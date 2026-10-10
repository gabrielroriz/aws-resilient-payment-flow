import { ErrorCategory } from "./enums/ErrorCategory";
import { ErrorCode } from "./enums/ErrorCode";
import { ErrorKind } from "./enums/ErrorKind";

/**
 * Common shape of the errors the application defines. Driving adapters answer with its status,
 * code, and message, and log its category and kind; any other error is hidden and logged as
 * unexpected.
 */
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
    /** Declared by each error, since a failure the caller causes and one that needs attention can share a status. */
    kind: ErrorKind;
  };
}
