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
      // Unknown paths are normal; a stored event with no provider needs attention.
      kind,
      // Only a deployment can add the provider, so retries wait for an operator.
      retryable: false,
    });
  }
}
