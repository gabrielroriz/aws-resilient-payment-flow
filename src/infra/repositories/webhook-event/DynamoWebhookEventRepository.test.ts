import { WebhookEventRepository } from "@application/ports/WebhookEventRepository";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { DynamoWebhookEventRepository } from "@infra/repositories/webhook-event/DynamoWebhookEventRepository";
import { gunzipSync } from "node:zlib";
import { expect, test, vi } from "vitest";

const event: WebhookEventRepository.Event = {
  provider: "stripe",
  providerEventId: "evt_1",
  eventType: "invoice.paid",
  occurredAt: new Date("2026-10-10T10:00:00.000Z"),
  receivedAt: new Date("2026-10-10T10:00:01.500Z"),
  subject: { type: "payment", id: "pi_1" },
  payload: '{"id":"evt_1","type":"invoice.paid"}',
};

// TTL keeps every item of the event until 90 days after the event was received.
const eventExpiresAt = Date.parse("2027-01-08T10:00:01Z") / 1000;

function setup() {
  const dynamo = new DynamoClient();
  return { dynamo, repository: new DynamoWebhookEventRepository(dynamo) };
}

// The item that create writes for `event`, standing in for what DynamoDB would return.
async function storedEventItem() {
  const { dynamo, repository } = setup();
  const putIfAbsent = vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: true });
  await repository.create(event);
  return putIfAbsent.mock.calls[0][1];
}

// Answers each query with the items listed under its partition key value.
function stubQueries(dynamo: DynamoClient, itemsByKey: Record<string, DynamoClient.Item[]>) {
  return vi.spyOn(dynamo, "queryAll").mockImplementation(async (input) => {
    const key = Object.values(input.ExpressionAttributeValues ?? {}).find((value) => String(value) in itemsByKey);
    return (itemsByKey[String(key)] ?? []) as never;
  });
}

test("create stores the event item with its index keys, compressed payload, and expiry", async () => {
  const { dynamo, repository } = setup();
  const putIfAbsent = vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: true });

  await expect(repository.create(event)).resolves.toEqual({ created: true, event });

  const [table, item, partitionKey] = putIfAbsent.mock.calls[0];
  expect([table, partitionKey]).toEqual(["webhook_events", "PK"]);
  expect(item).toMatchObject({
    PK: "stripe#evt_1",
    SK: "META",
    provider: "stripe",
    provider_event_id: "evt_1",
    event_type: "invoice.paid",
    occurred_at: "2026-10-10T10:00:00.000Z",
    received_at: "2026-10-10T10:00:01.500Z",
    subject_type: "payment",
    subject_id: "pi_1",
    GSI1PK: expect.stringMatching(/^stripe#[0-3]$/),
    GSI2PK: "stripe#payment#pi_1",
    expires_at: eventExpiresAt,
  });
  expect(gunzipSync(item.payload as Uint8Array).toString("utf8")).toBe(event.payload);
});

test("create leaves an event without a subject out of GSI2", async () => {
  const { dynamo, repository } = setup();
  const putIfAbsent = vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: true });

  await repository.create({ ...event, subject: undefined });

  expect(putIfAbsent.mock.calls[0][1].GSI2PK).toBeUndefined();
});

test("create returns the stored event when the event already exists", async () => {
  const { dynamo, repository } = setup();
  vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: false, existing: await storedEventItem() });

  const retry = { ...event, receivedAt: new Date("2026-10-10T10:05:00.000Z") };

  await expect(repository.create(retry)).resolves.toEqual({ created: false, event });
});

test("get reads the event item, or returns undefined when it does not exist", async () => {
  const { dynamo, repository } = setup();
  const get = vi.spyOn(dynamo, "get").mockResolvedValueOnce(await storedEventItem()).mockResolvedValueOnce(undefined);

  await expect(repository.get(event)).resolves.toEqual(event);
  await expect(repository.get({ provider: "stripe", providerEventId: "evt_missing" })).resolves.toBeUndefined();
  expect(get).toHaveBeenCalledWith("webhook_events", { PK: "stripe#evt_1", SK: "META" });
});

test("recordDuplicateDelivery stores a delivery item that expires with the event", async () => {
  const { dynamo, repository } = setup();
  const put = vi.spyOn(dynamo, "put").mockResolvedValue();

  await repository.recordDuplicateDelivery(event, { receivedAt: new Date("2026-10-10T10:05:00.000Z"), requestId: "req-2" });

  expect(put).toHaveBeenCalledWith("webhook_events", {
    PK: "stripe#evt_1",
    SK: "DELIVERY#2026-10-10T10:05:00.000Z#req-2",
    received_at: "2026-10-10T10:05:00.000Z",
    request_id: "req-2",
    expires_at: eventExpiresAt,
  });
});

test("getTrace returns the event with its attempts, effects, and deliveries", async () => {
  const { dynamo, repository } = setup();
  const queryAll = stubQueries(dynamo, {
    "stripe#evt_1": [
      {
        PK: "stripe#evt_1",
        SK: "ATTEMPT#2026-10-10T10:00:02.000Z#att-1",
        attempt_id: "att-1",
        started_at: "2026-10-10T10:00:02.000Z",
        finished_at: "2026-10-10T10:00:02.300Z",
        outcome: "failed",
        error_code: "INTERNAL_SERVER_ERROR",
        handler_version: "v1",
      },
      {
        PK: "stripe#evt_1",
        SK: "DELIVERY#2026-10-10T10:05:00.000Z#req-2",
        received_at: "2026-10-10T10:05:00.000Z",
        request_id: "req-2",
      },
      {
        PK: "stripe#evt_1",
        SK: "EFFECT#access_granted",
        effect: "access_granted",
        status: "completed",
        business_key: "access#pi_1",
        updated_at: "2026-10-10T10:00:03.000Z",
      },
      await storedEventItem(),
    ],
  });

  await expect(repository.getTrace(event)).resolves.toEqual({
    event,
    attempts: [
      {
        attemptId: "att-1",
        startedAt: new Date("2026-10-10T10:00:02.000Z"),
        finishedAt: new Date("2026-10-10T10:00:02.300Z"),
        outcome: "failed",
        errorCode: "INTERNAL_SERVER_ERROR",
        handlerVersion: "v1",
      },
    ],
    effects: [
      {
        effect: "access_granted",
        status: "completed",
        businessKey: "access#pi_1",
        updatedAt: new Date("2026-10-10T10:00:03.000Z"),
      },
    ],
    deliveries: [{ receivedAt: new Date("2026-10-10T10:05:00.000Z"), requestId: "req-2" }],
  });
  expect(queryAll.mock.calls[0][0]).toEqual({
    TableName: "webhook_events",
    KeyConditionExpression: "PK = :key",
    ExpressionAttributeValues: { ":key": "stripe#evt_1" },
  });
  await expect(repository.getTrace({ provider: "stripe", providerEventId: "evt_missing" })).resolves.toBeUndefined();
});

test("listReceived queries every shard of every provider and merges them in receipt order", async () => {
  const { dynamo, repository } = setup();
  const queryAll = stubQueries(dynamo, {
    "stripe#1": [
      {
        PK: "stripe#evt_b",
        provider: "stripe",
        event_type: "invoice.paid",
        occurred_at: "2026-10-10T09:59:00.000Z",
        received_at: "2026-10-10T10:00:00.000Z",
        subject_type: "payment",
        subject_id: "pi_1",
      },
    ],
    "simulated#3": [
      {
        PK: "simulated#evt_a",
        provider: "simulated",
        event_type: "payment.succeeded",
        occurred_at: "2026-10-10T08:59:00.000Z",
        received_at: "2026-10-10T09:00:00.000Z",
      },
    ],
  });

  const events = await repository.listReceived({
    providers: ["stripe", "simulated"],
    from: new Date("2026-10-10T00:00:00.000Z"),
    to: new Date("2026-10-11T00:00:00.000Z"),
  });

  expect(events).toEqual([
    {
      provider: "simulated",
      providerEventId: "evt_a",
      eventType: "payment.succeeded",
      occurredAt: new Date("2026-10-10T08:59:00.000Z"),
      receivedAt: new Date("2026-10-10T09:00:00.000Z"),
    },
    {
      provider: "stripe",
      providerEventId: "evt_b",
      eventType: "invoice.paid",
      occurredAt: new Date("2026-10-10T09:59:00.000Z"),
      receivedAt: new Date("2026-10-10T10:00:00.000Z"),
      subject: { type: "payment", id: "pi_1" },
    },
  ]);
  expect(queryAll.mock.calls.map(([input]) => input.ExpressionAttributeValues?.[":shard"])).toEqual([
    "stripe#0",
    "stripe#1",
    "stripe#2",
    "stripe#3",
    "simulated#0",
    "simulated#1",
    "simulated#2",
    "simulated#3",
  ]);
  // The interval excludes its end: the last millisecond queried is just before `to`.
  expect(queryAll.mock.calls[0][0]).toEqual({
    TableName: "webhook_events",
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :shard AND received_at BETWEEN :from AND :to",
    ExpressionAttributeValues: {
      ":shard": "stripe#0",
      ":from": "2026-10-10T00:00:00.000Z",
      ":to": "2026-10-10T23:59:59.999Z",
    },
  });
});

test("listReceived filters by event type when one is given", async () => {
  const { dynamo, repository } = setup();
  const queryAll = stubQueries(dynamo, {});

  await repository.listReceived({
    providers: ["stripe"],
    from: new Date("2026-10-10T00:00:00.000Z"),
    to: new Date("2026-10-11T00:00:00.000Z"),
    eventType: "charge.refunded",
  });

  expect(queryAll.mock.calls[0][0]).toMatchObject({
    FilterExpression: "event_type = :type",
    ExpressionAttributeValues: { ":type": "charge.refunded" },
  });
});

test("listReceived returns nothing for an empty interval without querying", async () => {
  const { dynamo, repository } = setup();
  const queryAll = stubQueries(dynamo, {});
  const instant = new Date("2026-10-10T00:00:00.000Z");

  await expect(repository.listReceived({ providers: ["stripe"], from: instant, to: instant })).resolves.toEqual([]);
  expect(queryAll).not.toHaveBeenCalled();
});

test("listBySubject queries GSI2 for the subject and returns its events", async () => {
  const { dynamo, repository } = setup();
  const queryAll = stubQueries(dynamo, {
    "stripe#payment#pi_1": [
      {
        PK: "stripe#evt_1",
        provider: "stripe",
        event_type: "invoice.paid",
        occurred_at: "2026-10-10T10:00:00.000Z",
        received_at: "2026-10-10T10:00:01.500Z",
      },
    ],
  });

  const events = await repository.listBySubject({ provider: "stripe", subject: { type: "payment", id: "pi_1" } });

  const { payload, ...summary } = event;
  expect(events).toEqual([summary]);
  expect(queryAll.mock.calls[0][0]).toEqual({
    TableName: "webhook_events",
    IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :subject",
    ExpressionAttributeValues: { ":subject": "stripe#payment#pi_1" },
  });
});
