import { Clock } from "@application/ports/Clock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { expect, test, vi } from "vitest";

const clock: Clock = { now: () => new Date("2026-10-10T10:00:00.000Z") };

test("every level writes one JSON line led by its timestamp, level, and message", () => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const logger = new JsonLogger(clock);

  logger.debug("webhook_routed", { provider: "gatewayGlobal" });
  logger.info("webhook_routed");
  logger.warn("webhook_routed");
  logger.error("application_error", { errorCode: "INTERNAL_SERVER_ERROR", category: undefined });

  expect(write.mock.calls.map(([line]) => line)).toEqual([
    '{"timestamp":"2026-10-10T10:00:00.000Z","level":"DEBUG","message":"webhook_routed","provider":"gatewayGlobal"}\n',
    '{"timestamp":"2026-10-10T10:00:00.000Z","level":"INFO","message":"webhook_routed"}\n',
    '{"timestamp":"2026-10-10T10:00:00.000Z","level":"WARN","message":"webhook_routed"}\n',
    // Undefined fields are left out, so optional values need no checks before logging.
    '{"timestamp":"2026-10-10T10:00:00.000Z","level":"ERROR","message":"application_error","errorCode":"INTERNAL_SERVER_ERROR"}\n',
  ]);
});

test("entries logged within a context carry its fields, and nested contexts add to it", async () => {
  const logs = captureLogs();
  const logger = new JsonLogger(clock);

  await logger.withContext({ lambdaRequestId: "lambda-1" }, async () => {
    await logger.withContext({ messageId: "message-1" }, async () => {
      await Promise.resolve();
      logger.info("webhook_routed", { provider: "gatewayBrazil" });
    });
    logger.info("webhook_routed");
  });
  logger.info("webhook_routed");

  expect(logs()).toEqual([
    expect.objectContaining({
      lambdaRequestId: "lambda-1",
      messageId: "message-1",
      provider: "gatewayBrazil",
    }),
    expect.not.objectContaining({ messageId: expect.anything() }),
    expect.not.objectContaining({ lambdaRequestId: expect.anything() }),
  ]);
});

test("concurrent contexts never see each other's fields", async () => {
  const logs = captureLogs();
  const logger = new JsonLogger(clock);
  const invocation = (requestId: string, delay: number) =>
    logger.withContext({ requestId }, async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      logger.info("webhook_routed");
    });

  await Promise.all([invocation("slow", 20), invocation("fast", 0)]);

  expect(logs().map((entry) => entry.requestId)).toEqual(["fast", "slow"]);
});

test("an entry whose fields JSON cannot represent is still written, without them", () => {
  const logs = captureLogs();
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  new JsonLogger(clock).error("application_error", { circular });

  expect(logs()).toEqual([
    {
      timestamp: "2026-10-10T10:00:00.000Z",
      level: "ERROR",
      message: "application_error",
      fieldsError: "The entry's fields are not serializable",
    },
  ]);
});
