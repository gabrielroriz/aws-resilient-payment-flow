import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { gateways, type Credentials, type SimulatedEvent, type SimulatedGateway } from './gateways.mts';

/** One observed outcome, compared with what the scenario expects. */
export type Check = { gateway: string; step: string; passed: boolean; detail: string };

/** A delivery pattern from the acceptance scenarios, run against the webhook API. */
export type Scenario = {
  name: string;
  /** What the API must do, as the scenario checks it. */
  description: string;
  run(baseUrl: string): Promise<Check[]>;
};

type Outcome = { status: number; body: Record<string, any> } | { timedOut: true };
type Expected = { status: number; duplicate?: boolean; code?: string };

// The provider gives up waiting for an acknowledgment after this long, then retries after the delay.
const ACK_TIMEOUT_MS = 50;
const RETRY_DELAY_MS = 3000;

export const scenarios: Scenario[] = [
  {
    name: 'duplicate-delivery',
    description: 'The same event delivered three times is stored once, and every delivery is acknowledged.',
    run: (baseUrl) =>
      forEachGateway(async (gateway) => {
        const body = gateway.render(newEvent('payment.paid'));
        return [
          check(gateway, 'first delivery', await deliver(baseUrl, gateway, body), { status: 200, duplicate: false }),
          check(gateway, 'second delivery', await deliver(baseUrl, gateway, body), { status: 200, duplicate: true }),
          check(gateway, 'third delivery', await deliver(baseUrl, gateway, body), { status: 200, duplicate: true }),
        ];
      }),
  },
  {
    name: 'provider-retry',
    description: 'A delivery whose acknowledgment times out is retried without storing the event twice.',
    run: (baseUrl) =>
      forEachGateway(async (gateway) => {
        const body = gateway.render(newEvent('payment.paid'));
        await deliver(baseUrl, gateway, body, { timeoutMs: ACK_TIMEOUT_MS });
        await sleep(RETRY_DELAY_MS);
        return [
          // The retry is a duplicate when the unacknowledged delivery was stored, and new otherwise.
          check(gateway, 'retry after the timeout', await deliver(baseUrl, gateway, body), { status: 200 }),
          check(gateway, 'later retry', await deliver(baseUrl, gateway, body), { status: 200, duplicate: true }),
        ];
      }),
  },
  {
    name: 'overlapping-ids',
    description: 'The same event ID from two gateways is stored as two independent events.',
    run: async (baseUrl) => {
      const shared = newEvent('payment.paid');
      return forEachGateway(async (gateway) => [
        check(gateway, `event ${shared.eventId}`, await deliver(baseUrl, gateway, gateway.render(shared)), {
          status: 200,
          duplicate: false,
        }),
      ]);
    },
  },
  {
    name: 'out-of-order',
    description: 'A refund delivered before its payment is accepted, and so is the payment that follows it.',
    run: (baseUrl) =>
      forEachGateway(async (gateway) => {
        const payment = newEvent('payment.paid', { occurredAt: new Date(Date.now() - 60_000) });
        const refund = newEvent('payment.refunded', { paymentId: payment.paymentId });
        return [
          check(gateway, 'refund first', await deliver(baseUrl, gateway, gateway.render(refund)), { status: 200, duplicate: false }),
          check(gateway, 'payment after it', await deliver(baseUrl, gateway, gateway.render(payment)), { status: 200, duplicate: false }),
        ];
      }),
  },
  {
    name: 'forged-request',
    description: 'Webhooks that fail authentication are rejected and leave nothing stored.',
    run: (baseUrl) =>
      forEachGateway(async (gateway) => {
        const body = gateway.render(newEvent('payment.paid'));
        const checks: Check[] = [];
        for (const credentials of gateway.forgeries) {
          const outcome = await deliver(baseUrl, gateway, body, { credentials });
          checks.push(check(gateway, `${credentials} credentials`, outcome, { status: 401, code: 'WEBHOOK_AUTHENTICATION_FAILED' }));
        }
        // Had a rejected delivery been stored, this authentic one would be a duplicate.
        checks.push(check(gateway, 'authentic delivery after them', await deliver(baseUrl, gateway, body), { status: 200, duplicate: false }));
        return checks;
      }),
  },
  {
    name: 'malformed-event',
    description: "An authentic webhook that is not one of the gateway's events is rejected as malformed.",
    run: (baseUrl) =>
      forEachGateway(async (gateway) => [
        check(gateway, 'event without an ID', await deliver(baseUrl, gateway, '{"unexpected":true}'), {
          status: 400,
          code: 'MALFORMED_WEBHOOK_EVENT',
        }),
      ]),
  },
];

// Every run uses new IDs, so events stored by earlier runs never make a first delivery a duplicate.
const runId = randomUUID().slice(0, 8);
let sequence = 0;

function newEvent(kind: SimulatedEvent['kind'], overrides: Partial<SimulatedEvent> = {}): SimulatedEvent {
  sequence += 1;
  return { eventId: `evt_${runId}_${sequence}`, kind, paymentId: `pay_${runId}_${sequence}`, occurredAt: new Date(), ...overrides };
}

// Gateways run side by side, as real providers do; each one's steps stay in order.
async function forEachGateway(steps: (gateway: SimulatedGateway) => Promise<Check[]>): Promise<Check[]> {
  return (await Promise.all(gateways.map(steps))).flat();
}

async function deliver(
  baseUrl: string,
  gateway: SimulatedGateway,
  body: string,
  { credentials, timeoutMs }: { credentials?: Credentials; timeoutMs?: number } = {},
): Promise<Outcome> {
  try {
    const response = await fetch(`${baseUrl}/webhooks/${gateway.name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...gateway.headers(body, credentials) },
      body,
      signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : { text } };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { timedOut: true };
    }
    throw error;
  }
}

function check(gateway: SimulatedGateway, step: string, outcome: Outcome, expected: Expected): Check {
  const passed =
    !('timedOut' in outcome) &&
    outcome.status === expected.status &&
    (expected.duplicate === undefined || outcome.body.duplicate === expected.duplicate) &&
    (expected.code === undefined || outcome.body.error?.code === expected.code);
  const detail = passed ? describe(outcome) : `${describe(outcome)}; expected ${describe(expected)}`;
  return { gateway: gateway.name, step, passed, detail };
}

function describe(outcome: Outcome | Expected): string {
  if ('timedOut' in outcome) {
    return 'no response';
  }
  const duplicate = 'body' in outcome ? outcome.body.duplicate : outcome.duplicate;
  const code = 'body' in outcome ? outcome.body.error?.code : outcome.code;
  return [`HTTP ${outcome.status}`, duplicate !== undefined && `duplicate=${duplicate}`, code].filter(Boolean).join(' ');
}
