import { Clock } from "@application/ports/Clock";
import { Logger } from "@application/ports/Logger";
import { Injectable } from "@kernel/decorators/injectable";
import { AsyncLocalStorage } from "node:async_hooks";

// Writes one JSON line per entry, which Lambda filters by `level`.
// That filtering also needs an RFC 3339 `timestamp`.
@Injectable(Clock)
export class JsonLogger implements Logger {
  // Per async call chain, so overlapping invocations never mix fields.
  // Only this instance sees these fields.
  private readonly context = new AsyncLocalStorage<Logger.Fields>();

  constructor(private readonly clock: Clock) {}

  debug(message: Logger.Message, fields?: Logger.Fields): void {
    this.write("DEBUG", message, fields);
  }

  info(message: Logger.Message, fields?: Logger.Fields): void {
    this.write("INFO", message, fields);
  }

  warn(message: Logger.Message, fields?: Logger.Fields): void {
    this.write("WARN", message, fields);
  }

  error(message: Logger.Message, fields?: Logger.Fields): void {
    this.write("ERROR", message, fields);
  }

  withContext<T>(fields: Logger.Fields, work: () => T): T {
    // A nested context adds to the outer one, such as a message within its batch.
    return this.context.run({ ...this.context.getStore(), ...fields }, work);
  }

  private write(level: JsonLogger.Level, message: Logger.Message, fields?: Logger.Fields): void {
    const entry = { timestamp: this.clock.now().toISOString(), level, message };
    let line: string;
    try {
      line = JSON.stringify({ ...entry, ...this.context.getStore(), ...fields });
    } catch {
      // A circular or otherwise unserializable field must not fail the request.
      line = JSON.stringify({ ...entry, fieldsError: "The entry's fields are not serializable" });
    }
    process.stdout.write(`${line}\n`);
  }
}

export namespace JsonLogger {
  // The level names Lambda's log-level filtering recognizes.
  export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";
}
