import { WebhookWorkerController } from "@application/controller/webhooks/WebhookWorkerController";
import { Clock } from "@application/ports/Clock";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { SystemClock } from "@infra/clock/SystemClock";
import { DynamoWebhookEventRepository } from "@infra/repositories/webhook-event/DynamoWebhookEventRepository";
import { InMemoryWebhookProviderRegistry } from "@infra/webhooks/InMemoryWebhookProviderRegistry";
import { Registry } from "@kernel/di/Registry";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";

const registry = Registry.getInstance();
registry.bind(Clock, SystemClock);
registry.bind(WebhookProviderRegistry, InMemoryWebhookProviderRegistry);
registry.bind(WebhookEventRepository, DynamoWebhookEventRepository);

export const handler = lambdaSqsAdapter(registry.resolve(WebhookWorkerController));
