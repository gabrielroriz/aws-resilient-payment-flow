import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";

// Shared provider lookup, so receipt and processing pick the same gateway adapters.
export abstract class WebhookProviderRegistry {
  // Returns the provider with this name, or `undefined` when none is supported.
  abstract find(name: string): WebhookProvider | undefined;
}
