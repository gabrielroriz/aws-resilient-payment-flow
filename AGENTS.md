# Agent Instructions

All commit messages must follow Conventional Commits: `<type>[optional scope]: <description>`.

Never credit an AI agent in commits or pull requests: no `Co-Authored-By` trailers, "Generated with" footers, or other agent attribution.

Follow the layers, import rules, and dependency injection conventions in [docs/architecture.md](docs/architecture.md).

Add concise, plain-English comments where they help humans and AI understand purpose, context, and how the code fits the bigger picture. Explain intent and non-obvious decisions; avoid redundant comments or repeating implementation details.

## References to files

Renaming or moving a file must never leave a stale reference behind, so comments and documentation avoid naming individual files.

- In code comments, explain the code in place and do not point to other files or documents. When code must stay in sync with something elsewhere, say what it must match, not where that lives, such as "must match the table name provisioned by Terraform".
- In documentation, describe concepts, conventions, and directories instead of individual source files. Do not inventory files, such as listing every test or module with its purpose.
- Link to a source file only when it is the reference example a reader should copy. Links between guides are fine.
- Configuration files that tools or scripts load by name, such as `package.json`, `tsconfig.json`, `vitest.config.mjs`, and `lambdas.json`, may be named and linked.

## Documentation

- Keep README focused on project purpose, getting started, and links to detailed guides in `docs/`.
- When adding a new technology to the project, add its badge to the README badge list in the same style as the existing badges.
- Give each guide one clear responsibility. Separate local development, deployment, testing, and adding new functions.
- For workflow guides, organize content into requirements, setup, how it works, and usage, as relevant.
- Prefer concise tables for requirements, commands, configuration fields, and artifacts.
- Use simple Mermaid diagrams when they explain a workflow more clearly than prose.
- Avoid examples tied to temporary functions or placeholder responses that will soon be removed.
- Keep prose paragraphs and list items on single source lines; let the Markdown renderer wrap them.
- Link to related guides instead of duplicating their instructions.
- Update links and section anchors when moving or renaming content.
- Update documentation when user-facing behavior changes.
- Describe current behavior and meaningful limitations. Do not record implementation history.
- Keep implementation intent in code comments.
