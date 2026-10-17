import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

// An authenticated webhook body unlike any provider event, so it cannot be stored.
export class ErrorWebhookMalformedEvent extends ApplicationError {
  constructor() {
    super("Malformed webhook event", {
      statusCode: 400,
      code: ErrorCode.WEBHOOK_MALFORMED_EVENT,
      category: ErrorCategory.WEBHOOKS,
      // The provider really sent it, so its adapter is likely out of date.
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
