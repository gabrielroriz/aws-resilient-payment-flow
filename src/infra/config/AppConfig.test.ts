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
