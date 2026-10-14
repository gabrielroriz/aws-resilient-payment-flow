import type { SimulatedEvent, SimulatedGateway } from '../gateways/gateways.types.mts';
import type { Outcome } from './api.types.mts';

// One printed step of a scenario: whether it passed and what was observed.
export type Check = { gateway: string; step: string; passed: boolean; detail: string };

// The reply a delivery must get; fields left out are only checked against the contract.
export type Expected = { status: number; duplicate?: boolean; outdated?: boolean; code?: string };

// The checks scenarios build their steps from.
export type Checks = {
  // Checks one delivery's outcome against the reply it must get.
  reply(step: string, outcome: Outcome, expected: Expected): Check;
  // Delivers a payment's events in order, each for the first time, and checks each outdated flag.
  sequence(
    step: string,
    gateway: SimulatedGateway,
    events: SimulatedEvent[],
    outdated: boolean[],
  ): Promise<Check>;
  // Redelivers a payment's events and checks that only `expected` comes back not outdated, which
  // reveals the latest event without reading the API's storage.
  latest(
    step: string,
    gateway: SimulatedGateway,
    events: SimulatedEvent[],
    expected: SimulatedEvent,
  ): Promise<Check>;
};
