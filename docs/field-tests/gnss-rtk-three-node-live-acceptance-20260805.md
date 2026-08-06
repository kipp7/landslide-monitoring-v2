# GNSS RTK Three-Node LIVE Acceptance - 2026-08-05

## Purpose

This record captures the first outdoor run in which all three UM220-IV NK
rovers reached RTK FIXED through the shared RK3568, XLS1, and RK2206 transport.
It separates link capability from professional displacement acceptance.

No CORS credentials, real coordinates, raw RTCM, or protected environment
contents belong in this document.

## G3S V7 1800-Second Recheck - 2026-08-06

The retained `RTCM32_GGB / aggregation=4 / burst=4 / guard=600 ms /
observation=1 Hz` profile ran LIVE for the full 1,800 seconds. The 120-second
window in the generated JSON is only the final positioning window; it is not
the test duration. The run received 5,712 valid caster frames, prepared and
wrote 3,282 inner RTCM frames in 1,570 outer field frames, and completed
303/303 normal polls. Caster CRC, field-write, poll-timeout, schema, and
interleaving errors were all zero, and the service did not restart.

The longer window proved that FIXED remained possible but did not pass the
positioning gate. Node B first reached GGA quality 4 at elapsed 1,221 seconds
and remained FIXED through the 1,355-second sample: 14 consecutive samples
over approximately 134 seconds. A and C never reached quality 4. Across all
175 monitor samples, the quality-4 counts were A/B/C `0/14/0`; the final
120-second window was again `0/12` for every node because B had already
returned to FLOAT.

The final-window correction-age P95 and maximum were 6 seconds on every node.
The complete monitor contained a later common transient with A/B/C maxima of
14/15/16 seconds. That transient did not cause B's initial loss of FIXED: B
returned to quality 5 at elapsed 1,366 seconds while its reported age was
still 4 seconds, and the 9--16 second samples appeared later. An age near five
seconds is therefore compatible with FIXED on this stationary system, but it
reduces convergence and hold margin and remains outside the preferred
professional operating range. It is a contributing risk, not a proven sole
cause.

Post-LIVE V7 queries again bounded the node path. A/B/C completion-to-dequeue
P95 was at most 20 ms, UART-write P95 at most 10 ms, and completion-to-write
P95 at most 50 ms; total maxima were 53/37/34 ms. GNSS UART read,
reconfiguration, and FIFO-drop counters were zero. A and B each injected
3,282 frames and reported two queue expirations at the LIVE shutdown boundary;
C injected 3,284 frames with zero expiry. There were no queue evictions,
partial writes, UART write errors, or monitored gateway write failures. The
two shutdown-boundary expirations are retained in this record rather than
being treated as in-window transport loss.

This recheck rules out a 120-second observation window as the reason for the
earlier all-FLOAT result. It also reconfirms that the shared software path is
not the source of the 4--6 second GGA age. The remaining scope is RF visibility
and multipath, incoming observation epochs, and UM220 correction application
and ambiguity resolution. Do not retune the accepted shared transport profile.
The next controlled comparison is an unobstructed single-node run, followed by
the same physical placement for the other receivers if needed.

The authoritative credential-free summary is
`/var/lib/lsmv2/experiments/g3s-v7-g3b4-live1800-20260806-011454.json`; its
monitor SHA-256 is
`64e841e18c49338396edf92b082250ac9379e9a994e4fcc77f8e7f70fb9e19d7`.
The gateway ended fail-closed with NTRIP disabled, runtime mode PROBE,
field-frame aggregation one, service active, and `NRestarts=0`.

## G3S V7 Field Attribution - 2026-08-06

All three nodes were flashed with the immutable G3S V7 images and passed an
on-demand diagnostic query. A/B/C locked their hardware UM220 UART at 115200
baud with zero read, reconfiguration, or FIFO-drop errors. Hardware soil, EC,
and tilt paths were current on all three nodes.

The RK3568 gateway was atomically replaced as one complete build before the
test. The protected environment remained `root:root 0600`; credentials were
configured only there. The test began and ended fail-closed with NTRIP
disabled, runtime mode PROBE, and field-frame aggregation one.

The staged real-caster PROBE gates were clean:

- legacy G3R used 74 inner writes and 74 outer field frames;
- G3B aggregation two used 80 inner writes and 40 outer field frames;
- G3B aggregation four used 86 inner writes and 40 outer field frames;
- every stage had zero caster CRC, field-write, normal-poll timeout, schema,
  and interleaving errors;
- the A/B/C V7 accepted/completed/PROBE counters remained identical, while
  CRC, reassembly-expiry, capacity, queue, and UART error counters did not
  increase.

An earlier legacy synthetic sender was intentionally rejected because the V7
release boots RTCM DISABLED and the old sender does not acquire a runtime
lease. Those rejected/decode counters remained unchanged through all valid
PROBE and LIVE stages and are not attributed to the production transport.

The retained G3B4 profile then ran LIVE for 600 seconds. It received 1,871
valid caster frames, prepared and wrote 1,058 inner RTCM fragments in 503
outer field frames, and completed 106/106 normal polls. Caster CRC, write,
poll-timeout, schema, and interleaving errors were all zero. Gateway
caster-to-field-write P95 was 1,120 ms, shaper-queue P95 was 947 ms, and
serial-write P95 was 199 ms.

This run did not pass the positioning gate. The final 120-second window had
zero of 12 samples at GGA quality 4 for A, B, and C; all three remained RTK
FLOAT. Correction-age P95 and maximum were 6 seconds on every node. No ENU
baseline or professional displacement sample may be created from this run.

The post-LIVE V7 query bounded the node path much more tightly. Each node
reported 1,061 injected frames and 113,954 injected bytes with no UART partial
write, write error, queue eviction, or injection drop. Reassembly completion
to queue dequeue was P95 at most 20 ms, UM220 UART write was P95 at most 10 ms,
and completion to UART-finished was P95 at most 50 ms. Maximum total node-path
latency was 35/38/43 ms for A/B/C.

The shared software transport is therefore not the source of the remaining
4--6 second correction age or this run's failure to reach FIXED. The unresolved
scope is now downstream of the completed UM220 UART write: receiver correction
application and GGA reporting semantics, incoming observation epoch, and RF
conditions. Transport parameters must remain unchanged for the next RF or
single-node isolation run.

The authoritative credential-free summary remains on RK3568 at
`/var/lib/lsmv2/experiments/g3s-v7-g3b4-live600-20260806-004205.json`; its
monitor SHA-256 is
`d71eeda6ce079f2b79bb0a9de1dc38ab95376c99c24ea9e75be19394d86ab824`.

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

## Correction-Age Stage Attribution

A later 600-second run kept the retained `RTCM32_GGB / G3B=4 / burst=4 /
guard=600 ms / correction-window=2500 ms / observation=1 Hz` profile unchanged
and instrumented only the RK3568 path. It completed with zero caster CRC,
field-write, normal-poll, schema, and interleaving errors. The bounded
caster-receive to completed field-write P95 was approximately `1121 ms`; the
serial-write P95 was approximately `158 ms`.

That evidence bounds the gateway contribution near 1.1 seconds and cannot
explain the receivers' 6--7 second GGA correction age. Parameter guessing at
the gateway is therefore stopped. The next image adds backward-compatible
`G3S V7` node diagnostics with three fixed histograms:

- completed RTCM reassembly to queue dequeue;
- UM220 UART write duration;
- completed RTCM reassembly to UM220 UART write completion.

V7 is a 916-byte on-demand diagnostic only. It does not enlarge the Compact V6
business payload, alter the retained correction cadence, or relax the
professional displacement gate. The immutable A/B/C release was built from
clean pushed commit `107597851b99ac8a745978adfe8a0f0aeaced668` at:

`F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_g3s_v7_latency_diag_rs485_gnss_hardware_live_20260805`

The release verifier confirmed hardware GNSS, hardware RS485, field-calibrated
PC0, LIVE capability with DISABLED boot mode, Compact V6 layered polling, the
new V7 marker, and unique A/B/C identities. Independent hashes are:

| Artifact | SHA-256 |
| --- | --- |
| `manifest.json` | `2a91850732fdf4e414c3fdc3dee8439065f761a59b8bcf27b83cdefe8d81fb41` |
| A `.img` | `e903d565ff764c7114690364ac29261644d4a37665415289d679076dd35f284a` |
| B `.img` | `0d22fd4373d801c6611514073a705a4e41bcb7053ca8ea32a98d43e5b879dfd8` |
| C `.img` | `f399eea340b0f4af8503b7887792ef194703707a89e0fce7fb95ac890e968c4f` |

The images have not yet been flashed or field-validated. After flashing by
physical label, V7 must be queried one node at a time after the next controlled
LIVE window. Until that evidence exists, the unresolved interval is RK2206
queue/UART scheduling plus UM220 internal application/reporting time.

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
## Final Compact V6 Low-Rate V2 Package - 2026-08-06

The final hardware-GNSS/RS485 package was rebuilt from clean source commit
`b4c40a85df5a28c442c9d9b5f44e8b3537730c0d` after the core-tilt timing review.
The release verifier passed with `sourceDirty=false`; this is a build/release
record, not a field acceptance result.

Package directory:
`F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_lowrate_v2_corefast_rs485_gnss_hardware_live_final_20260806`

| Artifact | SHA-256 |
| --- | --- |
| `manifest.json` | `a160e5ed61254be8efd0603c7b3729aad4a15ca2704a70cf19d0350b0275b7aa` |
| A `.bin` | `800756c70de9b553b445e9ca1e62bde482d47d27881e2c0182eba020c18656e2` |
| B `.bin` | `202366ec8490bf83a1173274852efe7e014c84ec6112a61d7b24bf68f765df73` |
| C `.bin` | `efb72b834c8428e726663334d39afb8b9bd8356f41454ebe37433875c93c8019` |

The image boots with RTCM disabled and is only LIVE-capable after the gateway
lease sequence. Flash by physical node label, keep NTRIP disabled for the first
communication gate, and do not call the package RTK-accepted until the outdoor
G3R/G3B PROBE and 600/1800-second positioning gates pass.

## Quick Hardware Core Gate - 2026-08-06

A 20-second hardware-GNSS Compact V6 core run completed through the RK3568
reverse SSH channel after A/B/C were powered:

- A/B/C completed `13/13` core rounds each;
- decode, wire-length, unmatched, duplicate, scope, epoch and profile errors were zero;
- `stableProfile=true`, hardware GNSS required, RTCM remained disabled;
- gateway arrival-interval P95 was A/B/C `2355.9/2360.1/2356.4 ms` and command-latency
  P95 was `1407.1/1749.4/2105.8 ms`.

The interval values are shared XLS1 polling arrival intervals, not local RK2206
tilt sampling intervals. The short run proves the current three-node Compact V6
communication/decode loop is healthy, but it is not a 600/1800-second acceptance
or an RTK positioning result. The gateway was restored automatically to
`active/running` with `NRestarts=0`, serial/MQTT online, NTRIP disabled, runtime
PROBE and aggregation one.

Credential-free report path on RK3568:
`/var/lib/lsmv2/experiments/xls1-compact-v6-layered-0020s-20260806-141155.json`

## Strict Communication Gates - 2026-08-06

The final low-rate V2 hardware package passed separate 60-second and 600-second
Compact V6 communication gates with real UM220 GNSS and RTCM disabled:

- 60 seconds: `39/39` complete core rounds and zero decode, wire-length,
  unmatched, duplicate, recovery, scope, epoch, profile, or trailing-byte errors;
- 600 seconds: `470/470` complete core rounds with the same zero-error profile;
- all 470 responses from each node used the initial P1 path, with no targeted
  recovery command;
- A/B/C core-arrival P95 was `1802.0/1812.2/1797.7 ms` and command-latency P95
  was `837.0/1131.1/1444.9 ms`;
- all `9/9` environment and `8/8` audit responses matched, and the strict
  distinct-epoch window checks remained satisfied.

The 600-second report is
`/var/lib/lsmv2/experiments/xls1-compact-v6-layered-0600s-20260806-142631.json`
with SHA-256
`8b47d3b3a66c8215457cf76e0ed3ca64e544ce71212149e780ecb3219bbb3231`.
The summary SHA-256 is
`84caa922bf627cb0d1e7b36931e9814f2abb5e0c23914512981a7400c5f6e3f5`.

The outer Windows SSH wait expired after the remote report had already passed.
An initial follow-up queried the wrong alias, `field-gateway.service`, and must
not be treated as evidence that production stopped. The real unit,
`lsmv2-field-gateway.service`, was verified `active/running`, `NRestarts=0`;
its journal shows uninterrupted serial/MQTT publishing for A/B/C from the
14:36:48 automatic restore onward. NTRIP remained disabled, runtime PROBE, and
aggregation one. Remote runners must query the exact production unit name.

These gates accept the three-node communication and acquisition profile. They
still do not accept RTK FIXED, correction age, centimetre displacement, or the
final 1800-second mixed LIVE load.

## Low-Rate V2 PROBE And LIVE Results - 2026-08-06

The final low-rate V2 package passed the gateway/field-link PROBE stages with
the retained `RTCM32_GGB / 1 Hz / burst=4 / guard=600 ms / window=2500 ms`
profile. Legacy G3R, G3B=2 and G3B=4 each completed a 60-second run with zero
caster CRC, field-write, poll-timeout, schema or interleaving errors. Their
inner/outer write counts were respectively `48/48`, `72/36` and `78/35`.
These runs prove the gateway and air-link PROBE path only; a matching G3S V7
node response was not obtained and therefore node-side PROBE completion is not
claimed.

The first 600-second G3B=4 LIVE run reached `GGA quality=4` on A/B/C for all
`12/12` samples in the final 120 seconds. Correction-age P95 was A/B/C
`12/11/11 s`; transport recorded `88/96` completed polls, eight poll timeouts,
three schema errors and zero field-write failures. This proved convergence but
failed the mixed-load freshness and zero-error gates.

A second controlled 600-second LIVE run at 15:38 CST reproduced and amplified
the scheduling issue:

- A/B/C remained `GGA quality=4` for all `12/12` final-window samples;
- correction-age P95/max was A `23/23 s`, B `24/24 s`, C `24/24 s`;
- caster input was healthy: `1846` valid frames, zero CRC errors;
- `686` inner fragments were prepared and written in `307` outer frames with
  zero write failures and zero interleaving errors;
- normal polling completed `82/100`, with `17` timeouts and `27` schema errors;
- dispatch blocking was dominated by `port-busy` (P95 `6419 ms`) and
  `targets-unarmed` (P95 `8631 ms`), while serial-write P95 was only `213 ms`;
- observation caster-to-field P95 remained `1202 ms`, but reference messages
  reached P95 `6698 ms` and max `10092 ms`.

The second report is stored only on RK3568 at
`/var/lib/lsmv2/experiments/lowrate-v2-g3b4-live600-recheck-20260806-20260806-153824.json`,
SHA-256 `681b4107e07a5b3b211c3750fce37247ccf96f924e6730bd8c5031d52a70afd6`.
Its credential-free monitor SHA-256 is
`b0da466177118d19fd68087b61fa4fecd73fb9b69d5b9985d845b080aa717339`.

An immediately preceding 60-second ordinary-communication run completed
`48/48` rounds per node with all transport/protocol errors zero. Its three
profile violations were only B's historical non-zero RTCM audit counters from
the prior LIVE session, not new injection while NTRIP was disabled. This report
is `/var/lib/lsmv2/experiments/xls1-compact-v6-layered-0060s-20260806-153413.json`,
SHA-256 `8ace0c7e1f96f99feb74fddf41d857077923c66ae56e2d8517f5155917ca31d9`.

The evidence therefore separates the outcome cleanly: ordinary three-node
telemetry is accepted and all receivers can remain FIXED, but the current
shared mixed-load scheduler is not freshness-accepted. The next revision must
shorten or preempt the `port-busy`/`targets-unarmed` intervals and eliminate
normal-poll/schema failures before another 600-second LIVE run. The test trap
restored `NTRIP_ENABLED=false`, runtime PROBE and aggregation one; the exact
production unit was verified active with `NRestarts=0`.
