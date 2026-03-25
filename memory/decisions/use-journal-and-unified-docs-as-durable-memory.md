---
title: use-journal-and-unified-docs-as-durable-memory
type: note
tags:
  - decision
status: active
---

# Decision: use-journal-and-unified-docs-as-durable-memory

## Context

This repository already has a large amount of durable project context in:

- `docs/journal/`
- `docs/unified/`
- `docs/guides/roadmap/project-status.md`

However, that context is expensive to re-read from scratch every session, especially when the monthly journal grows large.

## Decision

Adopt the workspace memory scaffold and treat:

- `docs/journal/` as the raw chronological history
- `docs/unified/` as the current factual checkpoint layer
- `memory/` as the distilled durable recall layer for repeated reuse

## Rationale

- The journal preserves exact sequence and final CLI wording.
- Unified reports preserve topic-level truth without relying on chat history.
- Memory notes give future sessions a short, stable entry path instead of forcing another full-document rediscovery pass.

## Consequences

- New durable facts should be extracted into `memory/` when they become recurring context.
- `memory/` must stay aligned with journal and unified reports instead of drifting into a parallel truth source.
- Future Codex sessions should start from:
  - `memory/references/project-entrypoints.md`
  - `memory/checkpoints/mainline-memory-bootstrap-2026-03-26.md`
  and only dive into the full journal when needed.

## Follow-up

- keep updating the memory checkpoint after major repo-wide changes
- add more focused decision/task notes when a single topic becomes a recurring resume point
