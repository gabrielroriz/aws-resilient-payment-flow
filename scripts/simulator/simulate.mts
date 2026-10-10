import { parseArgs } from 'node:util';
import { scenarios } from './scenarios.mts';

// Delivers webhooks the way the simulated gateways do and checks the API's responses. Runs every
// scenario unless some are named; exits with an error when any check fails.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: 'string', default: 'http://localhost:3000' } },
});
const baseUrl = values.url.replace(/\/$/, '');

const selected = positionals.length ? positionals : scenarios.map((scenario) => scenario.name);
const unknown = selected.filter((name) => !scenarios.some((scenario) => scenario.name === name));
if (unknown.length) {
  console.error(`Unknown scenario: ${unknown.join(', ')}. Available: ${scenarios.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const scenario of scenarios.filter((candidate) => selected.includes(candidate.name))) {
  console.log(`\n${scenario.name}: ${scenario.description}`);
  try {
    for (const { gateway, step, passed, detail } of await scenario.run(baseUrl)) {
      console.log(`  ${passed ? '✓' : '✗'} ${gateway.padEnd(13)} ${step}: ${detail}`);
      failed += passed ? 0 : 1;
    }
  } catch (error) {
    console.error(`  ✗ could not reach ${baseUrl}: ${(error as Error).message}. Is the API running?`);
    failed += 1;
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;
