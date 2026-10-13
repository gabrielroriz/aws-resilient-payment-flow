import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { SqsWebhookEventDispatcher } from "@infra/queues/SqsWebhookEventDispatcher";
import { InMemoryWebhookProviderRegistry } from "@infra/webhooks/InMemoryWebhookProviderRegistry";
import { invokeHttp } from "@main/adapters/lambdaHttpAdapter.fixtures";
import { handler } from "@main/functions/webhooks/webhookEntryPoint";
import { gunzipSync } from "node:zlib";
import { expect, test, vi } from "vitest";

// Stands in for a gateway adapter: it accepts requests that carry the expected signature header.
const simulated: WebhookProvider = {
  name: "simulated",
  process: vi.fn(async () => {}),
  authenticate: async ({ headers }) => headers["x-signature"] === "valid",
  parse: ({ rawBody }) => {
    const body = JSON.parse(rawBody);
    return {
      providerEventId: body.id,
      eventType: body.type,
      occurredAt: new Date(body.created_at),
    };
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

test("the webhook function stores and dispatches an event from the provider named in the URL", async () => {
  // A name unlike the deployed one shows that the function reads the table from configuration.
  vi.stubEnv("WEBHOOK_EVENTS_TABLE_NAME", "configured_events");
  vi.spyOn(InMemoryWebhookProviderRegistry.prototype, "find").mockImplementation((name) =>
    name === simulated.name ? simulated : undefined,
  );
  const putIfAbsent = vi
    .spyOn(DynamoClient.prototype, "putIfAbsent")
    .mockResolvedValue({ created: true });
  const dispatch = vi.spyOn(SqsWebhookEventDispatcher.prototype, "dispatch").mockResolvedValue();

  const response = await invokeHttp(handler, webhookTo("simulated"));

  expect(response).toMatchObject({
    statusCode: 200,
    body: { provider: "simulated", providerEventId: "evt_1", duplicate: false },
  });
  const [table, item] = putIfAbsent.mock.calls[0];
  expect(table).toBe("configured_events");
  expect(item).toMatchObject({ PK: "simulated#evt_1", event_type: "payment.succeeded" });
  // The request body reaches storage byte for byte, as signature checks and reprocessing need.
  expect(gunzipSync(item.payload as Uint8Array).toString("utf8")).toBe(body);
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "simulated", providerEventId: "evt_1" }),
  );
  expect(simulated.process).not.toHaveBeenCalled();
});

test("the webhook function answers 404 for a provider it does not support and logs it under webhooks", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const putIfAbsent = vi.spyOn(DynamoClient.prototype, "putIfAbsent");
  const dispatch = vi.spyOn(SqsWebhookEventDispatcher.prototype, "dispatch");

  const response = await invokeHttp(handler, webhookTo("unknown"));

  expect(response).toMatchObject({
    statusCode: 404,
    body: {
      success: false,
      error: { code: "WEBHOOK_PROVIDER_NOT_FOUND", message: "Unknown webhook provider: unknown" },
    },
  });
  expect(putIfAbsent).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  const failure = JSON.parse(consoleError.mock.calls[0][0]);
  expect(failure).toMatchObject({
    category: "webhooks",
    errorKind: "expected",
    errorCode: "WEBHOOK_PROVIDER_NOT_FOUND",
    errorName: "ErrorWebhookProviderNotFound",
  });
  expect(failure).not.toHaveProperty("errorStack");
});
