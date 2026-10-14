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
  };
}

// A short name for an event's kind in check details, such as `refunded`.
export function label(event: SimulatedEvent): string {
  return event.kind.replace(/^payment\./, '');
}
