import { createHmac } from 'node:crypto';
import type { SimulatedEvent, SimulatedGateway } from './gateways.types.mts';

// gatewayGlobal's type for each event kind, with either the payment's status or the reversing
// object and its ID prefix.
const globalEvents: Record<
  SimulatedEvent['kind'],
  { type: string; status?: string; reversal?: { object: string; prefix: string } }
> = {
  'payment.created': { type: 'payment.created', status: 'pending' },
  'payment.failed': { type: 'payment.failed', status: 'failed' },
  'payment.paid': { type: 'payment.succeeded', status: 'succeeded' },
  'payment.refunded': { type: 'refund.created', reversal: { object: 'refund', prefix: 're' } },
  'payment.charged_back': {
    type: 'chargeback.opened',
    reversal: { object: 'chargeback', prefix: 'cb' },
  },
};

// Stripe-like: event envelope, Unix-second times, amounts in cents, timestamped HMAC signature.
export function createGatewayGlobal({
  signingSecret,
}: {
  signingSecret: string;
}): SimulatedGateway {
  return {
    name: 'gatewayGlobal',
    render({ eventId, kind, paymentId, subscriptionId, occurredAt }) {
      const { type, status, reversal } = globalEvents[kind];
      return JSON.stringify({
        id: eventId,
        object: 'event',
        type,
        created: Math.floor(occurredAt.getTime() / 1000),
        data: {
          // A reversal names its payment, and only the payment names its subscription.
          object: reversal
            ? {
                object: reversal.object,
                id: `${reversal.prefix}_${eventId}`,
                payment: paymentId,
                amount: 1990,
                currency: 'usd',
              }
            : {
                object: 'payment',
                id: paymentId,
                amount: 1990,
                currency: 'usd',
                status,
                subscription: subscriptionId,
              },
        },
      });
    },
    headers(body, credentials = 'valid'): Record<string, string> {
      if (credentials === 'missing') {
        return {};
      }
      // A stale signature is older than the five minutes the receiver tolerates.
      const signedAt = Math.floor(Date.now() / 1000) - (credentials === 'stale' ? 10 * 60 : 0);
      const secret = credentials === 'forged' ? 'forged-secret' : signingSecret;
      const signature = createHmac('sha256', secret).update(`${signedAt}.${body}`).digest('hex');
      return { 'gateway-global-signature': `t=${signedAt},v1=${signature}` };
    },
    forgeries: ['missing', 'forged', 'stale'],
  };
}
