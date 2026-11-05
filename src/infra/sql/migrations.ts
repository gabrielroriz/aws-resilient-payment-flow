import type { SqlClient } from "@infra/sql/SqlClient";
import { digest } from "@kernel/utils/crypto";

// One schema change, applied once, in its place in the list.
export type Migration = { name: string; sql: string };

// Records which migrations a database has applied, and the text each one had.
const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

// Applies the migrations the database lacks, in list order, returning their names.
// Each migration commits together with its record, so a failure leaves no trace.
// An applied migration whose text changed fails the run instead of being skipped.
export async function applyMigrations(
  connection: SqlClient.Connection,
  migrations: readonly Migration[],
): Promise<string[]> {
  await connection.query(CREATE_LEDGER);
  const { rows } = await connection.query<{ name: string; checksum: string }>(
    "SELECT name, checksum FROM schema_migrations",
  );
  const applied = new Map(rows.map(({ name, checksum }) => [name, checksum]));

  const ran: string[] = [];
  for (const { name, sql } of migrations) {
    const checksum = digest([sql]);
    const stored = applied.get(name);
    if (stored !== undefined) {
      if (stored !== checksum) {
        throw new Error(`Migration ${name} changed after it was applied; add a new one instead.`);
      }
      continue;
    }

    await connection.query("BEGIN");
    try {
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
        name,
        checksum,
      ]);
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    }
    ran.push(name);
  }
  return ran;
}
