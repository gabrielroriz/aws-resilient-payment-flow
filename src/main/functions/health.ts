import { GetHealthController } from "@application/controller/health/GetHealthController";
import { Clock } from "@application/ports/Clock";
import { SystemClock } from "@infra/clock/SystemClock";
import { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";

// Composition root: bind only the adapters this function needs, so its bundle stays
// small, then build the controller once per execution environment.
const registry = Registry.getInstance();
registry.bind(Clock, SystemClock);

export const handler = lambdaHttpAdapter(registry.resolve(GetHealthController));
