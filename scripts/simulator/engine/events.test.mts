import { expect, test } from 'vitest';
import { createClock } from './clock.mts';
import { createEventFactory, label } from './events.mts';
import { NOW, fixedClock } from './simulation.fixtures.mts';

test('create numbers events within the run, occurring now unless overridden', () => {
  const events = createEventFactory({ runId: 'run1', clock: fixedClock });

  expect(events.create('payment.paid')).toEqual({
    eventId: 'evt_run1_1',
    kind: 'payment.paid',
    paymentId: 'pay_run1_1',
    occurredAt: NOW,
  });
  expect(events.create('payment.refunded', { paymentId: 'pay_run1_1' })).toMatchObject({
    eventId: 'evt_run1_2',
    paymentId: 'pay_run1_1',
  });
});

test('lifecycle is one payment created, failed, paid, refunded, and charged back, a minute apart until a minute ago', () => {
  const events = createEventFactory({ runId: 'run1', clock: fixedClock });

  const lifecycle = events.lifecycle();

  expect(lifecycle.map(label)).toEqual(['created', 'failed', 'paid', 'refunded', 'charged_back']);
  expect(new Set(lifecycle.map((event) => event.paymentId))).toEqual(new Set(['pay_run1_1']));
  expect(lifecycle.map((event) => event.occurredAt.toISOString())).toEqual([
    '2026-10-10T09:55:00.000Z',
    '2026-10-10T09:56:00.000Z',
    '2026-10-10T09:57:00.000Z',
    '2026-10-10T09:58:00.000Z',
    '2026-10-10T09:59:00.000Z',
  ]);
});

test('a clock reads the time from its source each time', () => {
  let now = NOW;
  const clock = createClock(() => now);

  now = new Date('2026-10-10T12:00:00.000Z');

  expect(clock.now()).toEqual(now);
  expect(clock.minutesAgo(90)).toEqual(new Date('2026-10-10T10:30:00.000Z'));
});
