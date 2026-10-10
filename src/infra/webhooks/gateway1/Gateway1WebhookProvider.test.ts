import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { Gateway1WebhookProvider } from "@infra/webhooks/gateway1/Gateway1WebhookProvider";
import { expect, test } from "vitest";

function request(rawBody: string): WebhookProvider.Request {
  return { rawBody, headers: {}, queryParams: {} };
}

const gateway = new Gateway1WebhookProvider();

test("gateway1 accepts every request, since its events carry no signature", async () => {
  await expect(gateway.authenticate()).resolves.toBe(true);
});

test("gateway1 reads an event and the subject it affects", () => {
  const body = JSON.stringify({
    id: "evt_1",
    type: "payment.succeeded",
    occurred_at: "2026-10-10T10:00:00.000Z",
    subject: { type: "payment", id: "pay_1", ignored: true },
    amount: 1000,
  });

  expect(gateway.parse(request(body))).toEqual({
    providerEventId: "evt_1",
    eventType: "payment.succeeded",
    occurredAt: new Date("2026-10-10T10:00:00.000Z"),
    subject: { type: "payment", id: "pay_1" },
  });
});

test("gateway1 reads an event that affects no subject", () => {
  const body = '{"id":"evt_2","type":"account.updated","occurred_at":"2026-10-10T10:00:00Z"}';

  expect(gateway.parse(request(body))).toEqual({
    providerEventId: "evt_2",
    eventType: "account.updated",
    occurredAt: new Date("2026-10-10T10:00:00.000Z"),
    subject: undefined,
  });
});

test.each([
  ["a body that is not JSON", "not json"],
  ["a JSON value that is not an object", '["evt_1"]'],
  ["an event without an ID", '{"type":"payment.succeeded","occurred_at":"2026-10-10T10:00:00Z"}'],
  ["an event with an empty type", '{"id":"evt_1","type":"","occurred_at":"2026-10-10T10:00:00Z"}'],
  ["an event without an occurrence time", '{"id":"evt_1","type":"payment.succeeded"}'],
  ["an event with an invalid occurrence time", '{"id":"evt_1","type":"payment.succeeded","occurred_at":"yesterday"}'],
  ["a subject without an ID", '{"id":"evt_1","type":"payment.succeeded","occurred_at":"2026-10-10T10:00:00Z","subject":{"type":"payment"}}'],
])("gateway1 reads no event from %s", (_case, body) => {
  expect(gateway.parse(request(body))).toBeUndefined();
});
