import type { Clock } from './clock.types.mts';

// Reads the time from `now`: the system clock in a run, a fixed time in tests.
export function createClock(now: () => Date): Clock {
  return {
    now,
    minutesAgo: (minutes) => new Date(now().getTime() - minutes * 60_000),
  };
}
