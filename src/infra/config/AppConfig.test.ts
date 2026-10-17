import { AppConfig } from "@infra/config/AppConfig";
import { expect, test, vi } from "vitest";

test("AppConfig reads the webhook providers' credentials into typed values", () => {
  vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", "signing-secret");
  vi.stubEnv("GATEWAY_BRAZIL_ACCESS_TOKEN", "access-token");

  expect(new AppConfig().webhooks).toEqual({
    gatewayGlobal: { signingSecret: "signing-secret" },
    gatewayBrazil: { accessToken: "access-token" },
  });
});

test("AppConfig reads the queue names", () => {
  vi.stubEnv("WEBHOOK_EVENTS_QUEUE_NAME", "webhook_events.fifo");

  expect(new AppConfig().queues).toEqual({ webhookEvents: { name: "webhook_events.fifo" } });
});

test("AppConfig reads the table names", () => {
  vi.stubEnv("WEBHOOK_EVENTS_TABLE_NAME", "webhook_events");

  expect(new AppConfig().tables).toEqual({ webhookEvents: { name: "webhook_events" } });
});

test("AppConfig reads the deployed code version", () => {
  vi.stubEnv("CODE_VERSION", "20261017110316-339fc51a2130");

  expect(new AppConfig().deployment).toEqual({ codeVersion: "20261017110316-339fc51a2130" });
});

test("AppConfig rejects an empty code version", () => {
  vi.stubEnv("CODE_VERSION", "");

  expect(() => new AppConfig().deployment).toThrow(
    /Invalid environment variables for deployment:[\s\S]*CODE_VERSION/,
  );
});

test("AppConfig names the group and the variable that fail validation", () => {
  vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", "signing-secret");
  vi.stubEnv("GATEWAY_BRAZIL_ACCESS_TOKEN", "");

  expect(() => new AppConfig().webhooks).toThrow(
    /Invalid environment variables for webhooks:[\s\S]*GATEWAY_BRAZIL_ACCESS_TOKEN/,
  );
});

test("AppConfig validates nothing until a group is read, so a function starts without unused variables", () => {
  vi.stubEnv("GATEWAY_GLOBAL_SIGNING_SECRET", "");

  expect(() => new AppConfig()).not.toThrow();
});
