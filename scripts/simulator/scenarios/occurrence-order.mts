import type { Scenario } from '../engine/runner.types.mts';

export const occurrenceOrder: Scenario = {
  name: 'occurrence-order',
  description:
    "Of two statuses with the same precedence, the one that occurred later stays the latest: a payment's creation delivered after its failure is accepted as outdated.",
  run: ({ api, checks, clock, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const created = events.create('payment.created', { occurredAt: clock.minutesAgo(1) });
      const failed = events.create('payment.failed', { paymentId: created.paymentId });
      return [
        checks.reply('failure first', await api.deliver(gateway, failed), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        checks.reply('creation after it', await api.deliver(gateway, created), {
          status: 200,
          duplicate: false,
          outdated: true,
        }),
      ];
    }),
};
