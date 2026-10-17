import type { SimulatedEvent } from '../gateways/gateways.types.mts';
import type { Clock } from './clock.types.mts';

export type EventFactoryOptions = {
  // Fresh per run, so no earlier run's event duplicates or outranks a delivery.
  runId: string;
  // When events occur unless a scenario says otherwise.
  clock: Clock;
};

export type EventFactory = {
  // An event about a new payment occurring now, unless the overrides say otherwise.
  create(kind: SimulatedEvent['kind'], overrides?: Partial<SimulatedEvent>): SimulatedEvent;
  // A payment created, failed, paid, refunded, and charged back, a minute apart.
  // The chargeback outranks the rest, so it must end up latest in any arrival order.
  lifecycle(): SimulatedEvent[];
  // A subscription's first two charges, a minute apart, each a payment of its own.
  // Each is created then paid: the second starts pending after the first succeeded.
  renewal(): SimulatedEvent[];
};
