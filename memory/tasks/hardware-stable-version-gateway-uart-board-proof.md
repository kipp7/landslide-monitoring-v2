---
title: hardware-stable-version-gateway-uart-board-proof
type: note
tags:
- task
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/hardware-stable-version-gateway-uart-board-proof
---

# Task: hardware-stable-version-gateway-uart-board-proof

## Goal

Push the current hardware-stable-version command proof from source-level and broker/relay proof into real gateway/UART/board evidence without losing the existing sample-driven chain.

## Current State

- source-level total proof is already broad and sample-driven:
  - `set_config`
  - `set_sampling_interval`
  - `manual_collect`
  - `deactivate_device`
  - `reboot`
  - `restart_device`
  - `motor_start`
  - `motor_stop`
  - `buzzer_on`
  - `buzzer_off`
  - mismatch `manual_collect`
- gateway-aligned command samples and UART chunk plans already exist:
  - `docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json`
  - `docs/unified/reports/hardware-stable-version-gateway-uart-injection-readiness-latest.json`
- local broker proof is already real:
  - `docs/unified/reports/hardware-stable-version-mqtt-command-publish-proof-latest.json`
- local relay proof and relay matrix are already real:
  - `docs/unified/reports/hardware-stable-version-mqtt-to-uart-relay-proof-latest.json`
  - `docs/unified/reports/hardware-stable-version-mqtt-to-uart-relay-matrix-latest.json`
- live relay wrappers now exist:
  - `scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1`
  - `scripts/dev/stop-hardware-stable-version-mqtt-uart-relay.ps1`
  - `docs/unified/reports/hardware-stable-version-live-relay-wrapper-proof-latest.json`
- the mapped OpenHarmony sample at:
  - `F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.0`
  now builds successfully in the real container environment:
  - container: `openharmony-dev`
  - command: `cd /root/workspace/txsmartropenharmony && hb build -f`
  - result: `isoftstone-rk2206 build success`
  - outputs:
    - `/root/workspace/txsmartropenharmony/out/rk2206/isoftstone-rk2206/liteos.bin`
    - `/root/workspace/txsmartropenharmony/out/rk2206/isoftstone-rk2206/liteos.elf`
    - `/root/workspace/txsmartropenharmony/out/rk2206/isoftstone-rk2206/liteos.hex`
- the host now sees a real physical serial adapter:
  - `USB-SERIAL CH340 (COM5)`
- passive read-only probing shows traffic on `COM5`, but it currently looks like noise rather than readable UART text:
  - `docs/unified/reports/hardware-stable-version-passive-serial-probe-latest.json`
- current serial root-cause evidence points to wiring/level/target-UART mismatch rather than missing drivers:
  - `docs/unified/reports/hardware-stable-version-serial-root-cause-latest.json`

## Constraints

- do not flash firmware or write serial bytes to the currently attached unrelated board unless explicitly approved
- do not assume the newly built `liteos.bin` should be flashed until the target board identity is confirmed
- prefer passive observation first when the board identity or UART path is uncertain
- preserve the existing sample-driven proof chain instead of replacing it with ad hoc manual traffic
- current board-side blocker appears to be physical path correctness, not broker/auth/relay software
- if the attached CH340 path is not the intended command UART, do not treat noise on `COM5` as command-path failure

## Plan

- verify the intended board-side UART path, including TX/RX crossover, shared GND, voltage compatibility, and target UART selection
- confirm whether the currently connected RK2206 is the board that may receive the newly built `liteos.bin`
- keep using passive serial probing until the observed signal is readable enough to trust that the correct UART has been found
- once the correct UART path is confirmed, switch the existing relay from `file` sink to `uart-com`
- capture one aligned command end-to-end through:
  - MQTT publish
  - gateway-style relay
  - real UART write
  - board-side receive evidence
- capture one mismatch sample end-to-end through the same path and prove board-side ignore behavior
- update unified reports and journal after each real hardware boundary is crossed

## Open Questions

- is the current `CH340 (COM5)` attached to the intended command UART, or to another board/UART path
- is the currently connected RK2206 the intended flash target for the newly built `liteos.bin`
- does the target board expose readable UART text when idle, or only binary/noisy electrical patterns unless the correct pins are attached
- when the correct UART is confirmed, which first command is safest to use for real board-side proof:
  - `manual_collect`
  - `set_sampling_interval`
  - another non-destructive command

## Done When

- at least one aligned command is proven through real broker -> relay -> UART -> board receive evidence
- at least one mismatch command is proven ignored through the same real path
- the current relay wrappers can be used on the real UART path without ad hoc command reconstruction
- the unified reports and monthly journal reflect the real hardware boundary, not only software-side proof
