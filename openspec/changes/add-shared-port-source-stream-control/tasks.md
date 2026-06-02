---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/tasks
---

## 1. Specification

- [x] 1.1 Define the shared southbound single-writer serialization requirement
- [x] 1.2 Define the command ACK quiet-window requirement for shared serial paths
- [x] 1.3 Define cadence staggering as secondary mitigation rather than primary closure
- [x] 1.4 Define shared-port readiness evidence using interleaving and node-status counters
- [x] 1.5 Define the implementation boundary between center XL01 source control and RK3568 gateway/runtime observation

## 2. Documentation and Authority

- [x] 2.1 Update the shared-port diagnosis authority doc so it references the new source-stream-control baseline
- [x] 2.2 Update field troubleshooting / runbook guidance to stop recommending parser-first mitigation for this class of failure
- [x] 2.3 Record the minimum acceptance evidence set for future source-side closure

## 3. Implementation

- [x] 3.1 Introduce a concrete source-side serialization strategy at the actual programmable control point adjacent to the center XL01 path
- [x] 3.2 Introduce an ACK quiet-window strategy that prevents unrelated payload injection during command closure
- [x] 3.3 Keep gateway-side counters and proofs aligned with the new source-side contract

## 4. Verification

- [ ] 4.1 Re-run shared-port observation after source-side control lands
- [ ] 4.2 Re-run command proof and confirm ACK evidence closes without shared-stream pollution
- [ ] 4.3 Re-run shared-port stagger experiment only as a secondary comparison, not as the primary closure proof
- [ ] 4.4 Refresh latest reports and confirm interleaving counters stop growing inside the accepted observation window
