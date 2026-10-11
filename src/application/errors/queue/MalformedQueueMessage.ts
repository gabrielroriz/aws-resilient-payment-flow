import { BaseError } from "../BaseError";
import { ErrorCategory } from "../enums/ErrorCategory";
import { ErrorCode } from "../enums/ErrorCode";
import { ErrorKind } from "../enums/ErrorKind";

/** Invalid message JSON, rejected before reaching a business handler without exposing its body. */
export class MalformedQueueMessage extends BaseError {
  constructor() {
    super("Queue message body is not valid JSON.", {
      statusCode: 400,
      code: ErrorCode.MALFORMED_QUEUE_MESSAGE,
      category: ErrorCategory.QUEUE,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
