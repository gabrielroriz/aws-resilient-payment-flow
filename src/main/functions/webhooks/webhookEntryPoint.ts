import { WebhookEntryPointController } from "@application/controller/webhooks/WebhookEntryPointController";
import { Clock } from "@application/ports/Clock";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { SystemClock } from "@infra/clock/SystemClock";
import { SqsWebhookEventDispatcher } from "@infra/queues/SqsWebhookEventDispatcher";
import { DynamoWebhookEventRepository } from "@infra/repositories/webhook-event/DynamoWebhookEventRepository";
import { InMemoryWebhookProviderRegistry } from "@infra/webhooks/InMemoryWebhookProviderRegistry";
import { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";

// Composition root: one function receives webhooks from every provider, so its bundle includes
// every provider adapter in the registry.
const registry = Registry.getInstance();
registry.bind(Clock, SystemClock);
registry.bind(WebhookProviderRegistry, InMemoryWebhookProviderRegistry);
registry.bind(WebhookEventRepository, DynamoWebhookEventRepository);
registry.bind(WebhookEventDispatcher, SqsWebhookEventDispatcher);

export const handler = lambdaHttpAdapter(registry.resolve(WebhookEntryPointController));
