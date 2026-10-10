import { Controller } from "@application/contracts/Controller";
import { ApplicationError } from "@application/errors/application/ApplicationError";
import { ErrorCategory } from "@application/errors/enums/ErrorCategory";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { ErrorKind } from "@application/errors/enums/ErrorKind";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { invokeHttp } from "@main/adapters/lambdaHttpAdapter.fixtures";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
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

// An error the application defines but declares unexpected, such as data a supported provider sent.
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

const handler = lambdaHttpAdapter(controller);

test("the HTTP adapter maps requests, application errors, and unknown errors to responses", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
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

  // An error the application defines keeps its status and code even when it needs attention.
  expect(await call({ body: '{"mode":"unreadable"}' })).toEqual({
    statusCode: 400,
    body: { success: false, error: { code: "UNREADABLE", message: "Event cannot be read" } },
  });

  expect(await call({ body: "{not json" })).toEqual({
    statusCode: 400,
    body: { success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON body" } },
  });

  // Unknown failures hide their details from the caller but keep them in the logs.
  expect(await call({ body: '{"mode":"unexpected"}' })).toEqual({
    statusCode: 500,
    body: { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
  });
});

test("the HTTP adapter logs every error with its category, kind, and code", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  for (const mode of ["expected", "unreadable", "unexpected"]) {
    await invokeHttp(handler, { routeKey: "POST /test", body: JSON.stringify({ mode }) });
  }
  await invokeHttp(handler, { routeKey: "POST /test", body: "{not json" });

  const logs = consoleError.mock.calls.map(([line]) => JSON.parse(line));
  const common = { logType: "application_error", requestId: "test-request", route: "POST /test" };
  expect(logs).toMatchObject([
    {
      ...common,
      category: "webhooks",
      errorKind: "expected",
      errorCode: "CONFLICT",
      errorName: "Conflict",
      errorMessage: "Already processed",
    },
    { ...common, category: "webhooks", errorKind: "unexpected", errorCode: "UNREADABLE", errorName: "Unreadable" },
    { ...common, errorKind: "unexpected", errorCode: "INTERNAL_SERVER_ERROR", errorMessage: "database password leaked" },
    { ...common, category: "http", errorKind: "expected", errorCode: "BAD_REQUEST", errorName: "BadRequest" },
  ]);
  // Errors the application does not define have no category; the route and function identify them.
  expect(logs[2]).not.toHaveProperty("category");
  // Stacks are logged only for the errors that need investigating.
  expect(logs.map((log) => "errorStack" in log)).toEqual([false, true, true, false]);
});

test("the HTTP adapter decodes a base64-encoded body before passing it on", async () => {
  // API Gateway base64-encodes bodies it does not treat as text.
  const { body } = await invokeHttp(handler, {
    body: Buffer.from('{"mode":"echo"}').toString("base64"),
    isBase64Encoded: true,
  });

  expect(body).toMatchObject({ body: { mode: "echo" }, rawBody: '{"mode":"echo"}' });
});
