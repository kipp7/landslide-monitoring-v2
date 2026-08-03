---
version: alpha
name: Landslide Field Situation Terminal
description: HarmonyOS mobile design system for landslide monitoring, alert response, and bounded Hermes edge tasks.
colors:
  primary: "#173D32"
  primary-soft: "#EAF1ED"
  page: "#F4F6F5"
  surface: "#FFFFFF"
  surface-alt: "#F8FAF9"
  text: "#18212B"
  text-secondary: "#52606D"
  muted: "#6C7782"
  subtle: "#8A949E"
  line: "#E2E8E5"
  accent: "#E46D35"
  accent-soft: "#F8ECE6"
  success: "#3C9D82"
  success-soft: "#E8F3EF"
  warning: "#A66021"
  warning-soft: "#FFF3E0"
  danger: "#B44832"
  danger-soft: "#F7E9E5"
  info: "#477B96"
  info-soft: "#EDF3F6"
typography:
  page-title:
    fontFamily: HarmonyOS Sans SC
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0px
  section-title:
    fontFamily: HarmonyOS Sans SC
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: 0px
  body:
    fontFamily: HarmonyOS Sans SC
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  metadata:
    fontFamily: HarmonyOS Sans SC
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0px
  control-label:
    fontFamily: HarmonyOS Sans SC
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0px
  button:
    fontFamily: HarmonyOS Sans SC
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0px
  metric:
    fontFamily: HarmonyOS Sans SC
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0px
spacing:
  micro: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  page-gutter: 16px
  touch-min: 44px
rounded:
  compact: 6px
  surface: 8px
  chat: 18px
  composer: 24px
  full: 9999px
components:
  page:
    backgroundColor: "{colors.page}"
    textColor: "{colors.text}"
    padding: "{spacing.page-gutter}"
  surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.surface}"
    height: "{spacing.touch-min}"
  button-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.surface}"
    height: "{spacing.touch-min}"
  input:
    backgroundColor: "#E8EEEB"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    height: "50px"
  status-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "{spacing.md}"
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "{spacing.md}"
  chat-composer:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.composer}"
    height: "52px"
  navigation-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.surface}"
  segment-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.control-label}"
    rounded: "{rounded.compact}"
    height: "{spacing.touch-min}"
  segment-rest:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.control-label}"
    rounded: "{rounded.compact}"
    height: "{spacing.touch-min}"
  filter-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
    typography: "{typography.control-label}"
    rounded: "{rounded.surface}"
    height: "{spacing.touch-min}"
  state-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "{spacing.lg}"
  settings-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    height: "72px"
  alert-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "{spacing.md}"
  navigation-badge:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.metadata}"
    rounded: "{rounded.full}"
  secondary-text:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
  metadata-text:
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
  disabled-text:
    textColor: "{colors.subtle}"
    typography: "{typography.metadata}"
  divider:
    backgroundColor: "{colors.line}"
    height: "1px"
  chart-accent-line:
    backgroundColor: "{colors.accent}"
    height: "2px"
  chart-accent-range:
    backgroundColor: "{colors.accent-soft}"
    height: "8px"
  status-success-dot:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.full}"
    size: "8px"
  status-success-surface:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  status-warning-dot:
    backgroundColor: "{colors.warning}"
    rounded: "{rounded.full}"
    size: "8px"
  status-danger-dot:
    backgroundColor: "{colors.danger}"
    rounded: "{rounded.full}"
    size: "8px"
  status-info-dot:
    backgroundColor: "{colors.info}"
    rounded: "{rounded.full}"
    size: "8px"
  status-info-surface:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
---

# Landslide Field Situation Terminal

## Overview

This is an **Operate** interface for Chinese-speaking competition presenters,
monitoring operators, and field personnel. It must feel calm, vigilant, and
evidence-led: a mature field instrument rather than a generic admin dashboard,
marketing page, or science-fiction AI demo.

Users must be able to scan current risk, A/B/C node health, data age, location,
and the result of bounded Hermes tasks outdoors, under time pressure, and with
one hand. Normal operation stays quiet. Real alarms, communication loss, stale
data, and unavailable evidence become unmistakable without decorative alarmism.

## Colors

The palette combines high-contrast cool neutrals with a restrained mineral
green. Semantic colors describe actual state and are never decorative.

- **Primary ({colors.primary}):** navigation, selected modes, and the main safe
  action. Do not use it as a generic card tint.
- **Text ({colors.text}):** headlines, data, and body copy on light surfaces.
- **Page ({colors.page}):** the cool off-white App background.
- **Success ({colors.success}):** confirmed online, live, or completed states.
- **Warning ({colors.warning}):** offline nodes, stale evidence, and conditions
  requiring attention without an active landslide alarm.
- **Danger ({colors.danger}):** active high-risk alarms and failed safety paths.
- **Info ({colors.info}):** neutral operational information and measurements.
- **Accent ({colors.accent}):** the product mark and selected chart emphasis,
  not a substitute for warning or danger.

Color is never the only status indicator. Pair it with Chinese state text,
timestamps, icons, or counts. Body text and component text/background pairs
must maintain WCAG AA contrast.

## Typography

Use the native HarmonyOS Chinese system face for complete glyph coverage,
instant rendering, and platform consistency. The token dimensions use `px`
because the alpha DESIGN.md schema does not accept ArkUI units; implementation
maps the same numeric values to ArkUI `fp` for type and `vp` for geometry.

- **Page titles:** 22, bold, compact, and literal.
- **Section titles:** 17, bold, with more space above than below.
- **Body:** 14 minimum for operational content.
- **Metadata:** 12 for timestamps and provenance; never use it for required
  actions or primary evidence.
- **Control labels:** 13 medium for segmented controls, filter chips, and
  compact secondary actions; their touch surface remains at least 44 units.
- **Metrics:** 30 only for the most important current value. Dense cards and
  sidebars use smaller type.
- Letter spacing is always `0`; hierarchy comes from size and weight.

## Layout

Use a 4-unit base with 8/12/16/24/32 spacing rhythm and a 16-unit page gutter.
Every interactive target is at least 44 by 44. Layouts must remain stable when
data updates so polling does not move scroll position or resize controls.

Information order is operational:

1. Overview: active risk or node communication loss, then operability and data
   freshness, then trends and upload volume.
2. Stations: distribution map, selected monitoring region, then concise node
   evidence.
3. Device: live provenance, current values, then date-qualified history.
4. Hermes: conversation first, bounded tools progressively disclosed, planner
   source and RK3568 execution evidence visible.
5. My: preferences and diagnostics grouped as settings; destructive account or
   server actions use explicit language.

Prefer unframed information bands, lists, and dividers. Cards are reserved for
actionable status, repeated entities, maps, charts, and grouped settings. Never
nest cards.

## Elevation & Depth

The App is predominantly flat. Hierarchy comes from tonal layers, spacing,
dividers, and semantic borders rather than decorative shadows. Page background
uses {colors.page}; primary content uses {colors.surface}. Do not combine a
border with a wide shadow on the same surface.

## Shapes

Operational surfaces and rectangular controls use {rounded.surface}. Compact
tags use {rounded.compact}. Chat bubbles and the composer may use the larger
chat-specific radii. Full pills are limited to small status chips and circular
icon controls, not ordinary text commands.

## Components

- **Page header:** literal 22-unit title, concise freshness or source subtitle,
  and one 44-unit refresh control.
- **Status surface:** one headline, one evidence line, and the next correct
  action. Active alarm routes to Alerts; offline-node attention routes to
  Stations. Never claim the system is stable when nodes are offline.
- **Node row:** Chinese node name, device role, connectivity, latest evidence,
  and data age. Missing values render as unavailable, never as zero.
- **Trend chart:** label metric, unit, sample count, date-qualified start/end,
  minimum, maximum, and interval change. Do not connect unavailable data as if
  it were continuous evidence.
- **Hermes message:** distinguish user and assistant authors visually; expose
  model planning, deterministic fallback, task state, and edge evidence without
  turning the conversation into a dashboard.
- **Buttons:** use symbols for familiar icon-only actions and explicit Chinese
  labels for commands. Every unfamiliar icon has accessibility text.
- **Settings group:** grouped rows may use one containing surface with dividers;
  rows inside are not independent nested cards.
- **Segmented controls:** use three equal-width 44-unit options for alert status
  and device history range. Selection uses surface contrast, weight, and an
  accessibility state rather than color alone.
- **Operational state panel:** loading, empty, offline, and recovery states use
  one icon or progress indicator, one literal title, one recovery explanation,
  and at most one working action.
- **Alert triage:** activity status and severity are separate controls. Sort
  severe alerts before recent alerts, name the source node, and keep event
  evidence grouped below the selected alert.
- **Motion:** use 160 ms for control feedback, 180 ms for selection,
  disclosure, and chat-message arrival, and 220 ms for the interruptive alert
  overlay. Use ease-out with opacity and small translation or scale changes.
  Never animate polling data, card dimensions, maps, or normal status dots.

## Do's and Don'ts

- Do put risk, offline nodes, data age, and recovery actions before volume data.
- Do distinguish live, cached, stale, unavailable, model-planned, rule-planned,
  and RK3568-executed states in plain Chinese.
- Do preserve ArkUI navigation, cache behavior, SSE alerts, map behavior, and
  API contracts while refining presentation.
- Do expose real settings as native switches, and require confirmation before
  switching servers, clearing a session, or logging out.
- Do keep active alerts cached and streamed separately from acknowledged and
  resolved history queries.
- Do format large counts for scanning and qualify multi-day chart times with a
  date.
- Don't fabricate live values, connectivity, GPS, conductivity, or AI evidence.
- Don't use identical metric-card grids, nested cards, gradients, glass effects,
  decorative shadows, colored side stripes, or ornamental motion.
- Don't use gray text on semantic colored backgrounds; use high-contrast text
  or a tone derived from that semantic family.
- Don't expose model credentials, unrestricted device control, or physical
  alarm authority in the App.
