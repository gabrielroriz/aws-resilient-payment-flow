import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { ProcessWebhookEventUseCase } from "@application/usecases/webhooks/ProcessWebhookEventUseCase";
import { expect, test, vi } from "vitest";

function provider(name: string): WebhookProvider {
  return {
    name,
    paymentStatuses: {},
    authenticate: async () => true,
    parse: () => undefined,
    process: async () => {},
  };
}

const stored: WebhookEventRepository.Event = {
  provider: "gatewayGlobal",
  providerEventId: "evt_1",
  eventType: "payment.succeeded",
  occurredAt: new Date("2026-10-10T10:00:00.000Z"),
  receivedAt: new Date("2026-10-10T10:00:01.000Z"),
  payload: '{ "original": true }',
  processingStatus: "enqueued",
  outdated: false,
};

const id = { provider: stored.provider, providerEventId: stored.providerEventId };

// `event` is what storage holds for the queued identity; processing only reads it.
function setup(providers: WebhookProvider[], event: WebhookEventRepository.Event | undefined) {
  const get = vi.fn(
    async (
      _id: WebhookEventRepository.EventId,
    ): Promise<WebhookEventRepository.Event | undefined> => event,
  );
  const events = { get } as Partial<WebhookEventRepository> as WebhookEventRepository;
  const providerRegistry: WebhookProviderRegistry = {
    find: (name) => providers.find((candidate) => candidate.name === name),
  };
  return { useCase: new ProcessWebhookEventUseCase(events, providerRegistry), get };
}

test.each(["gatewayGlobal", "gatewayBrazil"])(
  "process loads the stored %s event and hands it to only its provider without authenticating again",
  async (name) => {
    const target = provider(name);
    const other = provider("other");
    const process = vi.spyOn(target, "process");
    const otherProcess = vi.spyOn(other, "process");
    const authenticate = vi.spyOn(target, "authenticate");
    const parse = vi.spyOn(target, "parse");
    const event = { ...stored, provider: name };
    const { useCase, get } = setup([target, other], event);
    const eventId = { provider: name, providerEventId: event.providerEventId };

    await useCase.execute(eventId);

    expect(get).toHaveBeenCalledExactlyOnceWith(eventId);
    expect(process).toHaveBeenCalledExactlyOnceWith(event);
    expect(otherProcess).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  },
);

test("process rejects a missing stored event so it is retried, never passed to a provider as an empty payload", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { useCase } = setup([target], undefined);
  const operation = useCase.execute(id);

  await expect(operation).rejects.toBeInstanceOf(ErrorWebhookEventNotFound);
  await expect(operation).rejects.toMatchObject({
    statusCode: 404,
    code: "WEBHOOK_EVENT_NOT_FOUND",
    category: "webhooks",
    kind: "unexpected",
    message: "Stored webhook event not found: gatewayGlobal/evt_1",
  });
  expect(process).not.toHaveBeenCalled();
});

test.each(["unknown", "GatewayGlobal", "constructor"])(
  "process rejects a stored event of an unregistered provider with the shared error: %s",
  async (name) => {
    const target = provider(stored.provider);
    const process = vi.spyOn(target, "process");
    const { useCase } = setup([target], { ...stored, provider: name });
    const operation = useCase.execute({ provider: name, providerEventId: stored.providerEventId });

    await expect(operation).rejects.toBeInstanceOf(ErrorWebhookProviderNotFound);
    await expect(operation).rejects.toMatchObject({
      statusCode: 404,
      code: "WEBHOOK_PROVIDER_NOT_FOUND",
      category: "webhooks",
      kind: "unexpected",
      message: `Unknown webhook provider: ${name}`,
    });
    expect(process).not.toHaveBeenCalled();
  },
);

test("process propagates repository and provider failures so the queue can retry", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { useCase, get } = setup([target], stored);
  const failure = new Error("unavailable");

  get.mockRejectedValueOnce(failure);
  await expect(useCase.execute(id)).rejects.toBe(failure);
  expect(process).not.toHaveBeenCalled();

  process.mockRejectedValueOnce(failure);
  await expect(useCase.execute(id)).rejects.toBe(failure);
});
