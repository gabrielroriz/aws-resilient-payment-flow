import { BaseError } from "../BaseError";
import { ErrorCategory } from "../enums/ErrorCategory";

/**
 * Failure of the request itself, raised before the controller is reached, such as a malformed body.
 * It belongs to no business area, so every such error is in the http category.
 */
export abstract class HttpError extends BaseError {
  constructor(message: string, details: Omit<BaseError.Details, "category">) {
    super(message, { ...details, category: ErrorCategory.HTTP });
  }
}
