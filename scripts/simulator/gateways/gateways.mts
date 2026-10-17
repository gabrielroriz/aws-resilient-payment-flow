import { createGatewayBrazil } from './gateway-brazil.mts';
import { createGatewayGlobal } from './gateway-global.mts';
import type { SimulatedGateway } from './gateways.types.mts';

// The simulated gateways as senders, each with its own format and auth.
// They share no code with the receiving adapters, so a mismatch fails a scenario.
// Credentials come from the API's own variables.
// Defaults must match what npm run dev configures.
export function createGateways(env: Record<string, string | undefined>): SimulatedGateway[] {
  return [
    createGatewayGlobal({
      signingSecret: env.GATEWAY_GLOBAL_SIGNING_SECRET || 'local-gateway-global-secret',
    }),
    createGatewayBrazil({
      accessToken: env.GATEWAY_BRAZIL_ACCESS_TOKEN || 'local-gateway-brazil-token',
    }),
  ];
}
