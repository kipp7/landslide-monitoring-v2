# RK2206 Compact V6 Layered Acceptance

## Purpose

Compact V6 is the next three-node XLS1 telemetry candidate after Compact V5
proved lossless only with a slow 6-second guard. V6 keeps every normal
telemetry wire frame inside one nominal XLS1 64-byte session packet while
retaining the professional displacement, real RS485, and battery evidence.

This document defines the indoor transport gate. It does not prove RTK Fixed,
centimetre-level displacement, CORS operation, or the outdoor algorithm.

## Indoor Truth Profile

- XLS1 on PB2/PB3: hardware.
- SC16IS752 on PB4/PB5: hardware.
- RS-ECTH-N01-TR-1 soil temperature/moisture/EC: hardware.
- RS-DIP-N01-1 three-axis tilt: hardware.
- PC0 battery input: hardware with the final per-node field calibration.
- GNSS: simulated; the UM220 PB6/PB7 UART is not initialized.
- RTCM/NTRIP: disabled and fail-closed.
- SHT30, MPU6050, and rain sensor: disabled and absent from the contract.

## Wire Contract

Every V6 payload is exactly 46 bytes. COBS, CRC32, field-link header, and the
delimiter make every complete telemetry frame exactly 64 bytes.

The common 20-byte header contains `LS`, version 6, node number, status, scope,
validity bitmap, non-zero sequence, non-zero sensor `sample_epoch`, and command
correlation tag. Sequence and epoch wrap from `0xffffffff` to `1`; zero is
reserved and rejected by the C, TypeScript, and Python implementations.

| Scope | Poll | Normal content |
| --- | --- | --- |
| core | P1 broadcast | three-axis tilt, precise position, MSL altitude, fix quality, satellites, HDOP, correction/solution age, horizontal GST |
| environment | P3 targeted | uptime, calibrated battery, soil temperature/moisture/EC, geoid separation, GNSS week/TOW, vertical GST |
| audit | P4 targeted | RTCM mode/session/lease/queue/error summary, fix flags, Fixed streak/ratio/drop count, station ID, full horizontal GST |

P1 uses fixed A/B/C response slots `0/340/680 ms`. RK2206 remembers the eight
most recent P1 commands and suppresses repeated delivery before entering a
response slot. After the initial 1500 ms window, RK3568 sends a new targeted P2
to each missing node, one at a time; it never retransmits the same P1. A
completed logical core round may schedule at most one targeted extension. P3
is selected every 30 completed core rounds; P4 is selected every 60 and has
priority when both are due. Extension targets rotate A/B/C. An extension never
overlaps a core/recovery window, another scoped poll, a normal command, or an
RTCM write.

## Snapshot And Merge Rules

- RK2206 takes one mutex-protected sensor snapshot for a core response.
- P3/P4 reuse the most recently sent core sensor snapshot and its
  `sample_epoch`; each transmitted scope receives its own increasing `seq`.
- P3/P4 fail closed until a valid core snapshot exists after boot.
- RTCM runtime counters in audit are read at audit response time; they are
  operational evidence, not a claim that RTCM was sampled at the sensor epoch.
- RK3568 rejects a response whose scope does not match the active P3/P4 window,
  preserves the correct window for a possible later response, and stores the
  rejected frame as local evidence without publishing it.
- The telemetry writer merges environment/audit only when their epoch exactly
  equals the current core epoch. Older extension data remains diagnostic state
  but cannot appear in the flattened current metrics.
- A verified V6 reboot requires a core packet, strict sequence rollback, epoch
  rollback or equality, and a receive time newer than the stored shadow. The
  writer then clears all old scopes before accepting the new boot. Equal-seq
  duplicates are rejected.
- ClickHouse per-message isolation rebuilds the device shadow only from
  messages that were inserted successfully; a DLQ message cannot leak into the
  latest flattened state.

## Offline Release Gates

All of the following must pass from the same source commit before an immutable
release is prepared:

1. RK2206 compact builder, GNSS, RTCM, field-link, RS485, battery, and snapshot
   host/safety tests.
2. TypeScript/Python V6 golden vectors with the exact core/environment/audit
   payloads and 64-byte complete frames.
3. Field-gateway build, lint, unit tests, scope rejection, serial transport-loss
   cleanup, and configuration validation.
4. Telemetry-writer build, lint, sequence reset, same-epoch merge, and isolated
   ClickHouse replay tests.
5. API build/tests and Windows production build/lint for the existing flattened
   fields. The repository-wide API lint currently has 68 pre-existing errors in
   unrelated route files; V6 must not add errors, and that baseline gap remains
   explicit until it is fixed separately.
6. A/B/C OpenHarmony clean builds with hardware RS485, simulated GNSS, disabled
   RTCM, unique identities, and final battery calibration.
7. Release marker, pin, startup, TX ordering, poll cadence, manifest, hash, and
   clean-source safety gates.

The official prepare script must reject a dirty Git worktree. Compile artifacts
from dirty source are evidence only and must not be flashed.

## RK3568 Prerequisites

Before taking the serial port, the acceptance runner must verify:

- `/dev/ttyS3` at 115200 and the service/environment paths exist;
- the field-gateway environment is protected and `NTRIP_ENABLED=false`;
- no previous runtime hold exists;
- production polling can be stopped, the port can reach 5 seconds of quiet,
  and the service will be restored on success, failure, signal, or exception.

Run the prerequisite check and the fail-fast sequence with:

```bash
sudo python3 scripts/field/xls1_compact_v6_layered_acceptance.py \
  --required-gnss-source simulated --check-prerequisites

sudo python3 scripts/field/xls1_compact_v6_layered_acceptance.py \
  --required-gnss-source simulated
```

## Strict 60/600/1800 Gate

The default stages are 60, 600, and 1800 seconds. Stop at the first failure.
Every stage requires:

- all logical core rounds complete with A/B/C responses, directly from P1 or
  through bounded missing-node P2 recovery;
- every expected P3 and P4 response matched;
- exactly 64 bytes for every complete telemetry frame;
- zero decode, trailing-byte, unmatched, duplicate, scope, epoch, profile, and
  non-forward/non-unit sequence errors;
- per-node core arrival P95 `<=2500 ms`;
- core command-to-telemetry maximum `<=1500 ms` from the command that produced
  the accepted response;
- valid hardware tilt in core;
- valid field-calibrated battery and complete soil temperature/moisture/EC in
  environment;
- simulated GNSS explicitly untrusted and displacement-ineligible;
- audit RTCM exactly disabled/ready-only, with zero session, lease, queue,
  injection count, and error summary.

Reports remain on RK3568 under `/var/lib/lsmv2/experiments` and the resumable
memory records only store conclusions and hashes. Reports must not contain
CORS credentials, real coordinates, or raw RTCM.

## Promotion Boundary

Only after all three indoor stages pass may the project prepare a separate
clean hardware-GNSS V6 build for outdoor testing. CORS/RTCM/NTRIP remain off
until that new build first passes pure telemetry, then PROBE, then LIVE, and
finally sustained outdoor `GGA=4`/trusted displacement gates. Indoor simulated
coordinates must never seed the displacement baseline.
