import type { Scenario } from '../engine/runner.types.mts';

export const outOfOrder: Scenario = {
  name: 'out-of-order',
  description:
    'A refund delivered before its payment is accepted, and so is the payment that follows it.',
  run: ({ api, checks, clock, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const payment = events.create('payment.paid', { occurredAt: clock.minutesAgo(1) });
      const refund = events.create('payment.refunded', { paymentId: payment.paymentId });
      return [
        checks.reply('refund first', await api.deliver(gateway, refund), {
          status: 200,
          duplicate: false,
        }),
        checks.reply('payment after it', await api.deliver(gateway, payment), {
          status: 200,
          duplicate: false,
        }),
      ];
    }),
};
