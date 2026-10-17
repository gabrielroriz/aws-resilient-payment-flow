import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

// The webhook does not prove it comes from its URL's provider, so it may be forged.
export class ErrorWebhookAuthenticationFailed extends ApplicationError {
  constructor() {
    super("Webhook authentication failed", {
      statusCode: 401,
      code: ErrorCode.WEBHOOK_AUTHENTICATION_FAILED,
      category: ErrorCategory.WEBHOOKS,
      // Rejecting forged requests is normal operation.
      // A sudden rise in this code is what signals trouble.
      kind: ErrorKind.EXPECTED,
    });
  }
}
