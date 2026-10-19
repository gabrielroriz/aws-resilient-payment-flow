import { AsyncInvocationContext } from "@infra/invocation/AsyncInvocationContext";
import { expect, test, vi } from "vitest";

test("timing stays fixed across awaits and callers cannot mutate it", async () => {
  const now = new Date(1_000);
  const invocation = new AsyncInvocationContext({ now: () => now });

  await invocation.withContext(5_000, async () => {
    now.setTime(9_000);
    invocation.startedAt().setTime(0);
    invocation.deadline().setTime(0);
    await Promise.resolve();

    expect(invocation.startedAt()).toEqual(new Date(1_000));
    expect(invocation.deadline()).toEqual(new Date(6_000));
  });

  expect(() => invocation.startedAt()).toThrow("outside an invocation");
  expect(() => invocation.deadline()).toThrow("outside an invocation");
});

test("overlapping invocations keep separate timing on one shared instance", async () => {
  const now = vi.fn().mockReturnValueOnce(new Date(1_000)).mockReturnValueOnce(new Date(2_000));
  const invocation = new AsyncInvocationContext({ now });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timings: number[][] = [];

  const slow = invocation.withContext(5_000, async () => {
    await gate;
    timings.push([invocation.startedAt().getTime(), invocation.deadline().getTime()]);
  });
  const fast = invocation.withContext(10_000, async () => {
    await Promise.resolve();
    timings.push([invocation.startedAt().getTime(), invocation.deadline().getTime()]);
    release();
  });
  await Promise.all([slow, fast]);

  expect(timings).toEqual([
    [2_000, 12_000],
    [1_000, 6_000],
  ]);
});

test("a failed invocation leaves no timing for a later invocation", async () => {
  const now = vi.fn().mockReturnValueOnce(new Date(1_000)).mockReturnValueOnce(new Date(50_000));
  const invocation = new AsyncInvocationContext({ now });

  await expect(
    invocation.withContext(5_000, async () => {
      await Promise.resolve();
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  expect(() => invocation.deadline()).toThrow("outside an invocation");

  invocation.withContext(20_000, () => {
    expect(invocation.startedAt()).toEqual(new Date(50_000));
    expect(invocation.deadline()).toEqual(new Date(70_000));
  });
});
