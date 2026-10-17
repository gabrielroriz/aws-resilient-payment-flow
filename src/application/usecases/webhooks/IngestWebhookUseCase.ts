import { ErrorWebhookAuthenticationFailed } from "@application/errors/application/webhooks/ErrorWebhookAuthenticationFailed";
import { ErrorWebhookMalformedEvent } from "@application/errors/application/webhooks/ErrorWebhookMalformedEvent";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { Clock } from "@application/ports/Clock";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { Injectable } from "@kernel/decorators/injectable";

// Authenticates a webhook from any supported provider and stores its event once.
// The event is flagged outdated if outranked, then dispatched and marked enqueued.
// Ingestion applies no business effects, which keeps the acknowledgment fast.
@Injectable(WebhookProviderRegistry, WebhookEventRepository, WebhookEventDispatcher, Clock)
export class IngestWebhookUseCase {
  // Harder-to-undo statuses rank higher, so a refund always outranks its payment.
  // Equal ranks can follow each other, so occurrence time breaks ties.
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
    // Read first, so the receipt time excludes the time spent authenticating.
    const receivedAt = this.clock.now();

    // The URL names the provider; an unsupported one is answered with 404.
    const provider = this.providerRegistry.find(providerName);
    if (!provider) {
      throw new ErrorWebhookProviderNotFound(providerName);
    }

    // Unauthenticated requests are not parsed or stored, so forgeries are harmless.
    if (!(await provider.authenticate(request))) {
      throw new ErrorWebhookAuthenticationFailed();
    }

    // An authentic body that is not a known event means the adapter needs updating.
    const parsed = provider.parse(request);
    if (!parsed) {
      throw new ErrorWebhookMalformedEvent();
    }

    // Stored once with its exact payload; a repeat gets the stored event back.
    const { created, event } = await this.events.create({
      ...parsed,
      provider: provider.name,
      status: this.paymentStatus(provider, parsed),
      receivedAt,
      payload: request.rawBody,
    });
    // The repeat is kept in the event's history, so operators see every delivery.
    if (!created) {
      await this.events.recordDuplicateDelivery(event, { receivedAt, requestId });
    }

    // Recorded before dispatch so processing never sees a status without the event.
    // Repeated deliveries record it again in case an earlier one failed first.
    const { outdated } = await this.recordStatus(event);
    // Flags arrival only, never a later repeat.
    // An enqueued event's repeat can be outranked though the event came in order.
    // A repeat of a `received` event completes an unfinished receipt.
    if (outdated && event.processingStatus === "received") {
      await this.events.recordOutdated(event);
    }

    // Repeats are dispatched too: after a failed dispatch, the provider retries.
    // Only that retry can still dispatch the already stored event.
    await this.dispatcher.dispatch(event);
    // Only once dispatched, so an event left `received` never reached the queue.
    // An event that moved on is skipped: its failed condition would still be billed.
    if (event.processingStatus === "received") {
      await this.events.recordEnqueued(event);
    }

    // Describes the delivery only; every outcome here is acknowledged the same way.
    return {
      provider: event.provider,
      providerEventId: event.providerEventId,
      duplicate: !created,
      outdated,
    };
  }

  // Only payment events report a status.
  // `hasOwn` skips inherited properties, so a `constructor` type never matches.
  private paymentStatus(
    provider: WebhookProvider,
    { eventType, subject }: WebhookProvider.Event,
  ): WebhookEventRepository.SubjectStatus | undefined {
    if (subject?.type !== "payment" || !Object.hasOwn(provider.paymentStatuses, eventType)) {
      return undefined;
    }
    return provider.paymentStatuses[eventType];
  }

  // Outdated events are still dispatched since they can carry facts, like an amount.
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
    // ID of the delivering request, recorded when the delivery is a duplicate.
    requestId: string;
    request: WebhookProvider.Request;
  };

  export type Output = {
    provider: string;
    providerEventId: string;
    // True when an earlier delivery already stored the event.
    duplicate: boolean;
    // True when outranked by another event of its subject; false without a status.
    outdated: boolean;
  };
}
