# GNSS RTK V3.1 Transport Protocol

Status: protocol and RK3568 closed-loop PROBE tooling implemented. This document does not claim that the newly packaged firmware has passed the DL-XLS1/XL01 hardware gate until A/B/C are flashed and measured.

## Compatibility Boundary

The existing `cobs-crc-v1` field-link remains the outer frame. V3.1 adds two frame types without changing telemetry, command, ACK or control frames:

| Field-link type | Code | Direction | Payload |
| --- | ---: | --- | --- |
| `gnss-core` | 5 | RK2206 -> RK3568 | fixed 98-byte `GNSS_CORE` |
| `rtcm` | 6 | RK3568 -> RK2206 | RTCM fragment header plus binary data |

The outer frame is still `12-byte header + payload + CRC32`, followed by COBS encoding and a zero delimiter. RTCM is never converted to JSON or Base64.

## Common V3 Header

Every V3.1 payload starts with this 28-byte big-endian header:

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 2 | magic | ASCII `G3` |
| 2 | 1 | version | `3` |
| 3 | 1 | header bytes | `28` |
| 4 | 1 | flags | type-specific |
| 5 | 1 | source node | gateway `0`, A/B/C `1/2/3` |
| 6 | 1 | target mask | gateway `0`, A/B/C bits `0/1/2`, broadcast `0x07` |
| 7 | 1 | priority | lower value is more urgent |
| 8 | 4 | session epoch | non-zero, persisted monotonic gateway incarnation |
| 12 | 4 | sequence | monotonic inside the session; all fragments of one RTCM frame share it |
| 16 | 8 | generated Unix ms | absolute freshness evidence |
| 24 | 4 | TTL ms | checked again at the receiving node |

Session epoch is not a random boot ID. The gateway must persist and increment it atomically. A node accepts a newer epoch, clears in-flight state and rejects frames from an older epoch. Uint32 serial arithmetic handles wraparound.

Absolute generation time is required because a module may retain bytes internally. A node with valid GNSS time rejects data older than TTL. During time bootstrap, session/sequence and reassembly timeout remain mandatory, and the receiver must expose that absolute TTL could not yet be verified.

## GNSS_CORE

`GNSS_CORE` is 98 bytes including the common header. One frame preserves nanodegree coordinates and the fields needed for an independent RK3568 trust gate:

- coordinate frame, raw GGA quality and fix-evidence flags;
- GNSS week/time-of-week, satellites used/visible;
- `latitude_e9` / `longitude_e9` as signed 64-bit integers;
- MSL altitude and geoid separation in millimetres;
- correction age and solution age in milliseconds;
- HDOP/PDOP/VDOP scaled by 100;
- GST sigma in millimetres;
- C/N0 mean/median/min scaled by 10;
- Fixed streak, one-minute Fixed ratio in permille, drop count and station ID.

The payload is about 116 bytes after field-link framing. Three nodes at 1 Hz therefore consume no more than about 348 B/s before radio-specific overhead. The old compact telemetry GPS fields remain a rollback/display path and must not feed centimetre displacement calculations.

This is a compact structured summary, not a raw receiver dump. The normal field link does not carry raw NMEA sentences, per-satellite GSV rows or proprietary debug output. C/N0 values are bounded aggregates. Raw receiver evidence may only be enabled as a time-limited diagnostic capture; it must not compete continuously with RTCM.

The professional displacement result is computed once on RK3568 from `GNSS_CORE`: coordinate-frame validation, ECEF/ENU, Hampel, adaptive Kalman, innovation checks, baseline version and alarm persistence stay centralized. RK2206 supplies the raw structured solution and quality evidence; it does not run a second independent displacement filter. Filtered ENU/displacement is a northbound result contract and is not duplicated inside this southbound field-link payload.

## RTCM Fragment

The RTCM sub-header is 42 bytes including the common header:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 28 | 2 | RTCM message type |
| 30 | 1 | class: observation `1`, reference `2`, auxiliary `3` |
| 31 | 1 | fragment index |
| 32 | 1 | fragment count |
| 33 | 1 | reserved, zero |
| 34 | 2 | complete RTCM frame bytes |
| 36 | 2 | fragment byte offset |
| 38 | 4 | complete-frame CRC24Q in the low 24 bits |
| 42 | N | raw RTCM bytes |

MSM 1071-1137 frames are observation class, 1005/1006/1007/1008/1033 are reference class, and other valid types are auxiliary. The encoder and decoder reject a type/class mismatch so an observation cannot obtain a reference frame's long lifetime.

Default TTLs are 3 s for observations, 10 min for reference messages and 30 s for auxiliary messages. Hard maxima are 5 s, 1 h and 2 min respectively. The node injects bytes into UM220 only after exact byte coverage, complete RTCM length validation and CRC24Q success.

Default capacity assumptions for the first hardware sweep:

- fragment data candidate: 160 bytes;
- RTCM payload: 202 bytes;
- maximum field-link wire frame: 220 bytes;
- maximum complete RTCM3 frame: 1029 bytes;
- at most 32 fragments and 4 in-flight messages;
- reassembly timeout: 1500 ms;
- accepted sequence lag: 8 messages.

These are bounded software defaults, not measured XLS1 limits. The sweep must also test smaller frames before enabling 220-byte frames in production.

## Failure Semantics

- Missing, overlapping or conflicting fragments discard the complete RTCM frame.
- Exact duplicate fragments are counted and ignored.
- Wrong target, expired TTL, excessive future skew, stale session and stale sequence are rejected.
- Newer session epoch clears pending and recently-completed state.
- Capacity pressure evicts the oldest incomplete message; it never allocates an unbounded buffer.
- Reference messages may be cached at the gateway, but their generated time and class-specific TTL remain visible.

## RK2206 Injection Modes

The firmware has three compile-time modes and defaults to `DISABLED`:

| Mode | Field-link RTCM | Reassemble/CRC/queue | Write UM220 UART |
| --- | --- | --- | --- |
| `DISABLED` | ignored | no | no |
| `PROBE` | accepted | yes | no |
| `LIVE` | accepted | yes | yes |

The injection queue holds four complete RTCM frames and evicts the oldest frame under pressure, because a newer correction is more valuable than a delayed one. The queue was increased from two to four after B showed short scheduler stalls; this adds about 2058 bytes of static frame storage. Reassembly is capped at four incomplete frames and 1500 ms. Queue residence is capped at the smaller of the message TTL and 3000 ms.

Only the existing GPS poll task accesses the GNSS UART. The XL01 receive path can enqueue complete frames but cannot call `IoTUartWrite`, which serializes RTCM writes with NMEA reads at the HAL boundary. A queue-lock initialization failure keeps corrections disabled rather than falling back to an unsafe unlocked path.

The current RK2206 build has monotonic time but no independently trusted absolute Unix clock. It therefore enforces reassembly and local queue age while incrementing `ttl_unverified_fragments`; the gateway remains responsible for absolute generated-time filtering. `LIVE` must not be field-enabled until this limitation and the mixed-load gate are explicitly accepted.

Exposed counters include accepted/completed/duplicate/rejected fragments, CRC errors, expired assemblies, capacity evictions, TTL-unverified fragments, queue depth/high-water/eviction/expiration, probe-validated frames, injected bytes, partial writes and injection drops. PROBE V2 also reports completed-frame counts for 1005/1033/1074/1094/1114/1124 plus field-link decoded frames, decoded RTCM frames, decode failures, sequence gaps/duplicates/resets and UART RX FIFO drops. PROBE V3 appends diagnostic state for the deployed UM220-IV NK, RS-ECTH-N01-TR-1 and RS-DIP-N01-1 acquisition paths; disabled legacy drivers are not reported as installed sensors. PROBE V4 appends U4 self-tests, a bounded read-only parameter scan and categorized per-channel Modbus failures. PROBE V5 appends collection-level and per-path RS485 attempts, retry recoveries, final failures, skips, failure streaks and monotonic event times. It does not alter compact telemetry or enable RTCM injection.

## RK3568 Closed-Loop PROBE Statistics

The hardware gate does not require a PC debug UART. RK3568 sends a fixed 12-byte ASCII query as field-link `command=2`:

```text
G3Q + node letter A/B/C + 8 uppercase hexadecimal nonce
```

For example, `G3QB89ABCDEF` asks node B for a snapshot. The nonce must be non-zero. All nodes receive the command, but only the addressed node responds. A valid query is first queued by the XL01 receive path and is handled by the normal data-processing task; the UART receive callback never transmits a response.

The node returns a fixed binary payload as field-link `control=4`. V1 is 92 bytes, V2 is 148 bytes, V3 is 204 bytes, V4 is 384 bytes, and the current diagnostic V5 is 552 bytes. Every version retains the complete preceding layout before appending fields. The outer COBS/CRC32 frame protects the whole response:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 3 | ASCII `G3S` |
| 3 | 1 | response version `1`, `2`, `3`, `4` or `5` |
| 4 | 1 | node number A/B/C = `1/2/3` |
| 5 | 1 | injection mode `DISABLED/PROBE/LIVE = 0/1/2` |
| 6 | 2 | reserved, zero |
| 8 | 4 | echoed nonce |
| 12 | 4 | node uptime at snapshot, seconds |
| 16 | 72 | 18 big-endian uint32 counters in the order below |
| 88 | 2 | queue high watermark |
| 90 | 2 | current queue depth |
| 92 | 24 | V2 only: six completed-frame counters for 1005/1033/1074/1094/1114/1124 |
| 116 | 32 | V2 only: eight field-link counters in the order below |
| 148 | 1 | V3 only: enabled acquisition-path mask |
| 149 | 1 | V3 only: low-level initialization-success mask |
| 150 | 1 | V3 only: current-valid mask from the latest collection cycle |
| 151 | 1 | V3 only: ever-succeeded mask since boot |
| 152 | 1 | V3 only: acquisition-path count, fixed at `4` |
| 153 | 3 | V3 only: reserved, zero |
| 156 | 16 | V3 only: four big-endian uint32 collection-cycle counters |
| 172 | 16 | V3 only: four big-endian uint32 last-success monotonic uptime values |
| 188 | 16 | V3 only: four big-endian uint32 consecutive failed collection-cycle counters |
| 204 | 1 | V4 only: SC16IS752 diagnostic schema, fixed at `1` |
| 205 | 3 | V4 only: configured I2C address, detected address, address-found flag |
| 208 | 7 | V4 only: signed init, channel A/B scratchpad, loopback and latest UART-init statuses |
| 215 | 3 | V4 only: channel A/B loopback RX byte counts and detected LSR |
| 218 | 2 | V4 only: reserved, zero |
| 220 | 1 | V4 only: read-only scan schema, fixed at `1` |
| 221 | 1 | V4 only: scan started/completed/production-restore flags |
| 222 | 1 | V4 only: query-match mask, soil bit 0 and tilt bit 1 |
| 223 | 1 | V4 only: reserved, zero |
| 224 | 2 | V4 only: bounded scan attempt count |
| 226 | 2 | V4 only: successful query count |
| 228 | 4 | V4 only: scan duration in milliseconds |
| 232 | 16 | V4 only: first soil-query match tuple |
| 248 | 16 | V4 only: first tilt-query match tuple |
| 264 | 104 | V4 only: 13 big-endian uint32 Modbus counters for channel A, then channel B |
| 368 | 2 | V4 only: signed last Modbus status for channel A/B |
| 370 | 4 | V4 only: last RX byte count for channel A/B |
| 374 | 6 | V4 only: last response address, function and exception code for channel A/B |
| 380 | 4 | V4 only: reserved, zero |
| 384 | 1 | V5 only: RS485 runtime diagnostic schema, fixed at `1` |
| 385 | 1 | V5 only: path count, fixed at `4` |
| 386 | 1 | V5 only: enabled path mask |
| 387 | 1 | V5 only: current-valid path mask |
| 388 | 16 | V5 only: completed cycles, last completion uptime, last duration and maximum duration |
| 404 | 144 | V5 only: four 36-byte path records in soil, soil-EC, tilt and rain order |
| 548 | 4 | V5 only: reserved, zero |

Counter order is: accepted, duplicate, rejected, completed, CRC errors, expired assemblies, capacity evictions, TTL-unverified fragments, queued frames, queue evictions, queue-expired frames, PROBE-validated frames, PROBE-validated bytes, injected frames, injected bytes, UART write errors, UART partial writes and injection drops.

V2 field-link counter order is: decoded frames, decoded RTCM frames, decode errors, sequence gaps, sequence duplicates, sequence resets, RX FIFO dropped bytes and RX FIFO drop events. The sequence counters observe the aggregate field-link stream. RK3568 and each RK2206 have independent sequence spaces, so switching between valid senders can appear as a gap, duplicate or reset. These three counters remain visible for diagnosis but are not loss gates unless the protocol later exposes per-sender sequence tracking.

V3 acquisition-path order is:

1. UM220-IV NK GNSS fix path;
2. RS-ECTH-N01-TR-1 temperature/moisture register path;
3. the same RS-ECTH-N01-TR-1 probe's independent EC register path;
4. RS-DIP-N01-1 three-axis tilt register path.

The two RS-ECTH entries represent one physical three-in-one probe and intentionally separate base registers from EC so an EC-only failure cannot hide valid temperature/moisture. `initialization-success` means the required local driver/transport initialized: UM220 UART for GNSS and SC16IS752/Modbus for RS485 paths. It is not proof that the remote sensor answered. Endpoint health comes from current/ever valid state and consecutive failures. A sample count is the number of enabled collection cycles in which the path was evaluated, not the number of raw Modbus transactions. Last-success time uses RK2206 monotonic uptime; it never relies on the board's untrusted wall clock.

U4 self-tests run during initialization and record the detected `0x48..0x57` address plus scratchpad and internal UART loopback results for both channels. In the V5-r3 firmware, the longer read-only parameter scan no longer runs on healthy startup. It is triggered once, after the first normal collection cycle that still has a final path failure after the bounded retry. The scan tries only Modbus reads at slave address 1 across channels A/B, function codes `0x03/0x04`, baud rates 4800/9600 and 1.8432/14.7456 MHz clock hypotheses. The soil query reads the configured base-register shape; the tilt query reads the configured three-register shape and the manual's `0x00C8` alternative. It never writes an address, baud rate or sensor configuration register. It always attempts to restore both UARTs to 1.8432 MHz, 4800 8N1 before normal collection resumes. `scan_started=false` is therefore normal when all enabled runtime paths are healthy.

Each 16-byte match tuple is `found, channel, function, slave, start-register, register-count, baud, crystal`. A query match proves that a valid Modbus response was received for that combination; it does not by itself identify the physical sensor model, because different address-1 devices can expose overlapping registers. Per-channel counter order is requests, successes, write errors, TX-completion errors, I2C/UART read errors, no response, short response, unexpected address, CRC error, Modbus exception, unexpected function, unexpected byte count and total RX bytes. This distinction separates an internal U4 failure from an externally silent RS485 chain and from a noisy or misconfigured responding bus.

Each V5 path record contains eight big-endian uint32 values followed by four status bytes: collection cycles, raw attempts, first-attempt failures, retry recoveries, final failures, skipped cycles, consecutive final failures, last-event uptime, signed first status, signed final status, attempts in the event and event flags. Flags are first failure `0x01`, retry recovered `0x02`, final failure `0x04`, recovered after prior final failure `0x08` and skipped `0x10`. RK3568 and the field tool reject impossible relationships such as attempts below evaluated cycles, retry/final totals that disagree with first failures, disabled paths with history, invalid flag/status combinations, event times later than the snapshot, or current-valid masks outside enabled paths.

A deliberate optional-path reprobe skip increments `skipped_cycles` but does not erase the latest real final-failure status or timestamp. A later successful attempt records recovery. This keeps an EC backoff from replacing the evidence needed to distinguish a sensor failure from a planned skip.

V5 is an on-demand diagnostic, never a periodic business payload. The current golden vector is 552 bytes before framing and 570 bytes as a complete COBS/CRC field-link frame. The software limit is 1024 payload bytes. The DL-XLxx manual states that its transparent user UART buffers and internally splits arbitrary serial streams, with roughly 900 byte/s one-way throughput when uncontended; one V5 response therefore occupies roughly 0.63 seconds of nominal radio capacity. Queries remain addressed one node at a time with a 3-second response timeout and must not be sent once per second or concurrently with an acceptance load.

The RK3568 tool queries once before traffic and once after the drain interval. It computes uint32 wrap-safe deltas, so old accumulated counters do not require a node reboot. A PROBE run passes only when:

- firmware reports `PROBE` in both snapshots and node uptime does not move backwards;
- accepted and TTL-unverified fragment deltas exactly equal sent fragments;
- completed, queued and PROBE-validated frame deltas exactly equal sent frames;
- PROBE-validated byte delta exactly equals raw RTCM bytes;
- baseline and final queue depth are zero;
- duplicate, reject, CRC, expiration, eviction, injection and UART-write error deltas are all zero.
- when V2 is required, each tracked RTCM type delta matches the generated schedule, decoded RTCM packets match sent fragments, and field-link decode/FIFO-drop deltas are zero.

The aggregate field-link sequence gap, duplicate and reset deltas are reported but do not affect PASS/FAIL. A non-zero value is not accepted as proof of RTCM integrity: integrity is established independently by exact decoded-RTCM, accepted-fragment, completed-frame, per-message-type and byte counts plus zero decode, CRC, reassembly, queue and FIFO errors.

Any missing statistics response is a failed gate, not an inconclusive successful send. `PROBE` still never writes RTCM to UM220.

## Bounded Selective Retry ACK

The full 148-byte V2 statistics response is a diagnostic snapshot, not a per-second reliability ACK. The RK2206 ACK-capable build adds a fixed 12-byte field-link `command=2` query:

```text
G3A + node letter A/B/C + 8 uppercase hexadecimal nonce
```

The addressed node answers in task context as field-link `control=4`; the UART receive callback still never transmits. The response is 24 bytes:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 3 | ASCII `G3A` |
| 3 | 1 | response version `1` |
| 4 | 1 | node number A/B/C = `1/2/3` |
| 5 | 1 | injection mode `DISABLED/PROBE/LIVE = 0/1/2` |
| 6 | 1 | bit 0: session state valid |
| 7 | 1 | reserved, zero |
| 8 | 4 | echoed nonce |
| 12 | 4 | active RTCM session epoch |
| 16 | 4 | highest observed RTCM sequence |
| 20 | 2 | recent completed-sequence bitmap |
| 22 | 2 | reserved, zero |

Bitmap bit 0 represents `highest_sequence`, bit 1 represents `highest_sequence - 1`, and so on through bit 15, using uint32 wrap semantics. The gateway retains every frame in the current one-second window, queries the addressed node, and retransmits only sequences not marked complete. Retransmissions preserve session epoch, sequence, generation time and fragment metadata; the existing 16-frame completion cache makes already completed fragments duplicates instead of new corrections.

The bounded reliability gate requires all windows recovered, final unique accepted/completed/type/byte counts exact, zero CRC/reassembly-timeout/capacity/queue/FIFO errors, recovery latency no more than 3000 ms, schedule lateness no more than 500 ms and retransmitted fragments no more than 25% of unique fragments. Raw field-link decode errors and duplicate fragments remain visible but may be tolerated only when the end-to-end gate and all time/overhead bounds pass.

The 24-byte ACK implementation has C99 and TypeScript golden-vector coverage, and `DISABLED/PROBE/LIVE` builds pass. It has not yet been flashed or measured on A/B/C, so it is not production evidence.

## Capacity Gate

The PC baseline received about 882 B/s of RTCM. With 160-byte data fragments, large frames add about 60 bytes of V3.1 and field-link overhead per fragment. Actual traffic contains many message sizes, so a capture-driven calculator must determine the real overhead instead of applying one constant multiplier.

Capacity planning counts configured capacity, not only currently online nodes. When A/B are active and C is unavailable, the model keeps C's full `116 B/s GNSS_CORE + 64 B/s compact telemetry = 180 B/s` reserve. It does not emit fake C telemetry. With the measured RTCM summary and 160-byte fragmentation, the current budget is:

| Scope | Estimated wire rate | 115200 UART utilization |
| --- | ---: | ---: |
| A/B active | 1768.08 B/s | 15.35% |
| A/B plus full C reserve | 1948.08 B/s | 16.91% |

Historical compact polling proved A/B/C `541/541` batches with 1623/1623 matched telemetry frames, zero timeout and about 509 ms average response latency. That evidence supports the 64 B/s per-node compact telemetry budget, but it does not prove RTCM capacity.

The 2026-07-27 RK3568-only PROBE runs showed a different limit. At 160-byte fragmentation, A accepted 57-58/100 fragments and B accepted 64/100. Reducing fragment data to 96 bytes caused A to accept 58/128 and complete only 28/76 RTCM frames. CRC and explicit reject counters stayed zero while incomplete assemblies expired. The near-constant accepted packet count indicates a field-link packet-rate or air-link scheduling boundary rather than a 115200 UART byte-capacity limit. Until a stepped-rate or batching design passes the node counter gate, the 16.91% byte estimate must not be presented as an XLS1 RTCM pass.

The stepped-rate profile then separated packet-rate and frame-size effects. On node A, fixed 90-byte RTCM frames passed through 7.5 Hz (90/90) and failed at 8 Hz (80/96). Fixed 160-byte frames passed at 4 Hz (48/48), lost one frame at 5 Hz (59/60), and fell to 48/72 at 6 Hz. The earlier 250-byte RTCM-frame experiment still used 160-byte fragmentation, so 6 Hz generated 12 field-link packets per second and received 19/72 frames. It demonstrates packet-rate overload, not that a 250-byte single packet is unsupported; the safe region depends on both field-link frame rate and encoded length.

The vendor product page for UM220-IV NK lists GPS L1, BDS B1, Galileo E1 and QZSS support, but not GLONASS. The hardware candidate profile therefore:

- rejects RTCM 1084 before the radio because the receiver cannot use it;
- keeps the newest 1074, 1094 and 1124 observation per type;
- limits 1124 to 1 Hz while keeping GPS and Galileo observations at 1 Hz;
- treats supported QZSS 1114 as optional and disabled by default until mixed-load headroom is proven;
- preserves 1005/1033 reference messages and absolute generation/TTL evidence;
- uses 160-byte fragmentation and at least 160 ms between field-link RTCM packets;
- drops superseded or expired corrections instead of building latency in a FIFO.

This profile models 540 B/s of RTCM and 852 B/s after field-link framing. Node A passed a 60-second synthetic PROBE with 312/312 accepted fragments, 252/252 completed and PROBE-validated RTCM frames, and 32400/32400 validated bytes. It had no CRC, reassembly, queue, decode, injection or UART-write errors, no late events, and 4.365 ms maximum schedule lateness. The gateway service was restored after the test. Node B went offline before its matching run and node C remains offline, so the result is an A-only candidate gate, not a three-node or RTK Fixed acceptance.

After B returned, the same four-constellation profile passed for 12 seconds but lost two 90-byte frames in 60 seconds (310/312 fragments and 250/252 frames). Increasing packet spacing to 180 ms performed worse and introduced reassembly expiration and queue eviction. With optional QZSS 1114 disabled, B then passed 60 seconds exactly: 252/252 fragments, 192/192 frames and 27000/27000 validated bytes with every error delta at zero. The common A/B production candidate is therefore 450 B/s raw RTCM and 702 B/s field-link, carrying 1005/1033/1074/1094/1124. A already passed a strict superset containing the same traffic plus QZSS. C and real mixed-load evidence remain outstanding.

A follow-up reduced QZSS 1114 to 0.5 Hz. B still lost 2/282 fragments at both `160-byte/160-ms` and `160-byte/200-ms`; 200 ms removed queue eviction but did not remove link loss. Raising the fragment-data bound to 320 bytes let each 250-byte 1124 frame use one field-link packet. That profile passed 12 seconds at 44/44, reduced the 60-second loss to 1/222, and lowered field-link traffic to about 717 B/s, but still failed the zero-delta gate. The old `250-byte frame at 6 Hz` result used 160-byte fragmentation and therefore exercised 12 field-link packets per second; it must not be cited as evidence that a 250-byte single packet is intrinsically unsupported. The 0.5 Hz QZSS mode remains experimental. Restoring it in production requires a bounded cumulative-ack/selective-retry design or equivalent reliability mechanism, with explicit three-node half-duplex and correction-age gates.

After A/B were flashed with PROBE V2, both passed the 12-second three-core-constellation gate at 50/50 fragments and 38/38 frames. A later 60-second rerun under changed link conditions received only 200/252 fragments on A and 249/252 on B even with the previously successful `128-byte/0-ms` UART write pattern. The `320-byte` variant was worse on A. This rejects parameter tuning as a production reliability mechanism and motivates the bounded ACK protocol above.

An intermediate experiment reused the 148-byte statistics response once per second. It eventually recovered A to 38/38 frames, but stretched the nominal 12-second stream to about 202 seconds because the query helper waited for its entire timeout after already receiving a match. The helper now returns immediately, yet a full diagnostic response each second still produced 3.1 seconds of schedule drift in a later no-loss run. Full statistics therefore remain start/end diagnostics; the 24-byte ACK is the only current selective-retry candidate.

The field-gateway now contains an inactive production shaper core with bounded RTCM3 stream parsing, CRC validation, the UM220 message allow-list, per-type newest-only replacement, 1 Hz observation throttling, TTL expiry and counters. It is intentionally not connected to NTRIP, the serial-port command chain or `LIVE` firmware yet. Integration must preserve the gateway's single port owner, add 160-byte fragmentation and 160 ms packet pacing, and expose shaper and node counters before any real correction is transmitted.

The hardware gate requires a real RTCM capture plus three 1 Hz `GNSS_CORE` uplinks, compact environmental telemetry and injected control commands. Record per node:

- correction age P50/P95/max;
- RTCM complete/injected, duplicate, expired, CRC and reassembly counters;
- GNSS_CORE complete/stale counts and Fixed ratio;
- UART bytes, estimated/observed radio occupancy and queue age;
- command latency and compact telemetry completion/timeout counts.

Initial competition acceptance remains correction age P95 <= 3 s and max <= 5 s, with no old-session injection. A 60-minute mixed-load run is required. Only after this gate passes may the protocol be connected to NTRIP and UM220 on the deployed three-node system.
