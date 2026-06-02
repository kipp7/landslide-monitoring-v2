---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-field-identity-and-naming-standard/tasks
---

## 1. Identity Standard Freeze
- [x] 1.1 Define the field business hierarchy: `region -> slope -> station -> node -> gateway`
- [x] 1.2 Freeze machine identity vs human-readable labels
- [x] 1.3 Freeze code templates and uniqueness rules for `region_code`, `slope_code`, `station_code`, `node_code`, and `gateway_code`

## 2. Lifecycle Rules
- [x] 2.1 Define which identifiers remain stable across board replacement
- [x] 2.2 Define which identifiers are regenerated when a hardware unit is replaced
- [x] 2.3 Define how repaired/reflashed/replaced boards remain attached to the same fixed monitoring point

## 3. Formal-vs-Test Separation
- [x] 3.1 Define `identity_class` values and semantics
- [x] 3.2 Define that product default views only show `identity_class=formal`
- [x] 3.3 Define how `seed`, `replay`, `rehearsal`, and `smoke_test` stay available for proof tooling without polluting product views

## 4. Near-Term Data Model Strategy
- [x] 4.1 Define which fields remain first-class now (`device_id`, `station_id`, `station_code`)
- [x] 4.2 Define which new fields land first in `metadata`
- [x] 4.3 Define the minimum searchable/indexable field set needed before large-scale rollout

## 5. API and UI Alignment
- [x] 5.1 Define which canonical identity fields APIs must expose
- [x] 5.2 Define which fields are display-first vs machine-only
- [x] 5.3 Define how current `device_name` and `legacy_device_id` remain compatibility-only

## 6. Migration Plan
- [x] 6.1 Define the transition path from `device_1..N` seed naming to formal field naming
- [x] 6.2 Define the initial rollout path for A/B/C real nodes
- [x] 6.3 Define the later rollout path for multi-region batch onboarding
