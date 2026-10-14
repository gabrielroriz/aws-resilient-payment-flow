import { setTimeout as sleep } from 'node:timers/promises';
import type { Scenario } from '../engine/runner.types.mts';

// A provider stops waiting for an acknowledgment after the timeout, then retries after the delay.
const ACK_TIMEOUT_MS = 50;
const RETRY_DELAY_MS = 3000;

export const providerRetry: Scenario = {
  name: 'provider-retry',
  description:
    'A delivery whose acknowledgment times out is retried without storing the event twice.',
  run: ({ api, checks, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const event = events.create('payment.paid');
      await api.deliver(gateway, event, { timeoutMs: ACK_TIMEOUT_MS });
      await sleep(RETRY_DELAY_MS);
      return [
        // The retry is a duplicate when the unacknowledged delivery was stored, and new otherwise.
        checks.reply('retry after the timeout', await api.deliver(gateway, event), {
          status: 200,
        }),
        checks.reply('later retry', await api.deliver(gateway, event), {
          status: 200,
          duplicate: true,
        }),
      ];
    }),
};
