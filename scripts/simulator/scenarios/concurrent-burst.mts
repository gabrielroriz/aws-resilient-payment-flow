import { checkOf } from '../engine/checks.mts';
import { label } from '../engine/events.mts';
import { acknowledged, describeOutcome, problemsWith } from '../engine/replies.mts';
import type { Scenario } from '../engine/runner.types.mts';
import type { SimulatedEvent } from '../gateways/gateways.types.mts';

export const concurrentBurst: Scenario = {
  name: 'concurrent-burst',
  optional: true,
  description:
    "A payment's five events, each delivered twice at the same moment, are each stored once, and the chargeback still ends as the latest event. Meaningful against a deployed API, where deliveries really run in parallel.",
  run: ({ api, checks, events, forEachGateway }) =>
    forEachGateway(async (gateway) => {
      const lifecycle = events.lifecycle();
      const chargeback = lifecycle[4];
      const deliveries = [...lifecycle, ...lifecycle];
      const outcomes = await Promise.all(deliveries.map((event) => api.deliver(gateway, event)));
      const outcomesOf = (event: SimulatedEvent) =>
        outcomes.filter((_, index) => deliveries[index] === event);

      // Every reply must match the contract and name its event, whichever delivery stored it.
      const storeProblems = outcomes.flatMap((outcome, index) =>
        problemsWith(outcome, { status: 200 }).map(
          (problem) => `${label(deliveries[index])}: ${problem}`,
        ),
      );
      const stored = lifecycle.map(
        (event) =>
          outcomesOf(event).filter((outcome) => acknowledged(outcome)?.duplicate === false).length,
      );
      if (!stored.every((count) => count === 1)) {
        storeProblems.push('expected each event stored once');
      }

      // Nothing outranks the chargeback, so no interleaving can make it outdated.
      const chargebackAnswers = outcomesOf(chargeback).map(
        (outcome) => acknowledged(outcome)?.outdated ?? describeOutcome(outcome),
      );
      const chargebackProblems = chargebackAnswers.every((answer) => answer === false)
        ? []
        : ['expected false for every delivery'];

      return [
        checkOf(
          gateway.name,
          'each event stored once',
          `stored: ${lifecycle.map((event, index) => `${label(event)}=${stored[index]}`).join(' ')}`,
          storeProblems,
        ),
        checkOf(
          gateway.name,
          'chargeback never outdated',
          `outdated: ${chargebackAnswers.join(', ')}`,
          chargebackProblems,
        ),
        await checks.latest('latest after the burst', gateway, lifecycle, chargeback),
      ];
    }),
};
