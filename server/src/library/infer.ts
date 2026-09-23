import { naturalCompare, titleFromStem, type InferenceDecision } from '@zenport/shared';
import type { WalkedFile } from '../scanner/walk.js';

/**
 * Deterministic, explainable hierarchy inference. No AI, no probabilities —
 * a fixed rule set over folder structure and sibling evidence, with every
 * decision recorded so the UI can show *why* ZenPort read a library the way
 * it did. When evidence is weak the engine prefers "Unknown creator" over a
 * fabricated one.
 *
 * Rules (documented in docs/scanner.md):
 *  - wrapper-collapse: a generic top folder name (Meditations, Library, …)
 *    or a sole top-level folder whose children hold no direct audio is a
 *    wrapper, not a creator.
 *  - category-detected: a top folder with >=2 children, none of which hold
 *    direct audio but all of which lead to audio deeper, reads as a category
 *    (e.g. "Sleep"); its children are the creators.
 *  - a folder holding audio is a meditation ("media leaf"); numbered or
 *    same-stem files are one multi-track meditation, heterogeneous files at
 *    creator level are one meditation each.
 */

export interface InferredTrack {
  relPath: string;
  name: string;
  ext: string;
  ord: number;
  title: string;
  sizeBytes: number;
}

export interface InferredDoc {
  relPath: string;
  name: string;
  ext: string;
  sizeBytes: number;
}

export interface InferredItem {
  /** Root-relative folder (folder items) or file (file items) path: the stable identity. */
  itemKey: string;
  kind: 'folder' | 'file';
  title: string;
  creator: string;
  collection: string | null;
  breadcrumbs: string[];
  tracks: InferredTrack[];
  coverRelPath: string | null;
  documents: InferredDoc[];
  decisions: InferenceDecision[];
}

const UNKNOWN_CREATOR = 'Unknown creator';
const GENERIC_WRAPPERS =
  /^(meditations?|meditation|library|libraries|audio|collections?|media|downloads?|content|files)$/i;

/**
 * Folder names a CREATOR uses to sort their own work. A category above
 * creators has creator-named children ("Sleep/Orin Vale", "Sleep/Insight
 * Collective"); a creator has children like these. Finding one settles which
 * of the two structurally identical shapes we are looking at.
 */
const CREATOR_SUBFOLDERS =
  /^(courses?|livestreams?|talks?|workshops?|retreats?|albums?|series|audiobooks?|programs?|programmes?|sessions?|lectures?|interviews?|podcasts?|singles?|extras?|bonus)$/i;
const COVER_STEMS = ['cover', 'folder', 'front', 'album', 'art'];

interface DirNode {
  name: string;
  relPath: string; // '' for root
  parent: DirNode | null;
  children: Map<string, DirNode>;
  files: WalkedFile[];
  hasAudioDescendant: boolean;
}

function buildTree(files: WalkedFile[]): DirNode {
  const root: DirNode = {
    name: '',
    relPath: '',
    parent: null,
    children: new Map(),
    files: [],
    hasAudioDescendant: false,
  };
  for (const file of [...files].sort((a, b) => naturalCompare(a.relPath, b.relPath))) {
    const segs = file.relPath.split('/');
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i] as string;
      let child = node.children.get(seg);
      if (!child) {
        child = {
          name: seg,
          relPath: node.relPath ? `${node.relPath}/${seg}` : seg,
          parent: node,
          children: new Map(),
          files: [],
          hasAudioDescendant: false,
        };
        node.children.set(seg, child);
      }
      node = child;
    }
    node.files.push(file);
  }
  const mark = (node: DirNode): boolean => {
    let has = node.files.some((f) => f.kind === 'audio');
    for (const child of node.children.values()) if (mark(child)) has = true;
    node.hasAudioDescendant = has;
    return has;
  };
  mark(root);
  return root;
}

const directAudio = (n: DirNode) => n.files.filter((f) => f.kind === 'audio');
const stemOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/** Do these stems read as an ordered track set of one piece? */
function looksLikeTrackSet(stems: string[]): boolean {
  if (stems.length < 2) return false;
  if (stems.every((s) => /^\d/.test(s))) return true;
  const bases = stems.map((s) => s.replace(/[\s\-_.]*\d+$/, ''));
  const first = bases[0] ?? '';
  if (first.length > 0 && bases.every((b) => b === first)) return true;
  // "ST - 1. Introduction", "ST - 2. Meditation", "RET 1 - 5. Sunday": an
  // ordinal with a dot after a shared prefix, distinct across the set. The
  // prefix is an abbreviation of the album, and the album is the piece.
  const ordinals = stems.map((s) => /^(.*?)(\d{1,3})\.\s/.exec(s));
  if (ordinals.every((m) => m !== null)) {
    const prefix = ordinals[0]![1];
    const numbers = new Set(ordinals.map((m) => m![2]));
    return ordinals.every((m) => m![1] === prefix) && numbers.size === stems.length;
  }
  return false;
}

/**
 * Is `node` a category layer? (>=2 children, no direct audio anywhere at
 * child level, audio deeper in all.) "Mira Solen/{Meditations,Courses,
 * Livestreams}" has exactly that shape and is NOT one - it is a creator who
 * sorts their own work - so a child named like a creator's sub-folder
 * decides the other way.
 */
function isCategory(node: DirNode): boolean {
  if (node.children.size < 2) return false;
  if (directAudio(node).length > 0) return false;
  for (const child of node.children.values()) {
    if (directAudio(child).length > 0) return false;
    if (!child.hasAudioDescendant) return false;
    if (GENERIC_WRAPPERS.test(child.name) || CREATOR_SUBFOLDERS.test(child.name)) return false;
  }
  return true;
}

/** Is `node` a wrapper (sole child of its parent, no creator-shaped children)? */
function isSoleWrapper(node: DirNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.children.size !== 1) return false;
  if (directAudio(parent).length > 0) return false;
  if (directAudio(node).length > 0) return false;
  for (const child of node.children.values()) {
    if (directAudio(child).length > 0) return false; // children are meditations => node is a creator
  }
  return true;
}

interface AncestryResult {
  remaining: string[];
  decisions: InferenceDecision[];
}

/** Drop leading wrapper/category ancestors, recording why. */
function resolveAncestry(chain: DirNode[]): AncestryResult {
  const decisions: InferenceDecision[] = [];
  let i = 0;
  let categoryUsed = false;
  while (i < chain.length) {
    const node = chain[i] as DirNode;
    if (GENERIC_WRAPPERS.test(node.name)) {
      decisions.push({
        field: 'grouping',
        value: node.name,
        rule: 'wrapper-collapse',
        evidence: `"${node.name}" is a generic library folder name`,
      });
      i++;
      continue;
    }
    if (!categoryUsed && isCategory(node)) {
      decisions.push({
        field: 'grouping',
        value: node.name,
        rule: 'category-detected',
        evidence: `"${node.name}" holds ${node.children.size} folders, none with audio of their own - it reads as a category above creators`,
      });
      categoryUsed = true;
      i++;
      continue;
    }
    if (isSoleWrapper(node)) {
      decisions.push({
        field: 'grouping',
        value: node.name,
        rule: 'wrapper-collapse',
        evidence: `"${node.name}" is the only top-level folder and none of its children hold audio directly`,
      });
      i++;
      continue;
    }
    break;
  }
  // A generic wrapper between the creator and the piece ("Mira Solen/
  // Meditations/<album>") is not a collection either; it collapses wherever
  // it sits, and the collection is only the folders that actually name one.
  const remaining: string[] = [];
  for (const node of chain.slice(i)) {
    if (remaining.length > 0 && GENERIC_WRAPPERS.test(node.name)) {
      decisions.push({
        field: 'grouping',
        value: node.name,
        rule: 'wrapper-collapse',
        evidence: `"${node.name}" is a generic folder name under the creator`,
      });
      continue;
    }
    remaining.push(node.name);
  }
  return { remaining, decisions };
}

function pickFolderCover(node: DirNode, folderName: string): { rel: string; rule: string } | null {
  const images = node.files.filter((f) => f.kind === 'image');
  if (images.length === 0) return null;
  for (const wanted of COVER_STEMS) {
    const hit = images.find((img) => stemOf(img.name).toLowerCase() === wanted);
    if (hit) return { rel: hit.relPath, rule: 'cover-preferred-name' };
  }
  const byFolder = images.find(
    (img) => stemOf(img.name).toLowerCase() === folderName.toLowerCase(),
  );
  if (byFolder) return { rel: byFolder.relPath, rule: 'cover-folder-name' };
  const first = [...images].sort((a, b) => naturalCompare(a.name, b.name))[0];
  return first ? { rel: first.relPath, rule: 'cover-first-image' } : null;
}

export function inferLibrary(walked: WalkedFile[]): InferredItem[] {
  const root = buildTree(walked);
  const items: InferredItem[] = [];
  // Folder-item dirs, used afterwards to attach documents from audio-less subtrees.
  const folderItemByRel = new Map<string, InferredItem>();

  const visit = (node: DirNode, chain: DirNode[]) => {
    const audio = directAudio(node);
    if (audio.length > 0) {
      emitItemsForLeaf(node, chain, audio);
    }
    for (const child of [...node.children.values()].sort((a, b) =>
      naturalCompare(a.name, b.name),
    )) {
      visit(child, node.parent === null ? [] : [...chain, node]);
    }
  };

  const emitItemsForLeaf = (node: DirNode, chain: DirNode[], audio: WalkedFile[]) => {
    const sortedAudio = [...audio].sort((a, b) => naturalCompare(a.name, b.name));
    const stems = sortedAudio.map((f) => stemOf(f.name));
    const isRoot = node.parent === null;
    const ancestry = resolveAncestry(chain);
    const B = ancestry.remaining;
    const companions = node.files.some((f) => f.kind !== 'audio');
    const tracksLike = looksLikeTrackSet(stems);

    const asFileItems =
      isRoot ||
      (B.length === 0 &&
        !tracksLike &&
        (sortedAudio.length >= 2 || (sortedAudio.length === 1 && !companions)));

    if (asFileItems) {
      for (const file of sortedAudio) {
        const stem = stemOf(file.name);
        const creator = isRoot ? UNKNOWN_CREATOR : node.name;
        const decisions: InferenceDecision[] = [...ancestry.decisions];
        decisions.push({
          field: 'title',
          value: titleFromStem(stem),
          rule: 'file-as-item',
          evidence: isRoot
            ? `"${file.name}" sits directly in the library root`
            : `"${node.name}" holds separate recordings, so each file is its own meditation`,
        });
        decisions.push(
          isRoot
            ? {
                field: 'creator',
                value: UNKNOWN_CREATOR,
                rule: 'unknown-creator',
                evidence: 'no folder above this file names a creator',
              }
            : {
                field: 'creator',
                value: creator,
                rule: 'creator-from-folder',
                evidence: `the folder "${node.name}" directly holds this recording`,
              },
        );
        // Stem-matched companions attach to the file item.
        const cover = node.files.find(
          (f) => f.kind === 'image' && stemOf(f.name).toLowerCase() === stem.toLowerCase(),
        );
        if (cover) {
          decisions.push({
            field: 'cover',
            value: cover.name,
            rule: 'cover-stem-match',
            evidence: `"${cover.name}" shares its name with the recording`,
          });
        }
        const docs = node.files.filter(
          (f) => f.kind === 'document' && stemOf(f.name).toLowerCase() === stem.toLowerCase(),
        );
        items.push({
          itemKey: file.relPath,
          kind: 'file',
          title: titleFromStem(stem),
          creator,
          collection: null,
          breadcrumbs: file.relPath.split('/'),
          tracks: [
            {
              relPath: file.relPath,
              name: file.name,
              ext: file.ext,
              ord: 1,
              title: titleFromStem(stem),
              sizeBytes: file.sizeBytes,
            },
          ],
          coverRelPath: cover?.relPath ?? null,
          documents: docs.map((d) => ({
            relPath: d.relPath,
            name: d.name,
            ext: d.ext,
            sizeBytes: d.sizeBytes,
          })),
          decisions,
        });
      }
      return;
    }

    // Folder item: the folder is one meditation.
    const creator = B[0] ?? UNKNOWN_CREATOR;
    const collection = B.length > 1 ? B.slice(1).join(' / ') : null;
    const decisions: InferenceDecision[] = [...ancestry.decisions];
    decisions.push({
      field: 'title',
      value: node.name,
      rule: 'folder-as-item',
      evidence: `the folder "${node.name}" holds this meditation's audio`,
    });
    decisions.push(
      B.length === 0
        ? {
            field: 'creator',
            value: UNKNOWN_CREATOR,
            rule: 'unknown-creator',
            evidence: tracksLike
              ? `"${node.name}" holds a numbered track set with no creator folder above it`
              : 'no folder above this meditation names a creator',
          }
        : {
            field: 'creator',
            value: creator,
            rule: 'creator-from-folder',
            evidence: `"${creator}" is the first meaningful folder above this meditation`,
          },
    );
    if (collection) {
      decisions.push({
        field: 'collection',
        value: collection,
        rule: 'collection-from-path',
        evidence: `folders between the creator and this meditation form the collection`,
      });
    }
    if (tracksLike && sortedAudio.length > 1) {
      decisions.push({
        field: 'tracks',
        value: `${sortedAudio.length} tracks`,
        rule: 'numbered-track-set',
        evidence:
          'the audio files are numbered or share one stem, so they play in order as one piece',
      });
    }
    const cover = pickFolderCover(node, node.name);
    if (cover) {
      decisions.push({
        field: 'cover',
        value: cover.rel.split('/').at(-1) ?? cover.rel,
        rule: cover.rule,
        evidence: 'chosen from the images in this meditation folder',
      });
    }
    const item: InferredItem = {
      itemKey: node.relPath,
      kind: 'folder',
      title: node.name,
      creator,
      collection,
      breadcrumbs: node.relPath.split('/'),
      tracks: sortedAudio.map((f, i) => ({
        relPath: f.relPath,
        name: f.name,
        ext: f.ext,
        ord: i + 1,
        title: titleFromStem(stemOf(f.name)),
        sizeBytes: f.sizeBytes,
      })),
      coverRelPath: cover?.rel ?? null,
      documents: node.files
        .filter((f) => f.kind === 'document')
        .map((d) => ({ relPath: d.relPath, name: d.name, ext: d.ext, sizeBytes: d.sizeBytes })),
      decisions,
    };
    items.push(item);
    folderItemByRel.set(node.relPath, item);
  };

  visit(root, []);

  // Attach documents living in audio-less subfolders to their nearest
  // ancestor meditation folder (e.g. Retreat/handouts/worksheet.pdf).
  const attachDeepDocs = (node: DirNode, nearestItem: InferredItem | null) => {
    const here = folderItemByRel.get(node.relPath) ?? nearestItem;
    if (here && node.relPath !== here.itemKey) {
      for (const f of node.files) {
        if (f.kind === 'document') {
          here.documents.push({
            relPath: f.relPath,
            name: f.name,
            ext: f.ext,
            sizeBytes: f.sizeBytes,
          });
        }
      }
    }
    for (const child of [...node.children.values()].sort((a, b) =>
      naturalCompare(a.name, b.name),
    )) {
      attachDeepDocs(child, here);
    }
  };
  attachDeepDocs(root, null);

  items.sort((a, b) => naturalCompare(a.itemKey, b.itemKey));
  for (const item of items) {
    item.documents.sort((a, b) => naturalCompare(a.relPath, b.relPath));
  }
  return items;
}
