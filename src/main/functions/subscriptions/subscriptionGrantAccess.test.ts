import { ExecutionStatus } from "@aws-sdk/client-lambda";
import { LocalDurableTestRunner } from "@aws/durable-execution-sdk-js-testing";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { handler } from "@main/functions/subscriptions/subscriptionGrantAccess";
import { afterAll, beforeAll, expect, test } from "vitest";

beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));
afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

// The contract the worker sends for a succeeded payment.
const input = {
  provider: "gatewayBrazil",
  subscription_id: "sub_1",
  payment_id: "pay_1",
  metadata: { event_id: "evt_1", received_at: "2026-10-10T10:00:01.000Z" },
};

function run(payload: unknown) {
  return new LocalDurableTestRunner({ handlerFunction: handler }).run({ payload });
}

test("the workflow grants the subscription's access from its input", async () => {
  const logs = captureLogs();

  const result = await run(input);

  expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED);
  expect(logs().find((entry) => entry.message === "subscription_access_granted")).toMatchObject({
    provider: "gatewayBrazil",
    subscriptionId: "sub_1",
    paymentId: "pay_1",
    eventId: "evt_1",
    durableExecutionArn: expect.any(String),
  });
});

test.each([
  { ...input, subscription_id: " " },
  { ...input, metadata: { event_id: "evt_1" } },
  { ...input, metadata: { ...input.metadata, received_at: "yesterday" } },
  { provider: "gatewayBrazil", providerEventId: "evt_1" },
])("the workflow fails at once for input outside its contract: %j", async (payload) => {
  const logs = captureLogs();

  const result = await run(payload);

  expect(result.getStatus()).toBe(ExecutionStatus.FAILED);
  expect(result.getError().errorMessage).toMatch(/^Workflow input does not match/);
  expect(logs().some((entry) => entry.message === "subscription_access_granted")).toBe(false);
});
