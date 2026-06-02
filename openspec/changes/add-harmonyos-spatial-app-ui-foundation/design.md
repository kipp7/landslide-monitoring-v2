---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-harmonyos-spatial-app-ui-foundation/design
---

## Context

项目当前对移动端同时存在三组冲突约束：

1. 当前文档口径仍偏 Flutter 通用巡检 App
- `apps/mobile/README.md`
- `docs/features/prd/mobile-app.md`
- `docs/features/flutter/app-architecture.md`

2. 当前产品方向已经被用户改写为 HarmonyOS App
- 不再讨论官网
- 先做页面级 UI 效果
- 目标是“先进、前沿、让人眼前一亮”

3. 当前仓库与环境约束
- 仓库里尚无 HarmonyOS App 工程
- 当前机器未发现 `hvigorw` / `ohpm` / `DevEco` 等 HarmonyOS 工具链真值
- 直接承诺“先写可运行鸿蒙工程”不诚实

因此，这一阶段最合理的落点不是立即写运行时代码，而是：

- 先定义产品真值
- 先冻结页面体系与视觉系统
- 先落高保真 UI 原型
- 再把通过评审的页面迁入 HarmonyOS 原生实现

## Product Thesis

The app is not:

- a smaller version of the desktop client
- a generic monitoring dashboard on mobile
- a marketing-style concept app

The app is:

- a HarmonyOS spatial risk operations app
- centered on incidents/events rather than device tables
- optimized for command, patrol, and explanation

Working name:

- `HarmonyOS 山体风险空间孪生指挥 App`

## Visual Thesis

One sentence:

- a calm but high-tension spatial command surface that combines terrain logic, signal pulse, and mission-critical clarity

Keywords:

- `Topographic`
- `Spatial`
- `Mission Control`
- `Industrial Glass`
- `Safety Orange`

Material feel:

- deep rock-gray base
- mist blue environmental layers
- restrained translucent panels
- orange for primary action and danger attention
- cyan / blue-green for sensor pulse and rainfall flow

Typography and surface rules:

- primary Chinese UI text should favor `HarmonyOS Sans SC` with `Noto Sans SC` fallback
- numeric status, short labels, and mission counters may use a more technical display face such as `Space Grotesk`
- glass surfaces should stay within restrained blur and translucency ranges instead of turning into decorative neon glass everywhere
- the app should keep one dominant warm action color and one cool sensor color, not expand into many competing accents

The product should feel:

- advanced
- credible
- operational
- slightly cinematic

It should not feel:

- like a generic enterprise admin app
- like a cyberpunk toy
- like a desktop page squeezed onto a phone

## Content Plan

### Primary navigation

The first version SHALL use four top-level areas:

1. `空间`
2. `事件`
3. `任务`
4. `我的`

This is deliberate:

- `空间` establishes the product identity
- `事件` becomes the operational center
- `任务` supports patrol and execution
- `我的` isolates account, notification, and environment concerns

### Core page inventory

1. Login
- brand reveal
- identity / environment selection
- secure entry

2. Spatial Home
- status strip
- terrain / spatial stage
- hotspot overlay
- bottom mission dock

3. Event Feed
- incident stream
- severity filters
- freshness cues
- quick assignment / quick ack affordances

4. Event Detail
- incident header
- cause explanation
- supporting signals
- evidence timeline
- action bar

5. Task Center
- patrol queue
- assigned incident tasks
- in-progress / overdue / completed states

6. Patrol Task Detail / Scan Entry
- route or arrival context
- checklist
- attach note / confirm arrival / scan jump

7. Device / Station Quick View
- concise identity
- current health
- last signal
- recent trend
- linked incidents

8. Profile / Settings
- identity
- permission summary
- notification tuning
- environment / debug status

## Interaction Thesis

The product SHALL rely on a small number of strong motions rather than many weak ones.

Required motion ideas:

1. scene depth entrance on `空间`
- the terrain plane, hotspot layer, and task dock should arrive in a staged reveal

2. event sheet rise
- when a hotspot is selected, the event summary should emerge from the scene instead of feeling like a route jump

3. playback scrub
- dragging the time rail should visibly change risk pulse, hotspot intensity, and event state

Rules:

- motion must improve orientation
- motion must remain smooth on handheld devices
- motion must respect reduced-motion settings
- no ornamental micro-animations without operational value

Implementation guardrails:

- each page should have at most one dominant motion focus
- space page can use layered depth and playback emphasis
- event / task / profile pages should use faster and smaller transitions than the spatial home
- reduced-motion must remain a first-class path, not a later accessibility patch

## Page Layout Decisions

### Decision: Spatial Home is the brand-defining screen

The first meaningful screen after login SHALL be `空间`, not a chart dashboard.

Composition:

- top summary strip
- central spatial stage
- bottom action dock

The first impression must answer:

- where is the risk
- how bad is it
- what should I do next

### Decision: Event pages are lighter than the spatial stage

The app SHALL avoid carrying heavy 3D or spatial overhead into routine operational pages.

Meaning:

- the spatial home may be visually rich
- event, task, and profile pages should be more restrained and dense

### Decision: Event is the primary domain object

The UI SHALL organize drill-down around incidents and response, not around static device management.

Implications:

- device detail is subordinate to event detail in the main flow
- linked devices are shown as evidence / sources within incident context

### Decision: Operational states use one shared language

The app SHALL define loading, empty, error, and offline states as first-class parts of the visual system instead of leaving each page to improvise them.

Operational rules:

- `loading` must explain what is being prepared
- `empty` must distinguish "nothing new happened" from "failed to load"
- `error` must expose source, freshness, or next action instead of only a red warning
- `offline` must explain read-only scope, last sync, and pending actions

The first prototype implementation may stage these states in a dedicated preview page, but the state language must be reusable across spatial, event, and task pages.

## HarmonyOS-Native Capability Mapping

The long-term implementation target SHOULD map product needs to HarmonyOS system abilities:

- push:
  - risk escalation notices
  - direct deep-link into incident detail
- location:
  - patrol arrival confirmation
  - geo-aware task support
- scan:
  - QR / code entry into station, device, or task
- linking:
  - notification to page
  - external structured entry into incident context

The first UI prototype SHALL leave explicit affordance placeholders for these abilities even if the prototype is not yet backed by the HarmonyOS runtime.

## Prototype Delivery Strategy

### Decision: Build a page-first high-fidelity prototype before runtime code

Because the current environment does not expose a trustworthy HarmonyOS toolchain, the first deliverable SHOULD be a high-fidelity UI prototype workspace.

The prototype SHALL:

- cover all first-wave pages
- express motion and hierarchy
- be structured so it can later be translated into HarmonyOS-native screens

The prototype SHALL NOT be misrepresented as the final HarmonyOS runtime.

### Candidate workspace placement

Preferred:

- `apps/mobile/prototype/`

Rationale:

- keeps the prototype under the mobile product area
- avoids polluting desktop or web production code
- allows a later HarmonyOS project to coexist under `apps/mobile/`

## Research Inputs

### Official HarmonyOS / Huawei references reviewed on 2026-04-20

- HUAWEI Design portal:
  - `https://developer.huawei.com/consumer/en/design/`
  - used as the official design-language anchor for HarmonyOS-facing product work
- HUAWEI Map Kit:
  - `https://developer.huawei.com/consumer/en/hms/huawei-MapKit/`
  - reinforces that the spatial home should reserve map / marker / layer style interaction entry points rather than stay as a static background illustration
- HUAWEI Scene Kit codelab:
  - `https://developer.huawei.com/consumer/en/codelab/HMSSceneKit/`
  - confirms there is a later path for real 3D scene rendering, so the first prototype should preserve a scene-oriented composition and not collapse into flat dashboard cards
- HUAWEI App Linking HarmonyOS codelab:
  - `https://developer.huawei.com/consumer/en/codelab/AppLinking-HarmonyOS/`
  - supports keeping deep-link style entry into incident detail as a first-class flow
- HUAWEI developer resource index:
  - `https://developer.huawei.com/consumer/en/develop/`
  - confirms later tooling options such as Reality Studio / Theme Studio are available, but they are not blockers for this repo-native prototype phase

### Design-system takeaways applied in this change

- from `frontend-skill`:
  - keep the first meaningful app screen as a strong visual anchor
  - avoid generic card-mosaic dashboards
  - use a small number of intentional motions
- from `ui-ux-pro-max`:
  - keep glassmorphism restrained with thin borders and moderate blur
  - use Chinese-first readable typography with a dedicated technical display face for counters and status
  - respect reduced-motion and avoid excessive parallel animation

### Installed GitHub skill

- `openai/skills` → `frontend-skill`
- installed locally to improve composition, hierarchy, restraint, and motion quality for the upcoming UI work

### Existing local skill already available

- `ui-ux-pro-max`
- useful for structured design-system generation and stack-specific UX guidance

### Candidate MCP / future workflow option

- official Figma MCP registry entry
- useful once there are real design files or token-driven asset handoff needs
- not the primary tool for this first repo-native page prototype pass

## Risks / Trade-offs

- If the UI prototype is built as a generic mobile admin app, the product direction will lose differentiation before runtime work even starts
- If the spatial stage is too heavy and repeated everywhere, the app will become impressive but unusable
- If HarmonyOS-native capability placeholders are omitted, later runtime integration may force redesign
- If the repository keeps both “Flutter utility app” and “HarmonyOS spatial app” as equal truths, future sessions will drift

## Rollout Plan

### Phase 1: Product truth and design freeze

- finalize page inventory
- freeze visual thesis
- freeze motion thesis
- freeze page responsibilities

### Phase 2: High-fidelity page prototype

- build all core pages
- build shared theme, shell, and motion primitives
- verify the app reads as one coherent system

### Phase 3: HarmonyOS-native migration planning

- map prototype screens to HarmonyOS project structure
- choose native rendering path for the spatial stage
- define system ability integration details

## Open Questions

- whether the first spatial stage should remain 2.5D only or lightly simulate 3D camera motion before native Scene Kit work starts
- whether the prototype should include a weather/rainfall environmental layer in v1
- whether device quick view belongs inside event detail only or also as a standalone task entry
