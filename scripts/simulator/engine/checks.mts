import type { SimulatedEvent } from '../gateways/gateways.types.mts';
import type { Outcome, WebhookApi } from './api.types.mts';
import type { Check, Checks } from './checks.types.mts';
import { label } from './events.mts';
import { acknowledged, describeOutcome, problemsWith } from './replies.mts';

// Checks that deliver through the given API when they need deliveries of their own.
export function createChecks(api: WebhookApi): Checks {
  return {
    reply: (step, outcome, expected) =>
      checkOf(outcome.gateway, step, describeOutcome(outcome), problemsWith(outcome, expected)),

    async sequence(step, gateway, events, outdated) {
      const answers: string[] = [];
      const problems: string[] = [];
      for (const [index, event] of events.entries()) {
        const outcome = await api.deliver(gateway, event);
        answers.push(`${label(event)}=${answerOf(outcome)}`);
        const expected = { status: 200, duplicate: false, outdated: outdated[index] };
        problems.push(...prefixed(event, problemsWith(outcome, expected)));
      }
      return checkOf(gateway.name, step, `outdated: ${answers.join(' ')}`, problems);
    },

    async latest(step, gateway, events, expected) {
      const latest: string[] = [];
      const problems: string[] = [];
      for (const event of events) {
        const outcome = await api.deliver(gateway, event);
        // Every event was delivered before, so each must come back as a duplicate.
        problems.push(...prefixed(event, problemsWith(outcome, { status: 200, duplicate: true })));
        if (acknowledged(outcome)?.outdated === false) {
          latest.push(label(event));
        }
      }
      if (latest.length !== 1 || latest[0] !== label(expected)) {
        problems.push(`expected only ${label(expected)} as the latest`);
      }
      return checkOf(gateway.name, step, `latest: ${latest.join(', ') || 'none'}`, problems);
    },
  };
}

// A step that passes when nothing is wrong, printing what was observed and then each problem.
export function checkOf(
  gateway: string,
  step: string,
  observed: string,
  problems: string[],
): Check {
  return {
    gateway,
    step,
    passed: problems.length === 0,
    detail: [observed, ...problems].join('; '),
  };
}

// An event's problems, each prefixed with the event's label.
function prefixed(event: SimulatedEvent, problems: string[]): string[] {
  return problems.map((problem) => `${label(event)}: ${problem}`);
}

// The outdated flag a delivery came back with, or what came back instead.
function answerOf(outcome: Outcome): string {
  const reply = acknowledged(outcome);
  return reply ? String(reply.outdated) : describeOutcome(outcome);
}
