# Field Gateway

`field-gateway` is the RK3568 southbound gateway service for Landslide Monitoring V2. It reads field-node telemetry from serial links, reconstructs messages, validates envelopes, publishes MQTT telemetry, manages command windows, and writes local health files for sidecar services.

## Responsibilities

- Serial ingestion from RK2206/XL01 field links.
- JSON or framed telemetry reconstruction.
- MQTT telemetry publishing and command acknowledgement routing.
- Local spool/cache handling for publish retries and rejected messages.
- Runtime health file output for local monitoring.
- Optional polling mode for shared southbound links.

## Environment

Use `.env.example` as a local template. Deployment values should live in a local `.env`, systemd environment file, or device-management system outside Git.

Common variables:

- `SERIAL_DEVICE` - southbound serial device, for example `/dev/ttyS3`.
- `SERIAL_BAUD_RATE` - serial baud rate, usually `115200`.
- `FIELD_LINK_MODE` - link framing mode, for example `cobs-crc-v1` or `raw-json`.
- `MQTT_URL` - MQTT broker URL.
- `MQTT_USERNAME` / `MQTT_PASSWORD` - optional credentials; set both together when needed.
- `SOUTHBOUND_NODES_JSON` - optional field-node to device/port mapping.
- `SPOOL_ROOT_DIR` - local spool root.
- `HEALTH_FILE_PATH` - runtime health JSON output path.
- `SOUTHBOUND_POLLING_ENABLED` - enables gateway-managed polling on shared links.
- `SOUTHBOUND_POLLING_MODE` - `round-robin-json` for rollback, `compact-broadcast-v1` for V1/V2, `compact-targeted-v1` for V4/V5, or `compact-layered-v1` for V6.
- `SOUTHBOUND_POLLING_INTERVAL_MS` - minimum cooldown after a polling session closes; the indoor profile uses `250` ms.
- `SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS` - receive-protection window. V6 uses `6500` ms but closes immediately when A/B/C are complete, so the bound prevents overlap without delaying healthy rounds.
- `SOUTHBOUND_POLLING_PARTIAL_RETRIES` - `0` or `1`. Production V6 uses `0`; P2 retry remains a diagnostic rollback because field evidence showed it arrived after the original P1 and created redundant traffic.
- `SOUTHBOUND_POLLING_RETRY_AFTER_MS` - initial response and retry window when diagnostic P2 recovery is explicitly enabled; unused by the production V6 profile.
- `SOUTHBOUND_POLLING_PREWRITE_QUIET_MS` / `SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS` - poll-only quiet guard before a serial write.
- `SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES` / `SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS` - poll-only downlink pacing. Normal control commands keep the conservative `COMMAND_SERIAL_*` pacing.
- `SOUTHBOUND_LAYERED_ENVIRONMENT_EVERY_ROUNDS` / `SOUTHBOUND_LAYERED_AUDIT_EVERY_ROUNDS` - V6 P3/P4 extension cadence; the measured profile is `30` and `60` completed core rounds.

In `compact-targeted-v1` mode the gateway rotates A/B/C and sends `P2<node><nonce>`. Only the named node may respond, and the next command is not sent until the complete response arrives or the bounded receive-protection window closes. V4 uses a 157-byte frame; V5 preserves the professional field/RTK prefix in a 128-byte frame. A 3000 ms window still allowed two late V5 responses to form a `207 + 49 = 256` byte interleaving pair; the targeted deployment therefore uses 6000 ms. Successful responses still close the session immediately. The acceptance gate independently keeps command latency at 1500 ms and per-node P95 interval at 2500 ms, so protection does not weaken the speed requirement. `compact-broadcast-v1` and its `0/340/680 ms` slots remain available for the shorter V1/V2 rollback payloads. The gateway expands each binary response back into the telemetry JSON contract before MQTT publishing. Externally issued control commands remain JSON, keep their command ACKs, and pause internal polling while their quiet window is active.

In `compact-layered-v1` mode the gateway sends one `P1<nonce>` core broadcast. A/B/C respond in the existing `0/340/680 ms` slots, so each displacement/tilt core remains a 46-byte payload and a 64-byte complete COBS/CRC frame. RK2206 suppresses repeated delivery of the 256 most recent P1 commands. RK3568 holds the logical round open for at most 6500 ms, closes it immediately when A/B/C are complete, then enforces the configured cooldown; production does not send P2. Scheduler-poll telemetry that does not belong to the active logical round is counted and dropped before MQTT publication. After every 30 completed core rounds, the gateway inserts one targeted `P3<node><nonce>` environment response; after every 60 rounds it inserts one `P4<node><nonce>` RTK/RTCM audit response instead. Audit has priority when both cadences coincide, so one core round can create at most one extension. A scoped window closes only when node, command tag, upload trigger, and scope all match. The telemetry writer only merges scopes sharing the same `sample_epoch`; stale soil, battery, or audit values are never presented as current data.

Indoor V6 deployment keeps `NTRIP_ENABLED=false`, hardware RS485 and battery enabled, and GNSS simulated. Run `scripts/field/xls1_compact_v6_layered_acceptance.py` on RK3568 for the strict `60/600/1800` second gates before preparing a hardware-GNSS outdoor package.

## Local Development

From the repository root:

```bash
npm install
npm run build --workspace @lsmv2/field-gateway
node edge/rk3568-gateway/field-gateway/dist/index.js
```

For full workspace validation:

```bash
npm run edge:build
npm run edge:lint
```

## RK3568 Deployment

Deployment templates live under `deploy/`. A typical board install is:

```bash
sudo bash edge/rk3568-gateway/field-gateway/deploy/install-rk3568.sh \
  --repo-root /opt/landslide-monitoring-v2 \
  --run-user <service-user> \
  --mqtt-url mqtt://<broker-host>:1883
```

The installer keeps an existing environment file by default. Pass `--overwrite-env` when replacing local device configuration.

Default runtime locations:

- systemd unit: `lsmv2-field-gateway.service`
- environment file: `/etc/lsmv2/field-gateway.env`
- state root: `/var/lib/lsmv2/field-gateway`
- health file: `/var/lib/lsmv2/field-gateway/health/runtime-health.json`

Common checks:

```bash
sudo systemctl status lsmv2-field-gateway --no-pager
sudo journalctl -u lsmv2-field-gateway -n 100 --no-pager
cat /var/lib/lsmv2/field-gateway/health/runtime-health.json
bash edge/rk3568-gateway/field-gateway/deploy/check-rk3568-runtime.sh
```

## Local Data

- Do not commit device passwords, broker credentials, private endpoints, or site-specific node maps.
- Keep real runtime data under `/var/lib/lsmv2` or another local state directory outside Git.
- Use `.env.example` and `deploy/*.example` files as templates only.
