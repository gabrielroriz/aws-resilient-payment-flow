import { Controller } from "@application/contracts/Controller";
import { BaseError } from "@application/errors/BaseError";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { errorLogFields } from "@main/utils/errors";
import { buildHttpResponse, decodeHttpBody, parseHttpBody } from "@main/utils/http";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

// Driving adapter for API Gateway HTTP API events (payload format 2.0). Converts the
// event into a controller request and maps the result, or any error, to a response.
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
      console.error(
        JSON.stringify({
          logType: "application_error",
          requestId: event.requestContext?.requestId,
          route: event.routeKey,
          ...errorLogFields(error),
        }),
      );

      // Only errors the application defines reach the caller; other details stay in the logs.
      if (error instanceof BaseError) {
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
