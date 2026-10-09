import { ErrorCode } from "../ErrorCode";

/** Request-level failure with a fixed HTTP status, such as a malformed body. */
export abstract class HttpError extends Error {
  public abstract statusCode: number;
  public abstract code: ErrorCode;
}
