import { BaseError } from "../BaseError";

// Failure from the controller down, such as a business rule a use case enforces.
export abstract class ApplicationError extends BaseError {}
