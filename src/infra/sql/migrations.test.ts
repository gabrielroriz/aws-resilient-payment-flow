import { testConnection } from "@infra/sql/SqlClient.fixtures";
import { applyMigrations } from "@infra/sql/migrations";
import { expect, test } from "vitest";

async function tables(connection: Awaited<ReturnType<typeof testConnection>>) {
  const { rows } = await connection.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
  );
  return rows.map((row) => row.table_name);
}

test("applyMigrations applies each pending migration in order and records it", async () => {
  const connection = await testConnection();

  const ran = await applyMigrations(connection, [
    { name: "0001_a", sql: "CREATE TABLE a (id int);" },
    { name: "0002_b", sql: "CREATE TABLE b (a_id int); INSERT INTO a VALUES (1);" },
  ]);

  expect(ran).toEqual(["0001_a", "0002_b"]);
  expect(await tables(connection)).toEqual(["a", "b", "schema_migrations"]);
  const { rows } = await connection.query("SELECT name FROM schema_migrations ORDER BY name");
  expect(rows).toEqual([{ name: "0001_a" }, { name: "0002_b" }]);
});

test("applyMigrations skips migrations that are already applied", async () => {
  const connection = await testConnection();
  const first = { name: "0001_a", sql: "CREATE TABLE a (id int);" };
  await applyMigrations(connection, [first]);

  const ran = await applyMigrations(connection, [
    first,
    { name: "0002_b", sql: "CREATE TABLE b (id int);" },
  ]);

  expect(ran).toEqual(["0002_b"]);
  expect(await applyMigrations(connection, [first])).toEqual([]);
});

test("a failed migration leaves neither its changes nor its record, and stops the run", async () => {
  const connection = await testConnection();

  await expect(
    applyMigrations(connection, [
      { name: "0001_a", sql: "CREATE TABLE a (id int);" },
      { name: "0002_broken", sql: "CREATE TABLE partial (id int); SELECT missing_column FROM a;" },
      { name: "0003_c", sql: "CREATE TABLE c (id int);" },
    ]),
  ).rejects.toThrow(/missing_column/);

  expect(await tables(connection)).toEqual(["a", "schema_migrations"]);
  const { rows } = await connection.query("SELECT name FROM schema_migrations");
  expect(rows).toEqual([{ name: "0001_a" }]);
});

test("an applied migration whose text changed fails the run", async () => {
  const connection = await testConnection();
  await applyMigrations(connection, [{ name: "0001_a", sql: "CREATE TABLE a (id int);" }]);

  await expect(
    applyMigrations(connection, [{ name: "0001_a", sql: "CREATE TABLE a (id bigint);" }]),
  ).rejects.toThrow("Migration 0001_a changed after it was applied; add a new one instead.");
});
