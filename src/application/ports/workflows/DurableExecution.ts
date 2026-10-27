// Driven port for the durable workflow running the current use case.
// A resumed workflow runs the use case again from the start.
// Code outside steps must therefore be deterministic and free of side effects.
export abstract class DurableExecution {
  // Runs `work` as a named step and returns its JSON-compatible result.
  // `work` may run again after failing, unless its error is not retryable.
  // Once the step completes, a resumed workflow gets its result without running it.
  abstract step<T>(name: string, work: () => Promise<T>): Promise<T>;
}
