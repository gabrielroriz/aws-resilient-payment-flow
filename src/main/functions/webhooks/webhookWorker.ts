import { WebhookWorkerController } from "@application/controller/webhooks/WebhookWorkerController";
import { Deployment } from "@application/ports/Deployment";
import { Logger } from "@application/ports/Logger";
import { ConfiguredDeployment } from "@infra/config/ConfiguredDeployment";
import { Registry } from "@kernel/di/Registry";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";
import { bindRuntime } from "@main/bindings/runtime";
import { bindWebhooks } from "@main/bindings/webhooks";

const registry = Registry.getInstance();
bindRuntime(registry);
bindWebhooks(registry);
registry.bind(Deployment, ConfiguredDeployment);

export const handler = lambdaSqsAdapter(
  registry.resolve(WebhookWorkerController),
  registry.resolve(Logger),
);
