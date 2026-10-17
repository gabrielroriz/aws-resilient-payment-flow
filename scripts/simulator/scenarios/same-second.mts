import type { EventFactory } from '../engine/events.types.mts';
import type { Scenario } from '../engine/runner.types.mts';
import type { SimulatedEvent } from '../gateways/gateways.types.mts';

export const sameSecond: Scenario = {
  name: 'same-second',
  description:
    'A payment and its refund that occurred in the same second, which both gateways can report, end with the refund as the latest event in either order of arrival.',
  run: ({ api, checks, clock, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      // Both gateways report whole seconds.
      const second = new Date(Math.floor(clock.now().getTime() / 1000) * 1000);
      const refundFirst = sameSecondPair(events, second);
      const paymentFirst = sameSecondPair(events, second);
      return [
        checks.reply('refund first', await api.deliver(gateway, refundFirst.refund), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        checks.reply('payment after it', await api.deliver(gateway, refundFirst.payment), {
          status: 200,
          duplicate: false,
          outdated: true,
        }),
        checks.reply('payment first', await api.deliver(gateway, paymentFirst.payment), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        checks.reply('refund after it', await api.deliver(gateway, paymentFirst.refund), {
          status: 200,
          duplicate: false,
          outdated: false,
        }),
        await checks.latest(
          'latest after the payment first',
          gateway,
          [paymentFirst.payment, paymentFirst.refund],
          paymentFirst.refund,
        ),
      ];
    }),
};

// A payment and its refund in the same second.
// The payment's ID sorts after the refund's, so only precedence can rank the refund higher.
function sameSecondPair(
  events: EventFactory,
  occurredAt: Date,
): { payment: SimulatedEvent; refund: SimulatedEvent } {
  const refund = events.create('payment.refunded', { occurredAt });
  const payment = events.create('payment.paid', {
    eventId: `${refund.eventId}-payment`,
    paymentId: refund.paymentId,
    occurredAt,
  });
  return { payment, refund };
}
