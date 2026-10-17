import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { DynamoWebhookEventRepository } from "@infra/repositories/webhook-event/DynamoWebhookEventRepository";
import { InMemoryWebhookProviderRegistry } from "@infra/webhooks/InMemoryWebhookProviderRegistry";
import { Registry } from "@kernel/di/Registry";

// Binds the ports both webhook functions use: provider adapters and stored events.
export function bindWebhooks(registry: Registry): void {
  registry.bind(WebhookProviderRegistry, InMemoryWebhookProviderRegistry);
  registry.bind(WebhookEventRepository, DynamoWebhookEventRepository);
}
