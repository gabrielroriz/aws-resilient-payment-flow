import { Clock } from "@application/ports/Clock";
import { Logger } from "@application/ports/Logger";
import { SystemClock } from "@infra/clock/SystemClock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { Registry } from "@kernel/di/Registry";

// Binds the ports every function uses: the system clock and structured logs.
export function bindRuntime(registry: Registry): void {
  registry.bind(Clock, SystemClock);
  registry.bind(Logger, JsonLogger);
}
