import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';
import options from './build/esbuild.config.mts';

const tsconfigRaw = await readFile(new URL('./tsconfig.json', import.meta.url), 'utf8');

// Vite's default transform, Oxc, strips types but keeps standard decorators.
// Node cannot run them.
// Tests compile with esbuild, the production target, and tsconfig instead.
// That matches the deployed Lambdas' decorator lowering and class semantics.
const esbuildTypeScript = {
  name: 'esbuild-typescript',
  async transform(code, id) {
    // .mts covers build tooling, which Node.js runs and tests import as written.
    if (!/\.m?ts$/.test(id)) return null;
    const result = await transform(code, {
      loader: 'ts',
      target: options.target,
      tsconfigRaw,
      sourcefile: id,
      sourcemap: true,
    });
    return { code: result.code, map: result.map };
  },
};

export default defineConfig({
  oxc: false,
  plugins: [esbuildTypeScript],
  // Resolve the @application, @infra, @kernel, and @main aliases from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    // Tests sit next to their modules, including local tooling and the simulator.
    include: [
      'src/**/*.test.ts',
      'build/**/*.test.mts',
      'scripts/dev/**/*.test.mts',
      'scripts/simulator/**/*.test.mts',
    ],
    // Undo vi.spyOn after each test, so a replaced method never leaks to the next.
    restoreMocks: true,
    // Undo vi.stubEnv after each test, so a stubbed secret never leaks to the next.
    unstubEnvs: true,
    // Type tests run through tsc instead of executing.
    typecheck: { enabled: true, include: ['src/**/*.test-d.ts'] },
  },
});
