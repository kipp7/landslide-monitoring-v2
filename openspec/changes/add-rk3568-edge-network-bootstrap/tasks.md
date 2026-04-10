---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-network-bootstrap/tasks
---

## 1. Specification

- [ ] 1.1 Define RK3568 startup network order: local services first, STA attempt second, AP fallback last
- [ ] 1.2 Define fixed maintenance hotspot policy and operator expectations for `rk3568-1`
- [ ] 1.3 Define separation between gateway core, network/bootstrap manager, and sidecars
- [ ] 1.4 Define health/recovery evidence required before the runtime line is considered production-ready
- [ ] 1.5 Reserve a read-only `OpenClaw` quality-monitor sidecar boundary for future RK3568 deployment
- [ ] 1.6 Reserve a software-side `RK3568` group status monitoring boundary based on stable board/runtime facts

## 2. Implementation

- [ ] 2.1 Add deployable RK3568 network/bootstrap service assets under `services/field-gateway/deploy/`
- [ ] 2.2 Add install/update path for the bootstrap service from the Windows host scripts
- [ ] 2.3 Add a runtime check script that can verify STA success, AP fallback state, and gateway process readiness
- [ ] 2.4 Update runbook and operator commands to use the new bootstrap line without manual shell steps

## 3. Verification

- [ ] 3.1 Prove the host can install/update the bootstrap assets onto RK3568
- [ ] 3.2 Prove a normal boot lands in STA-connected mode and keeps `lsmv2-field-gateway.service` healthy
- [ ] 3.3 Prove a no-network condition lands in AP fallback mode with hotspot name `rk3568-1`
- [ ] 3.4 Record structured latest evidence for the productionized RK3568 startup line
