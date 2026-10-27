import type { SubscriptionGrantAccess } from "@application/contracts/Workflows";

// Driven port for subscriptions and the access they give.
export abstract class SubscriptionRepository {
  // Grants access unless another event of the payment outranks the causing event.
  // Records the outcome on the causing event either way; repeats change nothing.
  abstract grantAccess(
    grant: SubscriptionRepository.Grant,
  ): Promise<SubscriptionRepository.GrantResult>;
}

export namespace SubscriptionRepository {
  export type Grant = SubscriptionGrantAccess & { grantedAt: Date };

  export type GrantResult = {
    // False when another event of the payment outranks the causing event.
    granted: boolean;
  };
}
