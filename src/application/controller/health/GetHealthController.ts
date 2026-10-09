import { Controller } from "@application/contracts/Controller";
import { GetHealthUseCase } from "@application/usecases/health/GetHealthUseCase";
import { Injectable } from "@kernel/decorators/injectable";

@Injectable(GetHealthUseCase)
export class GetHealthController implements Controller<GetHealthUseCase.Output> {
  constructor(private readonly getHealthUseCase: GetHealthUseCase) {}

  async handle(): Promise<Controller.Response<GetHealthUseCase.Output>> {
    return { statusCode: 200, body: await this.getHealthUseCase.execute() };
  }
}
