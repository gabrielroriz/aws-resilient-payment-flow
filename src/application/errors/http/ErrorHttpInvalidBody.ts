import { ErrorCode } from "../enums/ErrorCode";
import { ErrorKind } from "../enums/ErrorKind";
import { HttpError } from "./HttpError";

// A valid JSON body that fails the controller's schema, so the caller must fix it.
// The response lists each issue, so the caller can see which fields to correct.
export class ErrorHttpInvalidBody extends HttpError {
  constructor(issues: string[]) {
    super(`Invalid request body: ${issues.join("; ")}`, {
      statusCode: 400,
      code: ErrorCode.HTTP_INVALID_BODY,
      kind: ErrorKind.EXPECTED,
    });
  }
}
