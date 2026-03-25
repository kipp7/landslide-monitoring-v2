<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Project Journal Rules

- When working in a parallel worktree, update the current worktree journal first; if the progress has not yet been merged or committed on the mainline, also sync the facts into the mainline `docs/journal/YYYY-MM.md` before treating the mainline as up to date.
- After each completed task, append the exact final CLI response to the current monthly journal under a clearly labeled `CLI 最终输出原文` section. Do not rewrite or summarize that final response.
- Treat `docs/journal/README.md` as the formatting source of truth for every CLI window.
