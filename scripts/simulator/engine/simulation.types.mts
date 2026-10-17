import type { SimulatedGateway } from '../gateways/gateways.types.mts';
import type { WebhookApi } from './api.types.mts';
import type { Check, Checks } from './checks.types.mts';
import type { Clock } from './clock.types.mts';
import type { EventFactory } from './events.types.mts';

// What every scenario receives, built once by the composition root.
// Scenarios reach the clock, the network, and the environment only through it.
export type Simulation = {
  // The gateways every scenario runs for.
  gateways: SimulatedGateway[];
  clock: Clock;
  events: EventFactory;
  api: WebhookApi;
  checks: Checks;
  // Runs gateways in parallel, as providers do, and each gateway's steps in order.
  forEachGateway(steps: (gateway: SimulatedGateway) => Promise<Check[]>): Promise<Check[]>;
};

// The parts the composition root builds.
export type SimulationParts = Omit<Simulation, 'forEachGateway'>;
