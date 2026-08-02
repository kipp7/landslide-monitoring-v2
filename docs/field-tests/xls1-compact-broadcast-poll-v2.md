# XLS1 Compact Broadcast Poll v2

## Goal

Collect A, B and C with one bounded broadcast session at a time, without asking the three nodes to transmit on the same radio channel at the same time.

## Downlink

The gateway sends one ASCII command after the previous three-node response window has closed and the configured cooldown has elapsed:

```text
P1xxxxxxxx
```

- `P1` identifies compact broadcast poll v1.
- `xxxxxxxx` is an uppercase hexadecimal nonce.
- Payload size is 10 bytes; the field-link wire frame is 28 bytes including header, CRC32, COBS and delimiter.
- The FNV-1a tag of the complete 10-byte command is copied into each compact telemetry response for correlation.

## Uplink Slots

| Node | Delay after command reception |
| --- | ---: |
| A | 0 ms |
| B | 340 ms |
| C | 680 ms |

Each response remains a 46-byte compact telemetry payload and a 64-byte field-link wire frame. The 340 ms slot width follows the existing XL01 driver's 300 ms asynchronous-send guard and leaves a small scheduling margin.

JSON commands remain available for device control. Only the high-frequency telemetry polling path uses the compact broadcast command.

## Production Gateway Integration

The RK3568 field gateway supports `SOUTHBOUND_POLLING_MODE=compact-broadcast-v1`.

- The COBS/CRC assembler preserves the binary payload instead of converting it to UTF-8 first.
- RK3568 expands each 46-byte telemetry payload into the existing telemetry JSON contract before MQTT publishing.
- The command tag correlates each A/B/C response with its broadcast batch.
- Normal JSON device-control commands remain unchanged and pause broadcast polling while their ACK window owns the serial port.
- Runtime health exposes issued, completed, matched, duplicate, unmatched, timed-out and bounded-retry counters.
- A per-port admission controller rejects a second broadcast while one is in flight.
- A complete or partial response resets the empty-response streak. An all-node timeout applies exponential backoff, bounded by the configured maximum.
- `SOUTHBOUND_POLLING_INTERVAL_MS` is a cooldown after a response window closes, not a fixed wall-clock launch period.
- Optional partial recovery rebroadcasts the same `P1` tag at most once. Normal complete rounds add no wire traffic. A response observed after retry dispatch is reported as such; the gateway does not claim the second command caused it because a delayed first response is indistinguishable on this link.

## 2026-07-24 Live Result

An early isolated test was contaminated by old JSON commands retained in the gateway-side XLS1 queue. The unmatched frames followed the exact old `A -> B -> C` 2.5-second production rhythm and their tags matched old command UUIDs. A 60-second warm-up was insufficient because the previous service had accumulated a much deeper queue.

After deploying the compact production gateway, no new JSON polling commands entered that queue. Continued compact broadcasts drained the remaining old commands. The following cumulative RK3568 health snapshot then contained only current tag-matched responses:

| Signal | Result |
| --- | ---: |
| Observation window | about 210 seconds |
| Broadcast batches issued | 210 |
| A telemetry | 210 |
| B telemetry | 210 |
| C telemetry | 210 |
| Tag-matched telemetry | 630 / 630 |
| MQTT published | 630 / 630 |
| Poll timeouts | 0 |
| Duplicate telemetry | 0 |
| Schema/decode rejects | 0 |
| Suspected interleaving | 0 |
| MQTT publish failures | 0 |
| Spool pending | 0 |
| Average command-to-response latency | 509 ms across all slots |
| Maximum command-to-response latency | 877 ms |

This proves one gateway broadcast collects all three nodes inside the one-second window on the powered test hardware. It is not three sequential node polls and it does not ask the three radios to transmit simultaneously.

### Final Soak And Cloud Persistence

After the final observability build restarted, the production service completed another `541/541` broadcast batches:

- A/B/C each produced `541` current-tag telemetry frames (`1623/1623` total).
- Completed batches: `541`; timeout, duplicate and unmatched counters: `0/0/0`.
- Schema rejects, suspected interleaving, command write failures and MQTT publish failures: all `0`.
- Spool pending remained `0`; one record interrupted by the controlled service restart was replayed successfully.
- Final average response latency was `509 ms`; maximum after restart was `870 ms` (`877 ms` maximum across the complete deployment observation).

ClickHouse independently confirmed the northbound path and database write rate:

| Device | Distinct sequences in 60 s | Distinct sequences in 300 s | Latest row age at query |
| --- | ---: | ---: | ---: |
| A | 61 | 301 | 564 ms |
| B | 61 | 301 | 225 ms |
| C | 61 | 300 | 885 ms |

The expected one-sample-per-second rate is therefore present at the database, not only at the RK3568 serial or MQTT layer.

## RK3568 Deployment

- Service: `lsmv2-field-gateway.service`
- Runtime mode: `SOUTHBOUND_POLLING_MODE=compact-broadcast-v1`
- Serial link: `/dev/ttyS3`, `115200`, `cobs-crc-v1`
- Pre-deployment rollback: `/var/lib/lsmv2/backups/field-gateway-pre-compact-v1-20260724-2145`
- Stable firmware rollback remains in the `competition-suite-20260723` release assets.

## 2026-08-01 Three-Node Rehearsal Profile

The temporary rehearsal firmware simulates only the unavailable RS485 soil, EC and tilt inputs. UM220 GNSS and the PC0 battery measurement remain real. The simulated build must report compact payload version 2 and `field_sensor_source=simulated`; it must never initialize PB4/PB5 or SC16IS752.

Flash the node-specific images from:

```text
F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_simulated_20260801
```

Run a strict 60-second preflight on RK3568:

```bash
sudo python3 /usr/local/bin/xls1_three_node_batch_poll.py \
  --broadcast-poll \
  --duration-seconds 60 \
  --batch-interval-ms 1000 \
  --broadcast-response-timeout-ms 5000 \
  --required-match-rate 1.0 \
  --required-compact-version 2 \
  --required-field-sensor-source simulated \
  --require-field-sensors-valid \
  --require-battery-valid \
  --max-p95-interval-ms 2500 \
  --max-command-latency-ms 1200 \
  --fail-on-gate
```

Exit code `0` and `result.stableProfile=true` require all three nodes, 100% command matching, continuous node sequence numbers, zero duplicate/unmatched/decode/profile violations, no trailing partial frame, valid simulated field measurements, valid PC0 battery readings, and the configured interval/latency limits. `--broadcast-response-timeout-ms 5000` prevents the test itself from overlapping broadcast sessions. When the service was active, the script installs a temporary `/run` systemd drop-in with `Restart=no` and `RefuseManualStart=yes`, stops the service, then removes the drop-in and restores the service in `finally`. A runtime mask is not sufficient when the unit file itself lives under `/etc/systemd/system`.

`result.batchCompleteness` separates complete, partial and empty rounds and records the longest and trailing empty-round streaks. `simultaneousSilenceAfterHealthyTraffic=true` is a factual diagnostic for at least three complete rounds followed by at least three trailing rounds with no A/B/C response. It does not identify the cause by itself; confirm the original baseline and RK3568/network availability before attributing the failure to a candidate timing parameter.

### 2026-08-02 Strict Gate Result

The powered A/B/C rehearsal firmware and deployed RK3568 gateway passed the 600-second strict gate:

| Signal | Result |
| --- | ---: |
| Broadcast rounds | 310 |
| Matched telemetry | 930 / 930 |
| A / B / C frames | 310 / 310 / 310 |
| Per-node sequence range | 570..879 |
| Sequence gaps / duplicates / regressions | 0 / 0 / 0 |
| Decode / profile / unmatched / trailing-frame errors | 0 / 0 / 0 / 0 |
| Maximum A / B / C command latency | 315.6 / 641.7 / 955.1 ms |

The report remains on RK3568 at `/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-20260802-004710.json`; its SHA-256 is `a1341efba950f8cd36e04b627078ec1741a559f41b78e1705fe4160ad2916a63`. Do not commit the raw report because later hardware runs may contain real GNSS coordinates.

With a 1000 ms cooldown after all three responses, the measured round period is about 1.94 seconds. This is deliberately not described as fixed 1 Hz polling. A post-power-up runtime check added another 93 complete rounds and 279 matched frames with every node sequence advancing by 93 and all error counters remaining zero.

### 2026-08-02 Bounded Partial Retry

A later no-retry 1000 ms cooldown baseline proved that interval tuning alone was not the root fix. Its 1800-second result contained 917 rounds, of which 911 were complete and 6 were partial. A/B/C missed `4/2/0` logical responses while every received node sequence remained continuous and decode, profile, duplicate, unmatched and trailing-frame errors stayed zero. The report SHA-256 is `ba8315faa13e645647a87ded8cdb42ed193c1d64a7acb3ca5353f9d75620b7b1`.

The accepted recovery profile keeps the 1000 ms post-session cooldown and adds these hard bounds:

- Initial response window: 1200 ms.
- Partial retries: at most one rebroadcast of the same `P1` command and tag.
- Total logical session limit: 2500 ms.
- Acceptance limits: retry rounds at most 2%, logical response latency at most 2500 ms, 100% logical matching and all existing strict protocol gates.
- One retry response per node is classified as expected retry redundancy. Any additional same-node response remains a real duplicate error.

Evidence was collected in three steps:

| Gate | Result |
| --- | --- |
| Forced 500 ms window, 20 s | 11/11 complete rounds and 33/33 logical frames while every round exercised one retry; sequence and protocol gates stayed clean. |
| Real 1200 ms window, 600 s | 310/310 complete rounds and 930/930 frames; one retry round (`0.3226%`) matched the missing A response after retry dispatch, with 1503.8 ms maximum logical latency and two expected redundant responses. |
| Final 1200 ms window, 1800 s | 929/929 complete rounds and 2787/2787 frames; no retry was needed, all three sequences were continuous and every protocol/error counter remained zero. |

The 600-second and final 1800-second report SHA-256 values are `fff4792c3b0f28ba4d5b09222ede60e0f8dc1d60107cd600f042ad6643ca2ceb` and `0cc143af8102924d80de0823ce99d3cbe072db2e288e52880f7c368bda66998a`. Raw reports remain outside Git.

Production uses `SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS=2500`, `SOUTHBOUND_POLLING_PARTIAL_RETRIES=1` and `SOUTHBOUND_POLLING_RETRY_AFTER_MS=1200`. An adversarial follow-up made the name and behavior exact: an empty response window closes into the existing exponential backoff without a retry, and only a `1..N-1` partial response can consume the single retry. Each node may contribute at most one expected redundant retry response; later copies are ordinary duplicate errors. The current rollback directory is `/home/linaro/lsmv2-backups/field-gateway-pre-empty-retry-boundary-20260802-163637`. Deployed `index.js`, `config.js` and `compact-poll-retry.js` SHA-256 values are `849f03659ed4ee8d890687ed4eb02a6d188255a5d1805ec91e60d64173c15a67`, `903ffbb9dcdd09a5feccdecaf590741c04b42edcc6c79fde2a4a4deb35724f36` and `320f0b148ea4b60accf42a9d38314acc1e0fb0d8257316200323a7aa2a52a71b`. After the controlled restart, the corrected build reached 61/61 complete rounds and 183/183 frames with zero retry, retry-write, timeout, duplicate, unmatched, rejected or spool-pending counters; field-gateway, Hermes and the reverse tunnel were active and the cloud route still used 4G `usb0`.

A 2026-08-02 16:23 CST production snapshot extended the post-deployment observation to 536/536 completed rounds and 1608/1608 matched A/B/C frames. The three nodes were online, serial and MQTT were connected, and retry, timeout, duplicate, unmatched, rejected and spool-pending counters were all zero. The final 1800-second report also provided 929 battery samples per node under neutral calibration: A stayed at 10.997 V, B spanned 10.967..10.982 V with a 10.971 V median, and C spanned 11.770..11.771 V with an 11.770 V median. This proves low sampling noise but not absolute accuracy; all three remain `default-calibration` until simultaneous multimeter readings produce per-node gains.

Test in this order:

1. Run the strict 60-second preflight at 1000 ms.
2. Run the same profile for 600 seconds to establish the zero-loss baseline.
3. If both pass, change only `--batch-interval-ms`: test 950, 900, 850 and 800 ms, stopping at the first failure.
4. Confirm the fastest passing candidate for at least 1800 seconds.

Do not change the node slots, UART chunk size, UART chunk delay or XLS1 module parameters during the interval sweep. When the RS485 interface parts arrive, rebuild with `-FieldSensorMode hardware -GnssRtcmInjectionMode disabled`; do not hand-edit the simulator or XLS1 driver.

After the neutral firmware passes the 60-second strict preflight, use the separate [RK2206 PC0 battery calibration procedure](rk2206-pc0-battery-calibration.md) to generate independent A/B/C gain values from simultaneous multimeter readings. Calibration and communication tuning are separate experiments; do not flash calibrated images during an interval sweep already in progress.
