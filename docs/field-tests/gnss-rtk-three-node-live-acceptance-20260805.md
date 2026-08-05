# GNSS RTK Three-Node LIVE Acceptance - 2026-08-05

## Purpose

This record captures the first outdoor run in which all three UM220-IV NK
rovers reached RTK FIXED through the shared RK3568, XLS1, and RK2206 transport.
It separates link capability from professional displacement acceptance.

No CORS credentials, real coordinates, raw RTCM, or protected environment
contents belong in this document.

## G3B v1 Field Result And 600-Second Reconvergence

All three nodes were subsequently flashed with the clean G3B v1 release. A
60-second legacy-G3R PROBE and the staged G3B PROBE gates completed without
CRC, reassembly, queue, UART-write, schema, interleaving, or normal-poll
errors. At aggregation four, 100 accepted inner fragments were carried by 38
outer XLS1 frames and the A/B/C node counters agreed.

Source and burst comparisons then established the following:

- `AUTO`, aggregation four, burst four remained at `GGA=2` and had
  correction-age P95 near 16 seconds, so it was rejected.
- `RTCM32_GGB`, aggregation four, burst four produced `13/13` tail samples at
  `GGA=4` on A/B/C in its first 180-second LIVE run. Correction-age P95 and
  maximum were still 6 seconds, so the professional gate remained closed.
- Increasing the burst allowance to eight did not improve age and caused A/B
  to remain FLOAT for the tail window. It was rejected.
- A bounded 200 ms observation-coalescing experiment produced zero actual
  coalescing deferrals on the real stream. Its 180-second result and a matching
  coalescing-disabled control both remained FLOAT with otherwise clean links.
  The experiment therefore had no demonstrated benefit and was removed rather
  than retained as another production control.

After two minutes of uninterrupted satellite tracking, the retained
`RTCM32_GGB / aggregation 4 / burst 4 / 600 ms guard / 1 Hz observation`
candidate ran for 600 seconds. A first reached FIXED at about four minutes and
all three reached FIXED at about six minutes. The final 120-second window was:

- A/B/C `12/12` samples at `GGA=4`;
- final A/B/C correction age `4/4/4 s`;
- A/B/C correction-age P95 and maximum `7/7 s`;
- 102 issued and 102 completed normal polls, with zero timeout;
- 1,868 valid caster frames, 1,058 accepted inner RTCM writes, and 508 outer
  field-frame writes;
- zero caster CRC, RTCM write, schema, and interleaving errors.

This separates convergence from transport failure: a 180-second run after
corrections have been interrupted is not long enough to reject the hardware or
firmware. The shared system can regain three-node FIXED, but it still fails the
professional freshness gate because P95 and maximum correction age are above
the required 3 and 5 seconds. No displacement baseline may be created yet.

The authoritative result remains on RK3568 at
`/var/lib/lsmv2/experiments/g3b4-rtcm32ggb-reconvergence-live600-20260805-20260805-222313.json`.
Its monitor SHA-256 is
`9ea9cb7f7cc96a54c2c09115dcf8b7aa85b45591758197dccebf82950f813be8`.
After the session, NTRIP was disabled, runtime returned to PROBE, aggregation
returned to one, the gateway was active with zero service restarts, and the
pre-experiment stable build was restored.

## Tested Hardware And Software

- Three RK2206 field nodes A/B/C with UM220-IV NK, BT-760, real SC16IS752
  RS485 soil and tilt acquisition, and final field-calibrated battery input.
- RK2206 candidate directory:
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_gps_uart_rx_drain_v2_live_candidate_20260805`.
- The UART drain candidate reads up to 256 bytes every 2 ms and parses NMEA in
  the UART owner task. It probes 115200 and 9600, but permits RTCM LIVE writes
  only after valid NMEA locks at the required 115200 baud.
- RK3568 uses one serial writer for normal polling, control commands, and RTCM.
  The candidate limits RTCM to four frames between polls and protects the next
  poll with a 600 ms post-burst guard.
- Node LIVE evidence is valid for no more than 45 seconds and never beyond the
  active lease. Reboot, session mismatch, lease expiry, or stale evidence
  closes the gate.

The corresponding RK3568 build hashes were:

| Artifact | SHA-256 |
| --- | --- |
| `index.js` | `10b2a7c0c99c14a1ced72a0d95f7cfa66ca57a546f111dea0f4df5cb0712e562` |
| `rtcm-downlink-controller.js` | `3a3044f1b962688911d1aca96a3b27c6b04b158aa914a82d4a36053049e6103b` |
| `rtcm-poll-burst-gate.js` | `432a4d1b072bec76dc25f350a9dc7c0a5f451b2ba5a2feb1fa2b9f6aa38041b` |

Before field deployment, field-gateway passed 62 unit tests, TypeScript build,
and ESLint.

The implementation was subsequently committed and pushed as `bd356416` on
`feat/gnss-rtk-v31-transport`. The flashed candidate directory predates that
clean commit, so it remains field evidence rather than an immutable release;
a formal package requires a clean rebuild and release verification.

## Parameter Comparison

| Candidate | Normal telemetry | RTK behavior | Decision |
| --- | --- | --- | --- |
| 1000 ms normal poll interval | authorization fell to 2/3 and poll timeout occurred | not acceptable | rejected |
| 6 frames, 250 ms guard | reached FIXED, then three poll timeouts paused RTCM | not stable | rejected |
| 4 frames, 250 ms guard | reached FIXED, authorization fell as low as 1/3 | evidence cadence not protected | rejected |
| 4 frames, 1200 ms guard | zero communication timeout | all nodes later fell back to FLOAT | corrections too sparse | rejected |
| 4 frames, 600 ms guard, 45 s evidence | `111/111` normal rounds, zero timeout | A/B/C ended FIXED | retained candidate |

Only one variable set is retained. Rejected sets must not silently return as
fallbacks or competition presets.

## Retained Candidate Result

The retained candidate ran continuously for about seven minutes:

- NTRIP connected once with `ICY 200 OK`.
- Normal Compact V6 polling completed `111/111` rounds.
- Poll timeout count was zero.
- RK3568 dispatched 348 RTCM frames.
- The caster stream supplied 2112 valid RTCM frames with zero caster CRC error.
- RTCM serial write errors, schema errors, and interleaving errors were zero.
- Node authorization remained `3/3`.
- A/B/C ended at `quality=4 / RTK FIXED` with approximately 32/32/34 satellites
  and HDOP near 0.55.

The node-A final G3S V6 snapshot also confirmed:

- UM220 UART locked at 115200;
- UART read error and FIFO drop counts were zero;
- GNSS, soil temperature/moisture/EC, and tilt were valid;
- U4 and both RS485 query paths were operational.

Raw reports remain on RK3568:

- `/var/lib/lsmv2/experiments/ntrip-live-guard600-accepted-final-20260805.json`
- `/var/lib/lsmv2/experiments/ntrip-live-guard600-seg1-20260805.tsv`
- `/var/lib/lsmv2/experiments/ntrip-live-guard600-seg2-20260805.tsv`
- `/var/lib/lsmv2/experiments/ntrip-live-guard600-node-A-final-20260805.json`

The final B/C G3S V6 snapshots were deferred when the equipment was collected
because of rain risk.

## Acceptance Boundary

All three receivers reaching `quality=4` proves that the hardware and shared
transport can deliver corrections well enough for RTK FIXED. It does not prove
that a professional displacement sample is trustworthy.

The retained run still reported correction age around 10 seconds, so
`rtk_trusted=false` and `rtk_displacement_eligible=false` were correct. No ENU
baseline may be created from this run. Promotion still requires:

- sustained `GGA quality=4` on A/B/C;
- correction-age P95 no more than 3 seconds and maximum no more than 5 seconds;
- trustworthy GST/uncertainty and GNSS epoch fields;
- fresh node-side completion and actual UART injection evidence;
- zero old-session injection, CRC, reassembly, queue, FIFO, UART-write, schema,
  interleaving, and normal-poll loss;
- a 600-second gate followed by a 1800-second mixed-load gate.

The UI and competition presentation must not convert `quality=4` alone into a
"centimetre-level accepted" state.

## Subsequent 0.5 Hz Observation

After the antenna placement was adjusted, a subsequent 300-second LIVE window
used the two retained correction observation groups at 0.5 Hz. The last
120 seconds kept A and B at `GGA quality=4`, while C remained at
`GGA quality=5` for the whole window. A/B/C accepted approximately
`1514/1515/1533` correction fragments. Gateway RTCM CRC, UART-write, normal
poll, schema, and interleaving error deltas were all zero.

This result rules out a shared loss of corrections as the main explanation for
C: C did not receive fewer fragments than A or B. C remains an independent
antenna-placement, local multipath, receiver-state, or convergence problem and
must be corrected at that node. The correction-age P95 was still approximately
`10/9/7 s` for A/B/C, so the professional displacement gate remained closed.
The 0.5 Hz profile is useful diagnosis, not the accepted production cadence.

## G3B v1 Transport Successor

The next transport revision reduces XLS1 packet rate without discarding RTCM
content. One `G3B v1` field-link payload contains two to four complete legacy
`G3R` fragments. RK2206 validates the entire outer batch boundary and every
inner G3R before accepting any fragment. A failed gateway write returns all
inner fragments to the queue in their original order.

Compatibility is intentionally fail-closed:

- `RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME=1` remains the default and emits only
  legacy G3R payloads;
- all three RK2206 nodes must boot the new image before aggregation is enabled;
- aggregation is first tested at `2` in PROBE, never directly in LIVE;
- one G3B consumes one XLS1/field-link burst unit, while health separately
  records outer field-frame writes and accepted inner-fragment writes;
- the field-link payload ceiling remains exactly `1024 B` on both gateway and
  RK2206.

The intended LIVE target is the two-observation-group `1 Hz` profile. It may be
accepted only when A/B/C sustain `GGA quality=4`, correction-age P95 is at most
`3 s`, correction-age maximum is at most `5 s`, and all normal-poll, CRC,
reassembly, queue, UART, schema, and session-error deltas remain zero.

The immutable A/B/C release was built from clean pushed commit
`d4a7155547d3d7dc6e84d36b3fbc6d9fed170030` at:

`F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_rtcm_batch_v1_rs485_gnss_hardware_live_20260805`

Its release verifier independently confirmed hardware GNSS, hardware RS485,
field-calibrated PC0, LIVE capability with DISABLED boot mode, Compact V6
layered polling, unique A/B/C identities, and all seven manifest artifacts.

| Artifact | SHA-256 |
| --- | --- |
| `manifest.json` | `11afc1f4c835c9267afc8cb3753d881a050baa69700a3b9683f61cf2dd494a6f` |
| A `Firmware.img` | `450a8d3a62714fae6f771729fcf6745d077ac4e83f1653594b81584167ed958a` |
| B `Firmware.img` | `3d42289066e70eda27c212093fc83c2cc3de499c1008f41c3580523f81598fd8` |
| C `Firmware.img` | `5405d02c463333d8779c223e04dcd63a7935274826badd23d6e48d56035abfc1` |
| loader | `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977` |

## Safe Stop And Resume

After the run the RK3568 was restored to:

- `NTRIP_ENABLED=false`
- `RTCM_RUNTIME_MODE=probe`
- `RTCM_FRAGMENT_DATA_BYTES=512`
- `SOUTHBOUND_POLLING_INTERVAL_MS=250`
- `SOUTHBOUND_LAYERED_AUDIT_EVERY_ROUNDS=2`
- field-gateway active with zero service restarts
- protected environment file owned by root with mode 0600

On the next outdoor power-up:

1. Deploy the matching gateway with NTRIP disabled and aggregation fixed at 1.
2. After all three nodes are flashed, verify ordinary telemetry and legacy-G3R
   PROBE with zero error deltas.
3. Set aggregation to 2 and repeat PROBE. Confirm that one outer field frame
   accounts for approximately two accepted inner fragments.
4. Run controlled 1 Hz LIVE for 600 seconds, then 1800 seconds only when
   correction-age, GST, session, and normal-poll gates pass.
5. Adjust C independently if it remains FLOAT; do not mask that condition by
   reducing the common correction cadence or relaxing the professional gate.
