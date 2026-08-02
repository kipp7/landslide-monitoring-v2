---
title: RK2206 Compact V4 hardware acceptance
status: active
updated: 2026-08-03
---

# RK2206 Compact V4 Hardware Acceptance

This gate validates the three real A/B/C sensor nodes before NTRIP or RTCM injection is enabled. A software build, a legacy V2 compatibility frame, or a synthetic PROBE does not satisfy this gate.

## Locked Inputs

- Release: `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_hardware_live_20260803`
- Manifest SHA-256: `d1f1e53a729f198fe4811cbdf835405f96b87eacf2add716142f3b8f930a09b7`
- Payload: Compact V4, 139 bytes; complete COBS/CRC field-link frame: 157 bytes.
- Production timing baseline: 1000 ms cooldown, 1200 ms response window, one partial-only retry, 2500 ms total logical-session limit.
- RK3568 must keep `NTRIP_ENABLED=false` throughout this gate.

Use only the image whose node label matches the physical A/B/C location. Do not use an earlier rejected candidate or a V3 simulated image.

## Electrical and Pin Gate

Power the node down before inserting or removing RK2206, SC16IS752, RS485, GNSS, or XLS1 hardware. Confirm connector orientation and full pin alignment before power-up.

The locked firmware assignments are:

| Function | RK2206 pins | Required behavior |
| --- | --- | --- |
| XLS1 user UART | PB2/PB3 | EUART2 M1, 115200 baud |
| SC16IS752 I2C | PB4/PB5 | EI2C0 M0, hardware mode only |
| UM220 GNSS UART | PB6/PB7 | UART0, 115200 baud |
| Battery ADC | PC0 | input-only ADC with per-node field calibration |

The V4 build must report hardware field sensors, a field-calibrated battery, and RTCM boot mode `disabled`. It must not initialize SHT30 or MPU6050. Firmware pin-safety and release-safety tests must pass before any rebuilt image is flashed.

## RK3568 Installation

Install the V4-aware gate scripts without changing field-gateway configuration:

```bash
sudo install -m 0755 xls1_three_node_batch_poll.py /usr/local/bin/xls1_three_node_batch_poll.py
sudo install -m 0755 xls1_compact_v4_acceptance.py /usr/local/bin/xls1_compact_v4_acceptance.py
```

Review the immutable plan first:

```bash
python3 /usr/local/bin/xls1_compact_v4_acceptance.py --dry-run
```

Verify the root-owned `0600` environment file, disabled NTRIP setting, serial character device, and active gateway service without sending a field command:

```bash
sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py --check-prerequisites
```

## Fail-Fast Three-Stage Gate

After all three matching images are flashed and A/B/C are powered, run:

```bash
sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py
```

The runner holds `lsmv2-field-gateway.service` once for the entire sequence, preventing production polling from contaminating the XLS1 queue between stages. It runs 60, 600, then 1800 seconds and stops immediately when a stage fails. The service hold is removed and the original active state is restored on success, failure, interruption, or a normal exception.

Each stage requires all of the following:

- all A/B/C frames decode as Compact V4 and match the current broadcast command tag;
- 100% logical matching, continuous per-node sequence numbers, and zero real duplicate, unmatched, decode, CRC, or trailing-frame errors;
- hardware soil temperature, soil moisture, EC, and three-axis tilt validity with bounded numeric values;
- valid PC0 voltage and percentage with `field-calibrated` quality;
- RTCM mode `disabled`, READY-only state, session epoch `0`, lease `0`, pending queue/high-water mark `0`, no historical RTCM action age, and all accepted/completed/injected/reject/CRC/queue-drop/UART counters at `0`;
- retry-round rate at most 2%, attempt latency at most 1200 ms, and total logical latency at most 2500 ms.

Reports stay under `/var/lib/lsmv2/experiments`. The runner prints each report path and SHA-256 plus a final summary path. Raw reports are not committed because later runs can carry real GNSS positions.

## Failure Rules

- A V2 frame means a node still runs old firmware or an independently powered old node remains on the channel. Stop and identify it.
- A missing soil/EC/tilt validity bit is a sensor/SC16IS752/RS485 hardware failure until proven otherwise; do not weaken the gate.
- A battery quality other than `field-calibrated` means the wrong image or calibration was used.
- Any nonzero RTCM session or lease while disabled is a fail-closed violation.
- Do not tune XLS1 channel, UART chunks, node slots, RTCM pacing, and polling cooldown in the same experiment. Change one dimension only after the 1800-second baseline passes.

## After This Gate

Only after all three stages pass may CORS credentials be enabled in the RK3568 root-owned `0600` environment file. Continue in this order: PROBE with a common finite session/lease, then LIVE mixed load, then outdoor `GGA=4` and correction-age/Fixed-continuity acceptance. None of the three pure-telemetry stages proves centimeter-level positioning.
