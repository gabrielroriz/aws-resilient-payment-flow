import { Controller } from "@application/contracts/Controller";
import { IngestWebhookUseCase } from "@application/usecases/webhooks/IngestWebhookUseCase";
import { Injectable } from "@kernel/decorators/injectable";

// Receives all webhooks on one route; its `{provider}` parameter names the provider.
@Injectable(IngestWebhookUseCase)
export class WebhookEntryPointController implements Controller<IngestWebhookUseCase.Output> {
  constructor(private readonly ingestWebhookUseCase: IngestWebhookUseCase) {}

  async handle(
    request: Controller.Request,
  ): Promise<Controller.Response<IngestWebhookUseCase.Output>> {
    const output = await this.ingestWebhookUseCase.execute({
      provider: request.params.provider ?? "",
      requestId: request.requestId,
      request: {
        rawBody: request.rawBody ?? "",
        headers: request.headers,
        queryParams: request.queryParams,
      },
    });

    // Any 2xx stops provider retries, so a repeat is acknowledged like a new one.
    return { statusCode: 200, body: output };
  }
}
