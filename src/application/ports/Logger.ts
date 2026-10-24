// Driven port for structured logs: each entry is a catalog message plus fields.
export abstract class Logger {
  abstract debug(message: Logger.Message, fields?: Logger.Fields): void;

  abstract info(message: Logger.Message, fields?: Logger.Fields): void;

  abstract warn(message: Logger.Message, fields?: Logger.Fields): void;

  abstract error(message: Logger.Message, fields?: Logger.Fields): void;

  // Adds `fields` to every entry logged until `work` settles.
  abstract withContext<T>(fields: Logger.Fields, work: () => T): T;
}

export namespace Logger {
  // Every message the functions log; a new kind of entry is added here first.
  export type Message =
    // An HTTP request failed with an error.
    | "application_error"
    // A queue message failed, so SQS delivers it again unless it is parked.
    | "queue_message_error"
    // The failed message can never succeed, so it waits in the dead-letter queue.
    | "queue_message_parked"
    // The message could not be parked, so SQS delivers it again.
    | "queue_message_park_failed"
    // The worker handed a stored event to its gateway adapter.
    | "webhook_routed";

  // JSON values, never payloads, credentials, or card data.
  // The entry's own keys are reserved.
  export type Fields = Record<string, unknown> & {
    timestamp?: never;
    level?: never;
    message?: never;
  };
}
