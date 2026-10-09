import { Clock } from "@application/ports/Clock";
import { Injectable } from "@kernel/decorators/injectable";

/** Reports that the function is running, with the time it answered. */
@Injectable(Clock)
export class GetHealthUseCase {
  constructor(private readonly clock: Clock) {}

  async execute(): Promise<GetHealthUseCase.Output> {
    return { status: "ok", checkedAt: this.clock.now().toISOString() };
  }
}

export namespace GetHealthUseCase {
  export type Output = {
    status: "ok";
    checkedAt: string;
  };
}
