import { Controller } from "@application/contracts/Controller";
import { ApplicationError } from "@application/errors/application/ApplicationError";
import { ErrorCode } from "@application/errors/ErrorCode";
import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";
import { invokeHttp } from "@main/adapters/lambdaHttpAdapter.fixtures";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { expect, test, vi } from "vitest";

class Conflict extends ApplicationError {
  code = "CONFLICT" as ErrorCode;
  override statusCode = 409;
}

const controller: Controller = {
  async handle(request) {
    const body = request.body as { mode?: string } | undefined;
    if (body?.mode === "expected") throw new Conflict("Already processed");
    if (body?.mode === "unexpected") throw new Error("database password leaked");
    return { statusCode: 202, body: request };
  },
};

const handler = lambdaHttpAdapter(controller);

test("the HTTP adapter maps requests, expected errors, and unexpected errors", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
    body: { body: { mode: "echo" }, params: { id: "1" }, queryParams: { q: "x" }, headers: { "x-test": "yes" } },
  });

  expect(await call({ body: '{"mode":"expected"}' })).toEqual({
    statusCode: 409,
    body: { success: false, error: { code: "CONFLICT", message: "Already processed" } },
  });

  expect(await call({ body: "{not json" })).toEqual({
    statusCode: 400,
    body: { success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON body" } },
  });

  // Unexpected failures hide their details from the caller but keep them in the logs.
  expect(await call({ body: '{"mode":"unexpected"}' })).toEqual({
    statusCode: 500,
    body: { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
  });
  const logs = consoleError.mock.calls.map(([line]) => JSON.parse(line));
  expect(logs.map((log) => log.errorKind)).toEqual(["expected", "expected", "unexpected"]);
  expect(logs[2]).toMatchObject({ errorMessage: "database password leaked", requestId: "test-request" });
});
