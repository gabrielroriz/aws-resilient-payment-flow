import { WebhookEventRepository } from "@application/ports/WebhookEventRepository";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { joinKey, shardOf } from "@infra/dynamodb/keys";
import { Injectable } from "@kernel/decorators/injectable";
import { gunzipSync, gzipSync } from "node:zlib";

// Must match the table name provisioned by Terraform.
const TABLE = "webhook_events";
const EVENT_SK = "META";
// Write shards per provider in GSI1: one provider can burst to about 4,000 writes per second,
// and every time-interval query covers all of them.
const GSI1_SHARDS = 4;
// Outlasts provider retries and the provider event history used for reconciliation.
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

type EventItem = {
  PK: string;
  SK: typeof EVENT_SK;
  provider: string;
  provider_event_id: string;
  event_type: string;
  occurred_at: string;
  received_at: string;
  subject_type?: string;
  subject_id?: string;
  payload: Uint8Array;
  GSI1PK: string;
  GSI2PK?: string;
  expires_at: number;
};

// Index queries return the keys and projected attributes only, never the payload.
type ReceivedItem = Pick<
  EventItem,
  "PK" | "provider" | "event_type" | "occurred_at" | "received_at" | "subject_type" | "subject_id"
>;
type SubjectItem = Pick<EventItem, "PK" | "provider" | "event_type" | "occurred_at" | "received_at">;

type AttemptItem = {
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

type EffectItem = {
  PK: string;
  SK: string;
  effect: string;
  status: "completed" | "failed";
  business_key: string;
  updated_at: string;
  expires_at: number;
};

type DeliveryItem = {
  PK: string;
  SK: string;
  received_at: string;
  request_id: string;
  expires_at: number;
};

type TraceItem = EventItem | AttemptItem | EffectItem | DeliveryItem;

/** Stores webhook events in the `webhook_events` table, one item collection per event. */
@Injectable(DynamoClient)
export class DynamoWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly dynamo: DynamoClient) {}

  async create(event: WebhookEventRepository.Event): Promise<WebhookEventRepository.CreateResult> {
    const result = await this.dynamo.putIfAbsent(TABLE, toEventItem(event), "PK");
    return result.created ? { created: true, event } : { created: false, event: fromEventItem(result.existing) };
  }

  async get(id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Event | undefined> {
    const item = await this.dynamo.get<EventItem>(TABLE, { PK: eventKey(id), SK: EVENT_SK });
    return item && fromEventItem(item);
  }

  async recordDuplicateDelivery(
    event: WebhookEventRepository.Event,
    delivery: WebhookEventRepository.Delivery,
  ): Promise<void> {
    const item: DeliveryItem = {
      PK: eventKey(event),
      SK: joinKey("DELIVERY", delivery.receivedAt.toISOString(), delivery.requestId),
      received_at: delivery.receivedAt.toISOString(),
      request_id: delivery.requestId,
      expires_at: expiresAt(event.receivedAt),
    };
    await this.dynamo.put(TABLE, item);
  }

  async getTrace(id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Trace | undefined> {
    const items = await this.dynamo.queryAll<TraceItem>({
      TableName: TABLE,
      KeyConditionExpression: "PK = :key",
      ExpressionAttributeValues: { ":key": eventKey(id) },
    });

    const event = items.find((item): item is EventItem => item.SK === EVENT_SK);
    if (!event) {
      return undefined;
    }

    // Items arrive sorted by SK, so attempts and deliveries are already in time order.
    const ofType = <T extends TraceItem>(type: string) =>
      items.filter((item) => item.SK.startsWith(`${type}#`)) as T[];
    return {
      event: fromEventItem(event),
      attempts: ofType<AttemptItem>("ATTEMPT").map(fromAttemptItem),
      effects: ofType<EffectItem>("EFFECT").map(fromEffectItem),
      deliveries: ofType<DeliveryItem>("DELIVERY").map(fromDeliveryItem),
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
      Array.from({ length: GSI1_SHARDS }, (_, shard) =>
        this.dynamo.queryAll<ReceivedItem>({
          TableName: TABLE,
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
    const items = await this.dynamo.queryAll<SubjectItem>({
      TableName: TABLE,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :subject",
      ExpressionAttributeValues: { ":subject": joinKey(provider, subject.type, subject.id) },
    });

    // GSI2 does not project the subject, since every item shares the one queried.
    return items.map((item) => ({ ...fromReceivedItem(item), subject }));
  }
}

function eventKey({ provider, providerEventId }: WebhookEventRepository.EventId): string {
  return joinKey(provider, providerEventId);
}

// Every item of an event expires with the event, so TTL never leaves a partial trace behind.
function expiresAt(eventReceivedAt: Date): number {
  return Math.floor(eventReceivedAt.getTime() / 1000) + RETENTION_SECONDS;
}

function toEventItem(event: WebhookEventRepository.Event): EventItem {
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
    // Compression keeps the exact bytes and reduces write units.
    payload: gzipSync(event.payload),
    GSI1PK: joinKey(event.provider, shardOf(key, GSI1_SHARDS)),
    // Events without a subject have no GSI2PK, so they stay out of GSI2.
    GSI2PK: event.subject && joinKey(event.provider, event.subject.type, event.subject.id),
    expires_at: expiresAt(event.receivedAt),
  };
}

function fromReceivedItem(item: ReceivedItem): WebhookEventRepository.Summary {
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

function fromEventItem(item: EventItem): WebhookEventRepository.Event {
  return { ...fromReceivedItem(item), payload: gunzipSync(item.payload).toString("utf8") };
}

function fromAttemptItem(item: AttemptItem): WebhookEventRepository.Attempt {
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

function fromEffectItem(item: EffectItem): WebhookEventRepository.Effect {
  return {
    effect: item.effect,
    status: item.status,
    businessKey: item.business_key,
    updatedAt: new Date(item.updated_at),
  };
}

function fromDeliveryItem(item: DeliveryItem): WebhookEventRepository.Delivery {
  return { receivedAt: new Date(item.received_at), requestId: item.request_id };
}
