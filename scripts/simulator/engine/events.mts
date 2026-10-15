import type { SimulatedEvent } from '../gateways/gateways.types.mts';
import type { EventFactory, EventFactoryOptions } from './events.types.mts';

// Creates events whose IDs combine the run ID with the order they were created in.
export function createEventFactory({ runId, clock }: EventFactoryOptions): EventFactory {
  let sequence = 0;

  const create: EventFactory['create'] = (kind, overrides = {}) => {
    sequence += 1;
    return {
      eventId: `evt_${runId}_${sequence}`,
      kind,
      paymentId: `pay_${runId}_${sequence}`,
      occurredAt: clock.now(),
      ...overrides,
    };
  };

  return {
    create,
    lifecycle() {
      const created = create('payment.created', { occurredAt: clock.minutesAgo(5) });
      const later = [
        'payment.failed',
        'payment.paid',
        'payment.refunded',
        'payment.charged_back',
      ] as const;
      return [
        created,
        ...later.map((kind, index) =>
          create(kind, { paymentId: created.paymentId, occurredAt: clock.minutesAgo(4 - index) }),
        ),
      ];
    },
    renewal() {
      // Numbered like events, so it is unique to the run too.
      sequence += 1;
      const subscriptionId = `sub_${runId}_${sequence}`;
      const charge = (minutesAgo: number) => {
        const created = create('payment.created', {
          subscriptionId,
          occurredAt: clock.minutesAgo(minutesAgo),
        });
        const paid = create('payment.paid', {
          paymentId: created.paymentId,
          subscriptionId,
          occurredAt: clock.minutesAgo(minutesAgo - 1),
        });
        return [created, paid];
      };
      return [...charge(4), ...charge(2)];
    },
  };
}

// A short name for an event's kind in check details, such as `refunded`.
export function label(event: SimulatedEvent): string {
  return event.kind.replace(/^payment\./, '');
}
