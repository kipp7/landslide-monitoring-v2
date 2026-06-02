---
title: WORKFLOWS
type: note
permalink: landslide-monitoring-v2-mainline/workflows
---

# Codex Workflows

Use these short commands when working in this workspace.

## 0. Parallel Subagents

This workspace can use Codex parallel subagents for bounded sidecar tasks.

Important boundary:

- this is a Codex agent-runtime capability
- it is not a feature developed by this repository itself
- the repository only records how we want to use it safely

Best fit:

- codebase audits
- field/contract mapping checks
- dependency/license due diligence
- implementation sequencing for disjoint modules

Do not use it for:

- overlapping write scopes
- blocking work that the main rollout should do locally right now
- vague “go research everything” delegation

Suggested prompts:

```text
Split this task into 3 parallel subagents: A audits existing contracts, B designs data mapping, C proposes worker integration order. Then summarize the combined result.
```

```text
Use parallel subagents only for read-only exploration. Keep file edits local in the main thread.
```

```text
Run two sidecar subagents: one checks licensing and one checks current code paths, then continue locally with the main design.
```

Operational note:

- user-facing invocation is natural language
- Codex will internally use the agent runtime subagent tools
- when coding, prefer subagents only for disjoint read-only or clearly isolated tasks

## 1. Resume This Repository Fast

Suggested prompt:

```text
Read AGENTS.md, CURRENT-TARGET.md, docs/journal/README.md, the latest monthly journal, artifacts/desk-win/CURRENT-BASELINE.md, memory/references/project-entrypoints.md, and the latest checkpoint note before continuing.
```

## 2. Record a Decision

Suggested prompt:

```text
Record this decision in memory/decisions using the decision template. Include context, decision, rationale, consequences, and follow-up.
```

## 3. Track a Task

Suggested prompt:

```text
Create or update the current task note in memory/tasks using the task template. Include goal, current state, constraints, plan, open questions, and done criteria.
```

## 4. Save a Checkpoint

Suggested prompt:

```text
Create or update a checkpoint note in memory/checkpoints using the checkpoint template. Include completed work, in-progress work, next steps, risks, and a resume prompt.
```

## Optional Context Refresh

Suggested prompt:

```text
Refresh repository context with ctx, then combine it with memory before continuing the task.
```

## Project-Specific Memory Refresh

Suggested prompt:

```text
Refresh project memory for landslide-monitoring-v2-mainline: re-read docs/journal/2026-04.md only for new facts since the last checkpoint, then update the matching memory notes instead of creating duplicates.
```
