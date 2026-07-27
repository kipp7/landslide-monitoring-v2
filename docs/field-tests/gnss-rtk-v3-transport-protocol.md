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

The hardware gate requires a real RTCM capture plus three 1 Hz `GNSS_CORE` uplinks, compact environmental telemetry and injected control commands. Record per node:

- correction age P50/P95/max;
- RTCM complete/injected, duplicate, expired, CRC and reassembly counters;
- GNSS_CORE complete/stale counts and Fixed ratio;
- UART bytes, estimated/observed radio occupancy and queue age;
- command latency and compact telemetry completion/timeout counts.

Initial competition acceptance remains correction age P95 <= 3 s and max <= 5 s, with no old-session injection. A 60-minute mixed-load run is required. Only after this gate passes may the protocol be connected to NTRIP and UM220 on the deployed three-node system.
