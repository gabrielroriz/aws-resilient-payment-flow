import type { SimulatedEvent } from '../gateways/gateways.types.mts';
import type { Clock } from './clock.types.mts';

export type EventFactoryOptions = {
  // Fresh per run, so earlier runs' events never make a delivery a duplicate or outrank it.
  runId: string;
  // When events occur unless a scenario says otherwise.
  clock: Clock;
};

export type EventFactory = {
  // An event about a new payment that occurs now, unless the overrides say otherwise.
  create(kind: SimulatedEvent['kind'], overrides?: Partial<SimulatedEvent>): SimulatedEvent;
  // A payment's whole life, a minute apart: created, failed, paid, refunded, and charged back.
  // The chargeback outranks the rest, so it must end as the latest in any arrival order.
  lifecycle(): SimulatedEvent[];
  // A subscription's first two charges, a minute apart: each a payment of its own, created and then
  // paid, so the second charge starts pending after the first succeeded.
  renewal(): SimulatedEvent[];
};
