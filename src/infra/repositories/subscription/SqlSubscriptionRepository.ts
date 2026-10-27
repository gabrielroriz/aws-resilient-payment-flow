import { SubscriptionRepository } from "@application/ports/subscriptions/SubscriptionRepository";
import { Injectable } from "@kernel/decorators/injectable";

// Placeholder for the relational database that stores subscriptions.
// It grants every request without storing anything.
@Injectable()
export class SqlSubscriptionRepository implements SubscriptionRepository {
  async grantAccess(
    _grant: SubscriptionRepository.Grant,
  ): Promise<SubscriptionRepository.GrantResult> {
    return { granted: true };
  }
}
