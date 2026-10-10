import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { InMemoryWebhookProviderCatalog } from "@infra/webhooks/InMemoryWebhookProviderCatalog";
import { expect, test } from "vitest";

function provider(name: string): WebhookProvider {
  return { name, authenticate: async () => true, parse: () => undefined };
}

test("the catalog finds each provider by its name", () => {
  const stripe = provider("stripe");
  const simulated = provider("simulated");
  const catalog = new InMemoryWebhookProviderCatalog(stripe, simulated);

  expect(catalog.find("stripe")).toBe(stripe);
  expect(catalog.find("simulated")).toBe(simulated);
});

test("the catalog finds no provider for a name it does not list", () => {
  const catalog = new InMemoryWebhookProviderCatalog(provider("stripe"));

  expect(catalog.find("paypal")).toBeUndefined();
  // Names match exactly, and built-in object keys are never mistaken for providers.
  expect(catalog.find("Stripe")).toBeUndefined();
  expect(catalog.find("constructor")).toBeUndefined();
});

test("the catalog rejects two providers with the same name", () => {
  expect(() => new InMemoryWebhookProviderCatalog(provider("stripe"), provider("stripe"))).toThrow(
    "Duplicate webhook provider name: stripe",
  );
});
