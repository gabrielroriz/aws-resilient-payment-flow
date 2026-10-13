// Transport-neutral handler for one queue message; rejection asks the transport to retry it.
// A handler declares its message's shape with `@Schema`, and the adapter validates each message
// before calling `handle`.
export interface MessageHandler {
  handle(body: unknown): Promise<void>;
}
