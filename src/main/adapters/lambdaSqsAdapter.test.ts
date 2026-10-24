import { MessageHandler } from "@application/contracts/MessageHandler";
import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { SystemClock } from "@infra/clock/SystemClock";
import { AsyncInvocationContext } from "@infra/invocation/AsyncInvocationContext";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { Schema } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";
import { deadLetterQueue, sqsEvent } from "@main/adapters/lambdaSqsAdapter.fixtures";
import { lambdaContext } from "@main/utils/lambdaContext.fixtures";
import { expect, test, vi } from "vitest";

const logger = new JsonLogger(new SystemClock());
const invocationContext = new AsyncInvocationContext(new SystemClock());

function adapter(handler: MessageHandler, deadLetters = deadLetterQueue()) {
  return lambdaSqsAdapter(handler, logger, invocationContext, deadLetters);
}

test("a batch shares its runtime deadline and the next invocation gets fresh timing", async () => {
  let now = 1_000;
  const invocation = new AsyncInvocationContext({ now: () => new Date(now) });
  const timings: number[][] = [];
  const adapter = lambdaSqsAdapter(
    {
      async handle() {
        await Promise.resolve();
        timings.push([invocation.startedAt().getTime(), invocation.deadline().getTime()]);
        now += 1_000;
      },
    },
    logger,
    invocation,
    deadLetterQueue(),
  );
  const getRemainingTimeInMillis = vi.fn().mockReturnValueOnce(5_000).mockReturnValueOnce(9_000);
  const context = lambdaContext({ getRemainingTimeInMillis });

  await expect(adapter(sqsEvent({}, {}), context)).resolves.toEqual({ batchItemFailures: [] });
  now = 100_000;
  await expect(adapter(sqsEvent({}), context)).resolves.toEqual({ batchItemFailures: [] });

  expect(timings).toEqual([
    [1_000, 6_000],
    [1_000, 6_000],
    [100_000, 109_000],
  ]);
  expect(getRemainingTimeInMillis).toHaveBeenCalledTimes(2);
  expect(() => invocation.deadline()).toThrow("outside an invocation");
});

test("awaits each message in order and acknowledges the completed batch", async () => {
  const completed: unknown[] = [];
  const handler = adapter({
    handle: async (body) => {
      await Promise.resolve();
      completed.push(body);
    },
  });
  await expect(handler(sqsEvent({ id: 1 }, { id: 2 }), lambdaContext())).resolves.toEqual({
    batchItemFailures: [],
  });
  expect(completed).toEqual([{ id: 1 }, { id: 2 }]);
  await expect(handler(sqsEvent(), lambdaContext())).resolves.toEqual({ batchItemFailures: [] });
});

test("a failed FIFO record retries itself and every unprocessed record, preserving prior successes", async () => {
  const logs = captureLogs();
  const handle = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("storage unavailable"));
  const event = sqsEvent({ id: 1 }, { id: 2 }, { id: 3 });
  await expect(adapter({ handle })(event, lambdaContext())).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-1" }, { itemIdentifier: "message-2" }],
  });
  expect(handle.mock.calls).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  const failure = logs()[0];
  expect(failure).toMatchObject({
    level: "ERROR",
    message: "queue_message_error",
    messageId: "message-1",
    messageGroupId: "gatewayGlobal",
    receiveCount: "1",
    errorMessage: "storage unavailable",
    errorKind: "unexpected",
    errorCode: "INTERNAL_SERVER_ERROR",
    errorStack: expect.any(String),
  });
  expect(failure).not.toHaveProperty("category");
});

test("a failed group does not spend the receives of other groups in the batch", async () => {
  const logs = captureLogs();
  const handle = vi.fn(async (body: { id: number }) => {
    if (body.id === 2 || body.id === 5) throw new Error("storage unavailable");
  });
  const event = sqsEvent(
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 4 },
    { id: 5 },
    { id: 6 },
    { id: 7 },
    { id: 8 },
  );
  const groups = [
    "gatewayGlobal",
    "gatewayGlobal",
    "gatewayBrazil",
    "gatewayGlobal",
    "gatewayBrazil",
    "gatewayBrazil",
    "gatewayOther",
    "gatewayOther",
  ];
  event.Records.forEach((record, index) => {
    record.attributes.MessageGroupId = groups[index];
  });

  await expect(adapter({ handle })(event, lambdaContext())).resolves.toEqual({
    batchItemFailures: [
      { itemIdentifier: "message-1" },
      { itemIdentifier: "message-3" },
      { itemIdentifier: "message-4" },
      { itemIdentifier: "message-5" },
    ],
  });
  expect(handle.mock.calls).toEqual([
    [{ id: 1 }],
    [{ id: 2 }],
    [{ id: 3 }],
    [{ id: 5 }],
    [{ id: 7 }],
    [{ id: 8 }],
  ]);
  expect(logs().map(({ messageId }) => messageId)).toEqual(["message-1", "message-4"]);
});

test("malformed JSON is parked at once without reaching the handler, and its group continues", async () => {
  const logs = captureLogs();
  const deadLetters = deadLetterQueue();
  const handle = vi.fn();
  const event = sqsEvent({}, {});
  event.Records[0].body = "{sensitive-payment-payload";
  await expect(adapter({ handle }, deadLetters)(event, lambdaContext())).resolves.toEqual({
    batchItemFailures: [],
  });
  expect(handle).toHaveBeenCalledExactlyOnceWith({});
  expect(deadLetters.park).toHaveBeenCalledExactlyOnceWith({
    body: "{sensitive-payment-payload",
    groupId: "gatewayGlobal",
    errorCode: "QUEUE_MALFORMED_MESSAGE",
    receiveCount: 1,
  });
  expect(logs()).toEqual([
    expect.objectContaining({
      category: "queue",
      errorKind: "unexpected",
      errorCode: "QUEUE_MALFORMED_MESSAGE",
      errorName: "ErrorQueueMalformedMessage",
      errorMessage: "Queue message body is not valid JSON.",
      errorStack: expect.any(String),
    }),
    expect.objectContaining({
      level: "ERROR",
      message: "queue_message_parked",
      messageId: "message-0",
    }),
  ]);
  expect(JSON.stringify(logs())).not.toContain("sensitive-payment-payload");
});

test("a message that does not match the handler's schema is parked at once, and its group continues", async () => {
  const logs = captureLogs();
  const deadLetters = deadLetterQueue();
  const handled: unknown[] = [];
  @Schema(z.object({ id: z.number() }))
  class Handler implements MessageHandler {
    async handle(message: { id: number }) {
      handled.push(message);
    }
  }

  const event = sqsEvent({ id: 1, extra: "dropped" }, { id: "card-4111" }, { id: 3 });
  await expect(adapter(new Handler(), deadLetters)(event, lambdaContext())).resolves.toEqual({
    batchItemFailures: [],
  });
  // The handler receives the schema's output, so undeclared fields never reach it.
  expect(handled).toEqual([{ id: 1 }, { id: 3 }]);
  expect(deadLetters.park).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ body: '{"id":"card-4111"}', errorCode: "QUEUE_INVALID_MESSAGE" }),
  );
  expect(logs()[0]).toMatchObject({
    messageId: "message-1",
    category: "queue",
    errorKind: "unexpected",
    errorCode: "QUEUE_INVALID_MESSAGE",
    errorName: "ErrorQueueInvalidMessage",
    errorMessage:
      "Queue message does not match the handler's schema: id: Invalid input: expected number, received string",
    errorStack: expect.any(String),
  });
  // The parked message keeps its body for redrive, but no log entry quotes it.
  expect(JSON.stringify(logs())).not.toContain("card-4111");
});

test.each([
  [
    "an unknown provider",
    new ErrorWebhookProviderNotFound("unknown"),
    "WEBHOOK_PROVIDER_NOT_FOUND",
  ],
  [
    "a missing stored event",
    new ErrorWebhookEventNotFound({ provider: "gatewayGlobal", providerEventId: "evt" }),
    "WEBHOOK_EVENT_NOT_FOUND",
  ],
])("%s can never succeed, so it is parked at once", async (_, error, errorCode) => {
  captureLogs();
  const deadLetters = deadLetterQueue();
  const handle = vi.fn().mockRejectedValue(error);

  await expect(adapter({ handle }, deadLetters)(sqsEvent({}), lambdaContext())).resolves.toEqual({
    batchItemFailures: [],
  });
  expect(deadLetters.park).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ errorCode, receiveCount: 1 }),
  );
});

test("a failure that may still succeed is never parked, so SQS delivers it again", async () => {
  captureLogs();
  const deadLetters = deadLetterQueue();
  const handle = vi.fn().mockRejectedValue(new Error("storage unavailable"));

  await expect(adapter({ handle }, deadLetters)(sqsEvent({}), lambdaContext())).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }],
  });
  expect(deadLetters.park).not.toHaveBeenCalled();
});

test("expected application errors keep their metadata and log no stack", async () => {
  const logs = captureLogs();
  const handle = vi.fn().mockRejectedValue(new ErrorWebhookProviderNotFound("unknown"));

  await adapter({ handle })(sqsEvent({}), lambdaContext());

  const failure = logs()[0];
  expect(failure).toMatchObject({
    category: "webhooks",
    errorKind: "expected",
    errorCode: "WEBHOOK_PROVIDER_NOT_FOUND",
    errorName: "ErrorWebhookProviderNotFound",
    errorMessage: "Unknown webhook provider: unknown",
  });
  expect(failure).not.toHaveProperty("errorStack");
});

test("a message that cannot be parked stays for SQS to deliver again, holding back its group", async () => {
  const logs = captureLogs();
  const deadLetters = deadLetterQueue();
  deadLetters.park.mockRejectedValue(new Error("SQS unavailable"));
  const handle = vi.fn();
  const event = sqsEvent({}, {});
  event.Records[0].body = "not json";

  await expect(adapter({ handle }, deadLetters)(event, lambdaContext())).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }, { itemIdentifier: "message-1" }],
  });
  expect(handle).not.toHaveBeenCalled();
  expect(logs().at(1)).toMatchObject({
    level: "ERROR",
    message: "queue_message_park_failed",
    messageId: "message-0",
    errorMessage: "SQS unavailable",
  });
});

test("every entry logged while handling a message carries the message's identity and the invocation's", async () => {
  const logs = captureLogs();
  const handler = adapter({
    async handle() {
      logger.info("webhook_routed");
    },
  });

  await handler(sqsEvent({}, {}), lambdaContext({ awsRequestId: "lambda-1" }));

  expect(logs()).toEqual([
    expect.objectContaining({
      lambdaRequestId: "lambda-1",
      messageId: "message-0",
      messageGroupId: "gatewayGlobal",
      receiveCount: "1",
      eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:webhook_events.fifo",
    }),
    expect.objectContaining({ lambdaRequestId: "lambda-1", messageId: "message-1" }),
  ]);
});
