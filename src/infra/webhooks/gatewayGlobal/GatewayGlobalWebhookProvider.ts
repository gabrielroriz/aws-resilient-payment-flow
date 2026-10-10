import { Clock } from "@application/ports/Clock";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { constantTimeEqual } from "@kernel/utils/crypto";
import { headerValue } from "@kernel/utils/headers";
import { isFilledString, isObject, parseJson } from "@kernel/utils/json";
import { createHmac } from "node:crypto";

/**
 * Simulated global card gateway, shaped like Stripe. Events arrive in an envelope with the object
 * they are about under `data.object`, times are Unix seconds, and amounts are integers in the
 * currency's minor unit. Each webhook is signed with HMAC-SHA256 over its timestamp and body.
 */
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
    const signature = parseSignature(headerValue(headers, GatewayGlobalWebhookProvider.SIGNATURE_HEADER));
    if (!signature) {
      return false;
    }

    const ageSeconds = Math.abs(this.clock.now().getTime() / 1000 - signature.timestamp);
    if (ageSeconds > GatewayGlobalWebhookProvider.TOLERANCE_SECONDS) {
      return false;
    }

    const expected = createHmac("sha256", signingSecret).update(`${signature.timestamp}.${rawBody}`).digest("hex");
    // While the gateway rotates its secret, it sends one signature per active secret.
    return signature.signatures.some((candidate) => constantTimeEqual(candidate, expected));
  }

  parse({ rawBody }: WebhookProvider.Request): WebhookProvider.Event | undefined {
    const event = parseJson(rawBody);
    if (!isGatewayEvent(event)) {
      return undefined;
    }
    return {
      providerEventId: event.id,
      eventType: event.type,
      occurredAt: new Date(event.created * 1000),
      subject: subjectOf(event.data.object),
    };
  }
}

export namespace GatewayGlobalWebhookProvider {
  /** The JSON body gatewayGlobal sends. */
  export type Event = {
    id: string;
    object: "event";
    /** Such as `payment.succeeded` or `refund.created`. */
    type: string;
    /** Unix seconds when the event happened. */
    created: number;
    data: { object: EventObject };
  };

  /** The object an event is about, such as a payment, refund, chargeback, or subscription. */
  export type EventObject = {
    object: string;
    id: string;
    /** The payment a refund or chargeback reverses. */
    payment?: string;
    /** Integer amount in the currency's minor unit, such as cents. */
    amount?: number;
    /** Lowercase ISO 4217 code, such as `usd`. */
    currency?: string;
  };
}

/** The parts of the signature header: `t=<Unix seconds>,v1=<hex signature>[,v1=...]`. */
function parseSignature(header: string | undefined): { timestamp: number; signatures: string[] } | undefined {
  const pairs = (header ?? "").split(",").map((pair) => pair.trim().split("="));
  const timestamp = pairs.find(([key]) => key === "t")?.[1];
  const signatures = pairs.filter(([key, value]) => key === "v1" && value).map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return undefined;
  }
  return { timestamp: Number(timestamp), signatures };
}

// Objects that reverse a payment, such as a refund, and name it in their `payment` field.
const REVERSALS = ["refund", "chargeback"];

// Payments and subscriptions are subjects themselves, and reversals affect the payment they
// reverse; other objects affect no subject.
function subjectOf(object: GatewayGlobalWebhookProvider.EventObject): WebhookProvider.Event["subject"] {
  if (object.object === "payment" || object.object === "subscription") {
    return { type: object.object, id: object.id };
  }
  // The event check guarantees that every reversal names its payment.
  return REVERSALS.includes(object.object) ? { type: "payment", id: object.payment! } : undefined;
}

function isGatewayEvent(value: unknown): value is GatewayGlobalWebhookProvider.Event {
  if (
    !isObject(value) ||
    !isFilledString(value.id) ||
    !isFilledString(value.type) ||
    !Number.isInteger(value.created) ||
    !isObject(value.data) ||
    !isObject(value.data.object) ||
    !isFilledString(value.data.object.object) ||
    !isFilledString(value.data.object.id)
  ) {
    return false;
  }
  // A reversal without its payment cannot be tied to the subject it affects.
  return !REVERSALS.includes(value.data.object.object) || isFilledString(value.data.object.payment);
}
