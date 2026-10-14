// Each is also the webhook path, so it must match the API's provider adapter name.
export type GatewayName = 'gatewayGlobal' | 'gatewayBrazil';

// A business fact to report, independent of any gateway's format.
export type SimulatedEvent = {
  eventId: string;
  kind:
    | 'payment.created'
    | 'payment.failed'
    | 'payment.paid'
    | 'payment.refunded'
    | 'payment.charged_back';
  paymentId: string;
  occurredAt: Date;
};

// How a delivery authenticates: as the gateway does, or the ways a forged request fails to.
export type Credentials = 'valid' | 'forged' | 'missing' | 'stale';

export type SimulatedGateway = {
  name: GatewayName;
  // The event in the gateway's own JSON format.
  render(event: SimulatedEvent): string;
  // Headers that authenticate a body the way the gateway does, or fail to in the given way.
  headers(body: string, credentials?: Credentials): Record<string, string>;
  // The invalid credentials this gateway's receiver must reject.
  forgeries: Exclude<Credentials, 'valid'>[];
};
