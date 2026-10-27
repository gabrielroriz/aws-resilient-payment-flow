import { BaseError } from "@application/errors/BaseError";
import { errorLogFields } from "@application/errors/errorLogFields";
import { Logger } from "@application/ports/Logger";
import { DurableExecution } from "@application/ports/workflows/DurableExecution";
import {
  createRetryStrategy,
  JitterStrategy,
  type DurableContext,
  type RetryDecision,
} from "@aws/durable-execution-sdk-js";
import { Injectable } from "@kernel/decorators/injectable";
import { AsyncLocalStorage } from "node:async_hooks";

// Runs steps on the Lambda durable execution of the invocation in progress.
// Each invocation's context stays separate even though the instance is shared.
@Injectable(Logger)
export class LambdaDurableExecution implements DurableExecution {
  // The 31 retries span about 2 to 4 hours, outlasting a two-hour outage.
  private static readonly backoff = createRetryStrategy({
    maxAttempts: 32,
    initialDelay: { seconds: 5 },
    maxDelay: { minutes: 10 },
    backoffRate: 2,
    // Spreads retries out, so a recovered dependency is not hit all at once.
    jitter: JitterStrategy.HALF,
  });

  private readonly context = new AsyncLocalStorage<DurableContext>();

  constructor(private readonly logger: Logger) {}

  // Makes the invocation's durable context available to steps run within `work`.
  withContext<T>(context: DurableContext, work: () => T): T {
    return this.context.run(context, work);
  }

  step<T>(name: string, work: () => Promise<T>): Promise<T> {
    return this.durableContext().step(
      name,
      async () => {
        try {
          return await work();
        } catch (error) {
          this.logger.error("workflow_step_error", { step: name, ...errorLogFields(error) });
          throw error;
        }
      },
      { retryStrategy: LambdaDurableExecution.retryStrategy },
    );
  }

  // A non-retryable error fails the step at once.
  private static retryStrategy(error: Error, attemptsMade: number): RetryDecision {
    return error instanceof BaseError && !error.retryable
      ? { shouldRetry: false }
      : LambdaDurableExecution.backoff(error, attemptsMade);
  }

  private durableContext(): DurableContext {
    const context = this.context.getStore();
    if (!context) throw new Error("A durable step can only run inside a durable execution.");
    return context;
  }
}
