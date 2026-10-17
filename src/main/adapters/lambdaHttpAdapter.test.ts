import { Controller } from "@application/contracts/Controller";
import { ApplicationError } from "@application/errors/application/ApplicationError";
import { ErrorCategory } from "@application/errors/enums/ErrorCategory";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { ErrorKind } from "@application/errors/enums/ErrorKind";
import { SystemClock } from "@infra/clock/SystemClock";
import { JsonLogger } from "@infra/logging/JsonLogger";
import { captureLogs } from "@infra/logging/JsonLogger.fixtures";
import { Schema } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { httpEvent, invokeHttp } from "@main/adapters/lambdaHttpAdapter.fixtures";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { expect, test, vi } from "vitest";

class Conflict extends ApplicationError {
  constructor() {
    super("Already processed", {
      statusCode: 409,
      code: "CONFLICT" as ErrorCode,
      category: ErrorCategory.WEBHOOKS,
      kind: ErrorKind.EXPECTED,
    });
  }
}

// An application error declared unexpected, such as data a supported provider sent.
class Unreadable extends ApplicationError {
  constructor() {
    super("Event cannot be read", {
      statusCode: 400,
      code: "UNREADABLE" as ErrorCode,
      category: ErrorCategory.WEBHOOKS,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}

const controller: Controller = {
  async handle(request) {
    const body = request.body as { mode?: string } | undefined;
    if (body?.mode === "expected") throw new Conflict();
    if (body?.mode === "unreadable") throw new Unreadable();
    if (body?.mode === "unexpected") throw new Error("database password leaked");
    return { statusCode: 202, body: request };
  },
};

const logger = new JsonLogger(new SystemClock());
const handler = lambdaHttpAdapter(controller, logger);

test("the HTTP adapter maps requests, application errors, and unknown errors to responses", async () => {
  captureLogs();
  const call = async (overrides: Partial<APIGatewayProxyEventV2>) => {
    const { statusCode, body } = await invokeHttp(handler, overrides);
    return { statusCode, body };
  };

  expect(
    await call({
      body: '{"mode":"echo"}',
      pathParameters: { id: "1" },
      queryStringParameters: { q: "x" },
      headers: { "x-test": "yes" },
    }),
  ).toEqual({
    statusCode: 202,
    body: {
      body: { mode: "echo" },
      rawBody: '{"mode":"echo"}',
      params: { id: "1" },
      queryParams: { q: "x" },
      headers: { "x-test": "yes" },
      requestId: "test-request",
    },
  });

  expect(await call({ body: '{"mode":"expected"}' })).toEqual({
    statusCode: 409,
    body: { success: false, error: { code: "CONFLICT", message: "Already processed" } },
  });

  // An application error keeps its status and code even when it needs attention.
  expect(await call({ body: '{"mode":"unreadable"}' })).toEqual({
    statusCode: 400,
    body: { success: false, error: { code: "UNREADABLE", message: "Event cannot be read" } },
  });

  expect(await call({ body: "{not json" })).toEqual({
    statusCode: 400,
    body: { success: false, error: { code: "HTTP_BAD_REQUEST", message: "Malformed JSON body" } },
  });

  // Unknown failures hide their details from the caller but keep them in the logs.
  expect(await call({ body: '{"mode":"unexpected"}' })).toEqual({
    statusCode: 500,
    body: {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
    },
  });
});

test("the HTTP adapter logs every error with its category, kind, and code", async () => {
  const read = captureLogs();

  for (const mode of ["expected", "unreadable", "unexpected"]) {
    await invokeHttp(handler, { routeKey: "POST /test", body: JSON.stringify({ mode }) });
  }
  await invokeHttp(handler, { routeKey: "POST /test", body: "{not json" });

  const logs = read();
  const common = {
    level: "ERROR",
    message: "application_error",
    requestId: "test-request",
    route: "POST /test",
  };
  expect(logs).toMatchObject([
    {
      ...common,
      category: "webhooks",
      errorKind: "expected",
      errorCode: "CONFLICT",
      errorName: "Conflict",
      errorMessage: "Already processed",
    },
    {
      ...common,
      category: "webhooks",
      errorKind: "unexpected",
      errorCode: "UNREADABLE",
      errorName: "Unreadable",
    },
    {
      ...common,
      errorKind: "unexpected",
      errorCode: "INTERNAL_SERVER_ERROR",
      errorMessage: "database password leaked",
    },
    {
      ...common,
      category: "http",
      errorKind: "expected",
      errorCode: "HTTP_BAD_REQUEST",
      errorName: "ErrorHttpBadRequest",
    },
  ]);
  // Errors the application does not define have no category.
  // The route and function identify them instead.
  expect(logs[2]).not.toHaveProperty("category");
  // Stacks are logged only for the errors that need investigating.
  expect(logs.map((log) => "errorStack" in log)).toEqual([false, true, true, false]);
});

test("every entry logged while handling a request carries the request's identity", async () => {
  const logs = captureLogs();
  const logging = lambdaHttpAdapter(
    {
      async handle() {
        logger.info("webhook_routed");
        return { statusCode: 200, body: {} };
      },
    },
    logger,
  );

  await logging(httpEvent({ routeKey: "POST /test" }), { awsRequestId: "lambda-1" } as Context);
  logger.info("webhook_routed");

  expect(logs()).toEqual([
    expect.objectContaining({
      lambdaRequestId: "lambda-1",
      requestId: "test-request",
      route: "POST /test",
    }),
    // The context ends with the request, so later entries do not carry it.
    expect.not.objectContaining({ requestId: expect.anything() }),
  ]);
});

test("the HTTP adapter decodes a base64-encoded body before passing it on", async () => {
  // API Gateway base64-encodes bodies it does not treat as text.
  const { body } = await invokeHttp(handler, {
    body: Buffer.from('{"mode":"echo"}').toString("base64"),
    isBase64Encoded: true,
  });

  expect(body).toMatchObject({ body: { mode: "echo" }, rawBody: '{"mode":"echo"}' });
});

test("the HTTP adapter validates the body against the controller's schema before calling it", async () => {
  captureLogs();
  const handle = vi.fn(async (request: Controller.Request<{ amount: number }>) => ({
    statusCode: 201,
    body: request.body,
  }));
  @Schema(z.object({ amount: z.int().check(z.positive()) }))
  class CreatePaymentController implements Controller {
    handle = handle;
  }
  const createPayment = lambdaHttpAdapter(new CreatePaymentController(), logger);

  // Undeclared fields are dropped, so the controller sees only its schema's fields.
  expect(await invokeHttp(createPayment, { body: '{"amount":100,"extra":true}' })).toMatchObject({
    statusCode: 201,
    body: { amount: 100 },
  });

  expect(await invokeHttp(createPayment, { body: '{"amount":-5}' })).toMatchObject({
    statusCode: 400,
    body: {
      success: false,
      error: {
        code: "HTTP_INVALID_BODY",
        message: "Invalid request body: amount: Too small: expected number to be >0",
      },
    },
  });
  expect(handle).toHaveBeenCalledTimes(1);
});
