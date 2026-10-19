import { Clock } from "@application/ports/Clock";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import { SystemClock } from "@infra/clock/SystemClock";
import { AsyncInvocationContext } from "@infra/invocation/AsyncInvocationContext";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { Registry } from "@kernel/di/Registry";

// Binds the clock, invocation timing, and structured logs every function uses.
export function bindRuntime(registry: Registry): void {
  registry.bind(Clock, SystemClock);
  registry.bind(InvocationContext, AsyncInvocationContext);
  registry.bind(Logger, JsonLogger);
}
