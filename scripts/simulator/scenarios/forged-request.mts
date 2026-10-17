import type { Check } from '../engine/checks.types.mts';
import type { Scenario } from '../engine/runner.types.mts';

export const forgedRequest: Scenario = {
  name: 'forged-request',
  description: 'Webhooks that fail authentication are rejected and leave nothing stored.',
  run: ({ api, checks, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const event = events.create('payment.paid');
      const results: Check[] = [];
      for (const credentials of gateway.forgeries) {
        const outcome = await api.deliver(gateway, event, { credentials });
        results.push(
          checks.reply(`${credentials} credentials`, outcome, {
            status: 401,
            code: 'WEBHOOK_AUTHENTICATION_FAILED',
          }),
        );
      }
      // If a rejected delivery was stored, this authentic one would be a duplicate.
      results.push(
        checks.reply('authentic delivery after them', await api.deliver(gateway, event), {
          status: 200,
          duplicate: false,
        }),
      );
      return results;
    }),
};
