import { ApiUnreachableError } from './api.mts';
import type { Scenario } from './runner.types.mts';
import type { Simulation } from './simulation.types.mts';

// Runs scenarios in turn, printing each check as ✓ or ✗, and returns how many failed. A scenario
// that throws counts as one failure, whether the API is unreachable or the scenario is broken.
export async function runScenarios(scenarios: Scenario[], simulation: Simulation): Promise<number> {
  // Gateway names are padded to the longest one, so every check's step starts in the same column.
  const column = Math.max(...simulation.gateways.map(({ name }) => name.length));
  let failed = 0;
  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}: ${scenario.description}`);
    try {
      for (const { gateway, step, passed, detail } of await scenario.run(simulation)) {
        console.log(`  ${passed ? '✓' : '✗'} ${gateway.padEnd(column)} ${step}: ${detail}`);
        failed += passed ? 0 : 1;
      }
    } catch (error) {
      failed += 1;
      if (error instanceof ApiUnreachableError) {
        console.error(`  ✗ ${error.message}. Is the API running?`);
      } else {
        // A defect in the scenario or the simulator, so its stack is printed to find it.
        console.error('  ✗ the scenario stopped with an error:', error);
      }
    }
  }
  return failed;
}
