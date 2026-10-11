import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

/** A queued reference cannot identify the webhook to process; the payload itself stays in storage. */
export class MalformedWebhookMessage extends ApplicationError {
  constructor() {
    super("Queued webhook must contain a provider and providerEventId.", {
      statusCode: 400,
      code: ErrorCode.MALFORMED_WEBHOOK_MESSAGE,
      category: ErrorCategory.WEBHOOKS,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
