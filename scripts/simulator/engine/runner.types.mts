import type { Check } from './checks.types.mts';
import type { Simulation } from './simulation.types.mts';

// A delivery pattern from the acceptance scenarios, run against the webhook API.
export type Scenario = {
  // How the command line selects the scenario.
  name: string;
  // What the API must do, as the scenario checks it.
  description: string;
  // Runs only when named, for scenarios that need a deployed API to be meaningful.
  optional?: boolean;
  run(simulation: Simulation): Promise<Check[]>;
};
