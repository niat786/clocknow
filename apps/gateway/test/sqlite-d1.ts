// Test helper: a real SQLite database (Node's built-in) with the gateway's migrations applied,
// shaped like the slice of D1 the gateway uses. SQL mistakes show up in tests, not in production.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import type { D1Database, D1PreparedStatement } from '../src/env.ts';

export function testDb(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...a) => stmt(sql, a),
    first: async <T>() => ((db.prepare(sql).get(...(args as never[])) as T | undefined) ?? null),
    all: async <T>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql), raw: db };
}
