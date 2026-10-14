import { expect, test } from 'vitest';
import { checkOf, createChecks } from './checks.mts';
import { acknowledgedOutcome, fakeApi, testEvent, testGateway } from './simulation.fixtures.mts';

const created = testEvent('payment.created', 'evt_created');
const paid = testEvent('payment.paid', 'evt_paid');
const refunded = testEvent('payment.refunded', 'evt_refunded');

test('reply passes with what was observed when the outcome matches the expected reply', () => {
  const checks = createChecks(fakeApi(acknowledgedOutcome));

  expect(
    checks.reply('first delivery', acknowledgedOutcome(paid), { status: 200, duplicate: false }),
  ).toEqual({
    gateway: 'gatewayGlobal',
    step: 'first delivery',
    passed: true,
    detail: 'HTTP 200 duplicate=false outdated=false',
  });
});

test('reply fails with what was observed followed by each problem', () => {
  const checks = createChecks(fakeApi(acknowledgedOutcome));

  expect(
    checks.reply('payment after it', acknowledgedOutcome(paid), { status: 200, outdated: true }),
  ).toMatchObject({
    passed: false,
    detail: 'HTTP 200 duplicate=false outdated=false; outdated: expected true, received false',
  });
});

test('sequence delivers the events in order and passes when each comes back new with its expected flag', async () => {
  const delivered: string[] = [];
  const checks = createChecks(
    fakeApi((event) => {
      delivered.push(event.eventId);
      return acknowledgedOutcome(event, { outdated: event === created });
    }),
  );

  const check = await checks.sequence('mixed arrival', testGateway, [paid, created], [false, true]);

  expect(delivered).toEqual(['evt_paid', 'evt_created']);
  expect(check).toEqual({
    gateway: 'gatewayGlobal',
    step: 'mixed arrival',
    passed: true,
    detail: 'outdated: paid=false created=true',
  });
});

test('sequence names the event behind each problem, and what came back when it was not acknowledged', async () => {
  const checks = createChecks(
    fakeApi((event) =>
      event === paid
        ? acknowledgedOutcome(event, { duplicate: true })
        : { gateway: 'gatewayGlobal', eventId: event.eventId, status: 500, body: {} },
    ),
  );

  const check = await checks.sequence('in order', testGateway, [paid, created], [false, false]);

  expect(check).toMatchObject({
    passed: false,
    detail:
      'outdated: paid=false created=HTTP 500; paid: duplicate: expected false, received true; created: status: expected 200, received 500',
  });
});

test('latest passes when only the expected event comes back not outdated on redelivery', async () => {
  const checks = createChecks(
    fakeApi((event) =>
      acknowledgedOutcome(event, { duplicate: true, outdated: event !== refunded }),
    ),
  );

  await expect(checks.latest('latest', testGateway, [paid, refunded], refunded)).resolves.toEqual({
    gateway: 'gatewayGlobal',
    step: 'latest',
    passed: true,
    detail: 'latest: refunded',
  });
});

test('latest fails when another event is the latest, and when a redelivery is not a duplicate', async () => {
  const checks = createChecks(
    fakeApi((event) =>
      acknowledgedOutcome(event, { duplicate: event === paid, outdated: event !== paid }),
    ),
  );

  await expect(
    checks.latest('latest', testGateway, [paid, refunded], refunded),
  ).resolves.toMatchObject({
    passed: false,
    detail:
      'latest: paid; refunded: duplicate: expected true, received false; expected only refunded as the latest',
  });
});

test('checkOf passes only without problems and prints them after what was observed', () => {
  expect(checkOf('gatewayBrazil', 'step', 'seen', [])).toEqual({
    gateway: 'gatewayBrazil',
    step: 'step',
    passed: true,
    detail: 'seen',
  });
  expect(checkOf('gatewayBrazil', 'step', 'seen', ['a', 'b'])).toMatchObject({
    passed: false,
    detail: 'seen; a; b',
  });
});
