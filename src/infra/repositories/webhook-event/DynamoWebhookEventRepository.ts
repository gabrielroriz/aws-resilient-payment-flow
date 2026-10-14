import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { AppConfig } from "@infra/config/AppConfig";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { joinKey, shardOf } from "@infra/dynamodb/keys";
import { Injectable } from "@kernel/decorators/injectable";
import { gunzipSync, gzipSync } from "node:zlib";

// Stores webhook events in the configured table, one item collection per event, and each
// subject's latest status in its own item.
@Injectable(DynamoClient, AppConfig)
export class DynamoWebhookEventRepository implements WebhookEventRepository {
  private static readonly EVENT_SK = "META";
  private static readonly STATUS_SK = "STATUS";
  // Write shards per provider in GSI1: one provider can burst to about 4,000 writes per second,
  // and every time-interval query covers all of them.
  private static readonly GSI1_SHARDS = 4;
  // Outlasts provider retries and the provider event history used for reconciliation.
  private static readonly RETENTION_SECONDS = 90 * 24 * 60 * 60;

  constructor(
    private readonly dynamo: DynamoClient,
    private readonly config: AppConfig,
  ) {}

  async create(event: WebhookEventRepository.Event): Promise<WebhookEventRepository.CreateResult> {
    const result = await this.dynamo.putIfAbsent(this.table, this.toEventItem(event), "PK");
    return result.created
      ? { created: true, event }
      : { created: false, event: fromEventItem(result.existing) };
  }

  async get(id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Event | undefined> {
    const item = await this.dynamo.get<DynamoWebhookEventRepository.EventItem>(this.table, {
      PK: eventKey(id),
      SK: DynamoWebhookEventRepository.EVENT_SK,
    });
    return item && fromEventItem(item);
  }

  async recordDuplicateDelivery(
    event: WebhookEventRepository.Event,
    delivery: WebhookEventRepository.Delivery,
  ): Promise<void> {
    const item: DynamoWebhookEventRepository.DeliveryItem = {
      PK: eventKey(event),
      SK: joinKey("DELIVERY", delivery.receivedAt.toISOString(), delivery.requestId),
      received_at: delivery.receivedAt.toISOString(),
      request_id: delivery.requestId,
      expires_at: this.expiresAt(event.receivedAt),
    };
    await this.dynamo.put(this.table, item);
  }

  // One item per subject holds its latest status; an event replaces it only by outranking it.
  async recordStatus(
    event: WebhookEventRepository.StatusEvent,
    precedence: number,
  ): Promise<WebhookEventRepository.RecordStatusResult> {
    const occurredAt = event.occurredAt.toISOString();
    const item: DynamoWebhookEventRepository.StatusItem = {
      // Keyed by subject, not event, so all events of one payment compete for the same item.
      PK: joinKey("SUBJECT", event.provider, event.subject.type, event.subject.id),
      SK: DynamoWebhookEventRepository.STATUS_SK,
      // The event that holds the latest status, so operators can trace where it came from.
      provider_event_id: event.providerEventId,
      status: event.status,
      occurred_at: occurredAt,
      // Fixed-width fields make ranks compare as text by precedence, then occurrence, then ID.
      rank: joinKey(String(precedence).padStart(2, "0"), occurredAt, event.providerEventId),
      // The status expires with the event that reported it.
      expires_at: this.expiresAt(event.receivedAt),
    };

    // Atomic, so concurrent deliveries cannot both win. An equal rank means the same event again.
    const recorded = await this.dynamo.putIf(this.table, item, {
      // Written when the subject has no status yet, or when this event ranks at least as high.
      ConditionExpression: "attribute_not_exists(PK) OR #rank <= :rank",
      // A placeholder keeps the attribute name clear of DynamoDB's reserved words.
      ExpressionAttributeNames: { "#rank": "rank" },
      ExpressionAttributeValues: { ":rank": item.rank },
    });
    // A failed condition means a stored event outranks this one.
    return { outdated: !recorded };
  }

  async getTrace(
    id: WebhookEventRepository.EventId,
  ): Promise<WebhookEventRepository.Trace | undefined> {
    const items = await this.dynamo.queryAll<DynamoWebhookEventRepository.TraceItem>({
      TableName: this.table,
      KeyConditionExpression: "PK = :key",
      ExpressionAttributeValues: { ":key": eventKey(id) },
    });

    const event = items.find(
      (item): item is DynamoWebhookEventRepository.EventItem =>
        item.SK === DynamoWebhookEventRepository.EVENT_SK,
    );
    if (!event) {
      return undefined;
    }

    // Items arrive sorted by SK, so attempts and deliveries are already in time order.
    const ofType = <T extends DynamoWebhookEventRepository.TraceItem>(type: string) =>
      items.filter((item) => item.SK.startsWith(`${type}#`)) as T[];
    return {
      event: fromEventItem(event),
      attempts: ofType<DynamoWebhookEventRepository.AttemptItem>("ATTEMPT").map(fromAttemptItem),
      effects: ofType<DynamoWebhookEventRepository.EffectItem>("EFFECT").map(fromEffectItem),
      deliveries:
        ofType<DynamoWebhookEventRepository.DeliveryItem>("DELIVERY").map(fromDeliveryItem),
    };
  }

  async listReceived({
    providers,
    from,
    to,
    eventType,
  }: WebhookEventRepository.ReceivedQuery): Promise<WebhookEventRepository.Summary[]> {
    // BETWEEN includes both bounds; stopping 1 ms before `to` makes the interval half-open.
    const last = new Date(to.getTime() - 1);
    if (last < from) {
      return [];
    }

    // GSI1 spreads each provider's events over shards, so every shard is queried in parallel.
    const queries = providers.flatMap((provider) =>
      Array.from({ length: DynamoWebhookEventRepository.GSI1_SHARDS }, (_, shard) =>
        this.dynamo.queryAll<DynamoWebhookEventRepository.ReceivedItem>({
          TableName: this.table,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :shard AND received_at BETWEEN :from AND :to",
          ...(eventType !== undefined && { FilterExpression: "event_type = :type" }),
          ExpressionAttributeValues: {
            ":shard": joinKey(provider, shard),
            ":from": from.toISOString(),
            ":to": last.toISOString(),
            ...(eventType !== undefined && { ":type": eventType }),
          },
        }),
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
    const items = await this.dynamo.queryAll<DynamoWebhookEventRepository.SubjectItem>({
      TableName: this.table,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :subject",
      ExpressionAttributeValues: { ":subject": joinKey(provider, subject.type, subject.id) },
    });

    // GSI2 does not project the subject, since every item shares the one queried.
    return items.map((item) => ({ ...fromReceivedItem(item), subject }));
  }

  // Read on each use, so a function without the table's variable fails only when it touches the table.
  private get table(): string {
    return this.config.tables.webhookEvents.name;
  }

  // Every item of an event expires with the event, so TTL never leaves a partial trace behind.
  private expiresAt(eventReceivedAt: Date): number {
    return (
      Math.floor(eventReceivedAt.getTime() / 1000) + DynamoWebhookEventRepository.RETENTION_SECONDS
    );
  }

  private toEventItem(event: WebhookEventRepository.Event): DynamoWebhookEventRepository.EventItem {
    const key = eventKey(event);
    return {
      PK: key,
      SK: DynamoWebhookEventRepository.EVENT_SK,
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.eventType,
      occurred_at: event.occurredAt.toISOString(),
      received_at: event.receivedAt.toISOString(),
      subject_type: event.subject?.type,
      subject_id: event.subject?.id,
      status: event.status,
      // Compression keeps the exact bytes and reduces write units.
      payload: gzipSync(event.payload),
      GSI1PK: joinKey(event.provider, shardOf(key, DynamoWebhookEventRepository.GSI1_SHARDS)),
      // Events without a subject have no GSI2PK, so they stay out of GSI2.
      GSI2PK: event.subject && joinKey(event.provider, event.subject.type, event.subject.id),
      expires_at: this.expiresAt(event.receivedAt),
    };
  }
}

export namespace DynamoWebhookEventRepository {
  // The event itself; the other items of its collection share its `PK`.
  export type EventItem = {
    PK: string;
    SK: "META";
    provider: string;
    provider_event_id: string;
    event_type: string;
    occurred_at: string;
    received_at: string;
    subject_type?: string;
    subject_id?: string;
    status?: WebhookEventRepository.SubjectStatus;
    payload: Uint8Array;
    GSI1PK: string;
    GSI2PK?: string;
    expires_at: number;
  };

  // A subject's latest status and its event, keyed by subject outside any event's collection.
  export type StatusItem = {
    PK: string;
    SK: "STATUS";
    provider_event_id: string;
    status: WebhookEventRepository.SubjectStatus;
    occurred_at: string;
    rank: string;
    expires_at: number;
  };

  // Index queries return the keys and projected attributes only, never the payload.
  export type ReceivedItem = Pick<
    EventItem,
    "PK" | "provider" | "event_type" | "occurred_at" | "received_at" | "subject_type" | "subject_id"
  >;
  export type SubjectItem = Pick<
    EventItem,
    "PK" | "provider" | "event_type" | "occurred_at" | "received_at"
  >;

  export type AttemptItem = {
    PK: string;
    SK: string;
    attempt_id: string;
    started_at: string;
    finished_at?: string;
    outcome: "succeeded" | "failed";
    error_code?: string;
    handler_version: string;
    trace_id?: string;
    expires_at: number;
  };

  export type EffectItem = {
    PK: string;
    SK: string;
    effect: string;
    status: "completed" | "failed";
    business_key: string;
    updated_at: string;
    expires_at: number;
  };

  export type DeliveryItem = {
    PK: string;
    SK: string;
    received_at: string;
    request_id: string;
    expires_at: number;
  };

  export type TraceItem = EventItem | AttemptItem | EffectItem | DeliveryItem;
}

function eventKey({ provider, providerEventId }: WebhookEventRepository.EventId): string {
  return joinKey(provider, providerEventId);
}

function fromReceivedItem(
  item: DynamoWebhookEventRepository.ReceivedItem,
): WebhookEventRepository.Summary {
  return {
    provider: item.provider,
    // Index items carry the table key, which is the provider followed by its event ID.
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
    status: item.status,
    payload: gunzipSync(item.payload).toString("utf8"),
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
