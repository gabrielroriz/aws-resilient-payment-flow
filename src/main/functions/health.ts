import { GetHealthController } from "@application/controller/health/GetHealthController";
import { Deployment } from "@application/ports/Deployment";
import { ConfiguredDeployment } from "@infra/config/ConfiguredDeployment";
import { Registry } from "@kernel/di/Registry";
import { bindRuntime } from "@main/bindings/runtime";
import { createHttpHandler } from "@main/factories/createHttpHandler";

// Composition root: bind only this function's adapters, so its bundle stays small.
// Then build the controller once per execution environment.
const registry = Registry.getInstance();
bindRuntime(registry);
registry.bind(Deployment, ConfiguredDeployment);

export const handler = createHttpHandler(registry, GetHealthController);
