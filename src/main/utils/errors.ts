import { BaseError } from "@application/errors/BaseError";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { ErrorKind } from "@application/errors/enums/ErrorKind";

// HTTP and queue failures share error metadata; each adapter adds delivery context.
export function errorLogFields(error: unknown) {
  const known = error instanceof BaseError;
  const kind = known ? error.kind : ErrorKind.UNEXPECTED;
  return {
    category: known ? error.category : undefined,
    errorKind: kind,
    errorCode: known ? error.code : ErrorCode.INTERNAL_SERVER_ERROR,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: kind === ErrorKind.UNEXPECTED && error instanceof Error ? error.stack : undefined,
  };
}
