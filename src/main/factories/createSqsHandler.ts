import type { MessageHandler } from "@application/contracts/MessageHandler";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import type { Registry } from "@kernel/di/Registry";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";
import { bindRuntime } from "@main/bindings/runtime";

// Binds the runtime before resolving the controller and its shared dependencies.
export function createSqsHandler(registry: Registry, controller: Registry.Token<MessageHandler>) {
  bindRuntime(registry);
  return lambdaSqsAdapter(
    registry.resolve(controller),
    registry.resolve(Logger),
    registry.resolve(InvocationContext),
  );
}
