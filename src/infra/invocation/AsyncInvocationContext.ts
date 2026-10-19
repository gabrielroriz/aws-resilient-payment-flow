import { Clock } from "@application/ports/Clock";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Injectable } from "@kernel/decorators/injectable";
import { AsyncLocalStorage } from "node:async_hooks";

// Keeps invocation timing separate even when the cached instance is shared.
@Injectable(Clock)
export class AsyncInvocationContext implements InvocationContext {
  private readonly context = new AsyncLocalStorage<AsyncInvocationContext.Timing>();

  constructor(private readonly clock: Clock) {}

  startedAt(): Date {
    return new Date(this.timing().startedAt);
  }

  deadline(): Date {
    return new Date(this.timing().deadline);
  }

  withContext<T>(remainingTimeMs: number, work: () => T): T {
    const startedAt = this.clock.now().getTime();
    return this.context.run({ startedAt, deadline: startedAt + remainingTimeMs }, work);
  }

  private timing(): AsyncInvocationContext.Timing {
    const timing = this.context.getStore();
    if (!timing) throw new Error("Invocation timing is unavailable outside an invocation.");
    return timing;
  }
}

export namespace AsyncInvocationContext {
  // Numbers prevent callers from mutating the stored timestamps through a Date.
  export type Timing = { startedAt: number; deadline: number };
}
