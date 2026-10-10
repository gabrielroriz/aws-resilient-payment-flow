import { BaseError } from "../BaseError";

/** Failure raised from the controller down, such as a business rule a use case enforces. */
export abstract class ApplicationError extends BaseError {}
