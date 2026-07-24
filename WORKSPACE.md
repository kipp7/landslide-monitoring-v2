# Workspace Setup

This workspace is configured for Codex with:

- Basic Memory for durable notes and cross-session recall.
- CTX for generated repository context and MCP-based context access.
- Reusable workflows in `WORKFLOWS.md`.
- Team governance rules in `memory/TEAM_RULES.md`.

## Directory conventions

- `memory/` stores durable notes, decisions, and task history.
- `memory/_templates/` stores reusable note templates for Codex and manual use.
- `.context/` stores generated context artifacts from CTX.
- `.bm-state/` stores isolated Basic Memory runtime state for this workspace.

## Usage rules

- Store architecture decisions and non-trivial task outcomes under `memory/`.
- Prefer updating an existing note instead of creating duplicate notes.
- Start new notes from the templates in `memory/_templates/`.
- Use the prompts in `WORKFLOWS.md` when you want a fast, repeatable command pattern.
- Follow the shared editing and review conventions in `memory/TEAM_RULES.md`.
- Keep generated artifacts inside `.context/`; do not hand-edit them.
- Keep secrets out of `memory/` and `context.yaml`.
- Use `.tools/basic-memory/basic-memory.cmd` for manual CLI/admin commands in this workspace.
- Codex uses `.tools/basic-memory/basic-memory-mcp.cmd` for the long-running MCP server.
