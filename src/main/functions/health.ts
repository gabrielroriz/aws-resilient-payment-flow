import { GetHealthController } from "@application/controller/health/GetHealthController";
import { Logger } from "@application/ports/Logger";
import { Registry } from "@kernel/di/Registry";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { bindRuntime } from "@main/bindings/runtime";

// Composition root: bind only this function's adapters, so its bundle stays small.
// Then build the controller once per execution environment.
const registry = Registry.getInstance();
bindRuntime(registry);

export const handler = lambdaHttpAdapter(
  registry.resolve(GetHealthController),
  registry.resolve(Logger),
);
