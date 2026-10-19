import { WebhookEntryPointController } from "@application/controller/webhooks/WebhookEntryPointController";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { SqsWebhookEventDispatcher } from "@infra/queues/SqsWebhookEventDispatcher";
import { Registry } from "@kernel/di/Registry";
import { bindRuntime } from "@main/bindings/runtime";
import { bindWebhooks } from "@main/bindings/webhooks";
import { createHttpHandler } from "@main/factories/createHttpHandler";

// Composition root: one function receives webhooks from every provider.
// Its bundle therefore includes every provider adapter in the registry.
const registry = Registry.getInstance();
bindRuntime(registry);
bindWebhooks(registry);
registry.bind(WebhookEventDispatcher, SqsWebhookEventDispatcher);

export const handler = createHttpHandler(registry, WebhookEntryPointController);
