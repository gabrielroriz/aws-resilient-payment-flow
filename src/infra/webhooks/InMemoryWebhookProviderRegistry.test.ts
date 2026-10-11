import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { InMemoryWebhookProviderRegistry } from "@infra/webhooks/InMemoryWebhookProviderRegistry";
import { expect, test } from "vitest";

function provider(name: string): WebhookProvider {
  return { name, authenticate: async () => true, parse: () => undefined };
}

test("the registry finds each provider by its name", () => {
  const stripe = provider("stripe");
  const simulated = provider("simulated");
  const registry = new InMemoryWebhookProviderRegistry(stripe, simulated);

  expect(registry.find("stripe")).toBe(stripe);
  expect(registry.find("simulated")).toBe(simulated);
});

test("the registry finds no provider for a name it does not list", () => {
  const registry = new InMemoryWebhookProviderRegistry(provider("stripe"));

  expect(registry.find("paypal")).toBeUndefined();
  // Names match exactly, and built-in object keys are never mistaken for providers.
  expect(registry.find("Stripe")).toBeUndefined();
  expect(registry.find("constructor")).toBeUndefined();
});

test("the registry rejects two providers with the same name", () => {
  expect(() => new InMemoryWebhookProviderRegistry(provider("stripe"), provider("stripe"))).toThrow(
    "Duplicate webhook provider name: stripe",
  );
});
