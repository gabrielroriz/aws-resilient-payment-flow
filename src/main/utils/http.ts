import { ErrorHttpBadRequest } from "@application/errors/http/ErrorHttpBadRequest";
import { ErrorHttpInvalidBody } from "@application/errors/http/ErrorHttpInvalidBody";
import { validatePayload } from "@kernel/decorators/schema";
import { parseJson } from "@kernel/utils/json";
import type { APIGatewayProxyResultV2 } from "aws-lambda";

// Returns the request body as the client sent it.
// API Gateway base64-encodes bodies it does not treat as text, such as form posts.
// Those are decoded back to the original text.
export function decodeHttpBody(
  body: string | undefined,
  isBase64Encoded: boolean,
): string | undefined {
  if (body === undefined || !isBase64Encoded) {
    return body;
  }

  return Buffer.from(body, "base64").toString("utf8");
}

// Parses a raw request body as JSON.
// A malformed body is the caller's fault, so it gets a 400, not an unexpected 500.
export function parseHttpBody(body: string | undefined): unknown {
  if (!body) {
    return undefined;
  }

  const parsed = parseJson(body);
  if (parsed === undefined) {
    throw new ErrorHttpBadRequest("Malformed JSON body");
  }
  return parsed;
}

// Validates a parsed body against the controller's `@Schema`.
// A body that does not match is the caller's fault, so it gets a 400.
// It is rejected before the controller is reached.
export function validateHttpBody(controller: object, body: unknown): unknown {
  const result = validatePayload(controller, body);
  if (!result.success) {
    throw new ErrorHttpInvalidBody(result.issues);
  }
  return result.data;
}

// Builds an API Gateway HTTP API response with a JSON body.
// An undefined body sends only the status code, so a 204 carries no content type.
export function buildHttpResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  if (body === undefined) {
    return { statusCode };
  }

  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
