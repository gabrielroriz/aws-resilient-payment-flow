import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";

/** Driven port for the providers this deployment accepts webhooks from, looked up by the name in the webhook URL. */
export abstract class WebhookProviderCatalog {
  /** Returns the provider with this name, or `undefined` when no such provider is supported. */
  abstract find(name: string): WebhookProvider | undefined;
}
