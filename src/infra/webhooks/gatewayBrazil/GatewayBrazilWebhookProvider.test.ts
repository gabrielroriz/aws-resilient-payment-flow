import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { GatewayBrazilWebhookProvider } from "@infra/webhooks/gatewayBrazil/GatewayBrazilWebhookProvider";
import { beforeEach, expect, test, vi } from "vitest";

const TOKEN = "test-access-token";
const gateway = new GatewayBrazilWebhookProvider(new AppConfig());

// The webhooks configuration holds every provider's credentials and is validated as a whole.
beforeEach(() => {
  vi.stubEnv("GATEWAY_BRAZIL_ACCESS_TOKEN", TOKEN);
  vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", "unused-signing-secret");
});

function request(rawBody: string, headers: Record<string, string> = {}): WebhookProvider.Request {
  return { rawBody, headers, queryParams: {} };
}

test("gatewayBrazil accepts a webhook carrying its access token, whatever the header's letter case", async () => {
  await expect(gateway.authenticate(request("{}", { "gateway-brazil-access-token": TOKEN }))).resolves.toBe(true);
  await expect(gateway.authenticate(request("{}", { "Gateway-Brazil-Access-Token": TOKEN }))).resolves.toBe(true);
});

test.each([
  ["no access token", {}],
  ["another access token", { "gateway-brazil-access-token": "forged" }],
])("gatewayBrazil rejects a webhook with %s", async (_case, headers) => {
  await expect(gateway.authenticate(request("{}", headers))).resolves.toBe(false);
});

test("gatewayBrazil fails instead of rejecting webhooks when its token is not configured", async () => {
  vi.stubEnv("GATEWAY_BRAZIL_ACCESS_TOKEN", "");

  await expect(gateway.authenticate(request("{}", { "gateway-brazil-access-token": TOKEN }))).rejects.toThrow("GATEWAY_BRAZIL_ACCESS_TOKEN");
});

test("gatewayBrazil reads a payment event, converting its Brasília time to UTC", () => {
  const body = JSON.stringify({
    id: "evt_1",
    event: "PAYMENT_RECEIVED",
    dateCreated: "2026-10-10 07:00:00",
    payment: { object: "payment", id: "pay_1", value: 19.9, billingType: "PIX", status: "RECEIVED" },
  });

  expect(gateway.parse(request(body))).toEqual({
    providerEventId: "evt_1",
    eventType: "PAYMENT_RECEIVED",
    occurredAt: new Date("2026-10-10T10:00:00.000Z"),
    subject: { type: "payment", id: "pay_1" },
  });
});

test.each([
  ["a subscription", { subscription: { object: "subscription", id: "sub_1" } }, { type: "subscription", id: "sub_1" }],
  ["no payment or subscription, as no subject", {}, undefined],
])("gatewayBrazil reads the subject of an event about %s", (_case, fields, subject) => {
  const event = { id: "evt_2", event: "SUBSCRIPTION_CREATED", dateCreated: "2026-10-10 07:00:00", ...fields };

  expect(gateway.parse(request(JSON.stringify(event)))?.subject).toEqual(subject);
});

test.each([
  ["a body that is not JSON", "not json"],
  ["an event without a name", '{"id":"evt_1","dateCreated":"2026-10-10 07:00:00"}'],
  ["an event with an ISO 8601 time instead of Brasília time", '{"id":"evt_1","event":"PAYMENT_RECEIVED","dateCreated":"2026-10-10T07:00:00Z"}'],
  ["a payment without an ID", '{"id":"evt_1","event":"PAYMENT_RECEIVED","dateCreated":"2026-10-10 07:00:00","payment":{"value":19.9}}'],
])("gatewayBrazil reads no event from %s", (_case, rawBody) => {
  expect(gateway.parse(request(rawBody))).toBeUndefined();
});
