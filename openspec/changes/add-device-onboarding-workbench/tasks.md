---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-device-onboarding-workbench/tasks
---

## 1. Specification

- [x] 1.1 Define the onboarding workbench placement under `设备管理`
- [x] 1.2 Define pending observation, binding, commissioning, and audit requirements
- [x] 1.3 Define the onboarding state model and allowed transitions
- [x] 1.4 Define the `API-only` boundary for onboarding actions

## 2. UX / IA

- [x] 2.1 Finalize the secondary navigation entry and route strategy
- [x] 2.2 Finalize the four-zone page information architecture
- [x] 2.3 Map existing desk components and styles to the new page
- [x] 2.4 Define empty/error/loading states consistent with current desk patterns

## 3. Backend Contract

- [x] 3.1 Define pending observation read API
- [x] 3.2 Define bind / naming write API
- [x] 3.3 Define commissioning evidence and confirmation API
- [x] 3.4 Define onboarding audit API

## 4. Frontend Implementation

- [x] 4.1 Add a dedicated onboarding subpage under `设备管理`
- [x] 4.2 Add secondary navigation / entry from the existing device-management area
- [x] 4.3 Implement the pending queue, binding form, commissioning panel, and audit panel
- [x] 4.4 Reuse current cards, tables, forms, tags, colors, and dark theme styles

## 5. Verification

- [x] 5.1 Validate OpenSpec change with `openspec validate --strict`
- [x] 5.2 Verify desk build passes
- [x] 5.3 Verify onboarding route is reachable without breaking current `设备管理` flows
- [x] 5.4 Verify unknown devices do not auto-promote into formal product views without explicit binding
