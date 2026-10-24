import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { AppConfig } from "@infra/config/AppConfig";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { DynamoWebhookEventRepository } from "@infra/repositories/webhook-event/DynamoWebhookEventRepository";
import { gunzipSync } from "node:zlib";
import { beforeEach, expect, test, vi } from "vitest";

// A name unlike the deployed one shows that the table comes from configuration.
const tableName = "configured_events";

beforeEach(() => {
  vi.stubEnv("WEBHOOK_EVENTS_TABLE_NAME", tableName);
});

const event: WebhookEventRepository.StatusEvent = {
  provider: "stripe",
  providerEventId: "evt_1",
  eventType: "invoice.paid",
  occurredAt: new Date("2026-10-10T10:00:00.000Z"),
  receivedAt: new Date("2026-10-10T10:00:01.500Z"),
  subject: { type: "payment", id: "pi_1" },
  subscriptionId: "sub_1",
  status: "succeeded",
  payload: '{"id":"evt_1","type":"invoice.paid"}',
  processingStatus: "received",
  outdated: false,
};

// TTL keeps every item of the event until 90 days after the event was received.
const eventExpiresAt = Date.parse("2027-01-08T10:00:01Z") / 1000;

function setup() {
  const dynamo = new DynamoClient();
  return { dynamo, repository: new DynamoWebhookEventRepository(dynamo, new AppConfig()) };
}

// The item create writes for `event`, standing in for what DynamoDB would return.
async function storedEventItem() {
  const { dynamo, repository } = setup();
  const putIfAbsent = vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: true });
  await repository.create(event);
  return putIfAbsent.mock.calls[0][0].Item as DynamoWebhookEventRepository.EventItem;
}

// Restores names and values so assertions describe DynamoDB's actual condition.
function expression(
  input: {
    ConditionExpression?: string;
    UpdateExpression?: string;
    KeyConditionExpression?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  },
  kind: "ConditionExpression" | "UpdateExpression" | "KeyConditionExpression" | "FilterExpression",
): string {
  let result = input[kind] ?? "";
  const aliases = {
    ...input.ExpressionAttributeNames,
    ...Object.fromEntries(
      Object.entries(input.ExpressionAttributeValues ?? {}).map(([name, value]) => [
        name,
        JSON.stringify(value),
      ]),
    ),
  };
  for (const [alias, value] of Object.entries(aliases).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    result = result.replaceAll(alias, value);
  }
  return result;
}

// Answers each query with the items listed under its partition key value.
function stubQueries(dynamo: DynamoClient, itemsByKey: Record<string, DynamoClient.Item[]>) {
  return vi.spyOn(dynamo, "queryAll").mockImplementation(async (input) => {
    const key = Object.values(input.ExpressionAttributeValues ?? {}).find(
      (value) => String(value) in itemsByKey,
    );
    return (itemsByKey[String(key)] ?? []) as never;
  });
}

test("create stores the event item as received and not outdated, with its index keys, compressed payload, and expiry", async () => {
  const { dynamo, repository } = setup();
  const putIfAbsent = vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: true });
  const { processingStatus, outdated, ...newEvent } = event;

  await expect(repository.create(newEvent)).resolves.toEqual({ created: true, event });

  const input = putIfAbsent.mock.calls[0][0];
  const item = input.Item!;
  expect(input.TableName).toBe(tableName);
  expect(expression(input, "ConditionExpression")).toBe("attribute_not_exists(PK)");
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
    subscription_id: "sub_1",
    status: "succeeded",
    processing_status: "received",
    outdated: false,
    GSI1PK: expect.stringMatching(/^stripe#[0-3]$/),
    GSI2PK: "stripe#payment#pi_1",
    expires_at: eventExpiresAt,
  });
  expect(gunzipSync(item.payload as Uint8Array).toString("utf8")).toBe(event.payload);
  expect(item).not.toHaveProperty("_et");
  expect(item).not.toHaveProperty("_ct");
  expect(item).not.toHaveProperty("_md");
});

test("create leaves an event without a subject out of GSI2", async () => {
  const { dynamo, repository } = setup();
  const putIfAbsent = vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({ created: true });

  await repository.create({ ...event, subject: undefined });

  expect(putIfAbsent.mock.calls[0][0].Item?.GSI2PK).toBeUndefined();
});

test("create returns the stored event when the event already exists", async () => {
  const { dynamo, repository } = setup();
  vi.spyOn(dynamo, "putIfAbsent").mockResolvedValue({
    created: false,
    existing: await storedEventItem(),
  });

  const retry = { ...event, receivedAt: new Date("2026-10-10T10:05:00.000Z") };

  await expect(repository.create(retry)).resolves.toEqual({ created: false, event });
});

test("get reads the event item consistently, or returns undefined when it does not exist", async () => {
  const { dynamo, repository } = setup();
  const get = vi
    .spyOn(dynamo, "get")
    .mockResolvedValueOnce(await storedEventItem())
    .mockResolvedValueOnce(undefined);

  await expect(repository.get(event)).resolves.toEqual(event);
  await expect(
    repository.get({ provider: "stripe", providerEventId: "evt_missing" }),
  ).resolves.toBeUndefined();
  expect(get).toHaveBeenCalledWith({
    TableName: tableName,
    Key: { PK: "stripe#evt_1", SK: "META" },
    ConsistentRead: true,
  });
});

test("recordEnqueued moves the event from received to enqueued", async () => {
  const { dynamo, repository } = setup();
  const updateIf = vi.spyOn(dynamo, "updateIf").mockResolvedValue(true);

  await repository.recordEnqueued(event);

  const input = updateIf.mock.calls[0][0];
  expect(input).toMatchObject({ TableName: tableName, Key: { PK: "stripe#evt_1", SK: "META" } });
  expect(expression(input, "UpdateExpression")).toBe('SET processing_status = "enqueued"');
  expect(expression(input, "ConditionExpression")).toBe('processing_status = "received"');
});

test("recordEnqueued leaves an event that already moved on unchanged, without failing", async () => {
  const { dynamo, repository } = setup();
  vi.spyOn(dynamo, "updateIf").mockResolvedValue(false);

  await expect(repository.recordEnqueued(event)).resolves.toBeUndefined();
});

test("recordOutdated flags the stored event as outdated, never creating a partial one", async () => {
  const { dynamo, repository } = setup();
  const updateIf = vi.spyOn(dynamo, "updateIf").mockResolvedValue(true);

  await repository.recordOutdated(event);

  const input = updateIf.mock.calls[0][0];
  expect(input).toMatchObject({ TableName: tableName, Key: { PK: "stripe#evt_1", SK: "META" } });
  expect(expression(input, "UpdateExpression")).toBe("SET outdated = true");
  expect(expression(input, "ConditionExpression")).toBe("attribute_exists(PK)");
});

test("get reads an event stored before processing statuses existed as enqueued and not outdated", async () => {
  const { dynamo, repository } = setup();
  const { processing_status, outdated, ...older } = await storedEventItem();
  vi.spyOn(dynamo, "get").mockResolvedValue(older);

  await expect(repository.get(event)).resolves.toMatchObject({
    processingStatus: "enqueued",
    outdated: false,
  });
});

const attempt: WebhookEventRepository.StartedAttempt = {
  attemptId: "att-1",
  startedAt: new Date("2026-10-10T10:00:02.000Z"),
  handlerVersion: "20261017110316-339fc51a2130",
  deadline: new Date("2026-10-10T10:00:32.000Z"),
};

test("startAttempt moves the event to processing, then stores the attempt with its code version", async () => {
  const { dynamo, repository } = setup();
  const updateIf = vi.spyOn(dynamo, "updateIf").mockResolvedValue(true);
  const put = vi.spyOn(dynamo, "put").mockResolvedValue();

  await expect(repository.startAttempt(event, attempt)).resolves.toBe(true);

  // A `processing` event is taken over once its deadline is before this start.
  const input = updateIf.mock.calls[0][0];
  expect(input).toMatchObject({ TableName: tableName, Key: { PK: "stripe#evt_1", SK: "META" } });
  expect(expression(input, "UpdateExpression")).toBe(
    'SET processing_status = "processing", current_attempt_id = "att-1", ' +
      'current_attempt_deadline = "2026-10-10T10:00:32.000Z"',
  );
  expect(expression(input, "ConditionExpression")).toBe(
    "(attribute_exists(PK)) AND ((attribute_not_exists(processing_status)) OR " +
      '(processing_status IN ("received", "enqueued", "failed")) OR ' +
      '((processing_status = "processing") AND ' +
      "((attribute_not_exists(current_attempt_deadline)) OR " +
      '(current_attempt_deadline < "2026-10-10T10:00:02.000Z"))))',
  );
  expect(put.mock.calls[0][0]).toMatchObject({
    TableName: tableName,
    Item: {
      PK: "stripe#evt_1",
      SK: "ATTEMPT#2026-10-10T10:00:02.000Z#att-1",
      attempt_id: "att-1",
      started_at: "2026-10-10T10:00:02.000Z",
      handler_version: "20261017110316-339fc51a2130",
      expires_at: eventExpiresAt,
    },
  });
  expect(updateIf.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0]);
});

test("startAttempt stores nothing when the event's status allows no new attempt", async () => {
  const { dynamo, repository } = setup();
  vi.spyOn(dynamo, "updateIf").mockResolvedValue(false);
  const put = vi.spyOn(dynamo, "put");

  await expect(repository.startAttempt(event, attempt)).resolves.toBe(false);

  expect(put).not.toHaveBeenCalled();
});

test("finishAttempt records the outcome on the attempt, then moves the event while the attempt still holds it", async () => {
  const { dynamo, repository } = setup();
  const updateIf = vi.spyOn(dynamo, "updateIf").mockResolvedValue(true);
  const finishedAt = new Date("2026-10-10T10:00:02.300Z");

  await repository.finishAttempt(event, { ...attempt, finishedAt, outcome: "succeeded" });
  await repository.finishAttempt(event, {
    ...attempt,
    finishedAt,
    outcome: "failed",
    errorCode: "INTERNAL_SERVER_ERROR",
  });

  const updates = updateIf.mock.calls.map(([input]) => input);
  expect(updates.map(({ TableName, Key }) => [TableName, Key])).toEqual([
    [tableName, { PK: "stripe#evt_1", SK: "ATTEMPT#2026-10-10T10:00:02.000Z#att-1" }],
    [tableName, { PK: "stripe#evt_1", SK: "META" }],
    [tableName, { PK: "stripe#evt_1", SK: "ATTEMPT#2026-10-10T10:00:02.000Z#att-1" }],
    [tableName, { PK: "stripe#evt_1", SK: "META" }],
  ]);
  expect(updates.map((input) => expression(input, "UpdateExpression"))).toEqual([
    'SET finished_at = "2026-10-10T10:00:02.300Z", outcome = "succeeded"',
    'SET processing_status = "processed"',
    'SET finished_at = "2026-10-10T10:00:02.300Z", outcome = "failed", ' +
      'error_code = "INTERNAL_SERVER_ERROR"',
    'SET processing_status = "failed"',
  ]);
  expect(expression(updates[0], "ConditionExpression")).toBe("attribute_exists(PK)");
  expect(expression(updates[1], "ConditionExpression")).toBe(
    '(processing_status = "processing") AND (current_attempt_id = "att-1")',
  );
});

test("recordDuplicateDelivery stores a delivery item that expires with the event", async () => {
  const { dynamo, repository } = setup();
  const put = vi.spyOn(dynamo, "put").mockResolvedValue();

  await repository.recordDuplicateDelivery(event, {
    receivedAt: new Date("2026-10-10T10:05:00.000Z"),
    requestId: "req-2",
  });

  expect(put.mock.calls[0][0]).toMatchObject({
    TableName: tableName,
    Item: {
      PK: "stripe#evt_1",
      SK: "DELIVERY#2026-10-10T10:05:00.000Z#req-2",
      received_at: "2026-10-10T10:05:00.000Z",
      request_id: "req-2",
      expires_at: eventExpiresAt,
    },
  });
});

test("recordStatus records the status as its subject's latest unless a stored status outranks it", async () => {
  const { dynamo, repository } = setup();
  const putIf = vi.spyOn(dynamo, "putIf").mockResolvedValue(true);

  await expect(repository.recordStatus(event, 2)).resolves.toEqual({ outdated: false });

  const input = putIf.mock.calls[0][0];
  expect(input).toMatchObject({
    TableName: tableName,
    Item: {
      PK: "SUBJECT#stripe#payment#pi_1",
      SK: "STATUS",
      provider_event_id: "evt_1",
      status: "succeeded",
      occurred_at: "2026-10-10T10:00:00.000Z",
      rank: "02#2026-10-10T10:00:00.000Z#evt_1",
      expires_at: eventExpiresAt,
    },
  });
  expect(expression(input, "ConditionExpression")).toBe(
    '(attribute_not_exists(PK)) OR (rank <= "02#2026-10-10T10:00:00.000Z#evt_1")',
  );
});

test("recordStatus reports the event as outdated when the stored status outranks it", async () => {
  const { dynamo, repository } = setup();
  vi.spyOn(dynamo, "putIf").mockResolvedValue(false);

  await expect(repository.recordStatus(event, 2)).resolves.toEqual({ outdated: true });
});

test("recordStatus ranks precedence first, then occurrence, then event ID", async () => {
  const { dynamo, repository } = setup();
  const putIf = vi.spyOn(dynamo, "putIf").mockResolvedValue(true);
  const later = new Date("2026-10-10T11:00:00.000Z");
  // Listed from the lowest rank to the highest.
  const ranked: [WebhookEventRepository.StatusEvent, number][] = [
    [{ ...event, providerEventId: "evt_late", occurredAt: later }, 1],
    [{ ...event, providerEventId: "evt_a" }, 2],
    [{ ...event, providerEventId: "evt_b" }, 2],
    [{ ...event, providerEventId: "evt_c", occurredAt: later }, 2],
    [{ ...event, providerEventId: "evt_early" }, 3],
    [{ ...event, providerEventId: "evt_0" }, 10],
  ];

  for (const [rankedEvent, precedence] of ranked) {
    await repository.recordStatus(rankedEvent, precedence);
  }

  const ranks = putIf.mock.calls.map(([input]) => input.Item?.rank as string);
  expect([...ranks].sort()).toEqual(ranks);
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
  const input = queryAll.mock.calls[0][0];
  expect(input.TableName).toBe(tableName);
  expect(expression(input, "KeyConditionExpression")).toBe('PK = "stripe#evt_1"');
  await expect(
    repository.getTrace({ provider: "stripe", providerEventId: "evt_missing" }),
  ).resolves.toBeUndefined();
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
  expect(
    queryAll.mock.calls.map(([input]) =>
      Object.values(input.ExpressionAttributeValues ?? {}).find((value) =>
        /^((stripe|simulated)#[0-3])$/.test(String(value)),
      ),
    ),
  ).toEqual([
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
  const input = queryAll.mock.calls[0][0];
  expect(input).toMatchObject({ TableName: tableName, IndexName: "GSI1" });
  expect(expression(input, "KeyConditionExpression")).toBe(
    '(GSI1PK = "stripe#0") AND (received_at BETWEEN ' +
      '"2026-10-10T00:00:00.000Z" AND "2026-10-10T23:59:59.999Z")',
  );
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

  expect(expression(queryAll.mock.calls[0][0], "FilterExpression")).toBe(
    'event_type = "charge.refunded"',
  );
});

test("listReceived returns nothing for an empty interval without querying", async () => {
  const { dynamo, repository } = setup();
  const queryAll = stubQueries(dynamo, {});
  const instant = new Date("2026-10-10T00:00:00.000Z");

  await expect(
    repository.listReceived({ providers: ["stripe"], from: instant, to: instant }),
  ).resolves.toEqual([]);
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

  const events = await repository.listBySubject({
    provider: "stripe",
    subject: { type: "payment", id: "pi_1" },
  });

  // GSI2 projects neither the payload, the subscription, nor the event's handling.
  const { payload, status, subscriptionId, processingStatus, outdated, ...summary } = event;
  expect(events).toEqual([summary]);
  const input = queryAll.mock.calls[0][0];
  expect(input).toMatchObject({ TableName: tableName, IndexName: "GSI2" });
  expect(expression(input, "KeyConditionExpression")).toBe('GSI2PK = "stripe#payment#pi_1"');
});
