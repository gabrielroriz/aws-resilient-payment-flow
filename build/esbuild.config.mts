import type { BuildOptions } from 'esbuild';
import { pathToFileURL } from 'node:url';

export default {
  // Keep each deployment to one small file, with no separate source map.
  bundle: true,
  // The Lambda Node.js runtime provides AWS SDK v3, so bundles leave it out.
  // Its version is the one the runtime ships, not the one installed locally.
  external: ['@aws-sdk/*'],
  minify: true,
  // Keep class names after minification so DI errors name the missing provider.
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
  // Fail on imports esbuild cannot resolve into the single-file package.
  // Computed imports are warnings, so the bundler can allow ones that never run.
  logOverride: {
    'unsupported-require-call': 'error',
    'unsupported-dynamic-import': 'warning',
  },
  // The bundler reports warnings itself, after rejecting computed imports.
  logLevel: 'silent',
} as const satisfies BuildOptions;

// Local debugging trades the small file for readable code and an inline source map.
// The container runs the code from another path, so the bundle names its local one.
// Debuggers then bind breakpoints from local source maps before the code runs.
export function debugOptions(outfile: string) {
  return {
    minify: false,
    sourcemap: 'inline',
    footer: { js: `//# sourceURL=${pathToFileURL(outfile).href}` },
  } as const satisfies BuildOptions;
}
