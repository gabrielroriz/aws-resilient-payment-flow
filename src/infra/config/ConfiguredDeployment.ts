import { Deployment } from "@application/ports/Deployment";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";

// Reads the deployment's facts from the function's configuration.
@Injectable(AppConfig)
export class ConfiguredDeployment implements Deployment {
  constructor(private readonly config: AppConfig) {}

  codeVersion(): string {
    return this.config.deployment.codeVersion;
  }
}
