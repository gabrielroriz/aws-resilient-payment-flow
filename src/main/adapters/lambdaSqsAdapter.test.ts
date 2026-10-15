import { MessageHandler } from "@application/contracts/MessageHandler";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { SystemClock } from "@infra/clock/SystemClock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { Schema } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";
import { sqsEvent } from "@main/adapters/lambdaSqsAdapter.fixtures";
import type { Context } from "aws-lambda";
import { expect, test, vi } from "vitest";

const logger = new JsonLogger(new SystemClock());

test("awaits each message in order and acknowledges the completed batch", async () => {
  const completed: unknown[] = [];
  const handler = lambdaSqsAdapter(
    {
      handle: async (body) => {
        await Promise.resolve();
        completed.push(body);
      },
    },
    logger,
  );
  await expect(handler(sqsEvent({ id: 1 }, { id: 2 }))).resolves.toEqual({ batchItemFailures: [] });
  expect(completed).toEqual([{ id: 1 }, { id: 2 }]);
  await expect(handler(sqsEvent())).resolves.toEqual({ batchItemFailures: [] });
});

test("a failed FIFO record retries itself and every unprocessed record, preserving prior successes", async () => {
  const logs = captureLogs();
  const handle = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("storage unavailable"));
  const event = sqsEvent({ id: 1 }, { id: 2 }, { id: 3 });
  await expect(lambdaSqsAdapter({ handle }, logger)(event)).resolves.toEqual({
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

test("malformed JSON fails before the handler and keeps the remainder of the batch", async () => {
  const logs = captureLogs();
  const handle = vi.fn();
  const event = sqsEvent({}, {});
  event.Records[0].body = "{sensitive-payment-payload";
  await expect(lambdaSqsAdapter({ handle }, logger)(event)).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }, { itemIdentifier: "message-1" }],
  });
  expect(handle).not.toHaveBeenCalled();
  expect(logs()[0]).toMatchObject({
    category: "queue",
    errorKind: "unexpected",
    errorCode: "QUEUE_MALFORMED_MESSAGE",
    errorName: "ErrorQueueMalformedMessage",
    errorMessage: "Queue message body is not valid JSON.",
    errorStack: expect.any(String),
  });
  expect(JSON.stringify(logs())).not.toContain("sensitive-payment-payload");
});

test("a message that does not match the handler's schema fails before the handler and keeps the remainder of the batch", async () => {
  const logs = captureLogs();
  const handled: unknown[] = [];
  @Schema(z.object({ id: z.number() }))
  class Handler implements MessageHandler {
    async handle(message: { id: number }) {
      handled.push(message);
    }
  }

  const event = sqsEvent({ id: 1, extra: "dropped" }, { id: "card-4111" }, { id: 3 });
  await expect(lambdaSqsAdapter(new Handler(), logger)(event)).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-1" }, { itemIdentifier: "message-2" }],
  });
  // The handler receives the schema's output, so undeclared fields never reach it.
  expect(handled).toEqual([{ id: 1 }]);
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
  expect(JSON.stringify(logs())).not.toContain("card-4111");
});

test("expected application errors keep their metadata and retry the batch without logging a stack", async () => {
  const logs = captureLogs();
  const handle = vi.fn().mockRejectedValue(new ErrorWebhookProviderNotFound("unknown"));
  await expect(lambdaSqsAdapter({ handle }, logger)(sqsEvent({}, {}))).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }, { itemIdentifier: "message-1" }],
  });
  expect(handle).toHaveBeenCalledTimes(1);
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

test("every entry logged while handling a message carries the message's identity and the invocation's", async () => {
  const logs = captureLogs();
  const handler = lambdaSqsAdapter(
    {
      async handle() {
        logger.info("webhook_routed");
      },
    },
    logger,
  );

  await handler(sqsEvent({}, {}), { awsRequestId: "lambda-1" } as Context);

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
