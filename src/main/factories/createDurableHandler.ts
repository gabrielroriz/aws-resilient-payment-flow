import type { MessageHandler } from "@application/contracts/MessageHandler";
import { Logger } from "@application/ports/Logger";
import { DurableExecution } from "@application/ports/workflows/DurableExecution";
import { LambdaDurableExecution } from "@infra/workflows/LambdaDurableExecution";
import type { Registry } from "@kernel/di/Registry";
import { lambdaDurableAdapter } from "@main/adapters/lambdaDurableAdapter";
import { bindRuntime } from "@main/bindings/runtime";

// Binds the runtime and the durable execution before resolving the controller.
// The adapter and the use case share one durable execution instance.
export function createDurableHandler(
  registry: Registry,
  controller: Registry.Token<MessageHandler>,
) {
  bindRuntime(registry);
  registry.bind(DurableExecution, LambdaDurableExecution);
  return lambdaDurableAdapter(
    registry.resolve(controller),
    registry.resolve(Logger),
    registry.resolve(LambdaDurableExecution),
  );
}
