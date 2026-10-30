import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { Client } from "pg";

// Must match the port of the history database in Terraform and Docker Compose.
const PORT = 5432;
// A paused Aurora Serverless instance takes up to about 30 seconds to resume.
const CONNECT_TIMEOUT_MS = 45_000;

// Shared PostgreSQL access for every SQL adapter.
// Each unit of work gets its own connection, closed when the work ends.
// An open idle connection would keep Aurora Serverless from pausing.
@Injectable(AppConfig)
export class SqlClient {
  constructor(private readonly config: AppConfig) {}

  async withConnection<T>(work: (connection: SqlClient.Connection) => Promise<T>): Promise<T> {
    const client = this.open();
    // A broken connection also rejects the pending query, which reports it.
    // Without a listener, the client's error event would crash the process.
    client.on("error", () => {});
    await client.connect();
    try {
      return await work(client);
    } finally {
      // Closing can fail after the work committed, so that error is ignored.
      await client.end().catch(() => {});
    }
  }

  // Builds the driver's connection, which tests replace to run without a server.
  open(): SqlClient.DriverConnection {
    const { host, database, user, password } = this.config.historyDatabase;
    return new Client({
      host,
      port: PORT,
      database,
      user,
      password,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
  }
}

export namespace SqlClient {
  // What adapters use: parameterized statements that return rows.
  export type Connection = {
    query<Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<{ rows: Row[] }>;
  };

  // The driver connection's lifecycle, which only this client manages.
  export type DriverConnection = Connection & {
    connect(): Promise<unknown>;
    end(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): unknown;
  };
}
