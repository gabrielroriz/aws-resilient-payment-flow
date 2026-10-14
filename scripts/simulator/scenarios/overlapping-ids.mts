import type { Scenario } from '../engine/runner.types.mts';

export const overlappingIds: Scenario = {
  name: 'overlapping-ids',
  description: 'The same event ID from two gateways is stored as two independent events.',
  run: async ({ api, checks, events, forEachGateway }) => {
    const shared = events.create('payment.paid');
    return forEachGateway(async (gateway) => [
      checks.reply(`event ${shared.eventId}`, await api.deliver(gateway, shared), {
        status: 200,
        duplicate: false,
      }),
    ]);
  },
};
