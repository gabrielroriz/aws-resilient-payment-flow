import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

/** The webhook URL names a provider this deployment does not support. */
export class WebhookProviderNotFound extends ApplicationError {
  constructor(provider: string) {
    super(`Unknown webhook provider: ${provider}`, {
      statusCode: 404,
      code: ErrorCode.WEBHOOK_PROVIDER_NOT_FOUND,
      category: ErrorCategory.WEBHOOKS,
      // Public URLs attract requests to arbitrary paths, so this alone needs no attention.
      kind: ErrorKind.EXPECTED,
    });
  }
}
