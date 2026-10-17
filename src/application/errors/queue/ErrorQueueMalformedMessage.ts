import { BaseError } from "../BaseError";
import { ErrorCategory } from "../enums/ErrorCategory";
import { ErrorCode } from "../enums/ErrorCode";
import { ErrorKind } from "../enums/ErrorKind";

// Invalid message JSON, rejected before any handler, without exposing the body.
export class ErrorQueueMalformedMessage extends BaseError {
  constructor() {
    super("Queue message body is not valid JSON.", {
      statusCode: 400,
      code: ErrorCode.QUEUE_MALFORMED_MESSAGE,
      category: ErrorCategory.QUEUE,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
