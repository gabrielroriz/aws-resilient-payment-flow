import type { Scenario } from '../engine/runner.types.mts';

export const outOfOrder: Scenario = {
  name: 'out-of-order',
  description:
    'A refund delivered before its payment stays the latest event, so the payment that follows it is accepted as outdated.',
  run: ({ api, checks, clock, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const payment = events.create('payment.paid', { occurredAt: clock.minutesAgo(1) });
      const refund = events.create('payment.refunded', { paymentId: payment.paymentId });
      return [
        checks.reply('refund first', await api.deliver(gateway, refund), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        checks.reply('payment after it', await api.deliver(gateway, payment), {
          status: 200,
          duplicate: false,
          outdated: true,
        }),
        // Delivered again, each event stays latest or outdated as before.
        checks.reply('refund again', await api.deliver(gateway, refund), {
          status: 200,
          duplicate: true,
          outdated: false,
        }),
        checks.reply('payment again', await api.deliver(gateway, payment), {
          status: 200,
          duplicate: true,
          outdated: true,
        }),
      ];
    }),
};
