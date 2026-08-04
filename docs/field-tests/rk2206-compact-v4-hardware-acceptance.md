---
title: RK2206 Compact V4 hardware acceptance
status: rejected
updated: 2026-08-04
---

# RK2206 Compact V4 Hardware Acceptance

This gate validates the three real A/B/C RS485 sensor paths before NTRIP or RTCM injection is enabled. GNSS is compiled as simulated for this indoor stage and is excluded from RTK evidence. A software build, a legacy V2 compatibility frame, or a synthetic PROBE does not satisfy this gate.

## Locked Inputs

- Release status: V5-r4 is the only package approved for the next indoor RS485
  acceptance flash. It is not yet a production-stability or RTK-Fixed result.
- Release directory:
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_diag_v5_r4_gnss_simulated_20260804`.
- Source commit: `a6bb102f3f89eb50b72e08fc01922065d555cc31`, pushed to
  `origin/feat/gnss-rtk-v31-transport`; manifest `sourceDirty=false`.
- Manifest SHA-256:
  `481b0805c67b91e99041a3c7543eb62dafeceb431c8da492fd0fbc0978e7b94b`.
- A/B/C `.img` SHA-256:
  `1b0443d3ba92195dbc95d52566ad758a5068514b2010c13a8441b5b74e3f3c84`,
  `755325733db20efdf748636617acc5fe6d3063a1ad059dc0d326b5509ddd0065`,
  `16f17fb91d5867c3cd7a68b78ac8bc3a36bc005a0d51782ab5a65d6c931b7dd6`.
- Loader SHA-256:
  `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`.
- Payload: Compact V4, 139 bytes; complete COBS/CRC field-link frame: 157 bytes.
- On-demand diagnostic: G3S V5, 552-byte payload and 570-byte measured golden
  field-link frame; never send periodically or query nodes concurrently.
- Firmware marker: `fw-rk2206-rtk-compact-v4-rs485-diag-v5-r4-20260804`.
- Poll reaction cadence: polled firmware now uses the configured 50 ms request
  check. V5-r3 printed 50 ms but actually slept 200 ms in `DataUploadTask`;
  that mismatch is rejected by a release safety gate.
- TX ordering: frame sequence allocation, COBS/CRC encoding, and the complete
  chunked UART write share one mutex. This prevents concurrent workers from
  putting sequence `N+1` on the wire before sequence `N`.
- Sensor policy: one retry after 80 ms for Modbus timeout/read/short/CRC failures only. Every failed first attempt remains in the low-level counters; no old sensor value is reused.
- Acceptance timing: fixed A to B to C targeted order, 250 ms batch interval, 3000 ms receive-protection window, zero XLS1 link retries, independent 1500 ms command-latency limit, and 2500 ms maximum per-node P95 interval.
- The RK3568 production service uses `compact-targeted-v1/250/3000/0`; the longer protection window prevents a late frame from overlapping the next node and does not relax either latency gate.
- RK3568 must keep `NTRIP_ENABLED=false` throughout this gate.

Two V5-r3 60-second runs delivered every requested frame (`90/90` and `78/78`)
without link, decode, profile, or sensor-validity errors, but failed the 2500 ms
P95 interval gate. The second run reached 2640.0/2699.8/2675.8 ms for A/B/C.
V5 diagnostics found only bounded recovered Modbus timeouts and zero final
sensor failure. Source review then found the 200 ms hard-coded upload sleep.

V5-r4 removed that hard-coded sleep, but the real three-node gate exposed a
separate air-interface limit. The first 60-second stage passed with `111/111`
matched frames, zero protocol/profile errors, and A/B/C arrival P95 of
2072.4/1902.7/1901.8 ms. The following 600-second stage stopped the gate at
`793/813`: A/B/C missed 7/8/5 frames and the decoder recorded 20 errors. Those
errors formed exactly ten `236 B + 78 B = 314 B` pairs, the byte count of two
157-byte frames interleaved in the shared XLS1 output. A/B/C arrival P95 rose
to 3821.2/3939.8/3957.9 ms, so the 1800-second stage correctly did not start.

G3S V5 diagnostics after the failure reported `hardwareGatePassed=true` for
all nodes, healthy U4/soil/EC/tilt current state, and zero final-failure streaks.
The few Modbus no-response events were recovered by the single bounded retry.
The same 236/78 interleaving reproduced under the production gateway's former
1200 ms session window. A 3000 ms protection-window comparison delivered
`99/99` frames without protocol errors, proving that the short window caused
the next node to transmit over a late response, but the permanent 3000 ms run
still failed the independent speed gate: its A/B/C arrival P95 was
4449.2/4470.6/5121.5 ms. Requiring 15 seconds of serial silence before another
run still produced 4972.4/5380.6/4985.7 ms, excluding historical queue residue.

The DL-XLxx manual explains the result: the session-layer nominal payload is
only `[0,64] B`; larger payloads are merely described as possibly successful.
It also documents 50 ms UART aggregation and about 900 B/s ideal one-way user
throughput, with bidirectional traffic, same-channel nodes, range, and
interference reducing that rate and moving excess data into a latency queue.
Compact V4's 157-byte complete frame therefore consumes at least three nominal
radio packets. V5-r4 is retained as diagnostic evidence but rejected for
production periodic telemetry. Do not compensate by increasing timeouts or
weakening the 100% match, zero-error, 1500 ms command-latency, or 2500 ms
per-node P95 gates. The successor must preserve the 95-byte professional V3
prefix while fitting its complete field-link frame within 128 bytes.

The former V5-r3 release, V5-r2 clean release,
`xls1_compact_v4_rs485_retry1_gnss_simulated_20260803`, dirty compile proofs,
earlier V4 directories, rejected candidates, and V3 images are all superseded.
Do not flash them. Use only the V5-r4 `.img` whose
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
- zero XLS1 link retries, command latency at most 1500 ms, total logical latency at most 3000 ms, and per-node P95 interval at most 2500 ms.

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

V5-r4 failed this gate and must not be retried unchanged. Its successor is
Compact V5: the same 95-byte professional field/RTK prefix plus a 15-byte RTCM
summary, producing a 128-byte complete frame. V5 must start again at the strict
60/600/1800-second pure-telemetry gate. Only after all three stages pass may
CORS credentials be enabled in the RK3568 root-owned `0600` environment file.
Continue in this order: PROBE with a common finite session/lease, then LIVE
mixed load, then outdoor `GGA=4` and correction-age/Fixed-continuity acceptance.
None of the pure-telemetry stages proves centimeter-level positioning.
