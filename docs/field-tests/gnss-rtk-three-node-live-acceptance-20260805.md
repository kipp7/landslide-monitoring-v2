# GNSS RTK Three-Node LIVE Acceptance - 2026-08-05

## Purpose

This record captures the first outdoor run in which all three UM220-IV NK
rovers reached RTK FIXED through the shared RK3568, XLS1, and RK2206 transport.
It separates link capability from professional displacement acceptance.

No CORS credentials, real coordinates, raw RTCM, or protected environment
contents belong in this document.

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

1. Build and verify the immutable G3B-capable A/B/C release from a clean commit.
2. Deploy the matching gateway with NTRIP disabled and aggregation fixed at 1.
3. After all three nodes are flashed, verify ordinary telemetry and legacy-G3R
   PROBE with zero error deltas.
4. Set aggregation to 2 and repeat PROBE. Confirm that one outer field frame
   accounts for approximately two accepted inner fragments.
5. Run controlled 1 Hz LIVE for 600 seconds, then 1800 seconds only when
   correction-age, GST, session, and normal-poll gates pass.
6. Adjust C independently if it remains FLOAT; do not mask that condition by
   reducing the common correction cadence or relaxing the professional gate.
