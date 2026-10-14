import type { Check } from '../engine/checks.types.mts';
import type { Scenario } from '../engine/runner.types.mts';

// Arrival orders as lifecycle indexes (0 oldest, 4 chargeback) and each arrival's outdated flag.
const ARRIVAL_ORDERS: { name: string; order: number[]; outdated: boolean[] }[] = [
  // Each event outranks every one before it, so none is outdated.
  { name: 'in order', order: [0, 1, 2, 3, 4], outdated: [false, false, false, false, false] },
  // The chargeback arrives first and outranks everything after it.
  { name: 'reversed', order: [4, 3, 2, 1, 0], outdated: [false, true, true, true, true] },
  // The failure loses to the chargeback by precedence, and the refund loses to it by occurrence.
  { name: 'mixed', order: [2, 4, 1, 3, 0], outdated: [false, false, true, true, true] },
];

export const orderIndependence: Scenario = {
  name: 'order-independence',
  description:
    "Whatever order a payment's five events arrive in, the chargeback, which has the highest precedence and occurred last, ends as the latest event.",
  run: ({ checks, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const results: Check[] = [];
      for (const { name, order, outdated } of ARRIVAL_ORDERS) {
        const lifecycle = events.lifecycle();
        const arrivals = order.map((index) => lifecycle[index]);
        results.push(await checks.sequence(`${name} arrival`, gateway, arrivals, outdated));
        results.push(
          await checks.latest(`latest after ${name} arrival`, gateway, lifecycle, lifecycle[4]),
        );
      }
      return results;
    }),
};
