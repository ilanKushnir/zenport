import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { migrate } from './migrations.js';

export type Db = DatabaseSync;

/** Open (or create) the ZenPort database and bring it up to date. */
export function openDb(file: string): Db {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  // Foreign keys are enforced on every connection, explicitly rather than
  // by the node:sqlite default — cascade deletes are ZenPort's privacy
  // contract, not an optional nicety. migrate() suspends enforcement only
  // while rebuild migrations run, then switches it back on.
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  migrate(db);
  return db;
}
