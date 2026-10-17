import { ErrorCategory } from "./enums/ErrorCategory";
import { ErrorCode } from "./enums/ErrorCode";
import { ErrorKind } from "./enums/ErrorKind";

// Common shape of defined errors.
// Driving adapters log the code, category, and kind.
// HTTP also uses the status and message for its response.
// Queue retries do not depend on the HTTP status or whether the error is expected.
export abstract class BaseError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly kind: ErrorKind;

  constructor(message: string, { statusCode, code, category, kind }: BaseError.Details) {
    super(message);
    // Bundles keep class names, so each error is logged under its own name.
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.category = category;
    this.kind = kind;
  }
}

export namespace BaseError {
  export type Details = {
    statusCode: number;
    code: ErrorCode;
    category: ErrorCategory;
    // Declared per error, as expected and unexpected errors can share a status.
    kind: ErrorKind;
  };
}
