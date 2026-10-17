import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

// A duplicate name would silently route a gateway's events to the wrong adapter.
export class ErrorWebhookProviderAlreadyRegistered extends ApplicationError {
  constructor(provider: string) {
    super(`Duplicate webhook provider name: ${provider}`, {
      statusCode: 500,
      code: ErrorCode.WEBHOOK_PROVIDER_ALREADY_REGISTERED,
      category: ErrorCategory.WEBHOOKS,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
