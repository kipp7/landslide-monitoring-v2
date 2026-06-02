---
title: TEAM_RULES
type: note
permalink: landslide-monitoring-v2-mainline/memory/team-rules
---

﻿# Team Memory Rules

## Purpose

This repository uses `memory/` as a shared, reviewable knowledge layer for the team.

## What To Commit

Commit:

- `memory/decisions/`
- `memory/tasks/`
- `memory/checkpoints/`
- `memory/references/`
- `memory/_templates/`
- `WORKSPACE.md`
- `WORKFLOWS.md`
- `context.yaml`

Do not commit:

- `.bm-state/`
- `.context/`
- local logs

## Naming Rules

- Use stable, descriptive titles.
- Prefer one note per durable topic.
- Update an existing note instead of creating a close variant.
- Keep filenames and titles aligned.

## Content Rules

- Decision notes must explain reasoning and tradeoffs.
- Task notes must state goal, constraints, and done criteria.
- Checkpoint notes must be resumable by someone else without hidden context.
- Reference notes should contain stable commands or operating knowledge, not transient chat logs.

## Safety Rules

- Do not store secrets, tokens, credentials, or private customer data in `memory/`.
- Prefer verified repository facts over memory when they conflict.