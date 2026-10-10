import { Clock } from "@application/ports/Clock";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { GatewayGlobalWebhookProvider } from "@infra/webhooks/gatewayGlobal/GatewayGlobalWebhookProvider";
import { createHmac } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";

const SECRET = "test-signing-secret";
const NOW = new Date("2026-10-10T10:00:00.000Z");
const clock: Clock = { now: () => NOW };
const gateway = new GatewayGlobalWebhookProvider(clock, new AppConfig());

const body = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "payment.succeeded",
  created: 1791626400,
  data: { object: { object: "payment", id: "pay_1", amount: 1990, currency: "usd" } },
});

// The webhooks configuration holds every provider's credentials and is validated as a whole.
beforeEach(() => {
  vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", SECRET);
  vi.stubEnv("GATEWAY_BRAZIL_ACCESS_TOKEN", "unused-access-token");
});

// Signs a body the way gatewayGlobal does: HMAC-SHA256 of `<timestamp>.<body>`.
function signature(rawBody: string, { secret = SECRET, at = NOW } = {}): string {
  const timestamp = Math.floor(at.getTime() / 1000);
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function request(rawBody: string, signatureHeader?: string): WebhookProvider.Request {
  return { rawBody, headers: { "gateway-global-signature": signatureHeader }, queryParams: {} };
}

test("gatewayGlobal accepts a webhook signed with its secret", async () => {
  await expect(gateway.authenticate(request(body, signature(body)))).resolves.toBe(true);
});

test("gatewayGlobal accepts any one valid signature, as sent while its secret rotates", async () => {
  const [timestamp, valid] = signature(body).split(",");
  const old = signature(body, { secret: "retired-secret" }).split(",")[1];

  await expect(gateway.authenticate(request(body, `${timestamp},${old},${valid}`))).resolves.toBe(true);
});

test.each([
  ["no signature", undefined],
  ["a garbled signature header", "v1=abc"],
  ["a signature made with another secret", signature(body, { secret: "forged" })],
  ["a signature of another body", signature(body.replace("1990", "1"))],
  ["a signature older than five minutes", signature(body, { at: new Date(NOW.getTime() - 301_000) })],
])("gatewayGlobal rejects a webhook with %s", async (_case, header) => {
  await expect(gateway.authenticate(request(body, header))).resolves.toBe(false);
});

test("gatewayGlobal fails instead of rejecting webhooks when its secret is not configured", async () => {
  vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", "");

  await expect(gateway.authenticate(request(body, signature(body)))).rejects.toThrow("GATEWAY_GLOBAL_SIGNING_SECRET");
});

test("gatewayGlobal reads a payment event", () => {
  expect(gateway.parse(request(body))).toEqual({
    providerEventId: "evt_1",
    eventType: "payment.succeeded",
    occurredAt: new Date("2026-10-10T10:00:00.000Z"),
    subject: { type: "payment", id: "pay_1" },
  });
});

test.each([
  ["a refund, as the payment it reverses", { object: "refund", id: "re_1", payment: "pay_1" }, { type: "payment", id: "pay_1" }],
  ["a chargeback, as the payment it reverses", { object: "chargeback", id: "cb_1", payment: "pay_1" }, { type: "payment", id: "pay_1" }],
  ["a subscription", { object: "subscription", id: "sub_1" }, { type: "subscription", id: "sub_1" }],
  ["another object, as no subject", { object: "customer", id: "cus_1" }, undefined],
])("gatewayGlobal reads the subject of %s", (_case, object, subject) => {
  const event = { id: "evt_2", object: "event", type: "any.event", created: 1791626400, data: { object } };

  expect(gateway.parse(request(JSON.stringify(event)))?.subject).toEqual(subject);
});

test.each([
  ["a body that is not JSON", "not json"],
  ["an event without an ID", '{"type":"payment.succeeded","created":1791626400,"data":{"object":{"object":"payment","id":"pay_1"}}}'],
  ["an event with a time that is not Unix seconds", '{"id":"evt_1","type":"payment.succeeded","created":"2026-10-10","data":{"object":{"object":"payment","id":"pay_1"}}}'],
  ["an event without its object", '{"id":"evt_1","type":"payment.succeeded","created":1791626400,"data":{}}'],
  ["a refund that does not name its payment", '{"id":"evt_1","type":"refund.created","created":1791626400,"data":{"object":{"object":"refund","id":"re_1"}}}'],
])("gatewayGlobal reads no event from %s", (_case, rawBody) => {
  expect(gateway.parse(request(rawBody))).toBeUndefined();
});
