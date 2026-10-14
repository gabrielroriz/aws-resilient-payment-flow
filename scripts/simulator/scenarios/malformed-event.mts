import type { Scenario } from '../engine/runner.types.mts';

export const malformedEvent: Scenario = {
  name: 'malformed-event',
  description:
    "An authentic webhook that is not one of the gateway's events is rejected as malformed.",
  run: ({ api, checks, forEachGateway }) =>
    forEachGateway(async (gateway) => [
      checks.reply('event without an ID', await api.deliverBody(gateway, '{"unexpected":true}'), {
        status: 400,
        code: 'WEBHOOK_MALFORMED_EVENT',
      }),
    ]),
};
