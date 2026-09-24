/**
 * Guides and notes that belong to a creator or a series rather than to one
 * recording - a manual in a creator's folder, a study guide beside a
 * series' parts. Read in place or downloaded, like any companion note.
 */
import { useState } from 'react';
import type { DocumentDto, FolderDocsDto } from '@zenport/shared';
import { DocReaderSheet } from '../pages/ItemPage.tsx';
import { Icon } from './ui.tsx';

const KIND: Record<string, string> = {
  pdf: 'PDF',
  html: 'Web page',
  markdown: 'Notes',
  text: 'Text',
  other: 'Document',
};

const size = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

export function FolderDocs({
  groups,
  title = 'Guides and notes',
}: {
  groups: FolderDocsDto[];
  title?: string;
}) {
  const [open, setOpen] = useState<DocumentDto | null>(null);
  const docs = groups.flatMap((g) => g.docs.map((d) => ({ ...d, label: g.label })));
  if (docs.length === 0) return null;
  return (
    <section className="section" aria-labelledby="sec-folder-docs">
      <div className="section-head">
        <h2 id="sec-folder-docs">{title}</h2>
      </div>
      <div className="rowlist folder-docs">
        {docs.map((d) => (
          <div className="row" key={d.id}>
            <span className="folder-doc-ic" aria-hidden="true">
              <Icon name="doc" size={18} />
            </span>
            <div className="grow">
              <div>{d.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')}</div>
              <div className="sub">
                {KIND[d.kind] ?? 'Document'} · {size(d.sizeBytes)}
                {d.label ? ` · ${d.label}` : ''}
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(d)}>
              Read
            </button>
            <a
              className="btn btn-sm btn-quiet"
              href={`/api/media/asset/${d.id}?download=1`}
              download
            >
              <Icon name="download" size={14} />
              <span className="visually-hidden">Download {d.name}</span>
            </a>
          </div>
        ))}
      </div>
      {open && <DocReaderSheet doc={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
