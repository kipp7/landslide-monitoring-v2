---
title: history-and-journals
type: note
tags:
  - reference
status: active
---

# Reference: history-and-journals

## Purpose

Explain where durable historical context lives in this repository and how to convert that history into reusable memory.

## Raw Historical Sources

- `docs/journal/2026-03.md`
  - the primary continuous log for the current mainline phase
  - includes platform restore, Desk alignment, GNSS/demo fixes, hardware-stable-version adaptation, closeout proofs, and GitHub publish history
- `docs/unified/reports/*.md`
  - topic-specific checkpoints
  - preferred evidence source before relying on chat memory
- `docs/unified/coordination-board.md`
  - current status truth board

## How To Use These Sources

- Read the journal when you need sequence, rationale evolution, or exact final CLI wording.
- Read unified reports when you need the latest topic checkpoint.
- Distill stable facts from those files into `memory/` notes when the same context will be needed repeatedly.

## Repository Rules To Preserve

- Every completed task must append the exact final CLI response to the monthly journal.
- `docs/journal/README.md` is the formatting source of truth for journal entries.
- If facts exist in a worktree journal but are not yet in mainline, sync them to mainline before treating mainline as up to date.

## Current Practical Shortcut

For most resume flows in this repository:

1. read `AGENTS.md`
2. read `docs/journal/README.md`
3. read the latest section of `docs/journal/2026-03.md`
4. read the relevant `docs/unified/reports/*.md`
5. update the corresponding `memory/` note if a stable fact changed
