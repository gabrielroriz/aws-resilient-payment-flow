import type { SubscriptionGrantAccess } from "@application/contracts/Workflows";
import { Clock } from "@application/ports/Clock";
import { Logger } from "@application/ports/Logger";
import { SubscriptionRepository } from "@application/ports/subscriptions/SubscriptionRepository";
import { DurableExecution } from "@application/ports/workflows/DurableExecution";
import { Injectable } from "@kernel/decorators/injectable";

// Grants a subscription access for the payment that paid for it, as a workflow.
@Injectable(DurableExecution, SubscriptionRepository, Clock, Logger)
export class DurableUseCaseSubscriptionGrantAccess {
  constructor(
    private readonly execution: DurableExecution,
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: DurableUseCaseSubscriptionGrantAccess.Input): Promise<void> {
    // A step may run more than once, and granting again changes nothing.
    await this.execution.step("grant_access", async () => {
      const { granted } = await this.subscriptions.grantAccess({
        ...input,
        grantedAt: this.clock.now(),
      });
      // A stale grant is no error, since a newer event of the payment decides.
      this.logger.info(
        granted ? "subscription_access_granted" : "subscription_access_grant_stale",
        {
          provider: input.provider,
          subscriptionId: input.subscriptionId,
          paymentId: input.paymentId,
          eventId: input.metadata.eventId,
        },
      );
    });
  }
}

export namespace DurableUseCaseSubscriptionGrantAccess {
  export type Input = SubscriptionGrantAccess;
}
