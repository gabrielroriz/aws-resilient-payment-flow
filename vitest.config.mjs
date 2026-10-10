import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';
import options from './build/esbuild.config.mts';

const tsconfigRaw = await readFile(new URL('./tsconfig.json', import.meta.url), 'utf8');

// Vite's default TypeScript transform (Oxc) strips types but leaves standard decorators in place,
// which Node cannot run. Compiling with esbuild, the production target, and the project tsconfig
// gives tests the same decorator lowering and class semantics as the deployed Lambdas.
const esbuildTypeScript = {
  name: 'esbuild-typescript',
  async transform(code, id) {
    // .mts covers the build tooling, which Node.js runs directly and tests import as written.
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
    // Each test sits next to the module it covers: Lambda code tests in src, build tooling tests in build.
    include: ['src/**/*.test.ts', 'build/**/*.test.mts'],
    // Undo vi.spyOn after each test, so a silenced console or replaced method never leaks into the next.
    restoreMocks: true,
    // Undo vi.stubEnv after each test, so a configured or missing secret never leaks into the next.
    unstubEnvs: true,
    // Type tests run through tsc instead of executing, such as the @Injectable dependency list checks.
    typecheck: { enabled: true, include: ['src/**/*.test-d.ts'] },
  },
});
