// Fixed timing for the invocation currently handling the async call chain.
export abstract class InvocationContext {
  abstract startedAt(): Date;

  abstract deadline(): Date;

  // Captures timing once using the runtime's remaining execution time.
  abstract withContext<T>(remainingTimeMs: number, work: () => T): T;
}
