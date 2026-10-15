import { WebhookEntryPointController } from "@application/controller/webhooks/WebhookEntryPointController";
import { Logger } from "@application/ports/Logger";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { SqsWebhookEventDispatcher } from "@infra/queues/SqsWebhookEventDispatcher";
import { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { bindRuntime } from "@main/bindings/runtime";
import { bindWebhooks } from "@main/bindings/webhooks";

// Composition root: one function receives webhooks from every provider, so its bundle includes
// every provider adapter in the registry.
const registry = Registry.getInstance();
bindRuntime(registry);
bindWebhooks(registry);
registry.bind(WebhookEventDispatcher, SqsWebhookEventDispatcher);

export const handler = lambdaHttpAdapter(
  registry.resolve(WebhookEntryPointController),
  registry.resolve(Logger),
);
