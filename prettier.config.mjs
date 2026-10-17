// Prettier formats the TypeScript and JavaScript code; VS Code applies it on save and CI rejects
// unformatted files.
// Any object, call, or signature that no longer fits on one line within the print width is broken
// onto several lines, one property or argument per line.
export default {
  printWidth: 100,
  overrides: [
    {
      // The Lambda code under src/ uses double quotes; the build tooling, scripts, and root config
      // files use single quotes.
      files: ['build/**', 'scripts/**', '*.mjs'],
      options: { singleQuote: true },
    },
  ],
};
