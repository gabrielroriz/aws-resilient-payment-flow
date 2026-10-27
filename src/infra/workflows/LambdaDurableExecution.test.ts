import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ExecutionStatus } from "@aws-sdk/client-lambda";
import { withDurableExecution } from "@aws/durable-execution-sdk-js";
import { LocalDurableTestRunner } from "@aws/durable-execution-sdk-js-testing";
import { SystemClock } from "@infra/clock/SystemClock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { LambdaDurableExecution } from "@infra/workflows/LambdaDurableExecution";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Retry delays pass at once, so backoff never slows the tests.
beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));
afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

// Runs `work` as the only step of an execution, through the adapter under test.
function run(work: () => Promise<unknown>) {
  const execution = new LambdaDurableExecution(new JsonLogger(new SystemClock()));
  const runner = new LocalDurableTestRunner({
    handlerFunction: withDurableExecution(async (_input: unknown, context) =>
      execution.withContext(context, () => execution.step("grant_access", work)),
    ),
  });
  return { runner, result: runner.run({ payload: {} }) };
}

test("a step runs once and returns its result", async () => {
  const work = vi.fn(async () => ({ granted: true }));
  const { runner, result } = run(work);

  const completed = await result;

  expect(completed.getStatus()).toBe(ExecutionStatus.SUCCEEDED);
  expect(completed.getResult()).toEqual({ granted: true });
  expect(work).toHaveBeenCalledOnce();
  expect(runner.getOperation("grant_access").getStepDetails()?.result).toEqual({ granted: true });
});

test("a failing step retries with backoff until it succeeds, logging each failure", async () => {
  const work = vi
    .fn(async () => {})
    .mockRejectedValueOnce(new Error("throttled"))
    .mockRejectedValueOnce(new Error("throttled"));
  const logs = captureLogs();

  expect((await run(work).result).getStatus()).toBe(ExecutionStatus.SUCCEEDED);

  expect(work).toHaveBeenCalledTimes(3);
  const failures = logs().filter((entry) => entry.message === "workflow_step_error");
  expect(failures).toHaveLength(2);
  expect(failures[0]).toMatchObject({
    step: "grant_access",
    errorMessage: "throttled",
    errorCode: "INTERNAL_SERVER_ERROR",
  });
});

test("a step that keeps failing stops after its retries and fails the execution", async () => {
  const work = vi.fn(async () => {
    throw new Error("still down");
  });
  captureLogs();

  const completed = await run(work).result;

  expect(completed.getStatus()).toBe(ExecutionStatus.FAILED);
  expect(completed.getError().errorMessage).toBe("still down");
  // The first attempt and its 31 retries.
  expect(work).toHaveBeenCalledTimes(32);
});

test("an error that can never succeed fails the execution without a retry", async () => {
  const work = vi.fn(async () => {
    throw new ErrorWebhookEventNotFound({ provider: "gatewayBrazil", providerEventId: "evt_1" });
  });
  const logs = captureLogs();

  const completed = await run(work).result;

  expect(completed.getStatus()).toBe(ExecutionStatus.FAILED);
  expect(completed.getError().errorMessage).toBe(
    "Stored webhook event not found: gatewayBrazil/evt_1",
  );
  expect(work).toHaveBeenCalledOnce();
  expect(logs().find((entry) => entry.message === "workflow_step_error")).toMatchObject({
    errorCode: "WEBHOOK_EVENT_NOT_FOUND",
  });
});

test("a step outside a durable execution is rejected before it runs", async () => {
  const execution = new LambdaDurableExecution(new JsonLogger(new SystemClock()));
  const work = vi.fn(async () => {});

  expect(() => execution.step("grant_access", work)).toThrow(
    "A durable step can only run inside a durable execution.",
  );
  expect(work).not.toHaveBeenCalled();
});
