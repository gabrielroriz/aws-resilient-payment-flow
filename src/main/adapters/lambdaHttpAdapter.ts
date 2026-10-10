import { Controller } from "@application/contracts/Controller";
import { BaseError } from "@application/errors/BaseError";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { ErrorKind } from "@application/errors/enums/ErrorKind";
import { buildHttpResponse, decodeHttpBody, parseHttpBody } from "@main/utils/http";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

/**
 * Driving adapter for API Gateway HTTP API events (payload format 2.0). Converts the
 * event into a controller request and maps the result, or any error, to a response.
 */
export function lambdaHttpAdapter(controller: Controller) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
      const rawBody = decodeHttpBody(event.body, event.isBase64Encoded);
      const response = await controller.handle({
        body: parseHttpBody(rawBody),
        rawBody,
        params: event.pathParameters ?? {},
        queryParams: event.queryStringParameters ?? {},
        headers: event.headers ?? {},
        requestId: event.requestContext.requestId,
      });

      return buildHttpResponse(response.statusCode, response.body);
    } catch (error) {
      // HTTP and application errors declare their category and kind; anything else is
      // uncategorized and unexpected, and the route and function still identify where it happened.
      const known = error instanceof BaseError;
      const kind = known ? error.kind : ErrorKind.UNEXPECTED;

      console.error(
        JSON.stringify({
          logType: "application_error",
          category: known ? error.category : undefined,
          requestId: event.requestContext?.requestId,
          route: event.routeKey,
          errorKind: kind,
          errorCode: known ? error.code : ErrorCode.INTERNAL_SERVER_ERROR,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: kind === ErrorKind.UNEXPECTED && error instanceof Error ? error.stack : undefined,
        }),
      );

      // Only errors the application defines reach the caller; other details stay in the logs.
      if (known) {
        return buildHttpResponse(error.statusCode, {
          success: false,
          error: { code: error.code, message: error.message },
        });
      }

      return buildHttpResponse(500, {
        success: false,
        error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: "Internal server error" },
      });
    }
  };
}
