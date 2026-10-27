// Transport-neutral handler for one queue message or workflow input.
// Rejecting reports a failure, which the transport may retry.
// A handler declares its message's shape with `@Schema`.
// The adapter validates each message against it before calling `handle`.
export interface MessageHandler {
  handle(body: unknown): Promise<void>;
}
