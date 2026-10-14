import type { Scenario } from '../engine/runner.types.mts';

export const duplicateDelivery: Scenario = {
  name: 'duplicate-delivery',
  description:
    'The same event delivered three times is stored once, and every delivery is acknowledged.',
  run: ({ api, checks, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const event = events.create('payment.paid');
      return [
        checks.reply('first delivery', await api.deliver(gateway, event), {
          status: 200,
          duplicate: false,
        }),
        checks.reply('second delivery', await api.deliver(gateway, event), {
          status: 200,
          duplicate: true,
        }),
        checks.reply('third delivery', await api.deliver(gateway, event), {
          status: 200,
          duplicate: true,
        }),
      ];
    }),
};
