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

The injection queue holds two complete RTCM frames and evicts the oldest frame under pressure, because a newer correction is more valuable than a delayed one. Reassembly is capped at four incomplete frames and 1500 ms. Queue residence is capped at the smaller of the message TTL and 3000 ms.

Only the existing GPS poll task accesses the GNSS UART. The XL01 receive path can enqueue complete frames but cannot call `IoTUartWrite`, which serializes RTCM writes with NMEA reads at the HAL boundary. A queue-lock initialization failure keeps corrections disabled rather than falling back to an unsafe unlocked path.

The current RK2206 build has monotonic time but no independently trusted absolute Unix clock. It therefore enforces reassembly and local queue age while incrementing `ttl_unverified_fragments`; the gateway remains responsible for absolute generated-time filtering. `LIVE` must not be field-enabled until this limitation and the mixed-load gate are explicitly accepted.

Exposed counters include accepted/completed/duplicate/rejected fragments, CRC errors, expired assemblies, capacity evictions, TTL-unverified fragments, queue depth/high-water/eviction/expiration, probe-validated frames, injected bytes, partial writes and injection drops.

## RK3568 Closed-Loop PROBE Statistics

The hardware gate does not require a PC debug UART. RK3568 sends a fixed 12-byte ASCII query as field-link `command=2`:

```text
G3Q + node letter A/B/C + 8 uppercase hexadecimal nonce
```

For example, `G3QB89ABCDEF` asks node B for a snapshot. The nonce must be non-zero. All nodes receive the command, but only the addressed node responds. A valid query is first queued by the XL01 receive path and is handled by the normal data-processing task; the UART receive callback never transmits a response.

The node returns a fixed 92-byte binary payload as field-link `control=4`. The outer COBS/CRC32 frame protects the whole response:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 3 | ASCII `G3S` |
| 3 | 1 | response version `1` |
| 4 | 1 | node number A/B/C = `1/2/3` |
| 5 | 1 | injection mode `DISABLED/PROBE/LIVE = 0/1/2` |
| 6 | 2 | reserved, zero |
| 8 | 4 | echoed nonce |
| 12 | 4 | node uptime at snapshot, seconds |
| 16 | 72 | 18 big-endian uint32 counters in the order below |
| 88 | 2 | queue high watermark |
| 90 | 2 | current queue depth |

Counter order is: accepted, duplicate, rejected, completed, CRC errors, expired assemblies, capacity evictions, TTL-unverified fragments, queued frames, queue evictions, queue-expired frames, PROBE-validated frames, PROBE-validated bytes, injected frames, injected bytes, UART write errors, UART partial writes and injection drops.

The RK3568 tool queries once before traffic and once after the drain interval. It computes uint32 wrap-safe deltas, so old accumulated counters do not require a node reboot. A PROBE run passes only when:

- firmware reports `PROBE` in both snapshots and node uptime does not move backwards;
- accepted and TTL-unverified fragment deltas exactly equal sent fragments;
- completed, queued and PROBE-validated frame deltas exactly equal sent frames;
- PROBE-validated byte delta exactly equals raw RTCM bytes;
- baseline and final queue depth are zero;
- duplicate, reject, CRC, expiration, eviction, injection and UART-write error deltas are all zero.

Any missing statistics response is a failed gate, not an inconclusive successful send. `PROBE` still never writes RTCM to UM220.

## Capacity Gate

The PC baseline received about 882 B/s of RTCM. With 160-byte data fragments, large frames add about 60 bytes of V3.1 and field-link overhead per fragment. Actual traffic contains many message sizes, so a capture-driven calculator must determine the real overhead instead of applying one constant multiplier.

Capacity planning counts configured capacity, not only currently online nodes. When A/B are active and C is unavailable, the model keeps C's full `116 B/s GNSS_CORE + 64 B/s compact telemetry = 180 B/s` reserve. It does not emit fake C telemetry. With the measured RTCM summary and 160-byte fragmentation, the current budget is:

| Scope | Estimated wire rate | 115200 UART utilization |
| --- | ---: | ---: |
| A/B active | 1768.08 B/s | 15.35% |
| A/B plus full C reserve | 1948.08 B/s | 16.91% |

Historical compact polling proved A/B/C `541/541` batches with 1623/1623 matched telemetry frames, zero timeout and about 509 ms average response latency. That evidence supports the 64 B/s per-node compact telemetry budget, but it does not prove RTCM capacity.

The 2026-07-27 RK3568-only PROBE runs showed a different limit. At 160-byte fragmentation, A accepted 57-58/100 fragments and B accepted 64/100. Reducing fragment data to 96 bytes caused A to accept 58/128 and complete only 28/76 RTCM frames. CRC and explicit reject counters stayed zero while incomplete assemblies expired. The near-constant accepted packet count indicates a field-link packet-rate or air-link scheduling boundary rather than a 115200 UART byte-capacity limit. Until a stepped-rate or batching design passes the node counter gate, the 16.91% byte estimate must not be presented as an XLS1 RTCM pass.

The stepped-rate profile then separated packet-rate and frame-size effects. On node A, fixed 90-byte RTCM frames passed through 7.5 Hz (90/90) and failed at 8 Hz (80/96). Fixed 160-byte frames passed at 4 Hz (48/48), lost one frame at 5 Hz (59/60), and fell to 48/72 at 6 Hz. A 250-byte single-fragment experiment at 6 Hz received only 19/72. Large-payload batching is therefore not an accepted solution; the safe region depends on both field-link frame rate and encoded length.

The vendor product page for UM220-IV NK lists GPS L1, BDS B1, Galileo E1 and QZSS support, but not GLONASS. The hardware candidate profile therefore:

- rejects RTCM 1084 before the radio because the receiver cannot use it;
- keeps the newest 1074, 1094, 1114 and 1124 observation per type;
- limits 1124 to 1 Hz while keeping the other supported observation types at 1 Hz;
- preserves 1005/1033 reference messages and absolute generation/TTL evidence;
- uses 160-byte fragmentation and at least 160 ms between field-link RTCM packets;
- drops superseded or expired corrections instead of building latency in a FIFO.

This profile models 540 B/s of RTCM and 852 B/s after field-link framing. Node A passed a 60-second synthetic PROBE with 312/312 accepted fragments, 252/252 completed and PROBE-validated RTCM frames, and 32400/32400 validated bytes. It had no CRC, reassembly, queue, decode, injection or UART-write errors, no late events, and 4.365 ms maximum schedule lateness. The gateway service was restored after the test. Node B went offline before its matching run and node C remains offline, so the result is an A-only candidate gate, not a three-node or RTK Fixed acceptance.

The field-gateway now contains an inactive production shaper core with bounded RTCM3 stream parsing, CRC validation, the UM220 message allow-list, per-type newest-only replacement, 1 Hz observation throttling, TTL expiry and counters. It is intentionally not connected to NTRIP, the serial-port command chain or `LIVE` firmware yet. Integration must preserve the gateway's single port owner, add 160-byte fragmentation and 160 ms packet pacing, and expose shaper and node counters before any real correction is transmitted.

The hardware gate requires a real RTCM capture plus three 1 Hz `GNSS_CORE` uplinks, compact environmental telemetry and injected control commands. Record per node:

- correction age P50/P95/max;
- RTCM complete/injected, duplicate, expired, CRC and reassembly counters;
- GNSS_CORE complete/stale counts and Fixed ratio;
- UART bytes, estimated/observed radio occupancy and queue age;
- command latency and compact telemetry completion/timeout counts.

Initial competition acceptance remains correction age P95 <= 3 s and max <= 5 s, with no old-session injection. A 60-minute mixed-load run is required. Only after this gate passes may the protocol be connected to NTRIP and UM220 on the deployed three-node system.
