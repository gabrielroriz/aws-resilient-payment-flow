import { AppConfig } from "@infra/config/AppConfig";
import { SqlClient } from "@infra/sql/SqlClient";
import { Client } from "pg";
import { expect, test, vi } from "vitest";

// A driver connection that records its lifecycle instead of reaching a server.
function fakeConnection(overrides: Partial<SqlClient.DriverConnection> = {}) {
  const calls: string[] = [];
  const connection: SqlClient.DriverConnection = {
    connect: async () => calls.push("connect"),
    query: async () => {
      calls.push("query");
      return { rows: [] };
    },
    end: async () => {
      calls.push("end");
    },
    on: () => calls.push("on"),
    ...overrides,
  };
  return { connection, calls };
}

function clientWith(connection: SqlClient.DriverConnection): SqlClient {
  const client = new SqlClient(new AppConfig());
  vi.spyOn(client, "open").mockReturnValue(connection);
  return client;
}

test("withConnection opens a connection for the work and closes it afterwards", async () => {
  const { connection, calls } = fakeConnection({
    query: async <Row>() => {
      calls.push("query");
      return { rows: [{ answer: 42 }] as Row[] };
    },
  });

  const rows = await clientWith(connection).withConnection(
    async (open) => (await open.query("SELECT 42 AS answer")).rows,
  );

  expect(rows).toEqual([{ answer: 42 }]);
  expect(calls).toEqual(["on", "connect", "query", "end"]);
});

test("withConnection closes the connection when the work fails and rethrows the failure", async () => {
  const failure = new Error("duplicate key");
  const { connection, calls } = fakeConnection({
    query: async () => {
      throw failure;
    },
  });

  await expect(
    clientWith(connection).withConnection((open) => open.query("INSERT ...")),
  ).rejects.toBe(failure);
  expect(calls).toEqual(["on", "connect", "end"]);
});

test("withConnection keeps the work's result when closing the connection fails", async () => {
  const { connection } = fakeConnection({
    end: async () => {
      throw new Error("socket closed");
    },
  });

  await expect(clientWith(connection).withConnection(async () => "done")).resolves.toBe("done");
});

test("withConnection runs no work when the connection cannot open", async () => {
  const failure = new Error("connection refused");
  const work = vi.fn();
  const { connection } = fakeConnection({
    connect: async () => {
      throw failure;
    },
  });

  await expect(clientWith(connection).withConnection(work)).rejects.toBe(failure);
  expect(work).not.toHaveBeenCalled();
});

test("open configures the driver from the history database settings", () => {
  vi.stubEnv("HISTORY_DB_HOST", "postgres");
  vi.stubEnv("HISTORY_DB_NAME", "history");
  vi.stubEnv("HISTORY_DB_USER", "history_writer");
  vi.stubEnv("HISTORY_DB_PASSWORD", "writer-password");

  const connection = new SqlClient(new AppConfig()).open();

  expect(connection).toBeInstanceOf(Client);
  expect(connection).toMatchObject({
    host: "postgres",
    port: 5432,
    database: "history",
    user: "history_writer",
  });
});
