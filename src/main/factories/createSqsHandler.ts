import type { MessageHandler } from "@application/contracts/MessageHandler";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import type { Registry } from "@kernel/di/Registry";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";

// Resolves shared dependencies once when the Lambda entry initializes.
export function createSqsHandler(registry: Registry, controller: Registry.Token<MessageHandler>) {
  return lambdaSqsAdapter(
    registry.resolve(controller),
    registry.resolve(Logger),
    registry.resolve(InvocationContext),
  );
}
