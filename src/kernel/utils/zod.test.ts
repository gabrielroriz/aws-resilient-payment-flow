import * as z from "@kernel/utils/zod";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const src = path.resolve(__dirname, "../..");

test("every module imports zod through the project's zod, so no bundle includes regular zod", async () => {
  const wrapper = path.join("kernel", "utils", "zod.ts");
  const files = (await readdir(src, { recursive: true })).filter(
    (file) => file.endsWith(".ts") && file !== wrapper,
  );

  const direct = [];
  for (const file of files) {
    if (/from "zod(\/[^"]*)?"/.test(await readFile(path.join(src, file), "utf8"))) {
      direct.push(file);
    }
  }

  expect(direct).toEqual([]);
});

test("issues carry English messages instead of zod/mini's bare default", () => {
  expect(z.string().safeParse(1).error?.issues[0].message).toBe(
    "Invalid input: expected string, received number",
  );
});
