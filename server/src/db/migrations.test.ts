import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from './migrations.js';

describe('migrations', () => {
  it("v10 moves the AI planner's summary out of a plan's notes into its guide", () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    for (const sql of MIGRATIONS.slice(0, 9)) db.exec(sql);
    db.prepare('INSERT INTO schema_version (version) VALUES (9)').run();
    db.prepare("INSERT INTO users (id, username, password_hash) VALUES (1, 'a', 'x')").run();
    const add = db.prepare(
      `INSERT INTO plans (user_id, name, start_date, created_at, notes)
       VALUES (1, ?, '2026-09-01', '2026-09-01T00:00:00Z', ?)`,
    );
    add.run('ai', 'Planned with gpt-5.5. Study starts with the foundations, then deepens.');
    add.run('mine', 'Light a candle first.');

    migrate(db);

    const rows = db.prepare('SELECT name, notes, guide FROM plans ORDER BY id').all() as {
      name: string;
      notes: string | null;
      guide: string | null;
    }[];
    expect(rows[0]!.notes).toBeNull();
    expect(JSON.parse(rows[0]!.guide!)).toMatchObject({
      model: 'gpt-5.5',
      summary: 'Study starts with the foundations, then deepens.',
      tips: [],
    });
    expect(rows[1]).toMatchObject({ notes: 'Light a candle first.', guide: null });
  });
});
