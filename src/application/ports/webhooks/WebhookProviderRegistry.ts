import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";

// Shared provider lookup for receipt and routing of stored events to their gateway.
export abstract class WebhookProviderRegistry {
  // Returns the provider with this name, or `undefined` when none is supported.
  abstract find(name: string): WebhookProvider | undefined;

  // Loads the stored event and awaits its provider's processing.
  // Rejects when the event or provider is missing.
  abstract route(id: WebhookEventRepository.EventId): Promise<void>;
}
