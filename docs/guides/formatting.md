# Formatting

How the code is formatted, in the editor and in CI. See [Testing](testing.md) for the automated tests.

## Requirements

| Requirement | Used for |
|---|---|
| Node.js 24 and npm | Running Prettier from the command line and in CI |
| [Prettier extension for VS Code](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) | Formatting on save; optional |

## Setup

In VS Code, install the extensions the workspace recommends. The workspace settings in [`.vscode/settings.json`](../../.vscode/settings.json) make the extension format TypeScript and JavaScript files on every save with the Prettier version installed by `npm ci`.

## How it works

[`prettier.config.mjs`](../../prettier.config.mjs) configures Prettier for every `.ts`, `.mts`, and `.mjs` file that Git does not ignore:

| Setting | Effect |
|---|---|
| Print width of 100 characters | An object, call, signature, or condition that does not fit on one line is broken onto several lines, one property or argument per line |
| Double quotes under `src/`; single quotes in `build/`, `scripts/`, and root config files | Each part of the codebase keeps the quote style it already uses |
| Prettier defaults for everything else | Two-space indentation, semicolons, and trailing commas in multi-line lists |

Prettier keeps an object expanded when its source has a line break after the opening brace, even if it would fit on one line; remove that line break to collapse it. Prettier never rewraps comments or strings.

CI runs `npm run format:check` before building and fails on any unformatted file. Prettier is pinned to an exact version in `package.json`, because new versions can format the same code differently. Markdown, JSON, YAML, and Terraform files are not formatted.

## Usage

| Task | Command or action |
|---|---|
| Format a file | Save it in VS Code |
| Format every file | `npm run format` |
| Format one file or directory | `npx prettier --write <path>` |
| Check formatting as CI does | `npm run format:check` |
