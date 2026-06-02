---
title: WORKSPACE
type: note
permalink: landslide-monitoring-v2-mainline/workspace
---

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

## Project-Specific Entry Points

- `AGENTS.md`
  - repository-local operating rules
  - journal write-back rules
- `docs/journal/README.md`
  - monthly journal format and source-of-truth rules
- `docs/journal/2026-03.md`
  - continuous historical context for this mainline workspace
- `docs/unified/README.md`
  - unified document hub
- `docs/unified/coordination-board.md`
  - current coordination truth board
- `docs/unified/next-actions.md`
  - default execution order when there is no newer explicit override
- `docs/guides/roadmap/project-status.md`
  - human/AI handoff entry for the broader project state

## Memory Conventions For This Repository

- Treat `docs/journal/YYYY-MM.md` as the raw chronological history.
- Treat `docs/unified/` as the current factual checkpoint layer.
- Treat `memory/` as the distilled durable layer for stable entry points, decisions, and resumable checkpoints.
- When a long journal section becomes a stable fact, extract it into `memory/` instead of re-reading the whole journal every time.