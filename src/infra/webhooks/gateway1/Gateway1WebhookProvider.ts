import { WebhookProvider } from "@application/ports/webhooks/WebhookProvider";
import { Injectable } from "@kernel/decorators/injectable";

/**
 * A minimal test gateway for exercising webhook receipt end to end, such as locally against
 * DynamoDB Local. Its events are plain JSON and carry no signature, so it accepts every request:
 * anyone who can reach the API can store events through it.
 */
@Injectable()
export class Gateway1WebhookProvider implements WebhookProvider {
  readonly name = "gateway1";

  // The gateway signs nothing and has no credentials, so there is nothing to check.
  async authenticate(): Promise<boolean> {
    return true;
  }

  parse({ rawBody }: WebhookProvider.Request): WebhookProvider.Event | undefined {
    const event = parseJson(rawBody);
    if (!isGatewayEvent(event)) {
      return undefined;
    }

    const occurredAt = new Date(event.occurred_at);
    if (Number.isNaN(occurredAt.getTime())) {
      return undefined;
    }

    return {
      providerEventId: event.id,
      eventType: event.type,
      occurredAt,
      subject: event.subject && { type: event.subject.type, id: event.subject.id },
    };
  }
}

export namespace Gateway1WebhookProvider {
  /** The JSON body gateway1 sends. */
  export type Event = {
    id: string;
    type: string;
    /** ISO 8601 timestamp of when the event happened. */
    occurred_at: string;
    /** The payment or subscription the event affects, if any. */
    subject?: { type: string; id: string };
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isGatewayEvent(value: unknown): value is Gateway1WebhookProvider.Event {
  if (!isObject(value) || !isFilled(value.id) || !isFilled(value.type) || typeof value.occurred_at !== "string") {
    return false;
  }
  return value.subject === undefined || (isObject(value.subject) && isFilled(value.subject.type) && isFilled(value.subject.id));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
