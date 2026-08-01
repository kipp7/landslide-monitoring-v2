# XLS1 Compact Broadcast Poll v2

## Goal

Collect A, B and C once per second without asking the three nodes to transmit on the same radio channel at the same time.

## Downlink

The gateway sends one ASCII command per second:

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
- Runtime health exposes issued, completed, matched, duplicate, unmatched and timed-out broadcast counters.

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
  --runtime-mask-service \
  --broadcast-poll \
  --duration-seconds 60 \
  --batch-interval-ms 1000 \
  --required-match-rate 1.0 \
  --required-compact-version 2 \
  --required-field-sensor-source simulated \
  --require-field-sensors-valid \
  --require-battery-valid \
  --max-p95-interval-ms 1500 \
  --max-command-latency-ms 950 \
  --fail-on-gate
```

Exit code `0` and `result.stableProfile=true` require all three nodes, 100% command matching, continuous node sequence numbers, zero duplicate/unmatched/decode/profile violations, no trailing partial frame, valid simulated field measurements, valid PC0 battery readings, and the configured interval/latency limits. The script restores `lsmv2-field-gateway.service` only when it was active before the test.

Test in this order:

1. Run the strict 60-second preflight at 1000 ms.
2. Run the same profile for 600 seconds to establish the zero-loss baseline.
3. If both pass, change only `--batch-interval-ms`: test 950, 900, 850 and 800 ms, stopping at the first failure.
4. Confirm the fastest passing candidate for at least 1800 seconds.

Do not change the node slots, UART chunk size, UART chunk delay or XLS1 module parameters during the interval sweep. When the RS485 interface parts arrive, rebuild with `-FieldSensorMode hardware -GnssRtcmInjectionMode disabled`; do not hand-edit the simulator or XLS1 driver.
