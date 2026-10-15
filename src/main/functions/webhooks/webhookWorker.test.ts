import { AppConfig } from "@infra/config/AppConfig";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { GatewayBrazilWebhookProvider } from "@infra/webhooks/gatewayBrazil/GatewayBrazilWebhookProvider";
import { GatewayGlobalWebhookProvider } from "@infra/webhooks/gatewayGlobal/GatewayGlobalWebhookProvider";
import { sqsEvent } from "@main/adapters/lambdaSqsAdapter.fixtures";
import { handler } from "@main/functions/webhooks/webhookWorker";
import { gzipSync } from "node:zlib";
import { beforeEach, expect, test, vi } from "vitest";

// A name unlike the deployed one shows that the worker reads the table from configuration.
const tableName = "configured_events";

beforeEach(() => {
  vi.stubEnv("WEBHOOK_EVENTS_TABLE_NAME", tableName);
});

test.each([
  ["gatewayGlobal", GatewayGlobalWebhookProvider, GatewayBrazilWebhookProvider],
  ["gatewayBrazil", GatewayBrazilWebhookProvider, GatewayGlobalWebhookProvider],
] as const)(
  "the worker routes %s through its shared provider without webhook credentials",
  async (provider, target, other) => {
    vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", undefined);
    vi.stubEnv("GATEWAY_BRAZIL_ACCESS_TOKEN", undefined);
    const credentials = vi.spyOn(AppConfig.prototype, "webhooks", "get");
    const authenticate = vi.spyOn(target.prototype, "authenticate");
    const parse = vi.spyOn(target.prototype, "parse");
    const logs = captureLogs();
    const process = vi.spyOn(target.prototype, "process");
    const otherProcess = vi.spyOn(other.prototype, "process");
    const payload = '{ "exact": "payload" }';
    const get = vi.spyOn(DynamoClient.prototype, "get").mockResolvedValue({
      PK: `${provider}#evt_1`,
      SK: "META",
      provider,
      provider_event_id: "evt_1",
      event_type: "payment.succeeded",
      occurred_at: "2026-10-10T10:00:00.000Z",
      received_at: "2026-10-10T10:00:01.000Z",
      payload: gzipSync(payload),
    });

    await expect(handler(sqsEvent({ provider, providerEventId: "evt_1" }))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(get).toHaveBeenCalledWith(tableName, { PK: `${provider}#evt_1`, SK: "META" });
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ provider, providerEventId: "evt_1", payload }),
    );
    expect(otherProcess).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(credentials).not.toHaveBeenCalled();
    // The gateway's entry carries the queue message it came from, and never the payload.
    expect(logs()).toEqual([
      {
        timestamp: expect.any(String),
        level: "INFO",
        message: "webhook_routed",
        messageId: "message-0",
        messageGroupId: "gatewayGlobal",
        receiveCount: "1",
        eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:webhook_events.fifo",
        provider,
        providerEventId: "evt_1",
        eventType: "payment.succeeded",
      },
    ]);
  },
);

test.each([
  null,
  [],
  {},
  { provider: "gatewayGlobal" },
  { provider: " ", providerEventId: "evt" },
  { provider: "gatewayGlobal", providerEventId: 1 },
  { provider: "gatewayGlobal", providerEventId: " " },
])(
  "invalid queued references are classified and retried without reading storage: %j",
  async (body) => {
    const logs = captureLogs();
    const get = vi.spyOn(DynamoClient.prototype, "get");
    await expect(handler(sqsEvent(body))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: "message-0" }],
    });
    expect(get).not.toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({
      category: "queue",
      errorKind: "unexpected",
      errorCode: "QUEUE_INVALID_MESSAGE",
      errorName: "ErrorQueueInvalidMessage",
      errorStack: expect.any(String),
    });
  },
);

test("the registry rejects an unknown stored provider with the shared error and the worker retries", async () => {
  const logs = captureLogs();
  const get = vi.spyOn(DynamoClient.prototype, "get").mockResolvedValue({
    PK: "unknown#evt",
    SK: "META",
    provider: "unknown",
    provider_event_id: "evt",
    event_type: "payment.succeeded",
    occurred_at: "2026-10-10T10:00:00.000Z",
    received_at: "2026-10-10T10:00:01.000Z",
    payload: gzipSync("{}"),
  });
  await expect(handler(sqsEvent({ provider: "unknown", providerEventId: "evt" }))).resolves.toEqual(
    {
      batchItemFailures: [{ itemIdentifier: "message-0" }],
    },
  );
  expect(get).toHaveBeenCalledWith(tableName, { PK: "unknown#evt", SK: "META" });
  expect(logs()[0]).toMatchObject({
    category: "webhooks",
    errorKind: "unexpected",
    errorCode: "WEBHOOK_PROVIDER_NOT_FOUND",
    errorName: "ErrorWebhookProviderNotFound",
    errorMessage: "Unknown webhook provider: unknown",
    errorStack: expect.any(String),
  });
});

test("a missing stored event logs its own code and leaves the batch for retry", async () => {
  const logs = captureLogs();
  const get = vi.spyOn(DynamoClient.prototype, "get").mockResolvedValue(undefined);
  const process = vi.spyOn(GatewayGlobalWebhookProvider.prototype, "process");
  const event = { provider: "gatewayGlobal", providerEventId: "missing" };
  await expect(handler(sqsEvent(event, { ...event, providerEventId: "later" }))).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }, { itemIdentifier: "message-1" }],
  });
  expect(get).toHaveBeenCalledTimes(1);
  expect(process).not.toHaveBeenCalled();
  expect(logs()[0]).toMatchObject({
    category: "webhooks",
    errorKind: "unexpected",
    errorCode: "WEBHOOK_EVENT_NOT_FOUND",
    errorName: "ErrorWebhookEventNotFound",
    errorMessage: "Stored webhook event not found: gatewayGlobal/missing",
    errorStack: expect.any(String),
  });
});
