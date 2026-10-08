export default {
  // Keep each deployment self-contained and small, with no separate source map.
  bundle: true,
  minify: true,
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
};
