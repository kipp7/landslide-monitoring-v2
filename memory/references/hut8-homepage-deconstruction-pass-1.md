---
title: hut8-homepage-deconstruction-pass-1
type: note
tags:
- reference
- website
- frontend
- inspiration
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/hut8-homepage-deconstruction-pass-1
---

# Reference: hut8-homepage-deconstruction-pass-1

## Purpose

Capture the first browser-level deconstruction pass of `https://www.hut8.com/` so the promo-site rebuild can borrow its interaction model and layout logic without re-scanning the site from scratch.

## Why This Site

- closest current reference to the product's desired tone:
  - infrastructure
  - geospatial / systems feel
  - dark cinematic shell
  - fixed-stage storytelling instead of ordinary page sections

## First-Pass Findings

### Visual / Structural Model

- the page is not a normal flow layout
- it relies heavily on:
  - fixed layers
  - pinned panels
  - a persistent canvas/WebGL layer
  - long scroll ranges that drive state changes
- detected fixed elements include:
  - fixed logo
  - fixed menu button
  - fixed navigation shell
  - fixed canvas wrapper
  - fixed landing hero
  - multiple fixed `.sticky` sections
  - fixed timeline/business/footer blocks

### Typography

- dominant font:
  - `"ITC Franklin Gothic Std", sans-serif`
- sampled body:
  - `16px`
- sampled large heading:
  - `60px`
  - weight `400`
  - letter-spacing `-1.8px`
- overall feeling:
  - condensed industrial editorial
  - not crypto-glassy
  - not luxury-minimal

### Asset / Rendering Mix

- `img`: `3`
- `video`: `2`
- `canvas`: `1`
- `svg`: `45`
- `button`: `2`

Interpretation:

- the page leans on a hybrid stack:
  - fixed DOM shells
  - vector/UI overlays
  - one major canvas scene
  - a small number of media assets

### Interaction Model

- no evidence of Lenis / Locomotive classes in the first pass
- `scroll-behavior` sampled as `auto`
- real interaction character is not smooth-scroll branding
- real interaction character is:
  - pinned/fixed stage transitions
  - long scroll storytelling
  - layer handoff between fixed content blocks

### Content Topology

Visible content sequence in the first pass:

1. hero manifesto
2. `Power`
3. `Digital Infrastructure`
4. `Compute`
5. narrative layer:
   - `Unlocking Human Potential`
   - `Integrated Energy Infrastructure`
6. `Powering the Future`
7. business overview
8. news/footer

This is useful because it maps well to the landslide promo-site translation:

- manifesto / world
- sensing layer
- network layer
- platform layer
- trust / strategy layer
- business / deployment proof

## Second-Pass Findings

### Actual Homepage Shell

- the homepage is one long `div.wrapper-home`
  - sampled height:
    - `35095px`
- the visual shell is not built from ordinary in-flow sections
- the persistent stage is assembled from:
  - `div.canvasWrapper`
    - fixed full-viewport scene layer
  - `div.preloader`
    - fixed intro stage
  - `div.landing`
    - fixed manifesto stage
- the main narrative rail is a sequence of tall relative containers that exist mostly to drive fixed stages:
  - `div.energy`
    - starts around `1800px`
    - height `1800px`
  - `div.infrastructure`
    - starts around `6300px`
    - height `2000px`
  - `div.compute`
    - starts around `9000px`
    - height `3600px`
  - `div.driven`
    - starts around `14621px`
    - height `2500px`
  - `div.sites`
    - starts around `18121px`
    - height `2500px`
  - `div.powering`
    - starts around `24552px`
    - height `2700px`
- later stage layers are also handled as pinned/fixed modules:
  - `div.pin-wrapper`
    - fixed visual / metrics theater
  - `div.business`
    - fixed business proof chapter
  - `div.footer`
    - fixed news / footer chapter

### Section Grammar

- `Power`, `Digital Infrastructure`, and `Compute` all use the same fixed-stage grammar:
  - parent long rail:
    - `div.energy` / `div.infrastructure` / `div.compute`
  - pinned viewport stage:
    - `div.sticky`
  - content wrapper:
    - `div.sticky-container`
  - title:
    - `h2.title-section`
  - lower-left copy block:
    - `div.bottom`
- `Unlocking Human Potential` and `Integrated Energy Infrastructure` are lighter variants of the same idea:
  - long parent container
  - full-screen `div.sticky`
  - reduced copy block instead of the bigger three-layer chapter framing
- the structure is therefore:
  - one repeated pinned-stage grammar
  - not many different one-off homepage section types

### Real Handoff Order

The actual visual order is better understood as:

1. preloader / intro stage
2. fixed landing manifesto
3. `Power`
4. `Digital Infrastructure`
5. `Compute`
6. `Unlocking Human Potential`
7. `Integrated Energy Infrastructure`
8. `Powering the Future`
   - with `pin-wrapper` acting as the major pinned data / object theater
9. `Our Businesses`
10. `Featured News & Insights` + footer

Interpretation:

- the early and middle homepage is one long pinned narrative machine
- the later homepage turns into:
  - one pinned proof chapter
  - one pinned news/footer chapter
- this is why the site feels like a controlled system walkthrough instead of a conventional corporate landing page

### What This Confirms For Our Product

- we should not design the landslide promo homepage as many unrelated panels
- we should design it as:
  - one long control rail
  - driving a fixed mountain / risk stage
- the clearest direct mapping is now:
  - `Power`
    - sensing / monitoring assets
  - `Digital Infrastructure`
    - gateway / network / edge uplink
  - `Compute`
    - platform / model / command
  - `Unlocking Human Potential`
    - risk evolution / why the system matters
  - `Integrated Energy Infrastructure`
    - trusted closed-loop monitoring + warning integration
  - `pin-wrapper`
    - one pinned data-theater chapter for risk replay / terrain twin / evidence chain
  - `Our Businesses`
    - deployment capability / official solution packaging

### Stronger Borrow / Avoid Guidance

Borrow more confidently:

- one dominant fixed-stage homepage shell
- repeated chapter grammar instead of many unrelated layouts
- a later pinned data theater chapter after the platform story
- keeping proof / deployment chapters later in the sequence

Avoid more explicitly:

- copying Hut 8's investor-relations back half too literally
- using energy / compute language where we need terrain / sensing / risk semantics
- copying its typography identity line by line
- overextending the homepage with too many late-stage business catalog blocks

## Translation To Our Product

Recommended direct translation from Hut 8 structure to the landslide promo site:

1. Hut 8 hero manifesto
   - translate to:
     - digital mountain manifesto
     - “不是官网首页，而是数字山体剧场”
2. `Power / Digital Infrastructure / Compute`
   - translate to:
     - sensing
     - gateway / network
     - platform / model / command
3. narrative layer blocks
   - translate to:
     - risk signal evolution
     - trust layer
     - evidence / signed event / replay
4. business overview
   - translate to:
     - deployment capability
     - regional rollout
     - command center / official offering

What to borrow exactly:

- borrow:
  - pinned section choreography
  - fixed-canvas + DOM overlay relationship
  - restrained media count
  - infrastructure-grade dark palette
- do not borrow:
  - crypto-energy wording
  - exact typography identity
  - corporate investor-information emphasis

## Commands

```text
codex mcp list
```

Browser scan was performed with Playwright MCP against:

```text
https://www.hut8.com/
```

## Files

- `memory/tasks/rebuild-promo-site-with-browser-first-reference-toolchain.md`
  - active rebuild task
- `memory/references/promo-site-inspiration-and-tech-direction.md`
  - broader site inspiration note
- `memory/references/promo-site-browser-reconstruction-toolchain.md`
  - tooling baseline for future reconstruction passes

## Notes

- Hut 8 is a better structural reference than Apple Vision Pro for the current product because it already speaks infrastructure, platform, and systems language.
- If the next rebuild aims for “更像技术官网而不是艺术展页”, Hut 8 should stay the primary structure reference.
- If the next rebuild aims for “更强艺术冲击和实验感”, mix Hut 8 structure with Lusion-style scene drama.
