import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";

/**
 * Driven port for one payment provider's webhooks. Providers differ in how they authenticate
 * requests and shape their events, so each has an adapter that turns its requests into the
 * event fields the core works with.
 */
export abstract class WebhookProvider {
  /** Identifies the provider in webhook URLs and stored events, such as `stripe`. */
  abstract readonly name: string;

  /** Whether the request really comes from the provider, such as by checking its signature. */
  abstract authenticate(request: WebhookProvider.Request): Promise<boolean>;

  /**
   * Reads the event from an authenticated request. Returns `undefined` when the body is not an
   * event the provider sends, such as when its ID or type is missing.
   */
  abstract parse(request: WebhookProvider.Request): WebhookProvider.Event | undefined;
}

export namespace WebhookProvider {
  export type Request = {
    /** Body exactly as received; providers sign these bytes, so it must not be re-serialized. */
    rawBody: string;
    headers: Record<string, string | undefined>;
    queryParams: Record<string, string | undefined>;
  };

  /** The event fields only the provider knows; the core adds the provider name, receipt time, and payload. */
  export type Event = Pick<WebhookEventRepository.Event, "providerEventId" | "eventType" | "occurredAt" | "subject">;
}
