import type { DocumentKind } from '@zenport/shared';

export type FileKind = 'audio' | 'image' | 'document';

export const AUDIO_EXTS = new Set(['mp3', 'm4a', 'm4b', 'flac', 'ogg', 'opus', 'wav', 'aac']);
export const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
export const DOCUMENT_EXTS = new Set(['pdf', 'txt', 'md', 'html', 'htm']);

export function classifyExt(ext: string): FileKind | null {
  const e = ext.toLowerCase();
  if (AUDIO_EXTS.has(e)) return 'audio';
  if (IMAGE_EXTS.has(e)) return 'image';
  if (DOCUMENT_EXTS.has(e)) return 'document';
  return null;
}

export function documentKind(ext: string): DocumentKind {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (e === 'md') return 'markdown';
  if (e === 'html' || e === 'htm') return 'html';
  return 'text';
}

export const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

export const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const DOCUMENT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  // HTML is deliberately served as an attachment/plain source, never rendered
  // same-origin; the web app uses a sandboxed iframe for preview.
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
};

/** Names that are never library content. */
const JUNK_NAMES = new Set(['thumbs.db', 'desktop.ini', 'albumartsmall.jpg']);

export function isJunkName(name: string): boolean {
  if (name.startsWith('.')) return true; // hidden files and dirs, ._resource forks
  return JUNK_NAMES.has(name.toLowerCase());
}
