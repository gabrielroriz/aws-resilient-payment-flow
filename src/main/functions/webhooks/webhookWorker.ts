import { WebhookWorkerController } from "@application/controller/webhooks/WebhookWorkerController";
import { Deployment } from "@application/ports/Deployment";
import { ConfiguredDeployment } from "@infra/config/ConfiguredDeployment";
import { Registry } from "@kernel/di/Registry";
import { bindRuntime } from "@main/bindings/runtime";
import { bindWebhooks } from "@main/bindings/webhooks";
import { createSqsHandler } from "@main/factories/createSqsHandler";

const registry = Registry.getInstance();
bindRuntime(registry);
bindWebhooks(registry);
registry.bind(Deployment, ConfiguredDeployment);

export const handler = createSqsHandler(registry, WebhookWorkerController);
