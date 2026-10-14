import { expect, test, vi } from 'vitest';
import { ApiUnreachableError } from './api.mts';
import { runScenarios } from './runner.mts';
import type { Scenario } from './runner.types.mts';
import { testGateway, testSimulation } from './simulation.fixtures.mts';

const brazil = { ...testGateway, name: 'gatewayBrazil' as const };

function captureOutput() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return {
    lines: () => [...log.mock.calls, ...error.mock.calls].map((args) => args.map(String).join(' ')),
    error,
  };
}

test('runScenarios prints each check under its scenario, gives every scenario the simulation, and counts failures', async () => {
  const output = captureOutput();
  const simulation = testSimulation([testGateway, brazil]);
  const scenario: Scenario = {
    name: 'two-checks',
    description: 'One passes, one fails.',
    run: async (received) => {
      expect(received).toBe(simulation);
      return [
        { gateway: 'gatewayGlobal', step: 'first', passed: true, detail: 'fine' },
        { gateway: 'gatewayBrazil', step: 'second', passed: false, detail: 'wrong' },
      ];
    },
  };

  await expect(runScenarios([scenario], simulation)).resolves.toBe(1);
  expect(output.lines()).toEqual([
    '\ntwo-checks: One passes, one fails.',
    '  ✓ gatewayGlobal first: fine',
    '  ✗ gatewayBrazil second: wrong',
  ]);
});

test('runScenarios counts a scenario that cannot reach the API as one failure and says so', async () => {
  const output = captureOutput();
  const scenario: Scenario = {
    name: 'unreachable',
    description: 'Throws.',
    run: async () => {
      throw new ApiUnreachableError('http://api.test', new Error('refused'));
    },
  };

  await expect(runScenarios([scenario], testSimulation())).resolves.toBe(1);
  expect(output.lines()).toContain(
    '  ✗ could not reach http://api.test: refused. Is the API running?',
  );
});

test('runScenarios reports any other error as a defect, with the error itself, and moves on', async () => {
  const output = captureOutput();
  const defect = new TypeError('Cannot read properties of undefined');
  const broken: Scenario = {
    name: 'broken',
    description: 'Throws.',
    run: async () => {
      throw defect;
    },
  };
  const next: Scenario = { name: 'next', description: 'Runs.', run: async () => [] };

  await expect(runScenarios([broken, next], testSimulation())).resolves.toBe(1);
  expect(output.error).toHaveBeenCalledWith('  ✗ the scenario stopped with an error:', defect);
  expect(output.lines()).toContain('\nnext: Runs.');
});

test('runScenarios pads gateway names to the longest one, so every step starts in the same column', async () => {
  const output = captureOutput();
  const short = { ...testGateway, name: 'gw' as never };
  const scenario: Scenario = {
    name: 'aligned',
    description: 'Two gateways.',
    run: async () => [
      { gateway: 'gw', step: 'a', passed: true, detail: '' },
      { gateway: 'gatewayGlobal', step: 'b', passed: true, detail: '' },
    ],
  };

  await runScenarios([scenario], testSimulation([short, testGateway]));

  expect(output.lines().slice(1)).toEqual(['  ✓ gw            a: ', '  ✓ gatewayGlobal b: ']);
});
