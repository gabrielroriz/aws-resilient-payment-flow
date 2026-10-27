import { BaseError } from "./BaseError";
import { ErrorCode } from "./enums/ErrorCode";
import { ErrorKind } from "./enums/ErrorKind";

// HTTP, queue, and workflow failures share error metadata.
// Each adapter adds its own delivery context.
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
