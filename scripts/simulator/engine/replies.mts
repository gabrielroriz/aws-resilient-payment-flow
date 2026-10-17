import { en } from 'zod/locales';
import * as z from 'zod/mini';
import type { Delivery, Outcome } from './api.types.mts';
import type { Expected } from './checks.types.mts';
import type { AcknowledgedReply } from './replies.types.mts';

// English issue messages; zod/mini's default is a bare "Invalid input".
z.config(en());

// The simulator's own copy of the API's reply contract, written apart from the API so an
// unintended change fails a scenario.
// Extra fields are allowed, as adding one keeps replies compatible.
export const acknowledgedReply = z.object({
  provider: z.string(),
  providerEventId: z.string(),
  duplicate: z.boolean(),
  outdated: z.boolean(),
});
const rejection = z.object({ code: z.string(), message: z.string() });
export const rejectedReply = z.object({ success: z.literal(false), error: rejection });

// The body of an acknowledged reply that matches the contract, or undefined for any other outcome.
export function acknowledged(outcome: Outcome): AcknowledgedReply | undefined {
  if ('timedOut' in outcome || outcome.status !== 200) {
    return undefined;
  }
  const result = acknowledgedReply.safeParse(outcome.body);
  return result.success ? result.data : undefined;
}

// What is wrong with an outcome, one line per problem: its status, the contract for that status,
// the values the step expects, and the gateway and event it must name.
export function problemsWith(outcome: Outcome, expected: Expected): string[] {
  if ('timedOut' in outcome) {
    return [`status: expected ${expected.status}, received no reply`];
  }
  // A wrong status makes the whole body wrong too, so it is the only problem reported.
  if (outcome.status !== expected.status) {
    return [`status: expected ${expected.status}, received ${outcome.status}`];
  }
  const result = expectedReply(expected, outcome).safeParse(outcome.body, { reportInput: true });
  return result.success ? [] : result.error.issues.map(describeIssue);
}

// Summarizes an outcome, such as `HTTP 200 duplicate=false outdated=true`.
export function describeOutcome(outcome: Outcome): string {
  if ('timedOut' in outcome) {
    return 'no reply';
  }
  const body = isRecord(outcome.body) ? outcome.body : {};
  const error = isRecord(body.error) ? body.error : {};
  return [
    `HTTP ${outcome.status}`,
    'duplicate' in body && `duplicate=${show(body.duplicate)}`,
    'outdated' in body && `outdated=${show(body.outdated)}`,
    typeof error.code === 'string' && error.code,
  ]
    .filter(Boolean)
    .join(' ');
}

// The contract for the expected status, narrowed to the values the step expects.
function expectedReply(expected: Expected, delivery: Delivery): z.ZodMiniType {
  if (expected.status !== 200) {
    return expected.code === undefined
      ? rejectedReply
      : z.extend(rejectedReply, { error: z.extend(rejection, { code: z.literal(expected.code) }) });
  }
  const values: Record<string, z.ZodMiniType> = { provider: z.literal(delivery.gateway) };
  if (delivery.eventId !== undefined) {
    values.providerEventId = z.literal(delivery.eventId);
  }
  if (expected.duplicate !== undefined) {
    values.duplicate = z.literal(expected.duplicate);
  }
  if (expected.outdated !== undefined) {
    values.outdated = z.literal(expected.outdated);
  }
  return z.extend(acknowledgedReply, values);
}

// One problem as `path: expected …, received …`, naming the value received rather than its type.
function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.') || 'body';
  const expected =
    issue.code === 'invalid_value'
      ? issue.values.map(show).join(' or ')
      : issue.code === 'invalid_type'
        ? issue.expected
        : undefined;
  return expected === undefined
    ? `${path}: ${issue.message}`
    : `${path}: expected ${expected}, received ${show(issue.input)}`;
}

// A value as JSON, cut short so a long body such as an HTML page stays readable.
function show(value: unknown): string {
  if (value === undefined) {
    return 'nothing';
  }
  const json = JSON.stringify(value) ?? String(value);
  return json.length > 60 ? `${json.slice(0, 57)}...` : json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
