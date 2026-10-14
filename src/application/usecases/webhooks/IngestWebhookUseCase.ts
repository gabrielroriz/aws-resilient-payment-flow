import { ErrorWebhookAuthenticationFailed } from "@application/errors/application/webhooks/ErrorWebhookAuthenticationFailed";
import { ErrorWebhookMalformedEvent } from "@application/errors/application/webhooks/ErrorWebhookMalformedEvent";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { Clock } from "@application/ports/Clock";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { Injectable } from "@kernel/decorators/injectable";

// Ingests a webhook from any supported provider: authenticates it, stores its event once with the
// exact payload, flags it outdated when another event of its subject outranks it, and dispatches
// it. Ingestion applies no business effects, which keeps the acknowledgment fast.
@Injectable(WebhookProviderRegistry, WebhookEventRepository, WebhookEventDispatcher, Clock)
export class IngestWebhookUseCase {
  // Harder-to-undo statuses rank higher, so a refund outranks its payment in any arrival order.
  // Equal ranks can follow each other (pending, then overdue), so occurrence time breaks ties.
  private static readonly PRECEDENCE: Record<WebhookEventRepository.SubjectStatus, number> = {
    pending: 1,
    overdue: 1,
    failed: 1,
    succeeded: 2,
    refunded: 3,
    charged_back: 3,
  };

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

    // The URL names the provider; one this deployment does not support is answered with 404.
    const provider = this.providerRegistry.find(providerName);
    if (!provider) {
      throw new ErrorWebhookProviderNotFound(providerName);
    }

    // Nothing from an unauthenticated request is parsed or stored, so a forged request has no effect.
    if (!(await provider.authenticate(request))) {
      throw new ErrorWebhookAuthenticationFailed();
    }

    // An authentic body that is not one of the provider's events means its adapter needs updating.
    const parsed = provider.parse(request);
    if (!parsed) {
      throw new ErrorWebhookMalformedEvent();
    }

    // Stored once with its exact payload; a repeated delivery gets the earlier stored event back.
    const { created, event } = await this.events.create({
      ...parsed,
      provider: provider.name,
      status: this.paymentStatus(provider, parsed),
      receivedAt,
      payload: request.rawBody,
    });
    // The repeat is kept in the event's history, so operators can see every delivery.
    if (!created) {
      await this.events.recordDuplicateDelivery(event, { receivedAt, requestId });
    }

    // Recorded before dispatch so processing never sees a status that misses the event;
    // repeated deliveries record it again in case an earlier one failed first.
    const { outdated } = await this.recordStatus(event);

    // Repeated deliveries are dispatched too: when dispatching fails, the provider gets an error
    // and retries, and only that retry can still dispatch the already stored event.
    await this.dispatcher.dispatch(event);

    // Describes the delivery only; every outcome that reaches here is acknowledged the same way.
    return {
      provider: event.provider,
      providerEventId: event.providerEventId,
      duplicate: !created,
      outdated,
    };
  }

  // Only payment events report a status; `hasOwn` keeps a type named like an object property, such
  // as `constructor`, from matching.
  private paymentStatus(
    provider: WebhookProvider,
    { eventType, subject }: WebhookProvider.Event,
  ): WebhookEventRepository.SubjectStatus | undefined {
    if (subject?.type !== "payment" || !Object.hasOwn(provider.paymentStatuses, eventType)) {
      return undefined;
    }
    return provider.paymentStatuses[eventType];
  }

  // Outdated events are still dispatched since they can carry facts, like a late payment's amount.
  private async recordStatus(
    event: WebhookEventRepository.Event,
  ): Promise<WebhookEventRepository.RecordStatusResult> {
    const { subject, status } = event;
    if (!subject || !status) {
      return { outdated: false };
    }
    return this.events.recordStatus(
      { ...event, subject, status },
      IngestWebhookUseCase.PRECEDENCE[status],
    );
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
    // True when another event of its subject outranks this one; false when it reports no status.
    outdated: boolean;
  };
}
