# Telemetry Pipeline Capacity Test (2026-07-25)

## Scope

This test measures the current production Compose stack's MQTT -> ingest -> Kafka -> telemetry-writer -> ClickHouse path. It uses revoked, isolated load-test devices only; formal field devices A/B/C are monitored for freshness and are never used as load targets.

Each synthetic telemetry envelope contains 11 metrics. The publisher uses MQTT QoS 1 and reports broker publish acknowledgements. A run is considered lossless only when ClickHouse contains the exact expected number of unique `(device_id, seq)` packets and `11 * packet_count` metric rows after the drain period.

## Results

The multi-topic tests use three load-test devices and run for 30 seconds. `drain` is the time after the publisher stops until all device shadows reach their final sequence.

| Total rate | Packets | ClickHouse packets | Metric rows | Loss | Drain | MQTT p99 | Result |
|---:|---:|---:|---:|---:|---:|---:|:---|
| 1,500 msg/s | 45,000 | 45,000 | 495,000 | 0 | 33.7 s | 21.83 ms | lossless |
| 2,000 msg/s | 60,000 | 60,000 | 660,000 | 0 | 51.2 s | 92.03 ms | lossless |
| 2,500 msg/s | 75,000 | 75,000 | 825,000 | 0 | 66.3 s | 170.95 ms | lossless |
| 2,550 msg/s | 76,500 | 76,472 | 841,192 | 28 (0.037%) | 66.7 s | 181.21 ms | loss observed |
| 2,625 msg/s | 78,750 | 78,516 | 863,676 | 234 (0.30%) | 70.9 s | 401.38 ms | loss observed |
| 2,750 msg/s | 82,500 | 81,516 | 896,676 | 984 (1.19%) | 74.6 s | 382.05 ms | loss observed |
| 3,000 msg/s | 90,000 | 87,533 | 962,863 | 2,467 (2.74%) | 84.0 s | 678.36 ms | loss observed |

The service remained healthy in every run: no core container restart, no OOM, and formal A/B/C maximum data age stayed at or below 2 seconds. At 2,500 msg/s the peak resources were approximately ClickHouse 98.6% CPU / 1.60 GiB and Kafka 97.0% CPU / 1.30 GiB. At 3,000 msg/s both reached approximately 99% CPU.

Earlier single-topic tests show a stricter sustained ceiling of about 750 msg/s. At 800 msg/s the queue began to accumulate, while 1,000 msg/s and above drained eventually but are unsuitable as a continuous operating rate.

## Interpretation

- The current verified three-topic burst ceiling with zero packet loss is **2,500 msg/s** for this server and image set. It is a test ceiling, not a production target: it needs more than one minute to drain and saturates Kafka/ClickHouse.
- Keep normal operation far below saturation. The real field workload (three nodes at one report per second) is several orders of magnitude lower than the tested ceiling.
- MQTT QoS 1 publish acknowledgement only proves that EMQX accepted the publication. During the high-rate runs EMQX reported cumulative `delivery.dropped.queue_full` increments, which explains the missing packets delivered to the ingest subscriber. This is not a ClickHouse silent-write failure.
- The current `maxInFlightRequests=5` producer setting removes the previous cross-topic head-of-line bottleneck while keyed queues preserve per-topic ordering.

## Cleanup and safety

All test devices were registered as `revoked` with metadata `capacity_pool=20260725`. After verification, the ClickHouse UUID range `00000000-0000-4000-9000-000000910000` through `...9100ff` contained zero rows, and all 256 PostgreSQL test device records plus their shadows were deleted. The shared Kafka topic was not deleted; its existing retention policy remains unchanged.

The automated runner is `/tmp/run-telemetry-capacity-step.sh` on the production host. It aborts when A/B/C freshness exceeds 10 seconds or when a core container restarts/OOMs.
