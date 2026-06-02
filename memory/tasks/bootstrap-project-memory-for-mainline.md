---
title: bootstrap-project-memory-for-mainline
type: note
tags:
- task
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/bootstrap-project-memory-for-mainline
---

# Task: bootstrap-project-memory-for-mainline

## Goal

Set up reusable workspace memory for `landslide-monitoring-v2-mainline` so future Codex sessions can resume from durable notes instead of relying on chat history alone.

## Current State

- workspace scaffold exists:
  - `WORKSPACE.md`
  - `WORKFLOWS.md`
  - `memory/`
  - `context.yaml`
  - `.tools/basic-memory/`
- project-specific MCP entries were added for:
  - `basic-memory-landslide-monitoring-v2-mainline`
  - `ctx-landslide-monitoring-v2-mainline`
- the MCP config needed manual repair because the initial auto-registration split paths containing spaces

## Constraints

- journal remains the authoritative raw history source
- memory must not become a conflicting second truth source
- secrets and local runtime state must stay out of shared memory

## Plan

- maintain stable reference notes for project entry points and journal usage
- maintain a resumable checkpoint note for the current workspace state
- only extract durable facts from journal/unified docs into memory when they are likely to be reused

## Open Questions

- whether to add more topic-specific memory notes for Desk delivery, field rehearsal, and hardware adaptation as separate recurring streams

## Done When

- future resume flow can start from `memory/` plus a small number of authoritative docs
- project-specific MCP entries are correctly configured
- the current bootstrap state is captured in a checkpoint note