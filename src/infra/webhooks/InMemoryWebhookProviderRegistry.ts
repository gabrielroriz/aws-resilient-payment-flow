import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ErrorWebhookProviderAlreadyRegistered } from "@application/errors/application/webhooks/ErrorWebhookProviderAlreadyRegistered";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { ErrorKind } from "@application/errors/enums/ErrorKind";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { GatewayBrazilWebhookProvider } from "@infra/webhooks/gatewayBrazil/GatewayBrazilWebhookProvider";
import { GatewayGlobalWebhookProvider } from "@infra/webhooks/gatewayGlobal/GatewayGlobalWebhookProvider";
import { Injectable } from "@kernel/decorators/injectable";

// One provider registration supports both receipt and queued-event routing.
@Injectable(WebhookEventRepository, GatewayGlobalWebhookProvider, GatewayBrazilWebhookProvider)
export class InMemoryWebhookProviderRegistry implements WebhookProviderRegistry {
  private readonly byName = new Map<string, WebhookProvider>();

  constructor(
    private readonly events: WebhookEventRepository,
    ...providers: WebhookProvider[]
  ) {
    for (const provider of providers) {
      // A second adapter with the same name would silently take over the first one's webhooks.
      if (this.byName.has(provider.name)) {
        throw new ErrorWebhookProviderAlreadyRegistered(provider.name);
      }
      this.byName.set(provider.name, provider);
    }
  }

  find(name: string): WebhookProvider | undefined {
    return this.byName.get(name);
  }

  async route(id: WebhookEventRepository.EventId): Promise<void> {
    // The queue carries only the identity; processing always uses the exact payload receipt stored.
    const event = await this.events.get(id);
    if (!event) {
      // Missing records can reflect a transient read or a broken dispatch; never acknowledge them.
      throw new ErrorWebhookEventNotFound(id);
    }

    const provider = this.find(event.provider);
    if (!provider) {
      // A stored event was already accepted, so a missing provider is a configuration problem.
      throw new ErrorWebhookProviderNotFound(event.provider, ErrorKind.UNEXPECTED);
    }
    await provider.process(event);
  }
}
