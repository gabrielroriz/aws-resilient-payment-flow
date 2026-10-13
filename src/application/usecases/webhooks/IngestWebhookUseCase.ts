import { ErrorWebhookAuthenticationFailed } from "@application/errors/application/webhooks/ErrorWebhookAuthenticationFailed";
import { ErrorWebhookMalformedEvent } from "@application/errors/application/webhooks/ErrorWebhookMalformedEvent";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { Clock } from "@application/ports/Clock";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { Injectable } from "@kernel/decorators/injectable";

// Ingests a webhook from any supported provider. The provider named in the request checks that
// the webhook is authentic and reads its event, and the event is stored once with its exact
// payload, so a repeated delivery is recognized and recorded instead of stored again. The event
// is then dispatched for processing: ingestion applies no business effects, which keeps the
// acknowledgment fast.
@Injectable(WebhookProviderRegistry, WebhookEventRepository, WebhookEventDispatcher, Clock)
export class IngestWebhookUseCase {
  constructor(
    private readonly providerRegistry: WebhookProviderRegistry,
    private readonly events: WebhookEventRepository,
    private readonly dispatcher: WebhookEventDispatcher,
    private readonly clock: Clock,
  ) {}

  async execute({
    provider: providerName,
    requestId,
    request,
  }: IngestWebhookUseCase.Input): Promise<IngestWebhookUseCase.Output> {
    // Read first, so the receipt time does not include the time spent authenticating.
    const receivedAt = this.clock.now();

    const provider = this.providerRegistry.find(providerName);
    if (!provider) {
      throw new ErrorWebhookProviderNotFound(providerName);
    }

    // Nothing from an unauthenticated request is parsed or stored, so a forged request has no effect.
    if (!(await provider.authenticate(request))) {
      throw new ErrorWebhookAuthenticationFailed();
    }

    const parsed = provider.parse(request);
    if (!parsed) {
      throw new ErrorWebhookMalformedEvent();
    }

    const { created, event } = await this.events.create({
      ...parsed,
      provider: provider.name,
      receivedAt,
      payload: request.rawBody,
    });
    if (!created) {
      await this.events.recordDuplicateDelivery(event, { receivedAt, requestId });
    }

    // Repeated deliveries are dispatched too: when dispatching fails, the provider gets an error
    // and retries, and only that retry can still dispatch the already stored event.
    await this.dispatcher.dispatch(event);

    return {
      provider: event.provider,
      providerEventId: event.providerEventId,
      duplicate: !created,
    };
  }
}

export namespace IngestWebhookUseCase {
  export type Input = {
    // Provider name as it appears in the webhook URL.
    provider: string;
    // ID of the request that delivered the webhook, recorded when the delivery is a duplicate.
    requestId: string;
    request: WebhookProvider.Request;
  };

  export type Output = {
    provider: string;
    providerEventId: string;
    // True when an earlier delivery already stored the event.
    duplicate: boolean;
  };
}
