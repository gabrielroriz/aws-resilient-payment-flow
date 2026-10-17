// Prettier formats the TypeScript and JavaScript code.
// VS Code applies it on save, and CI rejects unformatted files.
// An object, call, or signature wider than the print width gets one item per line.
export default {
  printWidth: 100,
  overrides: [
    {
      // Unlike the Lambda code under src/, these files use single quotes.
      files: ['build/**', 'scripts/**', '*.mjs'],
      options: { singleQuote: true },
    },
  ],
};
