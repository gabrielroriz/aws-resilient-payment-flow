import { ErrorCode } from "../ErrorCode";
import { HttpError } from "./HttpError";

export class BadRequest extends HttpError {
  public override statusCode = 400;
  public override code: ErrorCode;

  constructor(message = "Bad Request", code = ErrorCode.BAD_REQUEST) {
    super(message);
    this.name = "BadRequest";
    this.code = code;
  }
}
