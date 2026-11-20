import { neon } from "@neondatabase/serverless";

const globalForDb = globalThis;

// Returns null without DATABASE_URL, so the store route falls back to the local JSON file.
export async function getStoreSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  globalForDb.storeSql ??= neon(url);
  const sql = globalForDb.storeSql;
  // The whole workspace is one JSON document under id "main"; the table creates itself on first use.
  globalForDb.storeTable ??= sql`
    create table if not exists app_store (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`.catch((error) => {
    delete globalForDb.storeTable;
    throw error;
  });
  await globalForDb.storeTable;
  return sql;
}
