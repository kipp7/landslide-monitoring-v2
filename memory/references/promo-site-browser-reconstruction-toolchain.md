---
title: promo-site-browser-reconstruction-toolchain
type: note
tags:
- reference
- website
- frontend
- mcp
- skill
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/promo-site-browser-reconstruction-toolchain
---

# Reference: promo-site-browser-reconstruction-toolchain

## Purpose

Store the current browser-first reconstruction toolchain for rebuilding the promotional website from strong references instead of hand-waving a fresh demo from scratch.

## Current Local Tooling

Installed Codex skills:

- `frontend-skill`
  - already present in `C:\Users\Administrator\.codex\skills\frontend-skill`
  - use for art direction, hierarchy, restraint, and anti-generic landing-page rules
- `clone-website`
  - installed from `JCodesMore/ai-website-cloner-template`
  - local path: `C:\Users\Administrator\.codex\skills\clone-website`
  - purpose: turn a real site URL into extraction specs plus reconstruction workflow

Configured Codex MCP servers in `C:\Users\Administrator\.codex\config.toml`:

- `mcp-router`
  - command: `npx -y @mcp_router/cli@latest connect`
  - use as the unified remote MCP entrypoint when external MCP inventory should be centrally managed
  - token handling rule: keep `MCPR_TOKEN` in the user environment, not in repository memory notes
- `chrome-devtools`
  - command: `npx -y chrome-devtools-mcp@latest --headless --isolated --channel stable --viewport 1440x900 --no-usage-statistics`
  - use first for DOM/CSS inspection, screenshots, computed styles, and section-level extraction
- `playwright-browser`
  - command: `npx -y @playwright/mcp@latest --headless --browser chrome --caps vision pdf devtools --viewport-size 1440x900`
  - use for scroll/hover/click/viewport behavior capture and interaction replay
- `site-audit`
  - command: `npx -y lighthouse-mcp@latest`
  - use after reconstruction to catch performance/accessibility/SEO regressions before trusting a flashy page

## GitHub Sources

Primary sources currently judged useful:

- `ChromeDevTools/chrome-devtools-mcp`
- `microsoft/playwright-mcp`
- `@mcp_router/cli`
- `JCodesMore/ai-website-cloner-template`
- `obra/superpowers-chrome`
- `danielsogl/lighthouse-mcp-server`

Notes:

- `ai-website-cloner-template` is the closest thing to a real “reference site reconstruction workflow” because it ships a Codex skill specifically for cloning websites.
- `superpowers-chrome` is still useful as a browser-control option, but current local priority is `chrome-devtools` + `playwright-browser`.
- current local `site-audit` registration uses the npm package `lighthouse-mcp@latest`; if richer audit coverage is needed later, re-evaluate `danielsogl/lighthouse-mcp-server`.

## Preferred Workflow

1. Keep `mcp-router` available as the unified remote MCP entrypoint.
2. Pick one reference URL only.
3. Use browser MCP first, not screenshots alone.
4. Extract:
   - full-page screenshots
   - computed CSS
   - DOM structure
   - text content
   - hover/click/scroll behavior
   - responsive breakpoints
5. Save reconstruction facts into auditable notes or specs before rebuilding.
6. Rebuild section by section, not “整页凭感觉写”.
7. Run `site-audit` before calling a version presentable.

## Commands

```text
codex mcp list
codex mcp get mcp-router --json
codex mcp get chrome-devtools --json
codex mcp get playwright-browser --json
codex mcp get site-audit --json
```

Skill install source used for `clone-website`:

```text
python C:\Users\Administrator\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo JCodesMore/ai-website-cloner-template --ref master --path .codex/skills/clone-website --method download
```

## Files

- `C:\Users\Administrator\.codex\config.toml`
  - current Codex MCP registration source of truth
- `C:\Users\Administrator\.codex\skills\clone-website\SKILL.md`
  - installed reference-site reconstruction skill
- `C:\Users\Administrator\.codex\skills\frontend-skill\SKILL.md`
  - current frontend art-direction skill
- `memory/references/promo-site-inspiration-and-tech-direction.md`
  - website inspiration and reference-site direction note

## Notes

- Restart Codex to pick up newly installed skills cleanly.
- `mcp-router` is configured globally, but the token should remain only in user environment state.
- If a rebuild starts without browser MCP available, stop and fix tooling first.
- This toolchain exists specifically to avoid another “freehand speculative demo” pass.
