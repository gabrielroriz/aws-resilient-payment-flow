/** Transport-neutral handler for one queue message; rejection asks the transport to retry it. */
export interface MessageHandler {
  handle(body: unknown): Promise<void>;
}
