import { WebhookWorkerController } from "@application/controller/webhooks/WebhookWorkerController";
import { Deployment } from "@application/ports/Deployment";
import { ConfiguredDeployment } from "@infra/config/ConfiguredDeployment";
import { Registry } from "@kernel/di/Registry";
import { bindWebhooks } from "@main/bindings/webhooks";
import { createSqsHandler } from "@main/factories/createSqsHandler";

const registry = Registry.getInstance();
bindWebhooks(registry);
registry.bind(Deployment, ConfiguredDeployment);

export const handler = createSqsHandler(registry, WebhookWorkerController);
