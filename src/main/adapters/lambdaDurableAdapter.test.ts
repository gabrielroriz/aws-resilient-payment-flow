import { MessageHandler } from "@application/contracts/MessageHandler";
import { ExecutionStatus } from "@aws-sdk/client-lambda";
import { LocalDurableTestRunner } from "@aws/durable-execution-sdk-js-testing";
import { SystemClock } from "@infra/clock/SystemClock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { LambdaDurableExecution } from "@infra/workflows/LambdaDurableExecution";
import { Schema } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";
import { lambdaDurableAdapter } from "@main/adapters/lambdaDurableAdapter";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Retry delays pass at once, so backoff never slows the tests.
beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));
afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

const logger = new JsonLogger(new SystemClock());
const durableExecution = new LambdaDurableExecution(logger);

// Accepts only an input with a named order, and runs a step as use cases do.
@Schema(z.object({ order: z.string() }))
class OrderHandler implements MessageHandler {
  readonly handle = vi.fn(async (_input: unknown) => {
    await durableExecution.step("ship", async () => {
      logger.info("subscription_access_granted");
    });
  });
}

function run(handler: MessageHandler, payload: unknown) {
  const runner = new LocalDurableTestRunner({
    handlerFunction: lambdaDurableAdapter(handler, logger, durableExecution),
  });
  return { runner, result: runner.run({ payload }) };
}

test("the handler receives the input its schema accepts and runs its steps on the execution", async () => {
  const handler = new OrderHandler();
  const logs = captureLogs();
  const { runner, result } = run(handler, { order: "o1", extra: true });

  expect((await result).getStatus()).toBe(ExecutionStatus.SUCCEEDED);

  // Undeclared fields are dropped before the handler sees the input.
  expect(handler.handle).toHaveBeenCalledExactlyOnceWith({ order: "o1" });
  expect(runner.getOperation("ship").getStepDetails()?.attempt).toBe(1);
  // Every entry names the invocation and the execution it belongs to.
  expect(logs().find((entry) => entry.message === "subscription_access_granted")).toMatchObject({
    lambdaRequestId: expect.any(String),
    durableExecutionArn: expect.any(String),
  });
});

test("input that does not match the schema fails the execution before the handler runs", async () => {
  const handler = new OrderHandler();
  const logs = captureLogs();

  const completed = await run(handler, { order: 1 }).result;

  expect(completed.getStatus()).toBe(ExecutionStatus.FAILED);
  expect(completed.getError().errorMessage).toMatch(
    /^Workflow input does not match the handler's schema: order: /,
  );
  expect(handler.handle).not.toHaveBeenCalled();
  expect(logs().find((entry) => entry.message === "workflow_input_error")).toMatchObject({
    errorCode: "WORKFLOW_INVALID_INPUT",
    category: "workflow",
  });
});
