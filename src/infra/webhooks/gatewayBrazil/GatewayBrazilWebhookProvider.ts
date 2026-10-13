import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { constantTimeEqual } from "@kernel/utils/crypto";
import { headerValue } from "@kernel/utils/headers";
import { parseJson } from "@kernel/utils/json";
import * as z from "@kernel/utils/zod";

// Simulated Brazilian gateway, shaped like Asaas. Events are flat, with the payment or
// subscription they affect at the top level, upper-case event names, Brasília local times without
// an offset, and amounts in decimal reais without a currency field. Each webhook carries a static
// access token instead of a signature.
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
    const result = eventSchema.safeParse(parseJson(rawBody));
    if (!result.success) {
      return undefined;
    }

    const event = result.data;
    return {
      providerEventId: event.id,
      eventType: event.event,
      occurredAt: event.dateCreated,
      // A refund or chargeback arrives as an event about the payment it reverses.
      subject: event.payment
        ? { type: "payment", id: event.payment.id }
        : event.subscription && { type: "subscription", id: event.subscription.id },
    };
  }

  async process(event: WebhookEventRepository.Event): Promise<void> {
    // Routing is observable without logging payment payloads or claiming business effects occurred.
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

// A `YYYY-MM-DD HH:mm:ss` Brasília time, read as the moment it names. Brasília has stayed at UTC-3
// all year since Brazil abolished daylight saving time in 2019.
const brasiliaTime = z.pipe(
  z.pipe(
    z.string().check(z.regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)),
    z.transform((value: string) => new Date(`${value.replace(" ", "T")}-03:00`)),
  ),
  // Rejects times in the right format that do not exist, such as month 13.
  z.date(),
);

// The fields of a gatewayBrazil event that receipt reads; the body is stored exactly as received.
const eventSchema = z.object({
  id: z.string().check(z.minLength(1)),
  // Such as `PAYMENT_RECEIVED` or `PAYMENT_REFUNDED`.
  event: z.string().check(z.minLength(1)),
  dateCreated: brasiliaTime,
  payment: z.optional(z.object({ id: z.string().check(z.minLength(1)) })),
  subscription: z.optional(z.object({ id: z.string().check(z.minLength(1)) })),
});
