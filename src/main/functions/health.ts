import { GetHealthController } from "@application/controller/health/GetHealthController";
import { Logger } from "@application/ports/Logger";
import { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { bindRuntime } from "@main/bindings/runtime";

// Composition root: bind only the adapters this function needs, so its bundle stays
// small, then build the controller once per execution environment.
const registry = Registry.getInstance();
bindRuntime(registry);

export const handler = lambdaHttpAdapter(
  registry.resolve(GetHealthController),
  registry.resolve(Logger),
);
