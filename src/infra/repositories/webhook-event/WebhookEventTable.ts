import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { joinKey } from "@infra/dynamodb/keys";
import { Table } from "dynamodb-toolbox/table";
import { Entity } from "dynamodb-toolbox/entity";
import { item } from "dynamodb-toolbox/schema/item";
import { binary } from "dynamodb-toolbox/schema/binary";
import { boolean } from "dynamodb-toolbox/schema/boolean";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";

export const EVENT_SK = "META";
export const STATUS_SK = "STATUS";
export const ATTEMPT_ITEM_TYPE = "ATTEMPT";
export const DELIVERY_ITEM_TYPE = "DELIVERY";
export const EFFECT_ITEM_TYPE = "EFFECT";
export const RECEIVED_INDEX = "GSI1";
export const SUBJECT_INDEX = "GSI2";
// Outlasts provider retries and the provider event history used to reconcile.
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

// The partition key of an event's item collection.
// Providers are namespaced, so their event IDs never collide.
export function eventKey({ provider, providerEventId }: WebhookEventRepository.EventId): string {
  return joinKey(provider, providerEventId);
}

// The partition key of a subject's own items, such as its status.
// Its prefix keeps it apart from every event's key.
export function subjectKey(provider: string, { type, id }: WebhookEventRepository.Subject): string {
  return joinKey("SUBJECT", provider, type, id);
}

// An event's items all expire with it, so TTL never leaves a partial trace.
export function expiresAt(eventReceivedAt: Date): number {
  return Math.floor(eventReceivedAt.getTime() / 1000) + RETENTION_SECONDS;
}

// These schemas match stored attributes without adding Toolbox metadata.
// The table has legacy items that must remain readable and writable.
// Table keys and indexes must match those provisioned by Terraform.
export function webhookEventTable(name: string) {
  const table = new Table({
    name,
    partitionKey: { name: "PK", type: "string" },
    sortKey: { name: "SK", type: "string" },
    indexes: {
      [RECEIVED_INDEX]: {
        type: "global",
        partitionKey: { name: "GSI1PK", type: "string" },
        sortKey: { name: "received_at", type: "string" },
      },
      [SUBJECT_INDEX]: {
        type: "global",
        partitionKey: { name: "GSI2PK", type: "string" },
        sortKey: { name: "occurred_at", type: "string" },
      },
    },
  });
  const settings = { table, entityAttribute: false, timestamps: false } as const;

  const event = new Entity({
    name: "EVENT",
    ...settings,
    schema: item({
      PK: string().key(),
      SK: string().enum(EVENT_SK).key(),
      provider: string(),
      provider_event_id: string(),
      event_type: string(),
      occurred_at: string(),
      received_at: string(),
      subject_type: string().optional(),
      subject_id: string().optional(),
      subscription_id: string().optional(),
      status: string()
        .enum(...WebhookEventRepository.SUBJECT_STATUSES)
        .optional(),
      payload: binary(),
      processing_status: string()
        .enum(...WebhookEventRepository.PROCESSING_STATUSES)
        .optional(),
      outdated: boolean().optional(),
      current_attempt_id: string().optional(),
      current_attempt_deadline: string().optional(),
      GSI1PK: string(),
      GSI2PK: string().optional(),
      expires_at: number(),
    }),
  });
  const attempt = new Entity({
    name: ATTEMPT_ITEM_TYPE,
    ...settings,
    schema: item({
      PK: string().key(),
      SK: string().key(),
      attempt_id: string(),
      started_at: string(),
      finished_at: string().optional(),
      outcome: string()
        .enum(...WebhookEventRepository.ATTEMPT_OUTCOMES)
        .optional(),
      error_code: string().optional(),
      handler_version: string(),
      trace_id: string().optional(),
      expires_at: number(),
    }),
  });
  const status = new Entity({
    name: STATUS_SK,
    ...settings,
    schema: item({
      PK: string().key(),
      SK: string().enum(STATUS_SK).key(),
      provider_event_id: string(),
      status: string().enum(...WebhookEventRepository.SUBJECT_STATUSES),
      occurred_at: string(),
      rank: string(),
      expires_at: number(),
    }),
  });
  const delivery = new Entity({
    name: DELIVERY_ITEM_TYPE,
    ...settings,
    schema: item({
      PK: string().key(),
      SK: string().key(),
      received_at: string(),
      request_id: string(),
      expires_at: number(),
    }),
  });

  // Effects are read with an event trace even before effect writes are built.
  const effect = new Entity({
    name: EFFECT_ITEM_TYPE,
    ...settings,
    schema: item({
      PK: string().key(),
      SK: string().key(),
      effect: string(),
      status: string().enum(...WebhookEventRepository.EFFECT_STATUSES),
      business_key: string(),
      updated_at: string(),
      expires_at: number(),
    }),
  });

  return { table, event, attempt, status, delivery, effect };
}
