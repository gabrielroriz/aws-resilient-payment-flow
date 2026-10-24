import type { MessageHandler } from "@application/contracts/MessageHandler";
import { DeadLetterQueue } from "@application/ports/DeadLetterQueue";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import type { Registry } from "@kernel/di/Registry";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";
import { bindRuntime } from "@main/bindings/runtime";

// Binds the runtime before resolving the controller and its shared dependencies.
// The entry binds `DeadLetterQueue` to the queue its failed messages are parked in.
export function createSqsHandler(registry: Registry, controller: Registry.Token<MessageHandler>) {
  bindRuntime(registry);
  return lambdaSqsAdapter(
    registry.resolve(controller),
    registry.resolve(Logger),
    registry.resolve(InvocationContext),
    registry.resolve(DeadLetterQueue),
  );
}
