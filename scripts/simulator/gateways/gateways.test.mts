import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { createGateways } from './gateways.mts';

const event = {
  eventId: 'evt_1',
  kind: 'payment.paid' as const,
  paymentId: 'pay_1',
  occurredAt: new Date('2026-10-10T10:00:00.000Z'),
};

test('createGateways uses the local secrets that npm run dev configures unless the variables are set', () => {
  const [global, brazil] = createGateways({ GATEWAY_BRAZIL_ACCESS_TOKEN: 'deployed-token' });
  const body = global.render(event);

  const [timestamp, signature] = global.headers(body)['gateway-global-signature'].split(',');
  const expected = createHmac('sha256', 'local-gateway-global-secret')
    .update(`${timestamp.slice(2)}.${body}`)
    .digest('hex');
  expect(signature).toBe(`v1=${expected}`);
  expect(brazil.headers(brazil.render(event))).toEqual({
    'gateway-brazil-access-token': 'deployed-token',
  });
});

test('gateways name the subscription a charge bills, gatewayGlobal on the payment only', () => {
  const [global, brazil] = createGateways({});
  const render = (gateway: typeof global, kind: 'payment.paid' | 'payment.refunded') =>
    JSON.parse(gateway.render({ ...event, kind, subscriptionId: 'sub_1' }));

  expect(render(global, 'payment.paid').data.object.subscription).toBe('sub_1');
  expect(render(global, 'payment.refunded').data.object.subscription).toBeUndefined();
  expect(render(brazil, 'payment.paid').payment.subscription).toBe('sub_1');
  expect(render(brazil, 'payment.refunded').payment.subscription).toBe('sub_1');
});

test('gateways authenticate with their credentials only when asked for valid ones', () => {
  const [global, brazil] = createGateways({});
  const body = global.render(event);
  const signedAt = (credentials: 'valid' | 'stale') =>
    Number(global.headers(body, credentials)['gateway-global-signature'].split(',')[0].slice(2));

  expect(signedAt('valid') - signedAt('stale')).toBe(10 * 60);
  expect(global.headers(body, 'missing')).toEqual({});
  expect(brazil.headers('{}', 'forged')).toEqual({ 'gateway-brazil-access-token': 'forged-token' });
});
