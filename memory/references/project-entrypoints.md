---
title: project-entrypoints
type: note
tags:
- reference
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/project-entrypoints
---

# Reference: project-entrypoints

## Purpose

Provide a stable resume order for future Codex sessions so they do not have to rediscover the repository's source-of-truth files or ignore the now-available `MemPalace` retrieval layer.

## Fast Resume First

Start with `MemPalace` before rereading large documents:

- `.\mempalace.ps1 status`
  - confirm the palace is available
  - confirm whether the local index is stale via `freshness.sourceNewerThanIndex`
- `.\mempalace.ps1 search "<current question>"`
  - retrieve prior decisions, phase boundaries, and blockers quickly
- `.\mempalace.ps1 wake-up`
  - use when a larger session needs condensed project context

Current operating rule:

- `status` is read-only and does not auto-refresh
- `search` / `wake-up` auto-start a background refresh only when the index is stale
- system-global `mempalace` is not the stable contract on this machine; the repo-local PowerShell shim is

Windows note:

- force UTF-8 for `wake-up` in this workspace:
  - `PYTHONIOENCODING=utf-8`
  - `PYTHONUTF8=1`

## Read First

- `AGENTS.md`
  - repository-local execution rules
  - journal sync requirements
- `CURRENT-TARGET.md`
  - current default development target
  - current formal delivery baseline
  - explicit rule that `apps/web/` is not the default prototype or acceptance surface
- `memory/decisions/use-mempalace-as-default-retrieval-layer.md`
  - retrieval-order rule for future sessions
- `memory/checkpoints/desk-win-restored-delivery-archive-2026-04-16.md`
  - current visible desk-win delivery rollback anchor
- `memory/checkpoints/field-mainline-phase-baseline-2026-04-14.md`
  - current frozen field-stage baseline
- `docs/journal/README.md`
  - monthly journal format and write-back rules
- `docs/journal/2026-04.md`
  - current monthly journal; read the latest relevant section first
- `artifacts/desk-win/CURRENT-BASELINE.md`
  - current desk-win formal delivery baseline and non-baseline sibling directories

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
- If the task needs bounded parallel sidecar work, first check `WORKFLOWS.md`.
- Prefer updating these existing notes instead of creating near-duplicate summaries:
  - `memory/references/project-entrypoints.md`
  - `memory/references/history-and-journals.md`
  - `memory/decisions/use-journal-and-unified-docs-as-durable-memory.md`
  - `memory/decisions/use-mempalace-as-default-retrieval-layer.md`
  - `memory/checkpoints/desk-win-restored-delivery-archive-2026-04-16.md`
  - `memory/checkpoints/field-mainline-phase-baseline-2026-04-14.md`
  - `memory/checkpoints/mainline-memory-bootstrap-2026-03-26.md`
