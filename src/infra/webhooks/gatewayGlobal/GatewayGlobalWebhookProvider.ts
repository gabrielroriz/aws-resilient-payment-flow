import { Clock } from "@application/ports/Clock";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { constantTimeEqual } from "@kernel/utils/crypto";
import { headerValue } from "@kernel/utils/headers";
import { parseJson } from "@kernel/utils/json";
import * as z from "@kernel/utils/zod";
import { createHmac } from "node:crypto";

// Simulated global card gateway, shaped like Stripe. Events arrive in an envelope with the object
// they are about under `data.object`, times are Unix seconds, and amounts are integers in the
// currency's minor unit. Each webhook is signed with HMAC-SHA256 over its timestamp and body.
@Injectable(Clock, AppConfig)
export class GatewayGlobalWebhookProvider implements WebhookProvider {
  readonly name = "gatewayGlobal";

  private static readonly SIGNATURE_HEADER = "gateway-global-signature";
  // A signature older than this is rejected, so a captured webhook cannot be replayed later.
  private static readonly TOLERANCE_SECONDS = 5 * 60;

  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async authenticate({ rawBody, headers }: WebhookProvider.Request): Promise<boolean> {
    // A missing secret fails the request with a 5xx, so the gateway retries until it is configured.
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
    // While the gateway rotates its secret, it sends one signature per active secret.
    return signature.signatures.some((candidate) => constantTimeEqual(candidate, expected));
  }

  parse({ rawBody }: WebhookProvider.Request): WebhookProvider.Event | undefined {
    const result = eventSchema.safeParse(parseJson(rawBody));
    if (!result.success) {
      return undefined;
    }

    const event = result.data;
    return {
      providerEventId: event.id,
      eventType: event.type,
      occurredAt: new Date(event.created * 1000),
      subject: subjectOf(event.data.object),
    };
  }

  async process(event: WebhookEventRepository.Event): Promise<void> {
    // Receipt already authenticated the stored event; processing needs no signing credentials.
    console.info(
      JSON.stringify({
        logType: "webhook_routed",
        provider: this.name,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
      }),
    );
  }
}

// The parts of the signature header: `t=<Unix seconds>,v1=<hex signature>[,v1=...]`.
function parseSignature(
  header: string | undefined,
): { timestamp: number; signatures: string[] } | undefined {
  const pairs = (header ?? "").split(",").map((pair) => pair.trim().split("="));
  const timestamp = pairs.find(([key]) => key === "t")?.[1];
  const signatures = pairs
    .filter(([key, value]) => key === "v1" && value)
    .map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return undefined;
  }
  return { timestamp: Number(timestamp), signatures };
}

// Objects that reverse a payment, such as a refund, and name it in their `payment` field.
const REVERSALS = ["refund", "chargeback"];

// The object an event is about, such as a payment, refund, chargeback, or subscription.
const eventObjectSchema = z
  .object({
    object: z.string().check(z.minLength(1)),
    id: z.string().check(z.minLength(1)),
    // The payment a refund or chargeback reverses.
    payment: z.optional(z.string().check(z.minLength(1))),
  })
  .check(
    // A reversal without its payment cannot be tied to the subject it affects.
    z.refine(({ object, payment }) => !REVERSALS.includes(object) || payment !== undefined, {
      error: "A refund or chargeback must name its payment",
      path: ["payment"],
    }),
  );

// The fields of a gatewayGlobal event that receipt reads; the body is stored exactly as received.
const eventSchema = z.object({
  id: z.string().check(z.minLength(1)),
  // Such as `payment.succeeded` or `refund.created`.
  type: z.string().check(z.minLength(1)),
  // Unix seconds when the event happened.
  created: z.int(),
  data: z.object({ object: eventObjectSchema }),
});

// Payments and subscriptions are subjects themselves, and reversals affect the payment they
// reverse; other objects affect no subject.
function subjectOf(object: z.output<typeof eventObjectSchema>): WebhookProvider.Event["subject"] {
  if (object.object === "payment" || object.object === "subscription") {
    return { type: object.object, id: object.id };
  }
  // The event schema guarantees that every reversal names its payment.
  return REVERSALS.includes(object.object) ? { type: "payment", id: object.payment! } : undefined;
}
