import { ApiUnreachableError } from './api.mts';
import type { Scenario } from './runner.types.mts';
import type { Simulation } from './simulation.types.mts';

// Runs each scenario, printing its checks as ✓ or ✗, and returns how many failed.
// A scenario that throws counts as one failure, from an unreachable API or a defect.
export async function runScenarios(scenarios: Scenario[], simulation: Simulation): Promise<number> {
  // Gateway names are padded to the longest, so steps start in the same column.
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
        // A scenario or simulator defect, so its stack is printed to find it.
        console.error('  ✗ the scenario stopped with an error:', error);
      }
    }
  }
  return failed;
}
