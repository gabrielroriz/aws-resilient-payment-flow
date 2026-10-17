import type { SimulatedGateway } from '../gateways/gateways.types.mts';
import type {
  Delivery,
  DeliveryOptions,
  Outcome,
  WebhookApi,
  WebhookApiOptions,
} from './api.types.mts';

// Thrown for an unreachable API, so the runner can tell it from a broken scenario.
export class ApiUnreachableError extends Error {
  name = 'ApiUnreachableError';

  constructor(baseUrl: string, cause: unknown) {
    // A network failure reads "fetch failed"; its cause holds the real reason.
    const reason = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
    super(`could not reach ${baseUrl}: ${reason instanceof Error ? reason.message : reason}`, {
      cause,
    });
  }
}

// Sends webhooks to the API via the injected `fetch`, as the simulated gateways do.
export function createWebhookApi({ baseUrl, fetch }: WebhookApiOptions): WebhookApi {
  const url = baseUrl.replace(/\/$/, '');

  async function send(
    gateway: SimulatedGateway,
    body: string,
    delivery: Delivery,
    { credentials, timeoutMs }: DeliveryOptions = {},
  ): Promise<Outcome> {
    let status: number;
    let text: string;
    try {
      const response = await fetch(`${url}/webhooks/${gateway.name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...gateway.headers(body, credentials) },
        body,
        signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      // Scenarios check timeouts; any other failure means the API is unreachable.
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return { ...delivery, timedOut: true };
      }
      throw new ApiUnreachableError(url, error);
    }
    return { ...delivery, status, body: parseBody(text) };
  }

  return {
    deliver: (gateway, event, options) =>
      send(
        gateway,
        gateway.render(event),
        { gateway: gateway.name, eventId: event.eventId },
        options,
      ),
    deliverBody: (gateway, body, options) =>
      send(gateway, body, { gateway: gateway.name }, options),
  };
}

// Non-JSON bodies are kept as text, so the reply contract reports what was received.
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
