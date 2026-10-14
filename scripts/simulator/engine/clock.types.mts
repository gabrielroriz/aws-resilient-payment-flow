// The current time, and earlier moments for events that occurred before now.
export type Clock = {
  now(): Date;
  minutesAgo(minutes: number): Date;
};
