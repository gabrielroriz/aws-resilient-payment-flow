import { GetHealthController } from "@application/controller/health/GetHealthController";
import { Clock } from "@application/ports/Clock";
import { Logger } from "@application/ports/Logger";
import { SystemClock } from "@infra/clock/SystemClock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";

// Composition root: bind only the adapters this function needs, so its bundle stays
// small, then build the controller once per execution environment.
const registry = Registry.getInstance();
registry.bind(Clock, SystemClock);
registry.bind(Logger, JsonLogger);

export const handler = lambdaHttpAdapter(
  registry.resolve(GetHealthController),
  registry.resolve(Logger),
);
