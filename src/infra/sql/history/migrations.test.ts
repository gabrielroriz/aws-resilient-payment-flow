import { readdir } from "node:fs/promises";
import path from "node:path";
import { testConnection } from "@infra/sql/SqlClient.fixtures";
import { historyMigrations } from "@infra/sql/history/migrations";
import { applyMigrations } from "@infra/sql/migrations";
import { expect, test } from "vitest";

// Runs a statement as the writer role, then returns to the test's own role.
async function asWriter(connection: Awaited<ReturnType<typeof testConnection>>, sql: string) {
  await connection.query("SET ROLE history_writer");
  try {
    await connection.query(sql);
  } finally {
    await connection.query("RESET ROLE");
  }
}

const EVENT = `
  INSERT INTO webhook_events (provider, provider_event_id, event_type, occurred_at,
    received_at, payload, outdated)
  VALUES ('gatewayGlobal', 'evt_1', 'payment.succeeded', now(), now(), '\\x1f8b', false)`;
const CHANGE = `
  INSERT INTO webhook_event_changes (provider, provider_event_id, stream_sequence,
    changed_at, change, outdated)
  VALUES ('gatewayGlobal', 'evt_1', 1000, now(), 'created', false)`;

test("every history migration file is listed once, in name order", async () => {
  // Tests run from the repository root.
  const files = await readdir(path.resolve("src/infra/sql/history"));
  const names = files.filter((file) => file.endsWith(".sql")).map((file) => file.slice(0, -4));

  expect(historyMigrations.map((migration) => migration.name)).toEqual(names.sort());
});

test("the history migrations create every history table on an empty database", async () => {
  const connection = await testConnection();

  expect(await applyMigrations(connection, historyMigrations)).toHaveLength(
    historyMigrations.length,
  );

  const { rows } = await connection.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
  );
  expect(rows.map((row) => row.table_name)).toEqual([
    "schema_migrations",
    "webhook_event_attempts",
    "webhook_event_changes",
    "webhook_event_deliveries",
    "webhook_event_effects",
    "webhook_events",
  ]);
});

test("the writer can add and update history but never delete it or rewrite the ledger", async () => {
  const connection = await testConnection();
  await applyMigrations(connection, historyMigrations);

  await asWriter(connection, EVENT);
  await asWriter(connection, `${EVENT} ON CONFLICT DO NOTHING`);
  await asWriter(connection, "UPDATE webhook_events SET processing_status = 'processed'");
  await asWriter(connection, CHANGE);

  await expect(asWriter(connection, "DELETE FROM webhook_events")).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    asWriter(connection, "UPDATE webhook_event_changes SET change = 'modified'"),
  ).rejects.toThrow(/permission denied/);
  await expect(asWriter(connection, "DELETE FROM webhook_event_changes")).rejects.toThrow(
    /permission denied/,
  );
  await expect(asWriter(connection, "DROP TABLE webhook_events")).rejects.toThrow(/must be owner/);
});
