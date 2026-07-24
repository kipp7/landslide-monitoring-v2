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

## RK3568 Deployment

- Service: `lsmv2-field-gateway.service`
- Runtime mode: `SOUTHBOUND_POLLING_MODE=compact-broadcast-v1`
- Serial link: `/dev/ttyS3`, `115200`, `cobs-crc-v1`
- Pre-deployment rollback: `/var/lib/lsmv2/backups/field-gateway-pre-compact-v1-20260724-2145`
- Stable firmware rollback remains in the `competition-suite-20260723` release assets.
