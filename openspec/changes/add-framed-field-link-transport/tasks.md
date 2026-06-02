---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-framed-field-link-transport/tasks
---

## 1. Specification

- [x] 1.1 Define explicit field-link frame types for telemetry, command, ack, and control
- [x] 1.2 Define link-level sequence and CRC requirements
- [x] 1.3 Define stop-and-wait command closure on shared southbound links
- [x] 1.4 Define source-adjacent telemetry buffering as a required contract

## 2. Implementation

- [x] 2.1 Add configurable `FIELD_LINK_MODE` to `services/field-gateway`
- [x] 2.2 Add `cobs-crc-v1` frame encode/decode support in `services/field-gateway`
- [x] 2.3 Route southbound command writes through framed transport when the mode is enabled
- [x] 2.4 Enforce inbound frame-type checks for telemetry and ack payloads
- [ ] 2.5 Add runtime counters and proofs for framed transport acceptance
- [ ] 2.6 Add source-side buffering implementation at the center-adjacent control point

## 3. Verification

- [ ] 3.1 Build and lint `@lsmv2/field-gateway`
- [ ] 3.2 Validate `raw-json` mode remains backward compatible
- [ ] 3.3 Validate `cobs-crc-v1` mode with a framed link peer
