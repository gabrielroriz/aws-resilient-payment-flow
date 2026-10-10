import { createHmac } from 'node:crypto';

/**
 * The simulated gateways as senders: each writes the same business facts in its own format and
 * authenticates them its own way. This is written independently of the receiving adapters, so a
 * mismatch between the two shows up as a failed scenario instead of being shared by both sides.
 */

export type GatewayName = 'gatewayGlobal' | 'gatewayBrazil';

/** A business fact to report, independent of any gateway's format. */
export type SimulatedEvent = {
  eventId: string;
  kind: 'payment.paid' | 'payment.refunded';
  paymentId: string;
  occurredAt: Date;
};

/** How a delivery authenticates: as the gateway does, or the ways a forged request fails to. */
export type Credentials = 'valid' | 'forged' | 'missing' | 'stale';

export type SimulatedGateway = {
  name: GatewayName;
  /** The event in the gateway's own JSON format. */
  render(event: SimulatedEvent): string;
  /** Headers that authenticate a body the way the gateway does, or fail to in the given way. */
  headers(body: string, credentials?: Credentials): Record<string, string>;
  /** The invalid credentials this gateway's receiver must reject. */
  forgeries: Exclude<Credentials, 'valid'>[];
};

// The defaults must match the local secrets npm run dev configures; set these variables to target a deployed API.
const GLOBAL_SECRET = process.env.GATEWAY_GLOBAL_SIGNING_SECRET || 'local-gateway-global-secret';
const BRAZIL_TOKEN = process.env.GATEWAY_BRAZIL_ACCESS_TOKEN || 'local-gateway-brazil-token';

/** Stripe-like: an event envelope, Unix-second times, integer cents, and a timestamped HMAC signature. */
const gatewayGlobal: SimulatedGateway = {
  name: 'gatewayGlobal',
  render({ eventId, kind, paymentId, occurredAt }) {
    const paid = kind === 'payment.paid';
    return JSON.stringify({
      id: eventId,
      object: 'event',
      type: paid ? 'payment.succeeded' : 'refund.created',
      created: Math.floor(occurredAt.getTime() / 1000),
      data: {
        object: paid
          ? { object: 'payment', id: paymentId, amount: 1990, currency: 'usd', status: 'succeeded' }
          : { object: 'refund', id: `re_${eventId}`, payment: paymentId, amount: 1990, currency: 'usd' },
      },
    });
  },
  headers(body, credentials = 'valid'): Record<string, string> {
    if (credentials === 'missing') {
      return {};
    }
    // A stale signature is older than the five minutes the receiver tolerates.
    const signedAt = Math.floor(Date.now() / 1000) - (credentials === 'stale' ? 10 * 60 : 0);
    const secret = credentials === 'forged' ? 'forged-secret' : GLOBAL_SECRET;
    const signature = createHmac('sha256', secret).update(`${signedAt}.${body}`).digest('hex');
    return { 'gateway-global-signature': `t=${signedAt},v1=${signature}` };
  },
  forgeries: ['missing', 'forged', 'stale'],
};

/** Asaas-like: a flat event, upper-case names, Brasília local time, decimal reais, and an access token. */
const gatewayBrazil: SimulatedGateway = {
  name: 'gatewayBrazil',
  render({ eventId, kind, paymentId, occurredAt }) {
    const paid = kind === 'payment.paid';
    return JSON.stringify({
      id: eventId,
      event: paid ? 'PAYMENT_RECEIVED' : 'PAYMENT_REFUNDED',
      // Brasília is UTC-3 all year, written without an offset.
      dateCreated: new Date(occurredAt.getTime() - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
      payment: { object: 'payment', id: paymentId, value: 19.9, billingType: 'PIX', status: paid ? 'RECEIVED' : 'REFUNDED' },
    });
  },
  headers(_body, credentials = 'valid'): Record<string, string> {
    if (credentials === 'missing') {
      return {};
    }
    return { 'gateway-brazil-access-token': credentials === 'forged' ? 'forged-token' : BRAZIL_TOKEN };
  },
  // A static token has no timestamp, so it cannot be stale.
  forgeries: ['missing', 'forged'],
};

export const gateways: SimulatedGateway[] = [gatewayGlobal, gatewayBrazil];
