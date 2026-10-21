import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { AppConfig } from "@infra/config/AppConfig";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { joinKey, shardOf } from "@infra/dynamodb/keys";
import {
  ATTEMPT_ITEM_TYPE,
  DELIVERY_ITEM_TYPE,
  EFFECT_ITEM_TYPE,
  EVENT_SK,
  RECEIVED_INDEX,
  STATUS_SK,
  SUBJECT_INDEX,
  webhookEventTable,
} from "@infra/repositories/webhook-event/WebhookEventTable";
import { Injectable } from "@kernel/decorators/injectable";
import { GetItemCommand } from "dynamodb-toolbox/entity/actions/get";
import { PutItemCommand } from "dynamodb-toolbox/entity/actions/put";
import { UpdateItemCommand } from "dynamodb-toolbox/entity/actions/update";
import type { FormattedItem } from "dynamodb-toolbox/entity";
import { QueryCommand } from "dynamodb-toolbox/table/actions/query";
import { gunzipSync, gzipSync } from "node:zlib";

// Stores webhook events in the configured table, one item collection per event.
// Each subject's latest status lives in its own item.
@Injectable(DynamoClient, AppConfig)
export class DynamoWebhookEventRepository implements WebhookEventRepository {
  // GSI1 shards per provider, so each can burst to about 4,000 writes a second.
  // Every time-interval query reads all the shards.
  private static readonly GSI1_SHARDS = 4;
  // Outlasts provider retries and the provider event history used to reconcile.
  private static readonly RETENTION_SECONDS = 90 * 24 * 60 * 60;
  private modelName?: string;
  private modelSet?: ReturnType<typeof webhookEventTable>;

  constructor(
    private readonly dynamo: DynamoClient,
    private readonly config: AppConfig,
  ) {}

  async create(
    event: WebhookEventRepository.NewEvent,
  ): Promise<WebhookEventRepository.CreateResult> {
    const received: WebhookEventRepository.Event = {
      ...event,
      processingStatus: "received",
      outdated: false,
    };
    const input = this.models.event
      .build(PutItemCommand)
      .item(this.toEventItem(received))
      .options({ condition: { attr: "PK", exists: false } })
      .params();
    const result = await this.dynamo.putIfAbsent<DynamoWebhookEventRepository.EventItem>(input);
    return result.created
      ? { created: true, event: received }
      : { created: false, event: fromEventItem(result.existing) };
  }

  async get(id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Event | undefined> {
    const input = this.models.event
      .build(GetItemCommand)
      .key({ PK: eventKey(id), SK: EVENT_SK })
      .params();
    const item = await this.dynamo.get<DynamoWebhookEventRepository.EventItem>(input);
    return item && fromEventItem(item);
  }

  async recordEnqueued(id: WebhookEventRepository.EventId): Promise<void> {
    // A failed condition means the event has moved on, leaving nothing to record.
    await this.dynamo.updateIf(
      this.models.event
        .build(UpdateItemCommand)
        .item({
          PK: eventKey(id),
          SK: EVENT_SK,
          processing_status: "enqueued",
        })
        .options({ condition: { attr: "processing_status", eq: "received" } })
        .params(),
    );
  }

  async recordOutdated(id: WebhookEventRepository.EventId): Promise<void> {
    // The condition keeps an update from creating a partial event if none is stored.
    await this.dynamo.updateIf(
      this.models.event
        .build(UpdateItemCommand)
        .item({ PK: eventKey(id), SK: EVENT_SK, outdated: true })
        .options({ condition: { attr: "PK", exists: true } })
        .params(),
    );
  }

  async startAttempt(
    event: WebhookEventRepository.Event,
    attempt: WebhookEventRepository.StartedAttempt,
  ): Promise<boolean> {
    // Status first, so a refused attempt leaves no item that never ran.
    const started = await this.dynamo.updateIf(
      this.models.event
        .build(UpdateItemCommand)
        .item({
          PK: eventKey(event),
          SK: EVENT_SK,
          processing_status: "processing",
          current_attempt_id: attempt.attemptId,
          current_attempt_deadline: attempt.deadline.toISOString(),
        })
        .options({
          // The event must: 1. exist and be idle; 2. be held by an expired attempt.
          condition: {
            and: [
              // The event exists, so the update cannot create a partial item.
              { attr: "PK", exists: true },
              {
                or: [
                  // The event has no status because it predates statuses.
                  { attr: "processing_status", exists: false },
                  // The event is waiting for a first attempt or a retry.
                  { attr: "processing_status", in: ["received", "enqueued", "failed"] },
                  {
                    and: [
                      // The event is processing, but its attempt has expired.
                      { attr: "processing_status", eq: "processing" },
                      {
                        or: [
                          // The attempt has no deadline because it predates them.
                          { attr: "current_attempt_deadline", exists: false },
                          // The deadline passed before this attempt started.
                          {
                            attr: "current_attempt_deadline",
                            lt: attempt.startedAt.toISOString(),
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        })
        .params(),
    );
    if (!started) {
      return false;
    }

    const item: DynamoWebhookEventRepository.AttemptItem = {
      PK: eventKey(event),
      SK: attemptKey(attempt),
      attempt_id: attempt.attemptId,
      started_at: attempt.startedAt.toISOString(),
      handler_version: attempt.handlerVersion,
      expires_at: this.expiresAt(event.receivedAt),
    };
    await this.dynamo.put(this.models.attempt.build(PutItemCommand).item(item).params());
    return true;
  }

  async finishAttempt(
    event: WebhookEventRepository.Event,
    attempt: WebhookEventRepository.FinishedAttempt,
  ): Promise<void> {
    // The attempt keeps its outcome even when a newer attempt took the event over.
    await this.dynamo.updateIf(
      this.models.attempt
        .build(UpdateItemCommand)
        .item({
          PK: eventKey(event),
          SK: attemptKey(attempt),
          finished_at: attempt.finishedAt.toISOString(),
          outcome: attempt.outcome,
          ...(attempt.errorCode !== undefined && { error_code: attempt.errorCode }),
        })
        // A missing attempt must not create a partial history item.
        .options({ condition: { attr: "PK", exists: true } })
        .params(),
    );
    await this.dynamo.updateIf(
      this.models.event
        .build(UpdateItemCommand)
        .item({
          PK: eventKey(event),
          SK: EVENT_SK,
          processing_status: attempt.outcome === "succeeded" ? "processed" : "failed",
        })
        .options({
          condition: {
            and: [
              // Only an event still processing can move to a final status.
              { attr: "processing_status", eq: "processing" },
              // A newer attempt must keep control if it replaced this one.
              { attr: "current_attempt_id", eq: attempt.attemptId },
            ],
          },
        })
        .params(),
    );
  }

  async recordDuplicateDelivery(
    event: WebhookEventRepository.Event,
    delivery: WebhookEventRepository.Delivery,
  ): Promise<void> {
    const item: DynamoWebhookEventRepository.DeliveryItem = {
      PK: eventKey(event),
      SK: joinKey(DELIVERY_ITEM_TYPE, delivery.receivedAt.toISOString(), delivery.requestId),
      received_at: delivery.receivedAt.toISOString(),
      request_id: delivery.requestId,
      expires_at: this.expiresAt(event.receivedAt),
    };
    await this.dynamo.put(this.models.delivery.build(PutItemCommand).item(item).params());
  }

  // One item per subject holds its latest status.
  // An event replaces it only by outranking it.
  async recordStatus(
    event: WebhookEventRepository.StatusEvent,
    precedence: number,
  ): Promise<WebhookEventRepository.RecordStatusResult> {
    const occurredAt = event.occurredAt.toISOString();
    const item: DynamoWebhookEventRepository.StatusItem = {
      // Keyed by subject, not event, so a payment's events compete for one item.
      PK: joinKey("SUBJECT", event.provider, event.subject.type, event.subject.id),
      SK: STATUS_SK,
      // The event behind the latest status, so operators can trace its origin.
      provider_event_id: event.providerEventId,
      status: event.status,
      occurred_at: occurredAt,
      // Fixed-width fields make ranks compare correctly as text.
      // They order by precedence, then occurrence, then ID.
      rank: joinKey(String(precedence).padStart(2, "0"), occurredAt, event.providerEventId),
      // The status expires with the event that reported it.
      expires_at: this.expiresAt(event.receivedAt),
    };

    // Atomic, so concurrent deliveries cannot both win.
    const recorded = await this.dynamo.putIf(
      this.models.status
        .build(PutItemCommand)
        .item(item)
        // An equal rank is the same event delivered again.
        .options({
          condition: {
            or: [
              // The first status event establishes the subject's status.
              { attr: "PK", exists: false },
              // A lower or equal stored rank can be replaced by this event.
              { attr: "rank", lte: item.rank },
            ],
          },
        })
        .params(),
    );
    // A failed condition means a stored event outranks this one.
    return { outdated: !recorded };
  }

  async getTrace(
    id: WebhookEventRepository.EventId,
  ): Promise<WebhookEventRepository.Trace | undefined> {
    const items = await this.dynamo.queryAll<DynamoWebhookEventRepository.TraceItem>(
      this.models.table
        .build(QueryCommand)
        .query({ partition: eventKey(id) })
        .params(),
    );

    const event = items.find(
      (item): item is DynamoWebhookEventRepository.EventItem => item.SK === EVENT_SK,
    );
    if (!event) {
      return undefined;
    }

    // Items arrive sorted by SK, so attempts and deliveries are in time order.
    const ofType = <T extends DynamoWebhookEventRepository.TraceItem>(type: string) =>
      items.filter((item) => item.SK.startsWith(`${type}#`)) as T[];
    return {
      event: fromEventItem(event),
      attempts:
        ofType<DynamoWebhookEventRepository.AttemptItem>(ATTEMPT_ITEM_TYPE).map(fromAttemptItem),
      effects:
        ofType<DynamoWebhookEventRepository.EffectItem>(EFFECT_ITEM_TYPE).map(fromEffectItem),
      deliveries:
        ofType<DynamoWebhookEventRepository.DeliveryItem>(DELIVERY_ITEM_TYPE).map(fromDeliveryItem),
    };
  }

  async listReceived({
    providers,
    from,
    to,
    eventType,
  }: WebhookEventRepository.ReceivedQuery): Promise<WebhookEventRepository.Summary[]> {
    // BETWEEN is inclusive; ending 1 ms before `to` makes the interval half-open.
    const last = new Date(to.getTime() - 1);
    if (last < from) {
      return [];
    }

    // GSI1 shards each provider's events, so all shards are queried in parallel.
    const queries = providers.flatMap((provider) =>
      Array.from({ length: DynamoWebhookEventRepository.GSI1_SHARDS }, (_, shard) =>
        this.dynamo.queryAll<DynamoWebhookEventRepository.ReceivedItem>(
          this.models.table
            .build(QueryCommand)
            .query({
              index: RECEIVED_INDEX,
              partition: joinKey(provider, shard),
              range: { between: [from.toISOString(), last.toISOString()] },
            })
            .options(
              eventType === undefined ? {} : { filter: { attr: "event_type", eq: eventType } },
            )
            .params(),
        ),
      ),
    );

    // Each shard is in time order on its own; sorting merges them into one timeline.
    return (await Promise.all(queries))
      .flat()
      .map(fromReceivedItem)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  async listBySubject({
    provider,
    subject,
  }: WebhookEventRepository.SubjectQuery): Promise<WebhookEventRepository.Summary[]> {
    const items = await this.dynamo.queryAll<DynamoWebhookEventRepository.SubjectItem>(
      this.models.table
        .build(QueryCommand)
        .query({ index: SUBJECT_INDEX, partition: joinKey(provider, subject.type, subject.id) })
        .params(),
    );

    // GSI2 does not project the subject, since every item shares the one queried.
    return items.map((item) => ({ ...fromReceivedItem(item), subject }));
  }

  // Read on each use, so only functions that touch the table need its variable.
  private get table(): string {
    return this.config.tables.webhookEvents.name;
  }

  // Each repository instance builds its Toolbox models on first use.
  // The cached table name triggers a rebuild if configuration changes.
  private get models() {
    const name = this.table;
    if (this.modelName !== name || this.modelSet === undefined) {
      this.modelSet = webhookEventTable(name);
      this.modelName = name;
    }
    return this.modelSet;
  }

  // An event's items all expire with it, so TTL never leaves a partial trace.
  private expiresAt(eventReceivedAt: Date): number {
    return (
      Math.floor(eventReceivedAt.getTime() / 1000) + DynamoWebhookEventRepository.RETENTION_SECONDS
    );
  }

  private toEventItem(event: WebhookEventRepository.Event): DynamoWebhookEventRepository.EventItem {
    const key = eventKey(event);
    return {
      PK: key,
      SK: EVENT_SK,
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.eventType,
      occurred_at: event.occurredAt.toISOString(),
      received_at: event.receivedAt.toISOString(),
      subject_type: event.subject?.type,
      subject_id: event.subject?.id,
      subscription_id: event.subscriptionId,
      status: event.status,
      // Compression keeps the exact bytes and reduces write units.
      payload: gzipSync(event.payload),
      processing_status: event.processingStatus,
      outdated: event.outdated,
      GSI1PK: joinKey(event.provider, shardOf(key, DynamoWebhookEventRepository.GSI1_SHARDS)),
      // Events without a subject have no GSI2PK, so they stay out of GSI2.
      GSI2PK: event.subject && joinKey(event.provider, event.subject.type, event.subject.id),
      expires_at: this.expiresAt(event.receivedAt),
    };
  }
}

export namespace DynamoWebhookEventRepository {
  // The event itself; the other items of its collection share its `PK`.
  export type EventItem = FormattedItem<ReturnType<typeof webhookEventTable>["event"]>;

  // A subject's latest status and its event, kept outside any event's collection.
  export type StatusItem = FormattedItem<ReturnType<typeof webhookEventTable>["status"]>;

  // Index queries return the keys and projected attributes only, never the payload.
  export type ReceivedItem = Pick<
    EventItem,
    "PK" | "provider" | "event_type" | "occurred_at" | "received_at" | "subject_type" | "subject_id"
  >;
  export type SubjectItem = Pick<
    EventItem,
    "PK" | "provider" | "event_type" | "occurred_at" | "received_at"
  >;

  export type AttemptItem = FormattedItem<ReturnType<typeof webhookEventTable>["attempt"]>;

  export type EffectItem = FormattedItem<ReturnType<typeof webhookEventTable>["effect"]>;

  export type DeliveryItem = FormattedItem<ReturnType<typeof webhookEventTable>["delivery"]>;

  export type TraceItem = EventItem | AttemptItem | EffectItem | DeliveryItem;
}

function eventKey({ provider, providerEventId }: WebhookEventRepository.EventId): string {
  return joinKey(provider, providerEventId);
}

// Sorts an event's attempts by start time, then by ID.
function attemptKey({ startedAt, attemptId }: WebhookEventRepository.StartedAttempt): string {
  return joinKey(ATTEMPT_ITEM_TYPE, startedAt.toISOString(), attemptId);
}

function fromReceivedItem(
  item: DynamoWebhookEventRepository.ReceivedItem,
): WebhookEventRepository.Summary {
  return {
    provider: item.provider,
    // Index items carry the table key, the provider followed by its event ID.
    providerEventId: item.PK.slice(item.provider.length + 1),
    eventType: item.event_type,
    occurredAt: new Date(item.occurred_at),
    receivedAt: new Date(item.received_at),
    subject:
      item.subject_type === undefined || item.subject_id === undefined
        ? undefined
        : { type: item.subject_type, id: item.subject_id },
  };
}

function fromEventItem(item: DynamoWebhookEventRepository.EventItem): WebhookEventRepository.Event {
  return {
    ...fromReceivedItem(item),
    subscriptionId: item.subscription_id,
    status: item.status,
    payload: gunzipSync(item.payload).toString("utf8"),
    // Older events read as receipt left them: dispatched and not flagged.
    processingStatus: item.processing_status ?? "enqueued",
    outdated: item.outdated ?? false,
  };
}

function fromAttemptItem(
  item: DynamoWebhookEventRepository.AttemptItem,
): WebhookEventRepository.Attempt {
  return {
    attemptId: item.attempt_id,
    startedAt: new Date(item.started_at),
    finishedAt: item.finished_at === undefined ? undefined : new Date(item.finished_at),
    outcome: item.outcome,
    errorCode: item.error_code,
    handlerVersion: item.handler_version,
    traceId: item.trace_id,
  };
}

function fromEffectItem(
  item: DynamoWebhookEventRepository.EffectItem,
): WebhookEventRepository.Effect {
  return {
    effect: item.effect,
    status: item.status,
    businessKey: item.business_key,
    updatedAt: new Date(item.updated_at),
  };
}

function fromDeliveryItem(
  item: DynamoWebhookEventRepository.DeliveryItem,
): WebhookEventRepository.Delivery {
  return { receivedAt: new Date(item.received_at), requestId: item.request_id };
}
