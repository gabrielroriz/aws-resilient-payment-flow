import type { Controller } from "@application/contracts/Controller";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import type { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { bindRuntime } from "@main/bindings/runtime";

// Binds the runtime before resolving the controller and its shared dependencies.
export function createHttpHandler(registry: Registry, controller: Registry.Token<Controller>) {
  bindRuntime(registry);
  return lambdaHttpAdapter(
    registry.resolve(controller),
    registry.resolve(Logger),
    registry.resolve(InvocationContext),
  );
}
