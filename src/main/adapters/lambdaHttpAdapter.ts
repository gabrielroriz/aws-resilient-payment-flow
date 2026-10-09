import { Controller } from "@application/contracts/Controller";
import { ApplicationError } from "@application/errors/application/ApplicationError";
import { ErrorCode } from "@application/errors/ErrorCode";
import { BadRequest } from "@application/errors/http/BadRequest";
import { HttpError } from "@application/errors/http/HttpError";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

/**
 * Driving adapter for API Gateway HTTP API events (payload format 2.0). Converts the
 * event into a controller request and maps the result, or any error, to a response.
 */
export function lambdaHttpAdapter(controller: Controller) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
      const response = await controller.handle({
        body: parseBody(event.body),
        params: event.pathParameters ?? {},
        queryParams: event.queryStringParameters ?? {},
        headers: event.headers ?? {},
      });

      return jsonResponse(response.statusCode, response.body);
    } catch (error) {
      const expected = error instanceof HttpError || error instanceof ApplicationError;

      console.error(
        JSON.stringify({
          logType: "application_error",
          requestId: event.requestContext?.requestId,
          route: event.routeKey,
          errorKind: expected ? "expected" : "unexpected",
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: !expected && error instanceof Error ? error.stack : undefined,
        }),
      );

      // Only expected errors reach the caller; unexpected details stay in the logs.
      if (expected) {
        return jsonResponse(error.statusCode ?? 400, {
          success: false,
          error: { code: error.code, message: error.message },
        });
      }

      return jsonResponse(500, {
        success: false,
        error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: "Internal server error" },
      });
    }
  };
}

function parseBody(body: string | undefined): unknown {
  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new BadRequest("Malformed JSON body");
  }
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  if (body === undefined) {
    return { statusCode };
  }

  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
