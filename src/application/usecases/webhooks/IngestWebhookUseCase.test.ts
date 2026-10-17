import { Clock } from "@application/ports/Clock";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { WebhookProviderRegistry } from "@application/ports/webhooks/WebhookProviderRegistry";
import { IngestWebhookUseCase } from "@application/usecases/webhooks/IngestWebhookUseCase";
import { expect, test, vi } from "vitest";

const parsedEvent: WebhookProvider.Event = {
  providerEventId: "evt_1",
  eventType: "payment.succeeded",
  occurredAt: new Date("2026-10-10T10:00:00.000Z"),
  subject: { type: "payment", id: "pay_1" },
  subscriptionId: "sub_1",
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
    paymentStatuses: {
      "payment.succeeded": "succeeded",
    } as WebhookProvider.PaymentStatuses<string>,
    authenticate: vi.fn(async () => true),
    parse: vi.fn((): WebhookProvider.Event | undefined => parsedEvent),
    process: vi.fn(async () => {}),
    ...overrides,
  };
}

// `stored` is the event an earlier delivery stored, making this one a duplicate.
// `outdated` is what recording the event's status reports.
function setup({
  provider = fakeProvider(),
  stored,
  outdated = false,
}: { provider?: WebhookProvider; stored?: WebhookEventRepository.Event; outdated?: boolean } = {}) {
  const providerRegistry: WebhookProviderRegistry = {
    find: (name) => (name === provider.name ? provider : undefined),
    route: vi.fn(async () => {
      throw new Error("Receipt must not route events synchronously");
    }),
  };
  const create = vi.fn(
    async (event: WebhookEventRepository.NewEvent): Promise<WebhookEventRepository.CreateResult> =>
      stored
        ? { created: false, event: stored }
        : { created: true, event: { ...event, processingStatus: "received", outdated: false } },
  );
  const recordDuplicateDelivery = vi.fn(async () => {});
  const recordStatus = vi.fn(
    async (
      _event: WebhookEventRepository.StatusEvent,
      _precedence: number,
    ): Promise<WebhookEventRepository.RecordStatusResult> => ({ outdated }),
  );
  const recordOutdated = vi.fn(async (_id: WebhookEventRepository.EventId) => {});
  const recordEnqueued = vi.fn(async (_id: WebhookEventRepository.EventId) => {});
  // Receipt calls only these repository operations.
  const events = {
    create,
    recordDuplicateDelivery,
    recordStatus,
    recordOutdated,
    recordEnqueued,
  } as Partial<WebhookEventRepository> as WebhookEventRepository;
  const dispatcher = {
    dispatch: vi.fn(async (_event: WebhookEventRepository.EventId) => {}),
  } satisfies WebhookEventDispatcher;

  return {
    useCase: new IngestWebhookUseCase(providerRegistry, events, dispatcher, clock),
    create,
    recordDuplicateDelivery,
    recordStatus,
    recordOutdated,
    recordEnqueued,
    dispatch: dispatcher.dispatch,
  };
}

test("ingest stores a new event with the provider's name, the status its type reports, the receipt time, and the exact payload, then dispatches it and records it as enqueued", async () => {
  const provider = fakeProvider();
  const {
    useCase,
    create,
    recordDuplicateDelivery,
    recordStatus,
    recordOutdated,
    recordEnqueued,
    dispatch,
  } = setup({ provider });

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).resolves.toEqual({
    provider: "simulated",
    providerEventId: "evt_1",
    duplicate: false,
    outdated: false,
  });

  expect(provider.authenticate).toHaveBeenCalledWith(request);
  expect(provider.parse).toHaveBeenCalledWith(request);
  expect(provider.process).not.toHaveBeenCalled();
  const received = {
    ...parsedEvent,
    provider: "simulated",
    status: "succeeded",
    receivedAt: now,
    payload: request.rawBody,
  };
  expect(create).toHaveBeenCalledWith(received);
  const stored = { ...received, processingStatus: "received", outdated: false };
  expect(recordDuplicateDelivery).not.toHaveBeenCalled();
  expect(recordStatus).toHaveBeenCalledWith(stored, 2);
  expect(recordOutdated).not.toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith(stored);
  // The subject's status accounts for the event before processing can receive it.
  expect(recordStatus.mock.invocationCallOrder[0]).toBeLessThan(
    dispatch.mock.invocationCallOrder[0],
  );
  expect(recordEnqueued).toHaveBeenCalledWith(stored);
  expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(
    recordEnqueued.mock.invocationCallOrder[0],
  );
});

test("ingest records a repeated delivery against the stored event instead of storing it again, and dispatches it again", async () => {
  const stored: WebhookEventRepository.Event = {
    ...parsedEvent,
    provider: "simulated",
    status: "succeeded",
    receivedAt: new Date("2026-10-10T09:59:00.000Z"),
    payload: request.rawBody,
    processingStatus: "received",
    outdated: false,
  };
  const { useCase, recordDuplicateDelivery, recordStatus, recordEnqueued, dispatch } = setup({
    stored,
  });

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-2", request }),
  ).resolves.toEqual({
    provider: "simulated",
    providerEventId: "evt_1",
    duplicate: true,
    outdated: false,
  });

  expect(recordDuplicateDelivery).toHaveBeenCalledWith(stored, {
    receivedAt: now,
    requestId: "req-2",
  });
  // The earlier delivery may have failed to record or dispatch, so all steps rerun.
  expect(recordStatus).toHaveBeenCalledWith(stored, 2);
  expect(dispatch).toHaveBeenCalledWith(stored);
  expect(recordEnqueued).toHaveBeenCalledWith(stored);
});

test("ingest flags an event that another event of its subject outranks as outdated, on the stored event before dispatch, and still stores and dispatches it", async () => {
  const { useCase, create, recordOutdated, dispatch } = setup({ outdated: true });

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).resolves.toMatchObject({ duplicate: false, outdated: true });

  expect(recordOutdated).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "simulated", providerEventId: "evt_1" }),
  );
  expect(recordOutdated.mock.invocationCallOrder[0]).toBeLessThan(
    dispatch.mock.invocationCallOrder[0],
  );
  // An outdated event's facts can still count, such as a late payment's amount.
  expect(create).toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalled();
});

test("ingest answers a repeated delivery of an enqueued event as outdated without flagging the event, which arrived before it was outranked", async () => {
  const stored: WebhookEventRepository.Event = {
    ...parsedEvent,
    provider: "simulated",
    status: "succeeded",
    receivedAt: new Date("2026-10-10T09:59:00.000Z"),
    payload: request.rawBody,
    processingStatus: "enqueued",
    outdated: false,
  };
  const { useCase, recordOutdated, dispatch } = setup({ stored, outdated: true });

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-2", request }),
  ).resolves.toMatchObject({ duplicate: true, outdated: true });

  expect(recordOutdated).not.toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith(stored);
});

test("ingest flags an outranked repeated delivery of an event still received, since it completes the event's unfinished receipt", async () => {
  const stored: WebhookEventRepository.Event = {
    ...parsedEvent,
    provider: "simulated",
    status: "succeeded",
    receivedAt: new Date("2026-10-10T09:59:00.000Z"),
    payload: request.rawBody,
    processingStatus: "received",
    outdated: false,
  };
  const { useCase, recordOutdated } = setup({ stored, outdated: true });

  await useCase.execute({ provider: "simulated", requestId: "req-2", request });

  expect(recordOutdated).toHaveBeenCalledWith(stored);
});

test("ingest fails without dispatching when the event cannot be flagged as outdated, so the provider retries", async () => {
  const { useCase, recordOutdated, dispatch } = setup({ outdated: true });
  const failure = new Error("storage unavailable");
  recordOutdated.mockRejectedValue(failure);

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).rejects.toBe(failure);
  expect(dispatch).not.toHaveBeenCalled();
});

test.each<[WebhookEventRepository.SubjectStatus, number]>([
  ["pending", 1],
  ["overdue", 1],
  ["failed", 1],
  ["succeeded", 2],
  ["refunded", 3],
  ["charged_back", 3],
])(
  "ingest ranks a %s payment with precedence %i, so statuses no later event can undo rank higher",
  async (status, precedence) => {
    const provider = fakeProvider({ paymentStatuses: { "payment.succeeded": status } });
    const { useCase, recordStatus } = setup({ provider });

    await useCase.execute({ provider: "simulated", requestId: "req-1", request });

    expect(recordStatus).toHaveBeenCalledWith(expect.objectContaining({ status }), precedence);
  },
);

test.each<[string, Partial<WebhookProvider.Event>]>([
  ["a type its provider does not map", { eventType: "payment.updated" }],
  ["a type named like an object property", { eventType: "constructor" }],
  ["a subject that is not a payment", { subject: { type: "subscription", id: "sub_1" } }],
  ["no subject", { subject: undefined }],
])(
  "ingest gives no status to an event with %s, so it is never ranked or outdated",
  async (_case, fields) => {
    const provider = fakeProvider({ parse: vi.fn(() => ({ ...parsedEvent, ...fields })) });
    const { useCase, create, recordStatus, recordOutdated, dispatch } = setup({
      provider,
      outdated: true,
    });

    await expect(
      useCase.execute({ provider: "simulated", requestId: "req-1", request }),
    ).resolves.toMatchObject({ outdated: false });

    expect(create.mock.calls[0][0].status).toBeUndefined();
    expect(recordStatus).not.toHaveBeenCalled();
    expect(recordOutdated).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
  },
);

test("ingest fails without dispatching when the status cannot be recorded, so the provider retries", async () => {
  const { useCase, create, recordStatus, dispatch } = setup();
  const failure = new Error("storage unavailable");
  recordStatus.mockRejectedValue(failure);

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).rejects.toBe(failure);
  expect(create).toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

test("ingest fails when the event cannot be dispatched, so the provider retries the stored event, which stays received", async () => {
  const { useCase, create, recordEnqueued, dispatch } = setup();
  const failure = new Error("queue unavailable");
  dispatch.mockRejectedValue(failure);

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).rejects.toBe(failure);
  expect(create).toHaveBeenCalled();
  expect(recordEnqueued).not.toHaveBeenCalled();
});

test("ingest fails when the event cannot be recorded as enqueued, so the provider retries", async () => {
  const { useCase, recordEnqueued, dispatch } = setup();
  const failure = new Error("storage unavailable");
  recordEnqueued.mockRejectedValue(failure);

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).rejects.toBe(failure);
  expect(dispatch).toHaveBeenCalled();
});

test("ingest rejects a provider that is not supported and stores nothing", async () => {
  const { useCase, create, dispatch } = setup();

  await expect(
    useCase.execute({ provider: "stripe", requestId: "req-1", request }),
  ).rejects.toThrow(
    expect.objectContaining({
      name: "ErrorWebhookProviderNotFound",
      statusCode: 404,
      code: "WEBHOOK_PROVIDER_NOT_FOUND",
      category: "webhooks",
      kind: "expected",
      message: "Unknown webhook provider: stripe",
    }),
  );
  expect(create).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

test("ingest rejects an unauthenticated webhook without reading or storing it", async () => {
  const provider = fakeProvider({ authenticate: vi.fn(async () => false) });
  const { useCase, create, dispatch } = setup({ provider });

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).rejects.toThrow(
    expect.objectContaining({
      name: "ErrorWebhookAuthenticationFailed",
      statusCode: 401,
      code: "WEBHOOK_AUTHENTICATION_FAILED",
      category: "webhooks",
      kind: "expected",
    }),
  );
  expect(provider.parse).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

test("ingest rejects an authenticated webhook whose body is not a provider event", async () => {
  const provider = fakeProvider({ parse: vi.fn(() => undefined) });
  const { useCase, create, dispatch } = setup({ provider });

  await expect(
    useCase.execute({ provider: "simulated", requestId: "req-1", request }),
  ).rejects.toThrow(
    // The provider really sent it, so its adapter likely needs updating.
    expect.objectContaining({
      name: "ErrorWebhookMalformedEvent",
      statusCode: 400,
      code: "WEBHOOK_MALFORMED_EVENT",
      category: "webhooks",
      kind: "unexpected",
    }),
  );
  expect(create).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
