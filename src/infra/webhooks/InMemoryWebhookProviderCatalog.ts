import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderCatalog } from "@application/ports/webhooks/WebhookProviderCatalog";
import { GatewayBrazilWebhookProvider } from "@infra/webhooks/gatewayBrazil/GatewayBrazilWebhookProvider";
import { GatewayGlobalWebhookProvider } from "@infra/webhooks/gatewayGlobal/GatewayGlobalWebhookProvider";
import { Injectable } from "@kernel/decorators/injectable";

/** The supported webhook providers. To add one, list its adapter in `@Injectable` below. */
@Injectable(GatewayGlobalWebhookProvider, GatewayBrazilWebhookProvider)
export class InMemoryWebhookProviderCatalog implements WebhookProviderCatalog {
  private readonly byName = new Map<string, WebhookProvider>();

  constructor(...providers: WebhookProvider[]) {
    for (const provider of providers) {
      // A second adapter with the same name would silently take over the first one's webhooks.
      if (this.byName.has(provider.name)) {
        throw new Error(`Duplicate webhook provider name: ${provider.name}`);
      }
      this.byName.set(provider.name, provider);
    }
  }

  find(name: string): WebhookProvider | undefined {
    return this.byName.get(name);
  }
}
