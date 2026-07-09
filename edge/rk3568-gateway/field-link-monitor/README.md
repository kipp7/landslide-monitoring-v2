# Field Link Monitor

`field-link-monitor` is a read-only RK3568 sidecar that summarizes local gateway and network health. It does not read serial devices, publish MQTT telemetry, send field commands, restart gateway services, or modify gateway state.

## Responsibilities

- Read `field-gateway` runtime health evidence.
- Read local network-bootstrap status when available.
- Produce a field-link quality summary.
- Expose read-only localhost HTTP endpoints for local UI, diagnostics, or supervision layers.

## Read-Only Boundary

Allowed:

- Display link level, node status, publish freshness, parser noise, and local network state.
- Convert health evidence into operator or maintainer guidance.
- Support local diagnostic dashboards through read-only endpoints.

Not allowed:

- Open or take over southbound serial devices.
- Publish MQTT telemetry instead of `field-gateway`.
- Restart `field-gateway` automatically.
- Modify gateway spool, health, or environment files.
- Switch Wi-Fi/AP state without an explicit operator-controlled workflow.

## Environment

Use `.env.example` as a local template. Key variables:

- `GATEWAY_HEALTH_FILE_PATH` - gateway health file path.
- `NETWORK_STATUS_FILE_PATH` - network-bootstrap status file path.
- `SUMMARY_FILE_PATH` - generated summary output.
- `HTTP_HOST` - listen host, defaulting to localhost in development.
- `HTTP_PORT` - listen port.
- `POLL_INTERVAL_MS` - local status polling interval.

## Local Development

From the repository root:

```bash
npm install
npm run build --workspace @lsmv2/field-link-monitor
node edge/rk3568-gateway/field-link-monitor/dist/index.js
```

Endpoints:

- `GET /healthz`
- `GET /v1/summary`
- `GET /v1/automation`

## RK3568 Deployment

```bash
sudo bash edge/rk3568-gateway/field-link-monitor/deploy/install-rk3568-field-link-monitor.sh \
  --repo-root /opt/landslide-monitoring-v2 \
  --run-user <service-user>
```

Common checks:

```bash
sudo systemctl status lsmv2-field-link-monitor --no-pager
sudo journalctl -u lsmv2-field-link-monitor -n 100 --no-pager
bash edge/rk3568-gateway/field-link-monitor/deploy/check-rk3568-field-link-monitor.sh
```

## Public Safety Notes

Keep real health snapshots, network state, and site-specific configuration outside Git. Commit only examples and templates with placeholder values.
