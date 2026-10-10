import type { BuildOptions } from 'esbuild';

export default {
  // Keep each deployment to one small file, with no separate source map.
  bundle: true,
  // The Lambda Node.js runtime provides AWS SDK v3, so handlers import it at run time instead of
  // carrying a copy. Its version is the one the runtime ships, not the one installed locally.
  external: ['@aws-sdk/*'],
  minify: true,
  // Keep class names readable after minification so DI errors name the missing provider.
  keepNames: true,
  sourcemap: false,
  // Match Terraform's runtime and expose handler through CommonJS exports.
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  treeShaking: true,
  // Let the bundling step inspect dependencies before accepting the output on disk.
  metafile: true,
  write: false,
  // Fail when esbuild reports imports it cannot resolve into the single-file package.
  logOverride: {
    'unsupported-require-call': 'error',
    'unsupported-dynamic-import': 'error',
  },
} as const satisfies BuildOptions;
