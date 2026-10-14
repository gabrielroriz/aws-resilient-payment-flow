import { expect, test } from 'vitest';
import { testGateway, testSimulation } from './simulation.fixtures.mts';

test('forEachGateway runs the steps for every gateway and keeps their checks in gateway order', async () => {
  const brazil = { ...testGateway, name: 'gatewayBrazil' as const };
  const simulation = testSimulation([testGateway, brazil]);

  const checks = await simulation.forEachGateway(async (gateway) => [
    { gateway: gateway.name, step: 'one', passed: true, detail: '' },
    { gateway: gateway.name, step: 'two', passed: true, detail: '' },
  ]);

  expect(checks.map(({ gateway, step }) => `${gateway} ${step}`)).toEqual([
    'gatewayGlobal one',
    'gatewayGlobal two',
    'gatewayBrazil one',
    'gatewayBrazil two',
  ]);
});
