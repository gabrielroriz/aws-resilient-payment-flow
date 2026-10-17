import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";

// Driven port for one payment provider's webhooks.
// Providers differ in how they authenticate requests and shape their events.
// Each adapter therefore owns receipt and queued-event processing.
// The entry point authenticates and parses; the worker processes the stored event.
// `StatusEventType` lists the provider's event types that report a payment status.
export abstract class WebhookProvider<StatusEventType extends string = string> {
  // Identifies the provider in webhook URLs and stored events, such as `stripe`.
  abstract readonly name: string;

  // The payment status each listed event type reports; receipt ranks events by it.
  abstract readonly paymentStatuses: WebhookProvider.PaymentStatuses<StatusEventType>;

  // Whether the request really comes from the provider, such as by its signature.
  abstract authenticate(request: WebhookProvider.Request): Promise<boolean>;

  // Reads the event from an authenticated request.
  // Returns `undefined` when the body is not an event the provider sends.
  abstract parse(request: WebhookProvider.Request): WebhookProvider.Event | undefined;

  // Processes a stored event; repeated deliveries must not repeat business effects.
  abstract process(event: WebhookEventRepository.Event): Promise<void>;
}

export namespace WebhookProvider {
  export type Request = {
    // Body as received; providers sign these bytes, so never re-serialize it.
    rawBody: string;
    headers: Record<string, string | undefined>;
    queryParams: Record<string, string | undefined>;
  };

  // The event fields only the provider knows.
  // The core adds the provider name, receipt time, payload, and mapped status.
  export type Event = Pick<
    WebhookEventRepository.Event,
    "providerEventId" | "eventType" | "occurredAt" | "subject" | "subscriptionId"
  >;

  // Requires a status for every listed event type, and no other.
  export type PaymentStatuses<StatusEventType extends string> = Readonly<
    Record<StatusEventType, WebhookEventRepository.SubjectStatus>
  >;
}
