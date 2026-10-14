import { expect, test } from 'vitest';
import type { Outcome } from './api.types.mts';
import { acknowledged, describeOutcome, problemsWith } from './replies.mts';

const reply = {
  provider: 'gatewayGlobal',
  providerEventId: 'evt_1',
  duplicate: false,
  outdated: false,
};

// The outcome of delivering event `evt_1` from gatewayGlobal.
function outcome(status: number, body: unknown): Outcome {
  return { gateway: 'gatewayGlobal', eventId: 'evt_1', status, body };
}

test('a reply that matches the contract and the expected values has no problems, even with fields the contract does not name', () => {
  expect(
    problemsWith(outcome(200, { ...reply, extra: 1 }), {
      status: 200,
      duplicate: false,
      outdated: false,
    }),
  ).toEqual([]);
});

test.each([
  [
    'a wrong value',
    { ...reply, outdated: true },
    { outdated: false },
    'outdated: expected false, received true',
  ],
  [
    'an expected value of the wrong type',
    { ...reply, outdated: 'false' },
    { outdated: false },
    'outdated: expected false, received "false"',
  ],
  [
    'a contract field of the wrong type',
    { ...reply, outdated: 'false' },
    {},
    'outdated: expected boolean, received "false"',
  ],
  [
    'a missing contract field',
    { ...reply, outdated: undefined },
    {},
    'outdated: expected boolean, received nothing',
  ],
  [
    'another event',
    { ...reply, providerEventId: 'evt_2' },
    {},
    'providerEventId: expected "evt_1", received "evt_2"',
  ],
  [
    'another gateway',
    { ...reply, provider: 'gatewayBrazil' },
    {},
    'provider: expected "gatewayGlobal", received "gatewayBrazil"',
  ],
  [
    'a body that is not JSON',
    '<html>bad gateway</html>',
    {},
    'body: expected object, received "<html>bad gateway</html>"',
  ],
])('problemsWith reports %s in an acknowledged reply', (_case, body, expected, problem) => {
  expect(problemsWith(outcome(200, body), { status: 200, ...expected })).toEqual([problem]);
});

test('problemsWith reports only the status when it is wrong, since the whole body is then wrong too', () => {
  const rejected = {
    success: false,
    error: { code: 'WEBHOOK_AUTHENTICATION_FAILED', message: 'No' },
  };

  expect(problemsWith(outcome(401, rejected), { status: 200, duplicate: false })).toEqual([
    'status: expected 200, received 401',
  ]);
  expect(problemsWith({ gateway: 'gatewayGlobal', timedOut: true }, { status: 200 })).toEqual([
    'status: expected 200, received no reply',
  ]);
});

test('problemsWith checks a rejection against its contract and the expected error code', () => {
  const rejected = (code: string) => ({ success: false, error: { code, message: 'Rejected' } });

  expect(
    problemsWith(outcome(400, rejected('WEBHOOK_MALFORMED_EVENT')), {
      status: 400,
      code: 'WEBHOOK_MALFORMED_EVENT',
    }),
  ).toEqual([]);
  expect(
    problemsWith(outcome(400, rejected('HTTP_BAD_REQUEST')), {
      status: 400,
      code: 'WEBHOOK_MALFORMED_EVENT',
    }),
  ).toEqual(['error.code: expected "WEBHOOK_MALFORMED_EVENT", received "HTTP_BAD_REQUEST"']);
  expect(
    problemsWith(outcome(400, { success: false, error: { code: 'X' } }), { status: 400 }),
  ).toEqual(['error.message: expected string, received nothing']);
});

test('describeOutcome summarizes a reply, quoting values that are not booleans', () => {
  expect(describeOutcome(outcome(200, { ...reply, outdated: true }))).toBe(
    'HTTP 200 duplicate=false outdated=true',
  );
  expect(describeOutcome(outcome(200, { ...reply, outdated: 'false' }))).toBe(
    'HTTP 200 duplicate=false outdated="false"',
  );
  expect(
    describeOutcome(
      outcome(401, { success: false, error: { code: 'WEBHOOK_AUTHENTICATION_FAILED' } }),
    ),
  ).toBe('HTTP 401 WEBHOOK_AUTHENTICATION_FAILED');
  expect(describeOutcome({ gateway: 'gatewayGlobal', timedOut: true })).toBe('no reply');
});

test('problemsWith cuts a long received value short', () => {
  const [problem] = problemsWith(outcome(200, 'x'.repeat(200)), { status: 200 });

  expect(problem).toBe(`body: expected object, received "${'x'.repeat(56)}...`);
});

test('acknowledged returns the body of an acknowledged reply that matches the contract, and nothing otherwise', () => {
  expect(acknowledged(outcome(200, reply))).toEqual(reply);
  expect(acknowledged(outcome(200, { ...reply, outdated: 'false' }))).toBeUndefined();
  expect(acknowledged(outcome(500, reply))).toBeUndefined();
  expect(acknowledged({ gateway: 'gatewayGlobal', timedOut: true })).toBeUndefined();
});
