import type { Migration } from "@infra/sql/migrations";
import createHistoryTables from "@infra/sql/history/0001_create_history_tables.sql";
import createHistoryWriter from "@infra/sql/history/0002_create_history_writer.sql";

// The history database's migrations, in the order they apply.
// An applied migration never changes; a schema change is a new file at the end.
export const historyMigrations: readonly Migration[] = [
  { name: "0001_create_history_tables", sql: createHistoryTables },
  { name: "0002_create_history_writer", sql: createHistoryWriter },
];
