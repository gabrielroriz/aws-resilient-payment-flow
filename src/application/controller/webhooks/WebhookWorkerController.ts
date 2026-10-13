import { MessageHandler } from "@application/contracts/MessageHandler";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { Injectable } from "@kernel/decorators/injectable";
import { Schema } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";

// Whitespace alone cannot name a provider or an event.
const identifier = z.string().check(z.regex(/\S/, "Must not be blank"));

// The identity of a stored event, as receipt queues it; the payload itself stays in storage.
const messageSchema = z.object({ provider: identifier, providerEventId: identifier });

// Receives queued event identities from every provider and routes each to its gateway adapter.
@Injectable(WebhookProviderRegistry)
@Schema(messageSchema)
export class WebhookWorkerController implements MessageHandler {
  constructor(private readonly providerRegistry: WebhookProviderRegistry) {}

  async handle(message: WebhookWorkerController.Message): Promise<void> {
    await this.providerRegistry.route(message);
  }
}

export namespace WebhookWorkerController {
  export type Message = z.output<typeof messageSchema>;
}
