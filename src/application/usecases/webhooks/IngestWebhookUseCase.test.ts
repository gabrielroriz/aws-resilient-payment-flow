import { Clock } from "@application/ports/Clock";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderCatalog } from "@application/ports/webhooks/WebhookProviderCatalog";
import { IngestWebhookUseCase } from "@application/usecases/webhooks/IngestWebhookUseCase";
import { expect, test, vi } from "vitest";

const parsedEvent: WebhookProvider.Event = {
  providerEventId: "evt_1",
  eventType: "payment.succeeded",
  occurredAt: new Date("2026-10-10T10:00:00.000Z"),
  subject: { type: "payment", id: "pay_1" },
};

const request: WebhookProvider.Request = {
  rawBody: '{"id":"evt_1","type":"payment.succeeded"}',
  headers: { "x-signature": "valid" },
  queryParams: {},
};

const now = new Date("2026-10-10T10:00:01.500Z");
const clock: Clock = { now: () => now };

function fakeProvider(overrides: Partial<WebhookProvider> = {}) {
  return {
    name: "simulated",
    authenticate: vi.fn(async () => true),
    parse: vi.fn((): WebhookProvider.Event | undefined => parsedEvent),
    ...overrides,
  };
}

// `stored` is the event an earlier delivery already stored, making this delivery a duplicate.
function setup({ provider = fakeProvider(), stored }: { provider?: WebhookProvider; stored?: WebhookEventRepository.Event } = {}) {
  const providerCatalog: WebhookProviderCatalog = { find: (name) => (name === provider.name ? provider : undefined) };
  const create = vi.fn(
    async (event: WebhookEventRepository.Event): Promise<WebhookEventRepository.CreateResult> =>
      stored ? { created: false, event: stored } : { created: true, event },
  );
  const recordDuplicateDelivery = vi.fn(async () => {});
  // Receipt only creates events and records duplicates; no other repository operation is called.
  const events = { create, recordDuplicateDelivery } as Partial<WebhookEventRepository> as WebhookEventRepository;

  return { useCase: new IngestWebhookUseCase(providerCatalog, events, clock), create, recordDuplicateDelivery };
}

test("ingest stores a new event with the provider's name, the receipt time, and the exact payload", async () => {
  const provider = fakeProvider();
  const { useCase, create, recordDuplicateDelivery } = setup({ provider });

  await expect(useCase.execute({ provider: "simulated", requestId: "req-1", request })).resolves.toEqual({
    provider: "simulated",
    providerEventId: "evt_1",
    duplicate: false,
  });

  expect(provider.authenticate).toHaveBeenCalledWith(request);
  expect(provider.parse).toHaveBeenCalledWith(request);
  expect(create).toHaveBeenCalledWith({
    ...parsedEvent,
    provider: "simulated",
    receivedAt: now,
    payload: request.rawBody,
  });
  expect(recordDuplicateDelivery).not.toHaveBeenCalled();
});

test("ingest records a repeated delivery against the stored event instead of storing it again", async () => {
  const stored: WebhookEventRepository.Event = {
    ...parsedEvent,
    provider: "simulated",
    receivedAt: new Date("2026-10-10T09:59:00.000Z"),
    payload: request.rawBody,
  };
  const { useCase, recordDuplicateDelivery } = setup({ stored });

  await expect(useCase.execute({ provider: "simulated", requestId: "req-2", request })).resolves.toEqual({
    provider: "simulated",
    providerEventId: "evt_1",
    duplicate: true,
  });

  expect(recordDuplicateDelivery).toHaveBeenCalledWith(stored, { receivedAt: now, requestId: "req-2" });
});

test("ingest rejects a provider that is not supported and stores nothing", async () => {
  const { useCase, create } = setup();

  await expect(useCase.execute({ provider: "stripe", requestId: "req-1", request })).rejects.toThrow(
    expect.objectContaining({
      name: "WebhookProviderNotFound",
      statusCode: 404,
      code: "WEBHOOK_PROVIDER_NOT_FOUND",
      category: "webhooks",
      kind: "expected",
      message: "Unknown webhook provider: stripe",
    }),
  );
  expect(create).not.toHaveBeenCalled();
});

test("ingest rejects an unauthenticated webhook without reading or storing it", async () => {
  const provider = fakeProvider({ authenticate: vi.fn(async () => false) });
  const { useCase, create } = setup({ provider });

  await expect(useCase.execute({ provider: "simulated", requestId: "req-1", request })).rejects.toThrow(
    expect.objectContaining({
      name: "WebhookAuthenticationFailed",
      statusCode: 401,
      code: "WEBHOOK_AUTHENTICATION_FAILED",
      category: "webhooks",
      kind: "expected",
    }),
  );
  expect(provider.parse).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

test("ingest rejects an authenticated webhook whose body is not a provider event", async () => {
  const provider = fakeProvider({ parse: vi.fn(() => undefined) });
  const { useCase, create } = setup({ provider });

  await expect(useCase.execute({ provider: "simulated", requestId: "req-1", request })).rejects.toThrow(
    // The provider really sent it, so its adapter likely needs updating.
    expect.objectContaining({
      name: "MalformedWebhookEvent",
      statusCode: 400,
      code: "MALFORMED_WEBHOOK_EVENT",
      category: "webhooks",
      kind: "unexpected",
    }),
  );
  expect(create).not.toHaveBeenCalled();
});
