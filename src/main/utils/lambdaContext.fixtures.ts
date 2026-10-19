import type { Context } from "aws-lambda";

// Supplies the runtime fields the Lambda adapters read during tests.
export function lambdaContext(overrides: Partial<Context> = {}): Context {
  return {
    awsRequestId: "test-invocation",
    getRemainingTimeInMillis: () => 30_000,
    ...overrides,
  } as Context;
}
