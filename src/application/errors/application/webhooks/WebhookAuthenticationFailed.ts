import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

/** The webhook does not prove it comes from the provider in its URL, so it may be forged. */
export class WebhookAuthenticationFailed extends ApplicationError {
  constructor() {
    super("Webhook authentication failed", {
      statusCode: 401,
      code: ErrorCode.WEBHOOK_AUTHENTICATION_FAILED,
      category: ErrorCategory.WEBHOOKS,
      // Rejecting forged requests is normal operation; a sudden rise in this code is what signals trouble.
      kind: ErrorKind.EXPECTED,
    });
  }
}
