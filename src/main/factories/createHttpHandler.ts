import type { Controller } from "@application/contracts/Controller";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import type { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";

// Resolves shared dependencies once when the Lambda entry initializes.
export function createHttpHandler(registry: Registry, controller: Registry.Token<Controller>) {
  return lambdaHttpAdapter(
    registry.resolve(controller),
    registry.resolve(Logger),
    registry.resolve(InvocationContext),
  );
}
