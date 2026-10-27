import { MessageHandler } from "@application/contracts/MessageHandler";
import type { SubscriptionGrantAccess } from "@application/contracts/Workflows";
import { DurableUseCaseSubscriptionGrantAccess } from "@application/usecases/subscriptions/DurableUseCaseSubscriptionGrantAccess";
import { Injectable } from "@kernel/decorators/injectable";
import { Schema } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";

// Whitespace alone cannot name a provider, subscription, payment, or event.
const identifier = z.string().check(z.regex(/\S/, "Must not be blank"));

// The workflow's input as callers send it: snake_case JSON with ISO 8601 times.
const inputSchema = z.pipe(
  z.object({
    provider: identifier,
    subscription_id: identifier,
    payment_id: identifier,
    metadata: z.object({ event_id: identifier, received_at: z.iso.datetime() }),
  }),
  z.transform((input): SubscriptionGrantAccess => ({
    provider: input.provider,
    subscriptionId: input.subscription_id,
    paymentId: input.payment_id,
    metadata: {
      eventId: input.metadata.event_id,
      receivedAt: new Date(input.metadata.received_at),
    },
  })),
);

// Runs the subscription grant workflow with input its schema accepts.
@Injectable(DurableUseCaseSubscriptionGrantAccess)
@Schema(inputSchema)
export class SubscriptionGrantAccessController implements MessageHandler {
  constructor(
    private readonly durableUseCaseSubscriptionGrantAccess: DurableUseCaseSubscriptionGrantAccess,
  ) {}

  async handle(input: SubscriptionGrantAccessController.Input): Promise<void> {
    await this.durableUseCaseSubscriptionGrantAccess.execute(input);
  }
}

export namespace SubscriptionGrantAccessController {
  export type Input = z.output<typeof inputSchema>;
}
