import type { SimulatedEvent, SimulatedGateway } from '../gateways/gateways.types.mts';
import type { Outcome, WebhookApi } from './api.types.mts';
import { createChecks } from './checks.mts';
import { createClock } from './clock.mts';
import { createEventFactory } from './events.mts';
import { createSimulation } from './simulation.mts';
import type { Simulation } from './simulation.types.mts';

// A fixed time, so events and clock readings are deterministic.
export const NOW = new Date('2026-10-10T10:00:00.000Z');
export const fixedClock = createClock(() => NOW);

// Sends an event as its ID alone and names the credentials in a header, so tests see what was sent.
export const testGateway: SimulatedGateway = {
  name: 'gatewayGlobal',
  render: (event) => JSON.stringify({ id: event.eventId }),
  headers: (_body, credentials = 'valid') => ({ 'x-credentials': credentials }),
  forgeries: ['forged'],
};

export function testEvent(
  kind: SimulatedEvent['kind'] = 'payment.paid',
  eventId = 'evt_1',
): SimulatedEvent {
  return { eventId, kind, paymentId: 'pay_1', occurredAt: NOW };
}

// The outcome of an acknowledged delivery of `event`, as the API's contract shapes it.
export function acknowledgedOutcome(
  event: SimulatedEvent,
  { duplicate = false, outdated = false } = {},
): Outcome {
  return {
    gateway: testGateway.name,
    eventId: event.eventId,
    status: 200,
    body: { provider: testGateway.name, providerEventId: event.eventId, duplicate, outdated },
  };
}

// An API that answers each delivered event with the outcome `answer` gives for it.
export function fakeApi(answer: (event: SimulatedEvent) => Outcome): WebhookApi {
  return {
    deliver: async (_gateway, event) => answer(event),
    deliverBody: async () => {
      throw new Error('Only events are delivered in these tests');
    },
  };
}

// A simulation wired with the fixed clock, the given gateways, and an API answering with `answer`.
export function testSimulation(
  gateways: SimulatedGateway[] = [testGateway],
  answer: (event: SimulatedEvent) => Outcome = (event) => acknowledgedOutcome(event),
): Simulation {
  const api = fakeApi(answer);
  return createSimulation({
    gateways,
    clock: fixedClock,
    events: createEventFactory({ runId: 'run1', clock: fixedClock }),
    api,
    checks: createChecks(api),
  });
}
