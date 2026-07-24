# Telemetry Reliability and Recovery Test (2026-07-25)

## Long-running soak

Three isolated `revoked` devices ran at the expected competition rate: 3 MQTT messages per second total, one message per device per second, for 30 minutes.

| Check | Result |
|---|---:|
| Published / acknowledged packets | 5,400 / 5,400 |
| ClickHouse metric rows | 59,400 / 59,400 |
| Unique `(device_id, seq)` packets | 5,400 |
| Per-device sequence | 1..1,800 for all three devices |
| Publish p99 / max latency | 1.73 ms / 7.40 ms |
| Drain after publisher | 4.96 s |
| Formal A/B/C maximum age | 2 s |
| Core container restarts / OOM | 0 / 0 |
| Kafka lag after drain | 0 |

The soak ran from `2026-07-24T21:07:03Z` to `2026-07-24T21:37:13Z`. Resource usage remained bounded; ClickHouse peaked at about 987 MiB and telemetry-writer at about 34 MiB. Kafka had transient CPU bursts but no persistent lag.

## Recovery tests

Each recovery test used three different isolated devices and 900 packets (300 per device) at 3 msg/s.

| Injected fault | Result |
|---|---|
| Restart `telemetry-writer` during publish | 900/900 packets and 9,900/9,900 metric rows; sequences 1..300; service running afterward |
| Restart ClickHouse during publish | 900/900 packets and 9,900/9,900 metric rows; Kafka lag returned to 0; ClickHouse healthy afterward |
| Restart EMQX broker | Formal A/B/C resumed ingest within the 10-second observation window; all three device ages remained 1 s and ingest logs resumed for every device |

The tests did not reboot the whole VPS. They cover the service-level failures that can interrupt telemetry persistence while leaving the host and network reachable. A separate host-reboot acceptance remains useful before the competition if a maintenance window is available.

## Cleanup

All nine soak/recovery devices were deleted from PostgreSQL, their shadows were deleted, and the ClickHouse test UUID range `...910040` through `...910055` contains zero rows. The shared Kafka topic was not deleted. Final checks showed Kafka lag `0`, A/B/C age `1 s`, all core containers running, and 147 GiB free disk space.
