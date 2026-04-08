---
title: field-rk3568-access-baseline
type: note
tags:
- reference
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/field-rk3568-access-baseline
---

# Reference: field-rk3568-access-baseline

## Purpose

Store the current safe-to-share access baseline for the field RK3568 gateway board so later sessions can resume gateway work without re-deriving network access facts.

## Commands

```text
ssh linaro@192.168.124.172
ping 192.168.124.172
```

## Files

- `docs/journal/2026-04.md`
  - chronological record of when the RK3568 access baseline was established
- `memory/tasks/field-uplink-platform-closure.md`
  - active task context that now includes the gateway access fact

## Notes

- board role:
  - `RK3568 field gateway candidate`
- current network fact:
  - same WLAN as the operator workstation
  - IPv4 address: `192.168.124.172`
- current login fact:
  - SSH user: `linaro`
  - auth mode in use right now: `password`
- secret handling:
  - do not commit the plaintext password into repo memory or journal
  - rotate the default password and migrate to SSH key auth before long-running field use
- operational implication:
  - the next gateway skeleton work can proceed over LAN SSH once `sshd` remains available on the board
- confirmed UART ingress fact on the RK3568 host:
  - active UART device: `/dev/ttyS3`
  - required serial settings: `115200 8N1`
  - current observed payload shape:
    - standard JSON telemetry with:
      - `schema_version`
      - `device_id`
      - `seq`
      - `metrics`
      - `meta`
  - this means:
    - `RK2206 -> XL01 -> center node XL01 -> RK3568 ttyS3`
      is now observable directly from Ubuntu
