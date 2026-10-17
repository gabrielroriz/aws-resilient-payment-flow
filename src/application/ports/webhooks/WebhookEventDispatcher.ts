import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";

// Driven port that hands stored webhook events over for processing.
// Processing applies their business effects separately from receipt.
// An event may be dispatched again, such as when its provider redelivers it.
// Processing must therefore recognize events it has already handled.
export abstract class WebhookEventDispatcher {
  // Dispatches a stored event; processing reads the event itself from storage.
  abstract dispatch(event: WebhookEventRepository.EventId): Promise<void>;
}
