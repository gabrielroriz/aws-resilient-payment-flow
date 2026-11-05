import type { Migration } from "@infra/sql/migrations";
import createHistorySchema from "@infra/sql/platform/0001_create_history_schema.sql";
import createHistoryWriter from "@infra/sql/platform/0002_create_history_writer.sql";

// The platform database's migrations, for every schema, in the order they apply.
// An applied migration never changes; a schema change is a new file at the end.
export const platformMigrations: readonly Migration[] = [
  { name: "0001_create_history_schema", sql: createHistorySchema },
  { name: "0002_create_history_writer", sql: createHistoryWriter },
];
