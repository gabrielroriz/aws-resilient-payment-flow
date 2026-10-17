import { BaseError } from "../BaseError";
import { ErrorCategory } from "../enums/ErrorCategory";

// A request failure raised before the controller runs, such as a malformed body.
// It belongs to no business area, so every such error is in the http category.
export abstract class HttpError extends BaseError {
  constructor(message: string, details: Omit<BaseError.Details, "category">) {
    super(message, { ...details, category: ErrorCategory.HTTP });
  }
}
