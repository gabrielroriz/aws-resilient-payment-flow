import { ErrorCode } from "../ErrorCode";

/**
 * Expected business failure raised by use cases. Driving adapters expose its code and
 * message to the caller; any other error is treated as unexpected and hidden.
 */
export abstract class ApplicationError extends Error {
  public statusCode?: number;

  public abstract code: ErrorCode;
}
