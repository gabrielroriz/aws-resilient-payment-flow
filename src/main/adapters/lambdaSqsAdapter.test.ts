import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { lambdaSqsAdapter } from "@main/adapters/lambdaSqsAdapter";
import { sqsEvent } from "@main/adapters/lambdaSqsAdapter.fixtures";
import { expect, test, vi } from "vitest";

test("awaits each message in order and acknowledges the completed batch", async () => {
  const completed: unknown[] = [];
  const handler = lambdaSqsAdapter({
    handle: async (body) => {
      await Promise.resolve();
      completed.push(body);
    },
  });
  await expect(handler(sqsEvent({ id: 1 }, { id: 2 }))).resolves.toEqual({ batchItemFailures: [] });
  expect(completed).toEqual([{ id: 1 }, { id: 2 }]);
  await expect(handler(sqsEvent())).resolves.toEqual({ batchItemFailures: [] });
});

test("a failed FIFO record retries itself and every unprocessed record, preserving prior successes", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handle = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("storage unavailable"));
  const event = sqsEvent({ id: 1 }, { id: 2 }, { id: 3 });
  await expect(lambdaSqsAdapter({ handle })(event)).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-1" }, { itemIdentifier: "message-2" }],
  });
  expect(handle.mock.calls).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  const failure = JSON.parse(log.mock.calls[0][0]);
  expect(failure).toMatchObject({
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
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handle = vi.fn();
  const event = sqsEvent({}, {});
  event.Records[0].body = "{sensitive-payment-payload";
  await expect(lambdaSqsAdapter({ handle })(event)).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }, { itemIdentifier: "message-1" }],
  });
  expect(handle).not.toHaveBeenCalled();
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
    category: "queue",
    errorKind: "unexpected",
    errorCode: "QUEUE_MALFORMED_MESSAGE",
    errorName: "ErrorQueueMalformedMessage",
    errorMessage: "Queue message body is not valid JSON.",
    errorStack: expect.any(String),
  });
  expect(log.mock.calls[0][0]).not.toContain("sensitive-payment-payload");
});

test("expected application errors keep their metadata and retry the batch without logging a stack", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handle = vi.fn().mockRejectedValue(new ErrorWebhookProviderNotFound("unknown"));
  await expect(lambdaSqsAdapter({ handle })(sqsEvent({}, {}))).resolves.toEqual({
    batchItemFailures: [{ itemIdentifier: "message-0" }, { itemIdentifier: "message-1" }],
  });
  expect(handle).toHaveBeenCalledTimes(1);
  const failure = JSON.parse(log.mock.calls[0][0]);
  expect(failure).toMatchObject({
    category: "webhooks",
    errorKind: "expected",
    errorCode: "WEBHOOK_PROVIDER_NOT_FOUND",
    errorName: "ErrorWebhookProviderNotFound",
    errorMessage: "Unknown webhook provider: unknown",
  });
  expect(failure).not.toHaveProperty("errorStack");
});
