import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import type { Violation } from './comments.types.mts';

// Each comment line holds one whole sentence within this many columns.
export const MAX_WIDTH = 85;

// Line comment markers by file name; files matching none are not checked.
const MARKERS: [RegExp, readonly string[]][] = [
  [/\.(ts|mts|mjs|json)$/, ['//']],
  [/\.(tf|hcl)$/, ['//', '#']],
  [/\.(sh|ya?ml|tfvars|tfvars\.example)$|(^|\/)\.gitignore$/, ['#']],
];

// A sentence ends with its punctuation, possibly inside closing brackets or quotes.
const SENTENCE_END = /[.?!][)`'"]*$/;
// Two sentences meet where end punctuation is followed by a capital or code.
const SENTENCE_BREAK = /[a-z0-9`)\]][.?!] +[A-Z`]/;
const URL = /https?:\/\//;

// Checks every comment in the repository against the comment rule.
export function repositoryViolations(): Violation[] {
  return repositoryFiles().flatMap((path) => commentViolations(path, readFileSync(path, 'utf8')));
}

// Checks one file's whole-line comments.
export function commentViolations(path: string, text: string): Violation[] {
  const markers = MARKERS.find(([pattern]) => pattern.test(path))?.[1];
  if (markers === undefined) {
    return [];
  }

  const violations: Violation[] = [];
  text.split('\n').forEach((line, index) => {
    const comment = commentText(line, markers);
    // Shebangs and empty separator comments hold no sentence.
    if (comment === undefined || comment === '' || line.startsWith('#!')) {
      return;
    }
    const at = { path, line: index + 1 };
    // A URL cannot be shortened, so it may run past the width.
    if (line.length > MAX_WIDTH && !URL.test(comment)) {
      violations.push({ ...at, reason: `wider than ${MAX_WIDTH} columns` });
    }
    if (!SENTENCE_END.test(comment)) {
      violations.push({ ...at, reason: 'does not end its sentence' });
    }
    if (SENTENCE_BREAK.test(comment)) {
      violations.push({ ...at, reason: 'holds more than one sentence' });
    }
  });
  return violations;
}

// The text after a whole-line comment's marker, or undefined for any other line.
function commentText(line: string, markers: readonly string[]): string | undefined {
  const trimmed = line.trimStart();
  const marker = markers.find((candidate) => trimmed.startsWith(candidate));
  return marker === undefined ? undefined : trimmed.slice(marker.length).trim();
}

// Tracked and untracked files, so a new file is checked before it is added.
// Git leaves out ignored files, such as dependencies and build output.
function repositoryFiles(): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  // A deleted file stays listed until its deletion is staged.
  // A symbolic link can name a folder.
  return listed.split('\0').filter((path) => path !== '' && isFile(path));
}

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
