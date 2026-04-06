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
- the board has now been flashed once successfully via Rockchip `RKDevTool` in `MASKROM` mode
- post-flash passive boot logs on `COM5` at `115200` confirm the firmware is running and emitting readable console text
- the first flashed runtime exposed a real on-device blocker:
  - `ProcessTask` repeated `stack overflow!`
- a follow-up source fix has already been applied in:
  - `vendor/isoftstone/rk2206/samples/xl01_landslide_monitor_v1.0/main/landslide_main.c`
  by raising `ProcessTask` stack size from `2048` to `4096`
- the fixed image has been rebuilt successfully and is ready for reflash
- the fixed image has now been reflashed and validated on-device:
  - `ProcessTask` no longer reports repeated `stack overflow!`
  - boot reaches stable task startup including:
    - `Data Process started`
    - `Sensor Collection started`
    - `Data Upload started`
- current live blockers have shifted to runtime integration issues:
  - repeated `MPU6050 I2C read failed (ret=-1)`
  - upload path shows retry logs due to missing ACK / link-side response
- to remove non-essential hardware blockers during proof rehearsal, the sample has now been switched to a no-sensor rehearsal profile:
  - `ENABLE_GPS=0`
  - `ENABLE_MPU6050=0`
  - `ENABLE_VIRTUAL=1`
  - `ENABLE_ACK_CHECK=0`
- the no-sensor rehearsal image has been rebuilt successfully and is ready to flash
- the no-sensor rehearsal image has now been flashed and observed on-device
- current serial output confirms the board is emitting stable virtual telemetry such as:
  - `[SEND #111] 511 bytes ... (sent)`
  - `Temp:20.0... Humi:54.1% Tilt:29.60... GPS:(22.544109,114.059006)`
- the prior blockers are no longer present in the latest observed runtime slice:
  - no repeated `MPU6050 I2C read failed`
  - no `No ACK after 3 retries`
  - no `ProcessTask stack overflow`
- this means the firmware mainline can now be exercised on real hardware without physical sensors attached, as long as claims stay scoped to virtual-data / command-path proof rather than real-sensor proof
- the host now sees a real physical serial adapter:
  - `USB-SERIAL CH340 (COM5)`
- current hardware truth is now narrowed further:
  - `COM5` is the board log/debug port and should be treated as read-only observation
  - the real command ingress remains the board-side XL01 wired to `PB2/PB3 (EUART2_M1)`
  - the missing physical leg is the peer XL01 side on the host/gateway
- peer-side command/relay wrappers now exist to make that topology explicit and prevent accidental writes to the log port:
  - `scripts/dev/send-hardware-stable-version-xl01-peer-command.ps1`
  - `scripts/dev/start-hardware-stable-version-xl01-peer-relay.ps1`
- the peer-side wrapper dry-run has been verified:
  - direct sample injection can target a peer port such as `COM9` while separately documenting `COM5` as the board log port
  - MQTT relay dry-run resolves to `cmd/00000000-0000-0000-0000-000000000001` and now redacts the relay password in wrapper output
- the Windows CH340 conflict has now been fixed locally:
  - root cause was a second CH340 device instance also assigned `PortName=COM5`
  - the failing instance had `Problem Code 31` with `Problem Status 0xC0000035`, i.e. object-name collision
  - the second CH340 instance was reassigned from `COM5` to `COM9` and restarted successfully
  - current visible ports are now:
    - `COM5`
    - `COM9`
- later host-side verification refined the real port mapping:
  - `COM9` is the center-node XL01 adapter on the host
  - `COM5` is the board-side XL01 adapter when directly attached for configuration
- the XL01 pairing/network side is now materially validated:
  - `COM5` module has been identified as node `0003` (sub-node / board side)
  - `COM9` module has been identified as node `0001` (center node)
  - real air-link uplink proof has been captured on `COM9`
  - observed payload is no longer sample text only; the center node receives live telemetry chunks from the RK2206 firmware such as:
    - `temperature_c`
    - `humidity_pct`
    - `accel_x_g`
    - `tilt_x_deg`
    - `gps_latitude`
    - `meta.install_label=FIELD-NODE-A`
- center-node serial reception is now stable and readable rather than garbled:
  - on `2026-04-06`, the center node received a full telemetry frame in continuous `79`-byte chunks
  - the reconstructed payload remained valid JSON with normal fields including:
    - `schema_version=1`
    - `seq=21`
    - `metrics.temperature_c=29.5`
    - `metrics.humidity_pct=50.1`
    - `metrics.tilt_x_deg=5.12`
    - `metrics.gps_latitude=22.543200`
    - `meta.install_label=FIELD-NODE-A`
  - this materially validates the current chunked transparent-uplink strategy as the working baseline for field-node -> air-link -> center-node serial observation
- the first non-destructive transparent downlink proof is now also real:
  - on `2026-04-06`, `manual_collect` was injected from the center-node serial port `COM5`
  - the returned capture included a matching command ack for:
    - `command_id=9b839b88-46bc-4029-887d-8da10bd6e605`
    - `status=acked`
    - `result.collect_requested=true`
  - the immediately following telemetry frame proved board-side command consumption:
    - `meta.last_command_type=manual_collect`
    - `meta.last_command_id=9b839b88-46bc-4029-887d-8da10bd6e605`
    - `meta.last_command_uptime_s=1903`
    - `meta.upload_trigger=manual_collect`
  - later periodic frames retained the same `last_command_*` metadata while `upload_trigger` returned to `periodic`
  - this proves the full transparent downlink chain:
    - center-node serial write
    - XL01 air-link delivery
    - RK2206 board-side command parse/apply
    - ack return
    - follow-up telemetry metadata reflection
- a local script compatibility fix was also applied:
  - `scripts/dev/inject-hardware-stable-version-command.ps1` now forces `System.IO.Ports.SerialPort` loading before falling back, so `uart-com` writes can execute in the current PowerShell/.NET environment
- the current shared report for this boundary is now:
  - `docs/unified/reports/hardware-stable-version-xl01-peer-command-plan-latest.md`

## Constraints

- do not flash firmware or write serial bytes to the currently attached unrelated board unless explicitly approved
- do not assume the newly built `liteos.bin` should be flashed until the target board identity is confirmed
- prefer passive observation first when the board identity or UART path is uncertain
- preserve the existing sample-driven proof chain instead of replacing it with ad hoc manual traffic
- current board-side blocker appears to be physical path correctness, not broker/auth/relay software
- if the attached CH340 path is not the intended command UART, do not treat noise on `COM5` as command-path failure
- after the first successful flash, the immediate blocker is no longer flashing itself but runtime stability on-device
- do not repurpose `PB2/PB3`; they are the board-side XL01 UART and already match the established hardware truth
- do not use `COM5` as the command injection port; any live command write must go to the host-side peer XL01 serial port
- current working assumption is:
  - `COM9` is the center-node XL01 host port for current live air-link observation/injection
  - `COM5` is the board-side XL01 adapter when directly connected to the PC for configuration

## Plan

- identify the host-side peer XL01 serial port (`PeerPort`) rather than revisiting the board log port
- keep the current verified chunked uplink path intact as the frozen baseline
- freeze the current working transparent baseline:
  - center-node serial port currently observed as `COM5`
  - `manual_collect` over `ChunkStrategy=whole` is proven good
- next verify one additional downlink class, preferably either:
  - `set-report-300`
  - mismatch `manual_collect`
- for `set-report-300`, prove effect from subsequent telemetry cadence and metadata
- for mismatch, prove board-side ignore behavior by showing no matching ack and no `last_command_*` update to the mismatch command id
- once direct peer injection is proven, switch to `scripts/dev/start-hardware-stable-version-xl01-peer-relay.ps1` for real MQTT -> UART -> XL01 relay proof
- capture one aligned command end-to-end through:
  - MQTT publish
  - gateway-style relay
  - real peer-UART write
  - board-side receive evidence
- capture one mismatch sample end-to-end through the same peer-XL01 path and prove board-side ignore behavior
- update unified reports and journal after each real hardware boundary is crossed

## Open Questions

- what is the cleanest way to capture board-side command-consume evidence in parallel with the center-node serial feed
- under the current USB dock setup, what is the stable two-port mapping when both the center-node serial adapter and any second debug/config adapter are connected
- after direct peer injection succeeds, can the same peer port be kept for MQTT relay proof without changing wiring
- when the peer UART is confirmed, which first command is safest to use for real board-side proof:
  - `set_sampling_interval`
  - another non-destructive command

## Done When

- at least one aligned command is proven through real center-node UART -> XL01 -> board receive/apply evidence
- at least one mismatch command is proven ignored through the same real path
- the current relay wrappers can be used on the real UART path without ad hoc command reconstruction
- the unified reports and monthly journal reflect the real hardware boundary, not only software-side proof
