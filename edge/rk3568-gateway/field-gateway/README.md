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
- `SOUTHBOUND_POLLING_MODE` - `round-robin-json` for the rollback firmware or `compact-broadcast-v1` for one A/B/C collection batch per second.
- `SOUTHBOUND_POLLING_INTERVAL_MS` - poll start cadence; compact production uses `1000` for one broadcast batch per second.
- `SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS` - command-to-telemetry timeout; a missing node cannot hold the shared link indefinitely.
- `SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES` / `SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS` - poll-only downlink pacing. Normal control commands keep the conservative `COMMAND_SERIAL_*` pacing.

In `compact-broadcast-v1` mode the gateway sends one 28-byte field-link command per second. A/B/C receive that same command and return 64-byte frames in fixed `0/340/680 ms` slots. The gateway expands each binary response back into the unchanged telemetry JSON contract before MQTT publishing. Externally issued control commands remain JSON, keep their command ACKs, and temporarily pause broadcast polling while their quiet window is active.

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
