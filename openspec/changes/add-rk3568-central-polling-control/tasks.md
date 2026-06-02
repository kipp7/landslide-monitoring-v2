---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-central-polling-control/tasks
---

## 1. Specification

- [x] 1.1 Define RK3568 as the shared-link polling/token owner
- [x] 1.2 Define edge-node polling mode and latest-snapshot behavior
- [x] 1.3 Define poll-session closure as ACK plus target-telemetry-or-timeout
- [x] 1.4 Define operator-command priority over internal polling

## 2. Implementation

- [x] 2.1 Revert the temporary fixed-phase stagger experiment from the RK2206 sample
- [x] 2.2 Add edge uplink polling mode support in the RK2206 sample
- [x] 2.3 Add internal poll scheduler support to `services/field-gateway`
- [x] 2.4 Add poll-session state, telemetry matching, and timeout handling
- [x] 2.5 Add runtime counters / health output for poll control

## 3. Documentation

- [x] 3.1 Update `services/field-gateway/README.md`
- [x] 3.2 Update current mainline tasklist / authority note
- [x] 3.3 Record the migration boundary in the monthly journal

## 4. Verification

- [x] 4.1 Verify TypeScript build passes for `field-gateway`
- [ ] 4.2 Verify RK2206 sample still builds after uplink-mode change
- [ ] 4.3 Re-run three-node observation with polling mode enabled
