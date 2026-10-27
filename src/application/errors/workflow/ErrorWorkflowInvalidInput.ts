import { BaseError } from "../BaseError";
import { ErrorCategory } from "../enums/ErrorCategory";
import { ErrorCode } from "../enums/ErrorCode";
import { ErrorKind } from "../enums/ErrorKind";

// Workflow input not matching the handler's schema, rejected before reaching it.
export class ErrorWorkflowInvalidInput extends BaseError {
  constructor(issues: string[]) {
    super(`Workflow input does not match the handler's schema: ${issues.join("; ")}`, {
      statusCode: 400,
      code: ErrorCode.WORKFLOW_INVALID_INPUT,
      category: ErrorCategory.WORKFLOW,
      // Callers build workflow inputs in code, so a mismatch points to a defect.
      kind: ErrorKind.UNEXPECTED,
      retryable: false,
    });
  }
}
