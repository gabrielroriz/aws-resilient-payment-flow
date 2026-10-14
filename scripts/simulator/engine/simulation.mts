import type { Simulation, SimulationParts } from './simulation.types.mts';

// Assembles the parts into the simulation that scenarios receive.
export function createSimulation(parts: SimulationParts): Simulation {
  return {
    ...parts,
    forEachGateway: async (steps) => (await Promise.all(parts.gateways.map(steps))).flat(),
  };
}
