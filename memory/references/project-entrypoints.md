---
title: project-entrypoints
type: note
tags:
  - reference
status: active
---

# Reference: project-entrypoints

## Purpose

Provide a stable read order for future Codex sessions so they do not have to rediscover the repository's source-of-truth files.

## Read First

- `AGENTS.md`
  - repository-local execution rules
  - journal sync requirements
- `docs/journal/README.md`
  - monthly journal format and write-back rules
- `docs/journal/2026-03.md`
  - continuous mainline history for the current workstream

## Current Coordination Truth

- `docs/unified/coordination-board.md`
  - current status board
  - task state semantics
  - active strategy overrides
- `docs/unified/next-actions.md`
  - default execution order when no newer dispatch exists
- `docs/unified/reports/`
  - current factual checkpoints by topic

## Broader Handoff Context

- `docs/README.md`
  - docs hub
- `docs/unified/README.md`
  - unified docs index
- `docs/guides/roadmap/project-status.md`
  - human/AI handoff page for the broader project history

## Notes

- Use `docs/journal/` as raw history.
- Use `memory/` as distilled durable memory.
- Prefer updating these existing notes instead of creating near-duplicate summaries:
  - `memory/references/project-entrypoints.md`
  - `memory/references/history-and-journals.md`
  - `memory/decisions/use-journal-and-unified-docs-as-durable-memory.md`
  - `memory/checkpoints/mainline-memory-bootstrap-2026-03-26.md`
