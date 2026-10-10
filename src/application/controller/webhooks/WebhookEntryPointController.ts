import { Controller } from "@application/contracts/Controller";
import { IngestWebhookUseCase } from "@application/usecases/webhooks/IngestWebhookUseCase";
import { Injectable } from "@kernel/decorators/injectable";

/** Receives every provider's webhooks on one route, taking the provider from its `{provider}` path parameter. */
@Injectable(IngestWebhookUseCase)
export class WebhookEntryPointController implements Controller<IngestWebhookUseCase.Output> {
  constructor(private readonly ingestWebhookUseCase: IngestWebhookUseCase) {}

  async handle(request: Controller.Request): Promise<Controller.Response<IngestWebhookUseCase.Output>> {
    const output = await this.ingestWebhookUseCase.execute({
      provider: request.params.provider ?? "",
      requestId: request.requestId,
      request: {
        rawBody: request.rawBody ?? "",
        headers: request.headers,
        queryParams: request.queryParams,
      },
    });

    // Providers stop retrying on any 2xx, so a repeated delivery is acknowledged like a new one.
    return { statusCode: 200, body: output };
  }
}
