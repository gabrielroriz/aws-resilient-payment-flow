import { vi } from "vitest";

// Test helpers for code that logs through `JsonLogger`.
// Lambda entries never import them.

export type LogEntry = Record<string, unknown>;

// Silences stdout and returns a reader of the entries logged since.
export function captureLogs(): () => LogEntry[] {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  return () =>
    write.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as LogEntry);
}
