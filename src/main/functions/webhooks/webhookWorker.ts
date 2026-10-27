import { WebhookWorkerController } from "@application/controller/webhooks/WebhookWorkerController";
import { DeadLetterQueue } from "@application/ports/DeadLetterQueue";
import { Deployment } from "@application/ports/Deployment";
import { WorkflowStarter } from "@application/ports/workflows/WorkflowStarter";
import { ConfiguredDeployment } from "@infra/config/ConfiguredDeployment";
import { SqsDeadLetterQueue } from "@infra/queues/SqsDeadLetterQueue";
import { LambdaWorkflowStarter } from "@infra/workflows/LambdaWorkflowStarter";
import { Registry } from "@kernel/di/Registry";
import { bindWebhooks } from "@main/bindings/webhooks";
import { createSqsHandler } from "@main/factories/createSqsHandler";

const registry = Registry.getInstance();
bindWebhooks(registry);
registry.bind(Deployment, ConfiguredDeployment);
registry.bind(DeadLetterQueue, SqsDeadLetterQueue);
registry.bind(WorkflowStarter, LambdaWorkflowStarter);

export const handler = createSqsHandler(registry, WebhookWorkerController);
