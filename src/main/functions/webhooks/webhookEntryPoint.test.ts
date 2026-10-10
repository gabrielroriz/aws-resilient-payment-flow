import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { InMemoryWebhookProviderCatalog } from "@infra/webhooks/InMemoryWebhookProviderCatalog";
import { invokeHttp } from "@main/adapters/lambdaHttpAdapter.fixtures";
import { handler } from "@main/functions/webhooks/webhookEntryPoint";
import { gunzipSync } from "node:zlib";
import { expect, test, vi } from "vitest";

// Stands in for a gateway adapter: it accepts requests that carry the expected signature header.
const simulated: WebhookProvider = {
  name: "simulated",
  authenticate: async ({ headers }) => headers["x-signature"] === "valid",
  parse: ({ rawBody }) => {
    const body = JSON.parse(rawBody);
    return { providerEventId: body.id, eventType: body.type, occurredAt: new Date(body.created_at) };
  },
};

const body = '{"id":"evt_1","type":"payment.succeeded","created_at":"2026-10-10T10:00:00.000Z"}';

function webhookTo(provider: string) {
  return {
    routeKey: "POST /webhooks/{provider}",
    rawPath: `/webhooks/${provider}`,
    pathParameters: { provider },
    headers: { "x-signature": "valid" },
    body,
  };
}

test("the webhook function stores an event from the provider named in the URL", async () => {
  vi.spyOn(InMemoryWebhookProviderCatalog.prototype, "find").mockImplementation((name) =>
    name === simulated.name ? simulated : undefined,
  );
  const putIfAbsent = vi.spyOn(DynamoClient.prototype, "putIfAbsent").mockResolvedValue({ created: true });

  const response = await invokeHttp(handler, webhookTo("simulated"));

  expect(response).toMatchObject({
    statusCode: 200,
    body: { provider: "simulated", providerEventId: "evt_1", duplicate: false },
  });
  const item = putIfAbsent.mock.calls[0][1];
  expect(item).toMatchObject({ PK: "simulated#evt_1", event_type: "payment.succeeded" });
  // The request body reaches storage byte for byte, as signature checks and reprocessing need.
  expect(gunzipSync(item.payload as Uint8Array).toString("utf8")).toBe(body);
});

test("the webhook function answers 404 for a provider it does not support and logs it under webhooks", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const putIfAbsent = vi.spyOn(DynamoClient.prototype, "putIfAbsent");

  const response = await invokeHttp(handler, webhookTo("unknown"));

  expect(response).toMatchObject({
    statusCode: 404,
    body: {
      success: false,
      error: { code: "WEBHOOK_PROVIDER_NOT_FOUND", message: "Unknown webhook provider: unknown" },
    },
  });
  expect(putIfAbsent).not.toHaveBeenCalled();
  expect(JSON.parse(consoleError.mock.calls[0][0])).toMatchObject({
    category: "webhooks",
    errorKind: "expected",
    errorCode: "WEBHOOK_PROVIDER_NOT_FOUND",
  });
});
