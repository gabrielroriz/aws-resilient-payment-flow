import { BadRequest } from "@application/errors/http/BadRequest";
import type { APIGatewayProxyResultV2 } from "aws-lambda";

/**
 * Returns the request body as the client sent it. API Gateway base64-encodes bodies it does not
 * treat as text, such as form posts, so those are decoded back to the original text.
 */
export function decodeHttpBody(body: string | undefined, isBase64Encoded: boolean): string | undefined {
  if (body === undefined || !isBase64Encoded) {
    return body;
  }

  return Buffer.from(body, "base64").toString("utf8");
}

/**
 * Parses a raw request body as JSON. A malformed body is the caller's fault, so it
 * becomes a `BadRequest` (400) instead of surfacing as an unexpected 500.
 */
export function parseHttpBody(body: string | undefined): unknown {
  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new BadRequest("Malformed JSON body");
  }
}

/**
 * Builds an API Gateway HTTP API response with a JSON body. An undefined body sends
 * only the status code, so responses such as 204 carry no body or content type.
 */
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
