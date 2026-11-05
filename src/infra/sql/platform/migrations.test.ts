import { readdir } from "node:fs/promises";
import path from "node:path";
import { testConnection } from "@infra/sql/SqlClient.fixtures";
import { platformMigrations } from "@infra/sql/platform/migrations";
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
  INSERT INTO history.webhook_events (provider, provider_event_id, event_type, occurred_at,
    received_at, payload, outdated)
  VALUES ('gatewayGlobal', 'evt_1', 'payment.succeeded', now(), now(), '\\x1f8b', false)`;
const CHANGE = `
  INSERT INTO history.webhook_event_changes (provider, provider_event_id, stream_sequence,
    changed_at, change, outdated)
  VALUES ('gatewayGlobal', 'evt_1', 1000, now(), 'created', false)`;

test("every platform migration file is listed once, in name order", async () => {
  // Tests run from the repository root.
  const files = await readdir(path.resolve("src/infra/sql/platform"));
  const names = files.filter((file) => file.endsWith(".sql")).map((file) => file.slice(0, -4));

  expect(platformMigrations.map((migration) => migration.name)).toEqual(names.sort());
});

test("the migrations create every history table in the history schema", async () => {
  const connection = await testConnection();

  expect(await applyMigrations(connection, platformMigrations)).toHaveLength(
    platformMigrations.length,
  );

  const { rows } = await connection.query<{ table: string }>(
    `SELECT table_schema || '.' || table_name AS table FROM information_schema.tables
     WHERE table_schema IN ('public', 'history') ORDER BY 1`,
  );
  expect(rows.map((row) => row.table)).toEqual([
    "history.webhook_event_attempts",
    "history.webhook_event_changes",
    "history.webhook_event_deliveries",
    "history.webhook_event_effects",
    "history.webhook_events",
    "public.schema_migrations",
  ]);
});

test("the writer can add and update history but never delete it or rewrite the ledger", async () => {
  const connection = await testConnection();
  await applyMigrations(connection, platformMigrations);

  await asWriter(connection, EVENT);
  await asWriter(connection, `${EVENT} ON CONFLICT DO NOTHING`);
  await asWriter(connection, "UPDATE history.webhook_events SET processing_status = 'processed'");
  await asWriter(connection, CHANGE);

  await expect(asWriter(connection, "DELETE FROM history.webhook_events")).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    asWriter(connection, "UPDATE history.webhook_event_changes SET change = 'modified'"),
  ).rejects.toThrow(/permission denied/);
  await expect(asWriter(connection, "DELETE FROM history.webhook_event_changes")).rejects.toThrow(
    /permission denied/,
  );
  await expect(asWriter(connection, "DROP TABLE history.webhook_events")).rejects.toThrow(
    /must be owner/,
  );
});

test("the writer cannot create objects in the history schema", async () => {
  const connection = await testConnection();
  await applyMigrations(connection, platformMigrations);

  await expect(asWriter(connection, "CREATE TABLE history.extra (id int)")).rejects.toThrow(
    /permission denied/,
  );
});
