---
title: rebuild-promo-site-with-browser-first-reference-toolchain
type: note
tags:
- task
- website
- frontend
- mcp
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/rebuild-promo-site-with-browser-first-reference-toolchain
---

# Task: rebuild-promo-site-with-browser-first-reference-toolchain

## Goal

Rebuild the standalone promotional website in a way that is visibly reference-driven, technically inspectable, and good enough to survive direct comparison with the selected inspiration sites.

## Current State

- `apps/promo-demo/` remains the single working surface for promo-site experimentation.
- the previous abstract center-object direction has been abandoned for this pass.
- current implementation shell still stays in:
  - `Vue 3 + Vite + Three.js + GSAP`
- current demo direction has been reset from multi-section scrollytelling to a single-screen 3D monitoring map.
- current live scene is now intentionally legible:
  - mountain terrain
  - village / houses
  - road network
  - monitoring stations
  - command center
  - risk slope / warning zone
  - station-to-command links
- current interaction model is now 4 explicit map modes instead of chapter scrolling:
  - `总览`
  - `站点`
  - `监测`
  - `预警`
- latest scene pass has now upgraded the environment layer:
  - terrain vertex-color stratification
  - retaining wall / service pad
  - pine-tree vegetation
  - rock field near the alert slope
  - backdrop mountain silhouettes
  - low ground mist bands
- latest village pass also upgraded the house primitives:
  - slab
  - annex volume
  - chimney
- alert mode has been rebalanced once:
  - critical station remains the focal hotspot
  - non-critical stations now retreat more into the support network
- UI chrome has been compressed into:
  - one top status bar
  - one slim right HUD
  - one bottom mode dock
- the user request for "先把各种文字拿走，先把模型建好" is now reflected in the implementation:
  - copy reduced to minimal labels, metrics, and station status rows
  - the scene now carries the primary meaning
- `createPromoScene.ts` has now been rewritten around a map-readable object model instead of the earlier glowing abstract mother-object.
- local preview validation is now being done on:
  - `http://127.0.0.1:4180/`
- `npm --prefix apps/promo-demo run build` currently passes on the new map version
- first reconstruction target has now been selected and scanned:
  - `https://www.hut8.com/`
  - findings stored in `memory/references/hut8-homepage-deconstruction-pass-1.md`
- Hut 8 has now been pushed past first impressions into section-level structure facts:
  - real parent container order
  - fixed/sticky chapter grammar
  - later pinned business / footer handoff
- secondary reference has now also been scanned:
  - `https://lusion.co/`
  - findings stored in `memory/references/lusion-homepage-deconstruction-pass-1.md`
- current hybrid direction is now explicit:
  - `Hut 8`
    - structure / homepage skeleton
  - `Lusion`
    - scene method / canvas drama / giant type
- current direction has now changed again from "继续打磨地图单屏" to:
  - `reference-first rebuild`
  - clone the Hut 8 homepage shell first
  - then inject landslide-monitoring product semantics into that shell
- the locked map scene has now been migrated onto:
  - `@tresjs/core`
  - `TresCanvas`
  - a custom Tres runtime host using `useTresContext()` and `useLoop()`
- current scene controller is now centered in:
  - `apps/promo-demo/src/composables/usePromoTwinScene.ts`
- the old scene entrypoint has been collapsed into a compatibility re-export:
  - `apps/promo-demo/src/lib/createPromoScene.ts`
- the current digital-twin detail layer now includes:
  - roadside guardrails
  - utility poles and hanging feeder lines
  - slope-foot gabions / drainage channel / culvert pipes / anchor heads
  - service-pad fence / equipment cabinets / solar rack
  - road centerline markings
- current validation surface has moved from dev-only checking to explicit preview verification:
  - `http://127.0.0.1:4181/`
- current preview check has now passed with:
  - no console warnings
  - working mode switching
  - working boost trigger
- OpenSpec change validation currently passes:
  - `openspec validate update-promo-demo-tres-digital-twin --strict`
- one remaining technical debt item is now explicit:
  - `PromoScene` bundle size is still above Vite's default chunk warning threshold because the scene runtime is intentionally heavy
- Hut 8 research artifacts have now been expanded inside the repo:
  - `docs/research/hut8/PAGE_TOPOLOGY.md`
  - `docs/research/hut8/BEHAVIORS.md`
  - `docs/research/components/hut8/global-shell.spec.md`
  - `docs/research/components/hut8/hero-landing.spec.md`
  - `docs/research/components/hut8/chapter-shell.spec.md`
- a new OpenSpec change is now active for the clone-base direction:
  - `openspec/changes/update-promo-demo-hut8-clone-base/`
- current promo-demo shell has now been replaced once with a Hut 8 style homepage frame:
  - fixed top nav
  - overlay menu drawer
  - landing hero
  - three repeated sticky chapters
  - proof / business / footer sections
  - current `PromoScene` reused as the fixed background stage
- current shell has now been torn down and rebuilt again:
  - all homepage copy replaced
  - old low-poly mountain village scene replaced
  - new stage is now centered on:
    - terrain core slices
    - perimeter towers
    - link arcs
    - floating data blades
    - warning rings / replay theater geometry
- current promo language has now switched to a cleaner editorial stack:
  - `WHEN TERRAIN BECOMES SIGNAL`
  - `SENSING`
  - `FABRIC`
  - `COMMAND`
  - `WARNING`
  - `REPLAY`
- current local validation surface for the new clone-base shell is now:
  - `http://127.0.0.1:4190/`
- build validation for the new shell currently passes:
  - `npm --prefix apps/promo-demo run build`
- build validation after the full teardown-and-rebuild pass still passes:
  - `npm --prefix apps/promo-demo run build`
- current saved comparison artifacts now include:
  - `docs/design-references/hut8/hut8-home-desktop.png`
  - `docs/design-references/hut8/promo-clone-pass-hero.png`
  - `docs/design-references/hut8/promo-clone-pass-signal.png`
  - `docs/design-references/hut8/promo-clone-pass-proof.png`
  - `docs/design-references/hut8/promo-clone-pass-footer.png`
- current rebuilt pass screenshots now also include:
  - `docs/design-references/hut8/promo-rebuild-hero-v2.png`
  - `docs/design-references/hut8/promo-rebuild-trilogy-v2.png`
  - `docs/design-references/hut8/promo-rebuild-proof-v2.png`
- Local browser-first tooling has now been prepared:
  - unified MCP entrypoint:
    - `mcp-router`
  - MCP:
    - `chrome-devtools`
    - `playwright-browser`
    - `site-audit`
  - skills:
    - `frontend-skill`
    - `clone-website`
- Durable tooling reference is stored in:
  - `memory/references/promo-site-browser-reconstruction-toolchain.md`

## Constraints

- current work remains independent from `apps/web` and desktop clients unless the user explicitly changes scope
- later written docs should stay in Chinese
- browser reconstruction quality matters more than rapid speculative coding
- `clone-website` skill requires Codex restart to be picked up reliably

## Plan

- keep `Hut 8` as the active homepage mother template until the user explicitly replaces it
- keep `Lusion` only as a local motion / scene language reference
- keep browser-first reconstruction as the default method
- next concrete upgrade path should be:
  - continue tightening Hut 8 shell fidelity section by section
  - reduce overlap/jitter between sticky chapter transitions
  - deepen the proof / data-theater chapter with the current Tres stage
  - only after the shell is stable, decide whether to split the page into more reusable Vue components
- next concrete upgrade path should now bias toward:
  - stronger scene material contrast and focal lighting
  - more accurate replay / proof chapter timing
  - cleaner section switching and active-nav synchronization

## Open Questions

- whether the next pass should continue on:
  - stricter Hut 8 visual fidelity
  - or chapter-by-chapter custom differentiation after the clone base is accepted
- whether the next 3D investment should focus on:
  - proof/data-theater chapter only
  - or a stronger full-homepage scene script

Current recommendation:

- keep the current `apps/promo-demo` + `TresCanvas` stack as the background-stage runtime
- do not restart homepage architecture again before the user evaluates the new Hut 8 clone base
- keep scene work subordinate to homepage shell fidelity until the new shell is accepted

## Done When

- primary and secondary reference sites have both been decomposed with browser tooling
- the next promo-site iteration is built from extracted Hut 8 structure facts instead of guesswork
- the current demo exists as a running Hut 8 style homepage shell with the current 3D map as fixed stage
- the user accepts the current clone-base direction as the new baseline for further refinement
