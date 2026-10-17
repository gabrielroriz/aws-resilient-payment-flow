import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createWebhookApi } from './engine/api.mts';
import { createChecks } from './engine/checks.mts';
import { createClock } from './engine/clock.mts';
import { createEventFactory } from './engine/events.mts';
import { runScenarios } from './engine/runner.mts';
import { createSimulation } from './engine/simulation.mts';
import { createGateways } from './gateways/gateways.mts';
import { scenarios } from './scenarios/scenarios.mts';

// Delivers webhooks as the simulated gateways do and checks the API's replies.
// Runs the named scenarios, or every non-optional one, and exits with an error when any check
// fails.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: 'string', default: 'http://localhost:3000' } },
});

const selected = positionals.length
  ? positionals
  : scenarios.filter((scenario) => !scenario.optional).map((scenario) => scenario.name);
const unknown = selected.filter((name) => !scenarios.some((scenario) => scenario.name === name));
if (unknown.length) {
  console.error(
    `Unknown scenario: ${unknown.join(', ')}. Available: ${scenarios.map((s) => s.name).join(', ')}`,
  );
  process.exit(1);
}

// The composition root: the only place that reads the environment, the system clock, and the
// network. Everything else receives them through the simulation.
const clock = createClock(() => new Date());
const api = createWebhookApi({ baseUrl: values.url, fetch });
const simulation = createSimulation({
  gateways: createGateways(process.env),
  clock,
  events: createEventFactory({ runId: randomUUID().slice(0, 8), clock }),
  api,
  checks: createChecks(api),
});

const failed = await runScenarios(
  scenarios.filter((scenario) => selected.includes(scenario.name)),
  simulation,
);
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;
