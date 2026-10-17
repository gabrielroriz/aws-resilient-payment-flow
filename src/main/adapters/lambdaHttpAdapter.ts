import { Controller } from "@application/contracts/Controller";
import { BaseError } from "@application/errors/BaseError";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { Logger } from "@application/ports/Logger";
import { errorLogFields } from "@main/utils/errors";
import {
  buildHttpResponse,
  decodeHttpBody,
  parseHttpBody,
  validateHttpBody,
} from "@main/utils/http";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";

// Driving adapter for API Gateway HTTP API events (payload format 2.0).
// Converts the event into a controller request, validating the body by its schema.
// Maps the result, or any error, to a response.
export function lambdaHttpAdapter(controller: Controller, logger: Logger) {
  return (event: APIGatewayProxyEventV2, context?: Context): Promise<APIGatewayProxyResultV2> =>
    // Every entry logged for the request names it, so its logs are found together.
    logger.withContext(
      {
        lambdaRequestId: context?.awsRequestId,
        requestId: event.requestContext?.requestId,
        route: event.routeKey,
      },
      () => handle(controller, logger, event),
    );
}

async function handle(
  controller: Controller,
  logger: Logger,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const rawBody = decodeHttpBody(event.body, event.isBase64Encoded);
    const response = await controller.handle({
      body: validateHttpBody(controller, parseHttpBody(rawBody)),
      rawBody,
      params: event.pathParameters ?? {},
      queryParams: event.queryStringParameters ?? {},
      headers: event.headers ?? {},
      requestId: event.requestContext.requestId,
    });

    return buildHttpResponse(response.statusCode, response.body);
  } catch (error) {
    logger.error("application_error", errorLogFields(error));

    // Only application errors reach the caller; other details stay in the logs.
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
}
