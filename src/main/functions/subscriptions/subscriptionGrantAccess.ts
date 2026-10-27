import { SubscriptionGrantAccessController } from "@application/controller/subscriptions/SubscriptionGrantAccessController";
import { SubscriptionRepository } from "@application/ports/subscriptions/SubscriptionRepository";
import { SqlSubscriptionRepository } from "@infra/repositories/subscription/SqlSubscriptionRepository";
import { Registry } from "@kernel/di/Registry";
import { createDurableHandler } from "@main/factories/createDurableHandler";

const registry = Registry.getInstance();
registry.bind(SubscriptionRepository, SqlSubscriptionRepository);

export const handler = createDurableHandler(registry, SubscriptionGrantAccessController);
