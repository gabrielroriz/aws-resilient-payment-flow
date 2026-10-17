import { ErrorWebhookProviderAlreadyRegistered } from "@application/errors/application/webhooks/ErrorWebhookProviderAlreadyRegistered";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { GatewayBrazilWebhookProvider } from "@infra/webhooks/gatewayBrazil/GatewayBrazilWebhookProvider";
import { GatewayGlobalWebhookProvider } from "@infra/webhooks/gatewayGlobal/GatewayGlobalWebhookProvider";
import { Injectable } from "@kernel/decorators/injectable";

// One provider registration supports both receipt and processing.
@Injectable(GatewayGlobalWebhookProvider, GatewayBrazilWebhookProvider)
export class InMemoryWebhookProviderRegistry implements WebhookProviderRegistry {
  private readonly byName = new Map<string, WebhookProvider>();

  constructor(...providers: WebhookProvider[]) {
    for (const provider of providers) {
      // A same-named adapter would silently take over the first one's webhooks.
      if (this.byName.has(provider.name)) {
        throw new ErrorWebhookProviderAlreadyRegistered(provider.name);
      }
      this.byName.set(provider.name, provider);
    }
  }

  find(name: string): WebhookProvider | undefined {
    return this.byName.get(name);
  }
}
