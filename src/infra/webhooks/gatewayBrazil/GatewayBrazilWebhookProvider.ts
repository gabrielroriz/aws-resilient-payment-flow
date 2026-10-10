import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { constantTimeEqual } from "@kernel/utils/crypto";
import { headerValue } from "@kernel/utils/headers";
import { isFilledString, isObject, parseJson } from "@kernel/utils/json";

/**
 * Simulated Brazilian gateway, shaped like Asaas. Events are flat, with the payment or
 * subscription they affect at the top level, upper-case event names, Brasília local times without
 * an offset, and amounts in decimal reais without a currency field. Each webhook carries a static
 * access token instead of a signature.
 */
@Injectable(AppConfig)
export class GatewayBrazilWebhookProvider implements WebhookProvider {
  readonly name = "gatewayBrazil";

  private static readonly TOKEN_HEADER = "gateway-brazil-access-token";

  constructor(private readonly config: AppConfig) {}

  async authenticate({ headers }: WebhookProvider.Request): Promise<boolean> {
    // A missing token fails the request with a 5xx, so the gateway retries until it is configured.
    const { accessToken } = this.config.webhooks.gatewayBrazil;
    const token = headerValue(headers, GatewayBrazilWebhookProvider.TOKEN_HEADER);
    return token !== undefined && constantTimeEqual(token, accessToken);
  }

  parse({ rawBody }: WebhookProvider.Request): WebhookProvider.Event | undefined {
    const event = parseJson(rawBody);
    if (!isGatewayEvent(event)) {
      return undefined;
    }

    const occurredAt = fromBrasiliaTime(event.dateCreated);
    if (!occurredAt) {
      return undefined;
    }

    return {
      providerEventId: event.id,
      eventType: event.event,
      occurredAt,
      // A refund or chargeback arrives as an event about the payment it reverses.
      subject: event.payment
        ? { type: "payment", id: event.payment.id }
        : event.subscription && { type: "subscription", id: event.subscription.id },
    };
  }
}

export namespace GatewayBrazilWebhookProvider {
  /** The JSON body gatewayBrazil sends. */
  export type Event = {
    id: string;
    /** Such as `PAYMENT_RECEIVED` or `PAYMENT_REFUNDED`. */
    event: string;
    /** `YYYY-MM-DD HH:mm:ss` in Brasília time. */
    dateCreated: string;
    payment?: {
      object: "payment";
      id: string;
      subscription?: string;
      /** Decimal reais, such as `19.9`. */
      value: number;
      billingType: string;
      status: string;
    };
    subscription?: { object: "subscription"; id: string; value: number; cycle: string; status: string };
  };
}

// Brasília has stayed at UTC-3 all year since Brazil abolished daylight saving time in 2019.
function fromBrasiliaTime(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value.replace(" ", "T")}-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isGatewayEvent(value: unknown): value is GatewayBrazilWebhookProvider.Event {
  return (
    isObject(value) &&
    isFilledString(value.id) &&
    isFilledString(value.event) &&
    typeof value.dateCreated === "string" &&
    (value.payment === undefined || (isObject(value.payment) && isFilledString(value.payment.id))) &&
    (value.subscription === undefined || (isObject(value.subscription) && isFilledString(value.subscription.id)))
  );
}
