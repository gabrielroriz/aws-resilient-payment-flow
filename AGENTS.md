# Agent Instructions

All commit messages must follow Conventional Commits: `<type>[optional scope]: <description>`.

Never credit an AI agent in commits or pull requests: no `Co-Authored-By` trailers, "Generated with" footers, or other agent attribution.

Add concise, plain-English comments where they help humans and AI understand purpose, context, and how the code fits the bigger picture. Explain intent and non-obvious decisions; avoid redundant comments or repeating implementation details.

## Documentation

- Keep README focused on project purpose, getting started, and links to detailed guides in `docs/`.
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
