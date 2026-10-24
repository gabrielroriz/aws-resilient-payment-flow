import { ErrorCategory } from "./enums/ErrorCategory";
import { ErrorCode } from "./enums/ErrorCode";
import { ErrorKind } from "./enums/ErrorKind";

// Common shape of defined errors.
// Driving adapters log the code, category, and kind.
// HTTP also uses the status and message for its response.
// Queues retry unless `retryable` is false, whatever the HTTP status or kind.
export abstract class BaseError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly kind: ErrorKind;
  readonly retryable: boolean;

  constructor(
    message: string,
    { statusCode, code, category, kind, retryable = true }: BaseError.Details,
  ) {
    super(message);
    // Bundles keep class names, so each error is logged under its own name.
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.category = category;
    this.kind = kind;
    this.retryable = retryable;
  }
}

export namespace BaseError {
  export type Details = {
    statusCode: number;
    code: ErrorCode;
    category: ErrorCategory;
    // Declared per error, as expected and unexpected errors can share a status.
    kind: ErrorKind;
    // False when the same message can never succeed, so a queue parks it at once.
    retryable?: boolean;
  };
}
