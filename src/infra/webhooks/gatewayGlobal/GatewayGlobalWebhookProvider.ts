import { Clock } from "@application/ports/Clock";
import { Logger } from "@application/ports/Logger";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { constantTimeEqual } from "@kernel/utils/crypto";
import { headerValue } from "@kernel/utils/headers";
import { parseJson } from "@kernel/utils/json";
import * as z from "@kernel/utils/zod";
import { createHmac } from "node:crypto";

// Simulated global card gateway, shaped like Stripe.
// Events carry their object under `data.object` and times in Unix seconds.
// Amounts are integers in the currency's minor unit.
// Each webhook is signed with HMAC-SHA256 over its timestamp and body.
@Injectable(Clock, AppConfig, Logger)
export class GatewayGlobalWebhookProvider implements WebhookProvider<GatewayGlobalWebhookProvider.StatusEventType> {
  readonly name = "gatewayGlobal";

  readonly paymentStatuses: WebhookProvider.PaymentStatuses<GatewayGlobalWebhookProvider.StatusEventType> =
    {
      "payment.created": "pending",
      "payment.failed": "failed",
      "payment.succeeded": "succeeded",
      "refund.created": "refunded",
      "chargeback.opened": "charged_back",
    };

  private static readonly SIGNATURE_HEADER = "gateway-global-signature";
  // Older signatures are rejected, so a captured webhook cannot be replayed later.
  private static readonly TOLERANCE_SECONDS = 5 * 60;

  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  async authenticate({ rawBody, headers }: WebhookProvider.Request): Promise<boolean> {
    // A missing secret fails with a 5xx, so the gateway retries until it is set.
    const { signingSecret } = this.config.webhooks.gatewayGlobal;
    const signature = parseSignature(
      headerValue(headers, GatewayGlobalWebhookProvider.SIGNATURE_HEADER),
    );
    if (!signature) {
      return false;
    }

    const ageSeconds = Math.abs(this.clock.now().getTime() / 1000 - signature.timestamp);
    if (ageSeconds > GatewayGlobalWebhookProvider.TOLERANCE_SECONDS) {
      return false;
    }

    const expected = createHmac("sha256", signingSecret)
      .update(`${signature.timestamp}.${rawBody}`)
      .digest("hex");
    // During secret rotation, the gateway sends one signature per active secret.
    return signature.signatures.some((candidate) => constantTimeEqual(candidate, expected));
  }

  parse({ rawBody }: WebhookProvider.Request): WebhookProvider.Event | undefined {
    const result = eventSchema.safeParse(parseJson(rawBody));
    if (!result.success) {
      return undefined;
    }

    const event = result.data;
    const { object } = event.data;
    return {
      providerEventId: event.id,
      eventType: event.type,
      occurredAt: new Date(event.created * 1000),
      subject: subjectOf(object),
      // Only a payment names the subscription it bills.
      subscriptionId: object.object === "payment" ? object.subscription : undefined,
    };
  }

  async process(event: WebhookEventRepository.Event): Promise<void> {
    // Receipt already authenticated the event; processing needs no credentials.
    this.logger.info("webhook_routed", {
      provider: this.name,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
    });
  }
}

export namespace GatewayGlobalWebhookProvider {
  // The event types that report a payment status.
  export type StatusEventType =
    | "payment.created"
    | "payment.failed"
    | "payment.succeeded"
    | "refund.created"
    | "chargeback.opened";
}

// The parts of the signature header: `t=<Unix seconds>,v1=<hex signature>[,v1=...]`.
function parseSignature(
  header: string | undefined,
): { timestamp: number; signatures: string[] } | undefined {
  // Parsing is lenient: extra whitespace and unknown keys are ignored.
  const pairs = (header ?? "").split(",").map((pair) => pair.trim().split("="));
  const timestamp = pairs.find(([key]) => key === "t")?.[1];
  const signatures = pairs
    .filter(([key, value]) => key === "v1" && value)
    .map(([, value]) => value);

  // Timestamp must be a string of digits, and at least one signature must be present.
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return undefined;
  }
  return { timestamp: Number(timestamp), signatures };
}

// Objects that reverse a payment and name it in their `payment` field.
const REVERSALS = ["refund", "chargeback"];

// The object an event is about, such as a payment, refund, or subscription.
const eventObjectSchema = z
  .object({
    object: z.string().check(z.minLength(1)),
    id: z.string().check(z.minLength(1)),
    // The payment a refund or chargeback reverses.
    payment: z.optional(z.string().check(z.minLength(1))),
    // The subscription a payment bills; reversals name only their payment.
    subscription: z.optional(z.string().check(z.minLength(1))),
  })
  .check(
    // A reversal without its payment cannot be tied to the subject it affects.
    z.refine(({ object, payment }) => !REVERSALS.includes(object) || payment !== undefined, {
      error: "A refund or chargeback must name its payment",
      path: ["payment"],
    }),
  );

// The event fields receipt reads; the body is stored exactly as received.
const eventSchema = z.object({
  id: z.string().check(z.minLength(1)),
  // Such as `payment.succeeded` or `refund.created`.
  type: z.string().check(z.minLength(1)),
  // Unix seconds when the event happened.
  created: z.int(),
  data: z.object({ object: eventObjectSchema }),
});

// Payments and subscriptions are subjects; reversals affect their payment.
// Other objects affect no subject.
function subjectOf(object: z.output<typeof eventObjectSchema>): WebhookProvider.Event["subject"] {
  if (object.object === "payment" || object.object === "subscription") {
    return { type: object.object, id: object.id };
  }
  // The event schema guarantees that every reversal names its payment.
  return REVERSALS.includes(object.object) ? { type: "payment", id: object.payment! } : undefined;
}
