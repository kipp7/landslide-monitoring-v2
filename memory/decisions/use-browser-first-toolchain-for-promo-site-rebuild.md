---
title: use-browser-first-toolchain-for-promo-site-rebuild
type: note
tags:
- decision
- website
- frontend
- mcp
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-browser-first-toolchain-for-promo-site-rebuild
---

# Decision: use-browser-first-toolchain-for-promo-site-rebuild

## Context

The first standalone promo-site demo was not accepted. The core failure was not minor styling quality; it was the method. Building a high-visibility promotional website from scratch without a real browser-driven extraction workflow led to a visually arbitrary result instead of a defensible reconstruction of the chosen references.

## Decision

Future promo-site rebuild work SHALL use a browser-first reconstruction workflow instead of freehand greenfield guessing.

The current baseline stack is:

- `chrome-devtools-mcp`
- `playwright-mcp`
- `lighthouse-mcp`
- Codex skills:
  - `frontend-skill`
  - `clone-website`

## Rationale

- A flashy reference-led site must be decomposed from the live browser, not inferred from memory.
- CSS values, spacing, breakpoints, sticky behavior, and scroll choreography are all easy to misread without browser instrumentation.
- This stack separates concerns:
  - DevTools MCP for structure and computed styles
  - Playwright MCP for interaction and responsiveness
  - Lighthouse MCP for post-build quality gates
  - Skills for workflow guidance and design discipline

## Consequences

What gets easier:

- reverse-engineering strong references
- keeping rebuild work auditable
- catching interaction and performance regressions early

What gets harder:

- there is now mandatory extraction work before UI coding
- rebuild speed is slower at the start of each reference

What is deferred:

- any new promo-site pass that starts from “just make it cooler” without a selected reference and browser extraction

## Follow-up

- choose one reference site as the first reconstruction target
- restart Codex so the newly installed `clone-website` skill is picked up
- run the next promo-site pass with the browser-first stack as the default method
