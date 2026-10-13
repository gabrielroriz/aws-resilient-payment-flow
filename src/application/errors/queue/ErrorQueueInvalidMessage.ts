import { BaseError } from "../BaseError";
import { ErrorCategory } from "../enums/ErrorCategory";
import { ErrorCode } from "../enums/ErrorCode";
import { ErrorKind } from "../enums/ErrorKind";

// Message JSON that does not match the handler's schema, rejected before reaching the handler.
export class ErrorQueueInvalidMessage extends BaseError {
  constructor(issues: string[]) {
    super(`Queue message does not match the handler's schema: ${issues.join("; ")}`, {
      statusCode: 400,
      code: ErrorCode.QUEUE_INVALID_MESSAGE,
      category: ErrorCategory.QUEUE,
      // Queues carry messages the system itself sends, so a mismatch points to a defect.
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
