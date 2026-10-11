import { WebhookEventNotFound } from "@application/errors/application/webhooks/WebhookEventNotFound";
import { WebhookProviderNotFound } from "@application/errors/application/webhooks/WebhookProviderNotFound";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { InMemoryWebhookProviderRegistry } from "@infra/webhooks/InMemoryWebhookProviderRegistry";
import { expect, test, vi } from "vitest";

function provider(name: string): WebhookProvider {
  return { name, authenticate: async () => true, parse: () => undefined, process: async () => {} };
}

const stored: WebhookEventRepository.Event = {
  provider: "gatewayGlobal", providerEventId: "evt_1", eventType: "payment.succeeded",
  occurredAt: new Date("2026-10-10T10:00:00.000Z"), receivedAt: new Date("2026-10-10T10:00:01.000Z"),
  payload: '{ "original": true }',
};

// Routing only reads stored events; no other repository operation is called.
function repository(event: WebhookEventRepository.Event = stored) {
  const get = vi.fn(async (_id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Event | undefined> => event);
  return { events: { get } as Partial<WebhookEventRepository> as WebhookEventRepository, get };
}

test("the registry finds each provider by its name", () => {
  const stripe = provider("stripe");
  const simulated = provider("simulated");
  const registry = new InMemoryWebhookProviderRegistry(repository().events, stripe, simulated);

  expect(registry.find("stripe")).toBe(stripe);
  expect(registry.find("simulated")).toBe(simulated);
});

test("the registry finds no provider for a name it does not list", () => {
  const registry = new InMemoryWebhookProviderRegistry(repository().events, provider("stripe"));

  expect(registry.find("paypal")).toBeUndefined();
  // Names match exactly, and built-in object keys are never mistaken for providers.
  expect(registry.find("Stripe")).toBeUndefined();
  expect(registry.find("constructor")).toBeUndefined();
});

test("the registry rejects two providers with the same name", () => {
  expect(() => new InMemoryWebhookProviderRegistry(repository().events, provider("stripe"), provider("stripe"))).toThrow(
    expect.objectContaining({
      name: "WebhookProviderAlreadyRegistered",
      message: "Duplicate webhook provider name: stripe",
      statusCode: 500,
      code: "WEBHOOK_PROVIDER_ALREADY_REGISTERED",
      category: "webhooks",
      kind: "unexpected",
    }),
  );
});

test.each(["gatewayGlobal", "gatewayBrazil"])("the registry loads the stored %s event and routes it to only its provider without authenticating again", async (name) => {
  const target = provider(name);
  const other = provider("other");
  const process = vi.spyOn(target, "process");
  const otherProcess = vi.spyOn(other, "process");
  const authenticate = vi.spyOn(target, "authenticate");
  const parse = vi.spyOn(target, "parse");
  const event = { ...stored, provider: name };
  const { events, get } = repository(event);
  const registry = new InMemoryWebhookProviderRegistry(events, target, other);
  const id = { provider: name, providerEventId: event.providerEventId };

  await registry.route(id);

  expect(get).toHaveBeenCalledExactlyOnceWith(id);
  expect(process).toHaveBeenCalledExactlyOnceWith(event);
  expect(otherProcess).not.toHaveBeenCalled();
  expect(authenticate).not.toHaveBeenCalled();
  expect(parse).not.toHaveBeenCalled();
});

test("a missing stored event must be retried, never passed to a provider as an empty payload", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { events, get } = repository();
  get.mockResolvedValue(undefined);
  const registry = new InMemoryWebhookProviderRegistry(events, target);
  const operation = registry.route({ provider: stored.provider, providerEventId: stored.providerEventId });

  await expect(operation).rejects.toBeInstanceOf(WebhookEventNotFound);
  await expect(operation).rejects.toMatchObject({
    statusCode: 404, code: "WEBHOOK_EVENT_NOT_FOUND", category: "webhooks", kind: "unexpected",
    message: "Stored webhook event not found: gatewayGlobal/evt_1",
  });
  expect(process).not.toHaveBeenCalled();
});

test.each(["unknown", "GatewayGlobal", "constructor"])("routing an unregistered provider rejects with the shared error: %s", async (name) => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const registry = new InMemoryWebhookProviderRegistry(repository({ ...stored, provider: name }).events, target);
  const operation = registry.route({ provider: name, providerEventId: stored.providerEventId });

  await expect(operation).rejects.toBeInstanceOf(WebhookProviderNotFound);
  await expect(operation).rejects.toMatchObject({
    statusCode: 404, code: "WEBHOOK_PROVIDER_NOT_FOUND", category: "webhooks", kind: "unexpected",
    message: `Unknown webhook provider: ${name}`,
  });
  expect(process).not.toHaveBeenCalled();
});

test("repository and provider failures propagate so the queue can retry", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { events, get } = repository();
  const registry = new InMemoryWebhookProviderRegistry(events, target);
  const id = { provider: stored.provider, providerEventId: stored.providerEventId };
  const failure = new Error("unavailable");

  get.mockRejectedValueOnce(failure);
  await expect(registry.route(id)).rejects.toBe(failure);
  expect(process).not.toHaveBeenCalled();

  process.mockRejectedValueOnce(failure);
  await expect(registry.route(id)).rejects.toBe(failure);
});
