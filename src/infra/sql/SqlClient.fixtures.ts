// PGlite's published types use Emscripten types without depending on them.
/// <reference types="emscripten" />
import { PGlite } from "@electric-sql/pglite";
import type { SqlClient } from "@infra/sql/SqlClient";
import { onTestFinished } from "vitest";

// A real PostgreSQL in memory, so SQL adapters are tested without a server.
// The database is closed when the test that opened it finishes.
export async function testConnection(): Promise<SqlClient.Connection> {
  const database = await PGlite.create();
  onTestFinished(() => database.close());
  return {
    // Statements with values use the extended protocol, which allows only one.
    // Statements without values may hold several, as migrations do.
    async query<Row extends Record<string, unknown>>(text: string, values?: unknown[]) {
      if (values !== undefined) {
        return database.query<Row>(text, values);
      }
      const results = await database.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as Row[] };
    },
  };
}
