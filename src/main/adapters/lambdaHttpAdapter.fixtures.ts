import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

/** Test helpers for handlers built with `lambdaHttpAdapter`. Never imported by Lambda entries. */

type HttpHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

/** A minimal API Gateway HTTP API (payload 2.0) event with only the fields the adapter reads. */
export function httpEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /test",
    rawPath: "/test",
    headers: {},
    requestContext: { requestId: "test-request" },
    ...overrides,
  } as APIGatewayProxyEventV2;
}

/** Calls a handler with a test event and parses its JSON body, so tests assert on plain values. */
export async function invokeHttp(handler: HttpHandler, overrides?: Partial<APIGatewayProxyEventV2>) {
  const response = await handler(httpEvent(overrides));
  // API Gateway also accepts a bare string as a response, but the adapter always builds an object.
  if (typeof response === "string") {
    throw new Error("Expected a structured HTTP response");
  }

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body === undefined ? undefined : JSON.parse(response.body),
  };
}
