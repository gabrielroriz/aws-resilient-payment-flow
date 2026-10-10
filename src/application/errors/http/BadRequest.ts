import { ErrorCode } from "../enums/ErrorCode";
import { ErrorKind } from "../enums/ErrorKind";
import { HttpError } from "./HttpError";

/** The request cannot be read, such as a malformed JSON body, so the caller must fix it. */
export class BadRequest extends HttpError {
  constructor(message = "Bad Request", code = ErrorCode.BAD_REQUEST) {
    super(message, { statusCode: 400, code, kind: ErrorKind.EXPECTED });
  }
}
