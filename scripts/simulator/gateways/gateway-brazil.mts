import type { SimulatedEvent, SimulatedGateway } from './gateways.types.mts';

// gatewayBrazil's name for each kind of event, and the status of the payment it is about.
const brazilEvents: Record<SimulatedEvent['kind'], { event: string; status: string }> = {
  'payment.created': { event: 'PAYMENT_CREATED', status: 'PENDING' },
  'payment.failed': { event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', status: 'PENDING' },
  'payment.paid': { event: 'PAYMENT_RECEIVED', status: 'RECEIVED' },
  'payment.refunded': { event: 'PAYMENT_REFUNDED', status: 'REFUNDED' },
  'payment.charged_back': { event: 'PAYMENT_CHARGEBACK_REQUESTED', status: 'CHARGEBACK_REQUESTED' },
};

// Asaas-like: flat event, upper-case names, Brasília local time, decimal reais, static token.
export function createGatewayBrazil({ accessToken }: { accessToken: string }): SimulatedGateway {
  return {
    name: 'gatewayBrazil',
    render({ eventId, kind, paymentId, subscriptionId, occurredAt }) {
      const { event, status } = brazilEvents[kind];
      return JSON.stringify({
        id: eventId,
        event,
        // Brasília is UTC-3 all year, written without an offset.
        dateCreated: new Date(occurredAt.getTime() - 3 * 3600_000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' '),
        // Card is the one method that can be both refused and charged back, so every event uses it.
        payment: {
          object: 'payment',
          id: paymentId,
          value: 19.9,
          billingType: 'CREDIT_CARD',
          status,
          // Every event about a subscription's charge names it, refunds included.
          subscription: subscriptionId,
        },
      });
    },
    headers(_body, credentials = 'valid'): Record<string, string> {
      if (credentials === 'missing') {
        return {};
      }
      return {
        'gateway-brazil-access-token': credentials === 'forged' ? 'forged-token' : accessToken,
      };
    },
    // A static token has no timestamp, so it cannot be stale.
    forgeries: ['missing', 'forged'],
  };
}
