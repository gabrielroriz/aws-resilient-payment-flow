import type { Scenario } from '../engine/runner.types.mts';

export const subscriptionRenewal: Scenario = {
  name: 'subscription-renewal',
  description:
    "A subscription's next charge starts pending after the previous one succeeded without being outdated, because each charge is a payment ranked on its own.",
  run: ({ checks, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const renewal = events.renewal();
      const [firstCharge, nextCharge] = [renewal.slice(0, 2), renewal.slice(2)];
      // Only events of the same charge compete, and each outranks the one before it.
      const outdated = renewal.map(() => false);
      return [
        await checks.sequence('both charges in order', gateway, renewal, outdated),
        // The next charge leaves the first one paid, and each ends paid.
        await checks.latest('latest of the first charge', gateway, firstCharge, firstCharge[1]),
        await checks.latest('latest of the next charge', gateway, nextCharge, nextCharge[1]),
      ];
    }),
};
