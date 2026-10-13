import { Schema, validatePayload } from "@kernel/decorators/schema";
import * as z from "@kernel/utils/zod";
import { expect, test } from "vitest";

@Schema(
  z.object({
    id: z.string().check(z.minLength(1)),
    amount: z.int().check(z.positive()),
    currency: z._default(z.string(), "BRL"),
  }),
)
class PaymentHandler {}

test("a valid payload becomes the schema's output, with defaults applied and undeclared fields dropped", () => {
  expect(validatePayload(new PaymentHandler(), { id: "pay_1", amount: 100, extra: true })).toEqual({
    success: true,
    data: { id: "pay_1", amount: 100, currency: "BRL" },
  });
});

test("an invalid payload lists each issue by field without echoing the received values", () => {
  const result = validatePayload(new PaymentHandler(), { id: "", amount: "4111 1111 1111 1111" });

  expect(result).toEqual({
    success: false,
    issues: [
      "id: Too small: expected string to have >=1 characters",
      "amount: Invalid input: expected number, received string",
    ],
  });
  expect(JSON.stringify(result)).not.toContain("4111");
});

test("an issue with the payload as a whole names no field", () => {
  expect(validatePayload(new PaymentHandler(), null)).toEqual({
    success: false,
    issues: ["Invalid input: expected object, received null"],
  });
});

test("a handler without a schema receives the payload unchanged", () => {
  class PlainHandler {}
  const payload = { anything: [1] };

  const result = validatePayload(new PlainHandler(), payload);

  expect(result).toEqual({ success: true, data: payload });
  expect(result.success && result.data).toBe(payload);
});
