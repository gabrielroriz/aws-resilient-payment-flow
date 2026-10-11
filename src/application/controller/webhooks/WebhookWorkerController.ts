import { MessageHandler } from "@application/contracts/MessageHandler";
import { MalformedWebhookMessage } from "@application/errors/application/webhooks/MalformedWebhookMessage";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { Injectable } from "@kernel/decorators/injectable";
import { isObject } from "@kernel/utils/json";

/** Receives queued event identities from every provider and routes each to its gateway adapter. */
@Injectable(WebhookProviderRegistry)
export class WebhookWorkerController implements MessageHandler {
  constructor(private readonly providerRegistry: WebhookProviderRegistry) {}

  async handle(body: unknown): Promise<void> {
    if (!isObject(body) || typeof body.provider !== "string" || !body.provider.trim() ||
        typeof body.providerEventId !== "string" || !body.providerEventId.trim()) {
      throw new MalformedWebhookMessage();
    }
    await this.providerRegistry.route({ provider: body.provider, providerEventId: body.providerEventId });
  }
}
