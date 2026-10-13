import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

// A request or stored event names a provider this deployment does not support.
export class ErrorWebhookProviderNotFound extends ApplicationError {
  constructor(provider: string, kind: ErrorKind = ErrorKind.EXPECTED) {
    super(`Unknown webhook provider: ${provider}`, {
      statusCode: 404,
      code: ErrorCode.WEBHOOK_PROVIDER_NOT_FOUND,
      category: ErrorCategory.WEBHOOKS,
      // Unknown public paths are normal; an already accepted event with no provider needs attention.
      kind,
    });
  }
}
