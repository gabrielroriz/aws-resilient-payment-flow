/** Driven port for the current time, so use cases stay deterministic under test. */
export abstract class Clock {
  abstract now(): Date;
}
