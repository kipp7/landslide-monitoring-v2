---
title: RK2206 Compact V4 hardware acceptance
status: active
updated: 2026-08-03
---

# RK2206 Compact V4 Hardware Acceptance

This gate validates the three real A/B/C RS485 sensor paths before NTRIP or RTCM injection is enabled. GNSS is compiled as simulated for this indoor stage and is excluded from RTK evidence. A software build, a legacy V2 compatibility frame, or a synthetic PROBE does not satisfy this gate.

## Locked Inputs

- Release status: V5-r3 is the only package approved for the next indoor RS485
  acceptance flash. It is not yet a production-stability or RTK-Fixed result.
- Release directory:
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_diag_v5_r3_gnss_simulated_20260803`.
- Source commit: `b6b49adbbfe0601570bb87b292d29f736c6a44ac`, pushed to
  `origin/feat/gnss-rtk-v31-transport`; manifest `sourceDirty=false`.
- Manifest SHA-256:
  `96fdf0798ab5968abd58c6002e561e8f31b5804b2456c7db3e99021a27f2a6fc`.
- A/B/C `.img` SHA-256:
  `8f03f35ef3a26a4f38ef02235c042747371d2c030b29fbe7f412080f08dd1edc`,
  `73a3e873c3b66d2ce0a6865e7f1a2393a50e2d75b5b688fb18b917e5afe7cf80`,
  `ef4f8b4146f54f7f2bb5155aee2a4d41632267376cf2555387b61464c6cb4e9a`.
- Loader SHA-256:
  `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`.
- Payload: Compact V4, 139 bytes; complete COBS/CRC field-link frame: 157 bytes.
- On-demand diagnostic: G3S V5, 552-byte payload and 570-byte measured golden
  field-link frame; never send periodically or query nodes concurrently.
- Firmware marker: `fw-rk2206-rtk-compact-v4-rs485-diag-v5-r3-20260803`.
- TX ordering: frame sequence allocation, COBS/CRC encoding, and the complete
  chunked UART write share one mutex. This prevents concurrent workers from
  putting sequence `N+1` on the wire before sequence `N`.
- Sensor policy: one retry after 80 ms for Modbus timeout/read/short/CRC failures only. Every failed first attempt remains in the low-level counters; no old sensor value is reused.
- Acceptance timing: fixed A to B to C targeted order, 250 ms batch interval, 1500 ms response window, zero XLS1 link retries, 1500 ms logical-session limit, and 2500 ms maximum per-node P95 interval.
- The RK3568 production service remains at its existing `1200/1200/0` timing until all three acceptance stages pass.
- RK3568 must keep `NTRIP_ENABLED=false` throughout this gate.

The former V5-r2 clean release, `xls1_compact_v4_rs485_retry1_gnss_simulated_20260803`,
V5-r2 dirty compile proof, earlier V4 directories, rejected candidates, and V3
images are all superseded. Do not flash them. Use only the V5-r3 `.img` whose
node label matches the physical A/B/C location.

## Electrical and Pin Gate

Power the node down before inserting or removing RK2206, SC16IS752, RS485, GNSS, or XLS1 hardware. Confirm connector orientation and full pin alignment before power-up.

The locked firmware assignments are:

| Function | RK2206 pins | Required behavior |
| --- | --- | --- |
| XLS1 user UART | PB2/PB3 | EUART2 M1, 115200 baud |
| SC16IS752 I2C | PB4/PB5 | EI2C0 M0, hardware mode only |
| UM220 GNSS UART | PB6/PB7 | not initialized in this indoor simulated-GNSS package |
| Battery ADC | PC0 | input-only ADC with per-node field calibration |

The V4 build must report hardware field sensors, simulated GNSS, a field-calibrated battery, and RTCM boot mode `disabled`. It must not initialize the UM220 UART, SHT30, or MPU6050. Firmware pin-safety and release-safety tests must pass before any rebuilt image is flashed.

## RK3568 Installation

Install the V4-aware gate scripts without changing field-gateway configuration:

```bash
sudo install -m 0755 xls1_three_node_batch_poll.py /usr/local/bin/xls1_three_node_batch_poll.py
sudo install -m 0755 xls1_compact_v4_acceptance.py /usr/local/bin/xls1_compact_v4_acceptance.py
```

Review the immutable plan first:

```bash
python3 /usr/local/bin/xls1_compact_v4_acceptance.py --required-gnss-source simulated --dry-run
```

Verify the root-owned `0600` environment file, disabled NTRIP setting, serial character device, and active gateway service without sending a field command:

```bash
sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py --required-gnss-source simulated --check-prerequisites
```

## Fail-Fast Three-Stage Gate

After all three matching images are flashed and A/B/C are powered, run:

```bash
sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py --required-gnss-source simulated
```

The runner holds `lsmv2-field-gateway.service` once for the entire sequence, preventing production polling from contaminating the XLS1 queue between stages. It runs 60, 600, then 1800 seconds and stops immediately when a stage fails. The service hold is removed and the original active state is restored on success, failure, interruption, or a normal exception.

Each stage requires all of the following:

- all A/B/C frames decode as Compact V4, report hardware field sensors plus simulated GNSS, and match the current targeted command tag;
- 100% logical matching, continuous per-node sequence numbers, and zero real duplicate, unmatched, decode, CRC, or trailing-frame errors;
- hardware soil temperature, soil moisture, EC, and three-axis tilt validity with bounded numeric values;
- valid PC0 voltage and percentage with `field-calibrated` quality;
- RTCM mode `disabled`, READY-only state, session epoch `0`, lease `0`, pending queue/high-water mark `0`, no historical RTCM action age, and all accepted/completed/injected/reject/CRC/queue-drop/UART counters at `0`;
- zero XLS1 link retries, attempt and total logical latency at most 1500 ms, and per-node P95 interval at most 2500 ms.

Reports stay under `/var/lib/lsmv2/experiments`. The runner prints each report path and SHA-256 plus a final summary path. Raw reports are not committed because later runs can carry real GNSS positions.

## Failure Rules

- A V2 frame means a node still runs old firmware or an independently powered old node remains on the channel. Stop and identify it.
- A missing soil/EC/tilt validity bit is a sensor/SC16IS752/RS485 hardware failure until proven otherwise; do not weaken the gate.
- A recovered sensor retry is acceptable but still increments the first-attempt Modbus error counter. A rising or sustained failure rate is a hardware fault and must not be hidden by the retry.
- Keep B within the range already proven lossless; the prior `42/63` B-only result recovered to `86/86` when B was moved closer.
- A battery quality other than `field-calibrated` means the wrong image or calibration was used.
- Any nonzero RTCM session or lease while disabled is a fail-closed violation.
- Do not tune XLS1 channel, UART chunks, node slots, RTCM pacing, and polling cooldown in the same experiment. Change one dimension only after the 1800-second baseline passes.

## After This Gate

Only after all three stages pass may CORS credentials be enabled in the RK3568 root-owned `0600` environment file. Continue in this order: PROBE with a common finite session/lease, then LIVE mixed load, then outdoor `GGA=4` and correction-age/Fixed-continuity acceptance. None of the three pure-telemetry stages proves centimeter-level positioning.
