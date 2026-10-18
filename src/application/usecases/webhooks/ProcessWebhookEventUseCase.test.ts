import { ErrorWebhookEventNotFound } from "@application/errors/application/webhooks/ErrorWebhookEventNotFound";
import { ErrorWebhookMalformedEvent } from "@application/errors/application/webhooks/ErrorWebhookMalformedEvent";
import { ErrorWebhookProviderNotFound } from "@application/errors/application/webhooks/ErrorWebhookProviderNotFound";
import { Clock } from "@application/ports/Clock";
import { Deployment } from "@application/ports/Deployment";
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

// The attempt starts at the first reading and ends at the second.
const startedAt = new Date("2026-10-10T10:00:02.000Z");
const finishedAt = new Date("2026-10-10T10:00:02.300Z");

const deployment: Deployment = { codeVersion: () => "20261017110316-339fc51a2130" };

// `event` is what storage holds; `started` is whether storage lets an attempt begin.
function setup(
  providers: WebhookProvider[],
  event: WebhookEventRepository.Event | undefined,
  { started = true }: { started?: boolean } = {},
) {
  const get = vi.fn(
    async (
      _id: WebhookEventRepository.EventId,
    ): Promise<WebhookEventRepository.Event | undefined> => event,
  );
  const startAttempt = vi.fn(
    async (_event: WebhookEventRepository.Event, _attempt: WebhookEventRepository.StartedAttempt) =>
      started,
  );
  const finishAttempt = vi.fn(
    async (
      _event: WebhookEventRepository.Event,
      _attempt: WebhookEventRepository.FinishedAttempt,
    ) => {},
  );
  // Processing calls only these repository operations.
  const events = {
    get,
    startAttempt,
    finishAttempt,
  } as Partial<WebhookEventRepository> as WebhookEventRepository;
  const providerRegistry: WebhookProviderRegistry = {
    find: (name) => providers.find((candidate) => candidate.name === name),
  };
  const now = vi.fn().mockReturnValueOnce(startedAt).mockReturnValueOnce(finishedAt);
  const clock: Clock = { now };
  return {
    useCase: new ProcessWebhookEventUseCase(events, providerRegistry, clock, deployment),
    get,
    startAttempt,
    finishAttempt,
  };
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

test("process records a successful attempt with the deployed code version around the provider's processing", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { useCase, startAttempt, finishAttempt } = setup([target], stored);

  await useCase.execute(id);

  const started = {
    attemptId: expect.any(String),
    startedAt,
    handlerVersion: "20261017110316-339fc51a2130",
  };
  expect(startAttempt).toHaveBeenCalledExactlyOnceWith(stored, started);
  expect(finishAttempt).toHaveBeenCalledExactlyOnceWith(stored, {
    ...started,
    finishedAt,
    outcome: "succeeded",
  });
  // The attempt that finishes is the one that started.
  expect(finishAttempt.mock.calls[0][1].attemptId).toBe(startAttempt.mock.calls[0][1].attemptId);
  expect(startAttempt.mock.invocationCallOrder[0]).toBeLessThan(
    process.mock.invocationCallOrder[0],
  );
  expect(process.mock.invocationCallOrder[0]).toBeLessThan(
    finishAttempt.mock.invocationCallOrder[0],
  );
});

test("process records a failed attempt with the error's code, then rethrows so the queue retries", async () => {
  const target = provider(stored.provider);
  const failure = new ErrorWebhookMalformedEvent();
  vi.spyOn(target, "process").mockRejectedValue(failure);
  const { useCase, finishAttempt } = setup([target], stored);

  await expect(useCase.execute(id)).rejects.toBe(failure);

  expect(finishAttempt).toHaveBeenCalledExactlyOnceWith(
    stored,
    expect.objectContaining({
      finishedAt,
      outcome: "failed",
      errorCode: "WEBHOOK_MALFORMED_EVENT",
    }),
  );
});

test("process records an error the application does not define under the fallback code", async () => {
  const target = provider(stored.provider);
  vi.spyOn(target, "process").mockRejectedValue(new Error("gateway timeout"));
  const { useCase, finishAttempt } = setup([target], stored);

  await expect(useCase.execute(id)).rejects.toThrow("gateway timeout");

  expect(finishAttempt.mock.calls[0][1]).toMatchObject({
    outcome: "failed",
    errorCode: "INTERNAL_SERVER_ERROR",
  });
});

test("process acknowledges a repeated delivery of a processed event without another attempt", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { useCase, startAttempt } = setup([target], { ...stored, processingStatus: "processed" });

  await expect(useCase.execute(id)).resolves.toBeUndefined();

  expect(startAttempt).not.toHaveBeenCalled();
  expect(process).not.toHaveBeenCalled();
});

test("process rejects an event another attempt holds, so the queue retries it later", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { useCase, finishAttempt } = setup([target], stored, { started: false });

  await expect(useCase.execute(id)).rejects.toMatchObject({
    name: "ErrorWebhookEventInProgress",
    statusCode: 409,
    code: "WEBHOOK_EVENT_IN_PROGRESS",
    category: "webhooks",
    kind: "unexpected",
    message: "Webhook event already being processed: gatewayGlobal/evt_1",
  });
  expect(process).not.toHaveBeenCalled();
  expect(finishAttempt).not.toHaveBeenCalled();
});

test("process rejects a missing stored event so it is retried, never passed to a provider as an empty payload", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const { useCase, startAttempt } = setup([target], undefined);
  const operation = useCase.execute(id);

  await expect(operation).rejects.toBeInstanceOf(ErrorWebhookEventNotFound);
  await expect(operation).rejects.toMatchObject({
    statusCode: 404,
    code: "WEBHOOK_EVENT_NOT_FOUND",
    category: "webhooks",
    kind: "unexpected",
    message: "Stored webhook event not found: gatewayGlobal/evt_1",
  });
  expect(startAttempt).not.toHaveBeenCalled();
  expect(process).not.toHaveBeenCalled();
});

test.each(["unknown", "GatewayGlobal", "constructor"])(
  "process rejects a stored event of an unregistered provider with the shared error: %s",
  async (name) => {
    const target = provider(stored.provider);
    const process = vi.spyOn(target, "process");
    const { useCase, startAttempt } = setup([target], { ...stored, provider: name });
    const operation = useCase.execute({ provider: name, providerEventId: stored.providerEventId });

    await expect(operation).rejects.toBeInstanceOf(ErrorWebhookProviderNotFound);
    await expect(operation).rejects.toMatchObject({
      statusCode: 404,
      code: "WEBHOOK_PROVIDER_NOT_FOUND",
      category: "webhooks",
      kind: "unexpected",
      message: `Unknown webhook provider: ${name}`,
    });
    expect(startAttempt).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  },
);

test("process propagates repository failures so the queue can retry", async () => {
  const target = provider(stored.provider);
  const process = vi.spyOn(target, "process");
  const failure = new Error("unavailable");

  const reading = setup([target], stored);
  reading.get.mockRejectedValueOnce(failure);
  await expect(reading.useCase.execute(id)).rejects.toBe(failure);

  const starting = setup([target], stored);
  starting.startAttempt.mockRejectedValueOnce(failure);
  await expect(starting.useCase.execute(id)).rejects.toBe(failure);

  expect(process).not.toHaveBeenCalled();
});
