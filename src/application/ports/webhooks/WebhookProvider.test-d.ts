import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { test } from "vitest";

// A provider lists its status-reporting event types as the port's type argument.
// A table missing one or mapping an unlisted type must fail type checking.
// So must an unused expect-error.
test("the type checker requires a status for every listed event type, and no other", () => {
  type StatusEventType = "payment.succeeded" | "refund.created";

  const complete: WebhookProvider.PaymentStatuses<StatusEventType> = {
    "payment.succeeded": "succeeded",
    "refund.created": "refunded",
  };

  // @ts-expect-error: `refund.created` is listed but has no status.
  const missing: WebhookProvider.PaymentStatuses<StatusEventType> = {
    "payment.succeeded": "succeeded",
  };

  const unlisted: WebhookProvider.PaymentStatuses<StatusEventType> = {
    "payment.succeeded": "succeeded",
    "refund.created": "refunded",
    // @ts-expect-error: `payment.failed` is not a listed event type.
    "payment.failed": "failed",
  };

  const unknownStatus: WebhookProvider.PaymentStatuses<StatusEventType> = {
    "payment.succeeded": "succeeded",
    // @ts-expect-error: `reversed` is not a payment status.
    "refund.created": "reversed",
  };
});
