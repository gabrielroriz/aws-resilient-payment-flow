import { Clock } from "@application/ports/Clock";
import { Deployment } from "@application/ports/Deployment";
import { Injectable } from "@kernel/decorators/injectable";

// Reports that the function is running, when it answered, and its code version.
@Injectable(Clock, Deployment)
export class GetHealthUseCase {
  constructor(
    private readonly clock: Clock,
    private readonly deployment: Deployment,
  ) {}

  async execute(): Promise<GetHealthUseCase.Output> {
    return {
      status: "ok",
      checkedAt: this.clock.now().toISOString(),
      codeVersion: this.deployment.codeVersion(),
    };
  }
}

export namespace GetHealthUseCase {
  export type Output = {
    status: "ok";
    checkedAt: string;
    // Shows which commit is live, such as after a deployment.
    codeVersion: string;
  };
}
