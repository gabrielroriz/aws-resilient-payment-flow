import type { Scenario } from '../engine/runner.types.mts';

export const precedenceOverTime: Scenario = {
  name: 'precedence-over-time',
  description:
    'A failure reported after its payment succeeded is accepted as outdated even though it occurred later, because no failure undoes a successful payment.',
  run: ({ api, checks, clock, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const paid = events.create('payment.paid', { occurredAt: clock.minutesAgo(1) });
      const failed = events.create('payment.failed', { paymentId: paid.paymentId });
      return [
        checks.reply('payment first', await api.deliver(gateway, paid), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        checks.reply('later failure after it', await api.deliver(gateway, failed), {
          status: 200,
          duplicate: false,
          outdated: true,
        }),
      ];
    }),
};
