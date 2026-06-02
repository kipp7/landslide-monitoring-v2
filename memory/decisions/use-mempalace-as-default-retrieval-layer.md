---
title: use-mempalace-as-default-retrieval-layer
type: note
tags:
- decision
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-mempalace-as-default-retrieval-layer
---

# Decision: use-mempalace-as-default-retrieval-layer

## Context

The repository already has three durable layers:

- `docs/journal/`
- `docs/unified/`
- `memory/`

Those layers are authoritative, but they are expensive to reread in full during long-running field work. The workspace now also has a local `MemPalace` installation and project palace that can search the same project context much faster.

## Decision

Use `MemPalace` as the default retrieval layer for session resume and project recall.

Future sessions should prefer this order:

1. `MemPalace`
   - `status`
   - targeted `search`
   - `wake-up` when needed
2. authoritative verification
   - `docs/unified/reports/*latest.json`
   - `docs/journal/YYYY-MM.md`
3. distilled stable notes
   - `memory/`

`docs/` remains the source of truth. `MemPalace` becomes the first retrieval tool, not a replacement truth source.

## Rationale

- It preserves speed for resume and recall without forcing full rereads of the monthly journal.
- It fits the user's requirement that memory should survive context compression and long chat drift.
- It keeps authority boundaries clear:
  - `MemPalace` retrieves
  - `docs/unified/` and `docs/journal/` confirm
  - `memory/` anchors stable summaries and resume points

## Consequences

- When asked for project status, prior decisions, or current blockers, future sessions should search `MemPalace` first.
- Important current-phase baselines still need a stable checkpoint in `memory/checkpoints/`.
- Windows console calls should force UTF-8 when using `mempalace wake-up`, because the current environment can hit `gbk` encoding errors.

## Follow-up

- keep the current field-phase checkpoint aligned with `MemPalace` search results and `latest.json` truth
- continue treating `docs/unified/reports/*latest.json` as the final verification layer before major decisions or status updates
