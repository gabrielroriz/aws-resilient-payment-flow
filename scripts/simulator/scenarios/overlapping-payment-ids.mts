import type { Scenario } from '../engine/runner.types.mts';

export const overlappingPaymentIds: Scenario = {
  name: 'overlapping-payment-ids',
  description:
    "A refund from one gateway does not outrank a payment with the same ID from the other, because each gateway's payments are ranked on their own.",
  run: ({ api, checks, clock, events, forEachGateway, gateways }) =>
    forEachGateway(async (gateway) => {
      // The refund comes from another gateway, so this scenario needs at least two.
      const other = gateways.find((candidate) => candidate !== gateway)!;
      const payment = events.create('payment.paid', { occurredAt: clock.minutesAgo(1) });
      const refund = events.create('payment.refunded', { paymentId: payment.paymentId });
      return [
        checks.reply(`refund of ${payment.paymentId}`, await api.deliver(other, refund), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        checks.reply(`payment ${payment.paymentId} after it`, await api.deliver(gateway, payment), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
      ];
    }),
};
