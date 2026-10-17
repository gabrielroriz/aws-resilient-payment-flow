import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { ErrorKind } from "@application/errors/enums/ErrorKind";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { Injectable } from "@kernel/decorators/injectable";

// Hands a queued event, exactly as receipt stored it, to its gateway adapter.
@Injectable(WebhookEventRepository, WebhookProviderRegistry)
export class ProcessWebhookEventUseCase {
  constructor(
    private readonly events: WebhookEventRepository,
    private readonly providerRegistry: WebhookProviderRegistry,
  ) {}

  async execute(id: ProcessWebhookEventUseCase.Input): Promise<void> {
    // The queue carries only the identity; processing uses the exact stored payload.
    const event = await this.events.get(id);
    if (!event) {
      // Missing records can reflect a transient read or a broken dispatch.
      // Never acknowledge them.
      throw new ErrorWebhookEventNotFound(id);
    }

    const provider = this.providerRegistry.find(event.provider);
    if (!provider) {
      // A stored event was accepted, so a missing provider means misconfiguration.
      throw new ErrorWebhookProviderNotFound(event.provider, ErrorKind.UNEXPECTED);
    }
    await provider.process(event);
  }
}

export namespace ProcessWebhookEventUseCase {
  export type Input = WebhookEventRepository.EventId;
}
