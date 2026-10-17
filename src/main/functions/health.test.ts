import { invokeHttp } from "@main/adapters/lambdaHttpAdapter.fixtures";
import { handler } from "@main/functions/health";
import { expect, test, vi } from "vitest";

test("the health function answers through every layer, with the deployed code version", async () => {
  vi.stubEnv("CODE_VERSION", "20261017110316-339fc51a2130");
  const before = Date.now();

  const response = await invokeHttp(handler, { routeKey: "GET /health", rawPath: "/health" });

  expect(response.statusCode).toBe(200);
  expect(response.headers?.["content-type"]).toBe("application/json");
  expect(response.body.status).toBe("ok");
  expect(Date.parse(response.body.checkedAt)).toBeGreaterThanOrEqual(before - 1000);
  expect(response.body.codeVersion).toBe("20261017110316-339fc51a2130");
});
