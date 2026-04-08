---
title: field-rk3568-runtime-network-baseline
type: note
tags:
- reference
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/field-rk3568-runtime-network-baseline
---

# Reference: field-rk3568-runtime-network-baseline

## Purpose

Store the current stable runtime, network, and sidecar boundary truth for the RK3568 edge gateway role.

## Commands

```text
ssh linaro@192.168.124.172
```

## Files

- `docs/unified/reports/field-rk3568-edge-runtime-network-architecture-2026-04.md`
  - authority report for runtime and networking policy
- `memory/references/field-rk3568-access-baseline.md`
  - current access and UART ingress truth

## Notes

- role:
  - `edge gateway + edge control node`
- network policy:
  - `STA first, AP fallback`
- fallback hotspot SSID:
  - `rk3568-1`
- current active UART ingress:
  - `/dev/ttyS3`
  - `115200 8N1`
- service layering:
  - Layer 0: OS/device management
  - Layer 1: southbound I/O
  - Layer 2: gateway core
  - Layer 3: local control plane
  - Layer 4: edge intelligence/UI sidecars
- hard rule:
  - display and OpenClaw are sidecars only
  - they must not block serial ingest, spool, or uplink
- redundancy principle:
  - selective layered redundancy
  - not uniform full dual-hot redundancy everywhere
