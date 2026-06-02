---
title: lusion-homepage-deconstruction-pass-1
type: note
tags:
- reference
- website
- frontend
- inspiration
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/lusion-homepage-deconstruction-pass-1
---

# Reference: lusion-homepage-deconstruction-pass-1

## Purpose

Capture the first browser-level deconstruction pass of `https://lusion.co/` so the promo-site rebuild can borrow its scene logic and interaction character without misreading it as a normal marketing site.

## Why This Site

- it is useful as a scene / motion / theater reference
- it is not useful as a direct information architecture reference
- the site is much closer to:
  - an interactive stage
  - a studio showcase
  - a controlled canvas-driven scroll performance
- than to:
  - a product credibility site
  - a technical solution homepage

## First-Pass Findings

### Actual Page Shell

- the homepage is not built on normal document scroll
- sampled browser facts:
  - `html` overflow:
    - `hidden`
  - `body` overflow:
    - `hidden`
  - sampled `html` / `body` height:
    - `900px`
- the visual system is assembled from fixed full-screen layers:
  - `canvas#canvas`
    - fixed viewport scene layer
  - `div#ui`
    - fixed overlay shell
    - sampled height:
      - about `50973px`
  - `header#header`
    - fixed command rail
  - `div#scroll-indicator`
    - fixed right-edge scroll cue
  - `canvas#transition-overlay`
    - fixed transition layer
  - `div#video-overlay`
    - fixed media control layer
- the real content rail lives inside:
  - `div#page-container`
    - inside `div#ui`
    - sampled height:
      - about `50973px`
- keyboard scroll interaction changes the container transform directly:
  - sampled state after one `PageDown`:
    - `matrix(1, 0, 0, 1, 0, -900)`

Interpretation:

- this is a self-managed full-screen stage
- not a native page that simply scrolls downward

### Asset / Rendering Mix

- `img`: `0`
- `video`: `0`
- `canvas`: `3`
- `svg`: `41`
- `button`: `12`

Interpretation:

- the homepage relies much more on:
  - canvases
  - vector/UI fragments
  - DOM typography
- than on conventional image stacks

### Section Topology

Main section order sampled from `#page-container`:

1. hero stage
   - `.section`
   - about `900px`
   - contains:
     - `h1`
     - `SCROLL TO EXPLORE`
2. manifesto / positioning chapter
   - `.section`
   - starts around `900px`
   - height about `2533px`
   - contains giant `h4`
3. featured work chapter
   - `.section`
   - starts around `3433px`
   - height about `3321px`
   - contains project links / project wall
4. long scene runway
   - `.section`
   - starts around `6754px`
   - height about `39855px`
   - visually this reads as the giant immersive handoff zone
5. CTA chapter
   - `.section`
   - starts around `46610px`
   - height about `3150px`
6. contact / footer chapter
   - `.section`
   - starts around `49760px`
   - height about `900px`
7. next-page cue
   - `.section`
   - starts around `50660px`
   - height about `313px`

Interpretation:

- the homepage spends a very long amount of narrative budget on scene runway
- it is not trying to explain a platform clearly section by section
- it is trying to hold the visitor inside a studio atmosphere

### Visual Language

- dominant font:
  - `Aeonik`
- sampled hero `h1`:
  - `36px`
  - weight `400`
- sampled giant manifesto `h4`:
  - `144px`
  - weight `400`
  - letter-spacing `-2.88px`
- sampled palette is very restrained:
  - `rgb(0, 0, 0)`
  - `rgb(255, 255, 255)`
  - `rgb(240, 241, 250)`
  - transparent layers
- the visual aggression comes less from color and more from:
  - giant editorial type
  - duplicated letterforms
  - fixed edge UI
  - canvas-led transitions

### Interaction Character

- homepage behavior is closer to:
  - scene stepping
  - custom translation of a giant content rail
  - fixed-stage immersion
- not closer to:
  - standard long-form article scrolling
  - block-based enterprise site navigation
- the header behaves like a fixed control rail rather than a quiet top nav
- the project list behaves like a portfolio stream, not a product chapter system
- the right-edge scroll indicator reinforces that the site wants the visitor to feel “inside a mechanism”

### Mother-Object Judgment

- the homepage does not read as one single persistent mother-object in the same clean way that a pure hero-object site would
- it reads as:
  - fixed scene stage
  - editorial typography
  - project-wall / showcase progression
- so for our purposes:
  - `Lusion` is better used as a scene-language reference
  - not as a whole-homepage content architecture reference

## Translation To Our Product

What is worth borrowing:

- `fixed canvas + DOM overlay` as a stage technique
- one dramatic edge-controlled scroll cue
- giant editorial typography for one manifesto chapter
- using one high-impact 3D mountain / risk-core object as the memorable scene anchor
- using long scene runway only where we really want an immersive chapter

What should not be copied directly:

- the homepage project wall / studio portfolio backbone
- full-site `overflow: hidden` + custom scroll as the default everywhere
- duplicated letterform gimmicks across the whole site
- agency-style menu / contact / newsletter weight in the header
- turning our product story into a studio self-promotion site

## Recommended Role In Our Rebuild

- keep `Hut 8` as the structure reference
- keep `Lusion` as the scene-method reference
- if we borrow `Lusion`, borrow it in one concentrated place:
  - hero
  - one pinned 3D scene chapter
  - one dramatic CTA transition
- do not let `Lusion` dictate the whole homepage information architecture

## Commands

```text
https://lusion.co/
```

Browser inspection used:

- Chrome DevTools MCP
- Playwright MCP

## Files

- `memory/references/hut8-homepage-deconstruction-pass-1.md`
  - primary structure reference
- `memory/references/promo-site-inspiration-and-tech-direction.md`
  - broader website direction note
- `memory/tasks/rebuild-promo-site-with-browser-first-reference-toolchain.md`
  - active rebuild task

## Notes

- `Lusion` is excellent for reminding us that the homepage can feel like a controlled instrument, not a regular page.
- `Lusion` is poor as a direct homepage skeleton for a monitoring platform because too much of the narrative budget is spent on studio self-presentation and showcase rhythm.
