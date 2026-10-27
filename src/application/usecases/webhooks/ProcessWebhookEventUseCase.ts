import type { SubscriptionGrantAccess } from "@application/contracts/Workflows";
import { BaseError } from "@application/errors/BaseError";
import { ErrorWebhookEventInProgress } from "@application/errors/application/webhooks/ErrorWebhookEventInProgress";
import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { ErrorCode } from "@application/errors/enums/ErrorCode";
import { ErrorKind } from "@application/errors/enums/ErrorKind";
import { Clock } from "@application/ports/Clock";
import { Deployment } from "@application/ports/Deployment";
import { InvocationContext } from "@application/ports/InvocationContext";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { WorkflowStarter } from "@application/ports/workflows/WorkflowStarter";
import { Injectable } from "@kernel/decorators/injectable";
import { randomId } from "@kernel/utils/crypto";

// Hands a queued event, exactly as receipt stored it, to its gateway adapter.
// It then starts the durable workflows that apply the event's business effects.
// Each run is recorded as an attempt that moves the event's processing status.
@Injectable(
  WebhookEventRepository,
  WebhookProviderRegistry,
  WorkflowStarter,
  Clock,
  Deployment,
  InvocationContext,
)
export class ProcessWebhookEventUseCase {
  constructor(
    private readonly events: WebhookEventRepository,
    private readonly providerRegistry: WebhookProviderRegistry,
    private readonly workflows: WorkflowStarter,
    private readonly clock: Clock,
    private readonly deployment: Deployment,
    private readonly invocationContext: InvocationContext,
  ) {}

  async execute(id: ProcessWebhookEventUseCase.Input): Promise<void> {
    // The queue carries only the identity; processing uses the exact stored payload.
    const event = await this.events.get(id);
    if (!event) {
      // Missing records can reflect a transient read or a broken dispatch.
      // Never acknowledge them.
      throw new ErrorWebhookEventNotFound(id);
    }
    // A repeated delivery of a processed event has nothing left to do.
    if (event.processingStatus === "processed") {
      return;
    }

    const provider = this.providerRegistry.find(event.provider);
    if (!provider) {
      // A stored event was accepted, so a missing provider means misconfiguration.
      throw new ErrorWebhookProviderNotFound(event.provider, ErrorKind.UNEXPECTED);
    }

    const startedAt = this.clock.now();
    const attempt: WebhookEventRepository.StartedAttempt = {
      attemptId: randomId(),
      startedAt,
      handlerVersion: this.deployment.codeVersion(),
      // No attempt outlives the invocation that runs it.
      deadline: this.invocationContext.deadline(),
    };
    if (!(await this.events.startAttempt(event, attempt))) {
      throw new ErrorWebhookEventInProgress(event);
    }

    try {
      await provider.process(event);
      // The attempt covers starting the workflow; the workflow owns its result.
      const grantAccessInput = this.subscriptionGrantIfPaid(event);
      if (grantAccessInput) {
        await this.workflows.start("subscription_grant_access", grantAccessInput);
      }
    } catch (error) {
      await this.events.finishAttempt(event, {
        ...attempt,
        finishedAt: this.clock.now(),
        outcome: "failed",
        errorCode: error instanceof BaseError ? error.code : ErrorCode.INTERNAL_SERVER_ERROR,
      });
      throw error;
    }
    await this.events.finishAttempt(event, {
      ...attempt,
      finishedAt: this.clock.now(),
      outcome: "succeeded",
    });
  }

  // A succeeded payment grants access to the subscription it bills.
  private subscriptionGrantIfPaid(
    event: WebhookEventRepository.Event,
  ): SubscriptionGrantAccess | undefined {
    if (event.status !== "succeeded" || !event.subject || !event.subscriptionId) {
      return undefined;
    }
    return {
      provider: event.provider,
      subscriptionId: event.subscriptionId,
      paymentId: event.subject.id,
      metadata: { eventId: event.providerEventId, receivedAt: event.receivedAt },
    };
  }
}

export namespace ProcessWebhookEventUseCase {
  export type Input = WebhookEventRepository.EventId;
}
