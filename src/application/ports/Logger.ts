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
    // A succeeded payment granted its subscription access.
    | "subscription_access_granted"
    // A newer event of the payment outranked the grant, so nothing changed.
    | "subscription_access_grant_stale"
    // The worker handed a stored event to its gateway adapter.
    | "webhook_routed"
    // A workflow's input does not match its schema, so its execution fails.
    | "workflow_input_error"
    // A workflow step failed; it retries unless its error is not retryable.
    | "workflow_step_error";

  // JSON values, never payloads, credentials, or card data.
  // The entry's own keys are reserved.
  export type Fields = Record<string, unknown> & {
    timestamp?: never;
    level?: never;
    message?: never;
  };
}
