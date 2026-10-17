import type {
  Credentials,
  GatewayName,
  SimulatedEvent,
  SimulatedGateway,
} from '../gateways/gateways.types.mts';

// The gateway a delivery came from, and the ID of the event it carried, if any.
export type Delivery = { gateway: GatewayName; eventId?: string };

// The API's reply, its body parsed if JSON, or none before the timeout.
export type Outcome = Delivery & ({ status: number; body: unknown } | { timedOut: true });

export type DeliveryOptions = {
  // The gateway's valid credentials when left out.
  credentials?: Credentials;
  // How long the gateway waits for a reply; no limit when left out.
  timeoutMs?: number;
};

// The webhook API as the simulated gateways reach it.
export type WebhookApi = {
  // Sends one of the gateway's events in its format, with its authentication.
  deliver(
    gateway: SimulatedGateway,
    event: SimulatedEvent,
    options?: DeliveryOptions,
  ): Promise<Outcome>;
  // Sends an arbitrary body instead of an event, authenticated as the gateway.
  deliverBody(gateway: SimulatedGateway, body: string, options?: DeliveryOptions): Promise<Outcome>;
};

export type WebhookApiOptions = {
  // Such as `http://localhost:3000`.
  baseUrl: string;
  fetch: typeof fetch;
};
