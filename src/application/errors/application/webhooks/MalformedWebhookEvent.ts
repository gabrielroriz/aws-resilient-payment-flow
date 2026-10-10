import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

/** An authenticated webhook whose body is not an event its provider sends, so it cannot be stored. */
export class MalformedWebhookEvent extends ApplicationError {
  constructor() {
    super("Malformed webhook event", {
      statusCode: 400,
      code: ErrorCode.MALFORMED_WEBHOOK_EVENT,
      category: ErrorCategory.WEBHOOKS,
      // The provider really sent it, so the provider adapter is likely out of date and the event is not stored.
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
