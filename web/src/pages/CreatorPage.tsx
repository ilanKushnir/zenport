import { Link, useParams } from 'react-router-dom';
import type { LibraryDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, SkeletonGrid } from '../components/ui.tsx';
import { MedCard } from './LibraryPage.tsx';

export function CreatorPage() {
  const { name = '' } = useParams();
  const creatorName = decodeURIComponent(name);
  const lib = useApi<LibraryDto>('/api/library');

  if (lib.loading) return <SkeletonGrid />;
  if (lib.error) return <ErrorNote message={lib.error} onRetry={lib.reload} />;

  const items = (lib.data?.items ?? []).filter((i) => i.creator === creatorName && !i.missing);
  const creator = lib.data?.creators.find((c) => c.name === creatorName);
  const collections = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.collection ?? '';
    collections.set(key, [...(collections.get(key) ?? []), item]);
  }

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Library</Link>
          <span className="sep">/</span>
          <span aria-current="page">{creatorName}</span>
        </nav>
        <h1 style={{ marginTop: 8 }}>{creatorName}</h1>
        {creator && (
          <p className="lede">
            {creator.itemCount} meditation{creator.itemCount > 1 ? 's' : ''}
            {creator.totalDurationSec ? ` · ${formatDuration(creator.totalDurationSec)}` : ''}
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="No meditations for this creator">
          They may have been renamed or removed from the mounted folders.
        </EmptyState>
      ) : (
        [...collections.entries()].map(([collection, list]) => (
          <section className="section" key={collection || '(root)'}>
            {collection && (
              <div className="section-head">
                <h2>{collection}</h2>
              </div>
            )}
            <div className="card-grid">
              {list.map((item) => (
                <MedCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
