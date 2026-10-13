import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";

// Driven port that hands stored webhook events over for processing, which applies their business
// effects separately from receipt. An event can be dispatched more than once, such as when its
// provider redelivers it, so processing must recognize events it has already handled.
export abstract class WebhookEventDispatcher {
  // Dispatches a stored event; processing reads the event itself from the record of received events.
  abstract dispatch(event: WebhookEventRepository.EventId): Promise<void>;
}
