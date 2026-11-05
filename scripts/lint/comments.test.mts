import { expect, test } from 'vitest';
import { commentViolations, MAX_WIDTH, repositoryViolations } from './comments.mts';

const reasons = (path: string, text: string) =>
  commentViolations(path, text).map(({ line, reason }) => `${line}: ${reason}`);

test('every comment in the repository is one sentence per line within the width', () => {
  const violations = repositoryViolations().map(
    ({ path, line, reason }) => `${path}:${line} ${reason}`,
  );
  expect(violations).toEqual([]);
});

test('a comment of whole sentences, one per line, passes', () => {
  const text = [
    '// Stores each event once.',
    '// A repeat returns the stored one (with its `status`).',
    'const x = 1; // Trailing comments are not checked',
  ].join('\n');

  expect(reasons('src/a.ts', text)).toEqual([]);
});

test('a sentence continued on the next line fails on the line it breaks', () => {
  const text = ['// Stores each event once, and a repeat', '// returns the stored one.'].join('\n');

  expect(reasons('src/a.ts', text)).toEqual(['1: does not end its sentence']);
});

test('SQL line comments follow the same rule', () => {
  expect(reasons('src/a.sql', '-- Stores each event once, and a repeat')).toEqual([
    '1: does not end its sentence',
  ]);
});

test('a line holding two sentences fails', () => {
  expect(reasons('src/a.ts', '// Stores each event once. A repeat returns it.')).toEqual([
    '1: holds more than one sentence',
  ]);
});

test('a line wider than the limit fails, indentation included, unless it holds a URL', () => {
  const sentence = (width: number) => `// ${'a'.repeat(width - 4)}.`;
  const indented = `  ${sentence(MAX_WIDTH - 1)}`;
  const url = `// See https://example.com/${'a'.repeat(MAX_WIDTH)}.`;

  expect(reasons('src/a.ts', sentence(MAX_WIDTH))).toEqual([]);
  expect(reasons('src/a.ts', indented)).toEqual([`1: wider than ${MAX_WIDTH} columns`]);
  expect(reasons('src/a.ts', url)).toEqual([]);
});

test.each([
  ['scripts/dev/index.sh', '#!/usr/bin/env bash\n# Runs the API.'],
  ['src/a.ts', '//\n  #private = 1;'],
  ['src/a.ts', '/// <reference types="emscripten" />'],
  ['compose.dev.yaml', '# Local services.'],
  ['terraform/main.tf', '// Creates the table.\n# Creates the queue.'],
  ['src/a.sql', '-- Creates the table.\nCREATE TABLE a (id int); -- trailing'],
  ['docs/guide.md', '# Heading without a period'],
])(
  '%s: shebangs, directives, empty comments, code, and unchecked file types pass',
  (path, text) => {
    expect(reasons(path, text)).toEqual([]);
  },
);
