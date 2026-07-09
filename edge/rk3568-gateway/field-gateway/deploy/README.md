# Field Gateway Deployment

This directory contains public deployment templates for the RK3568 `field-gateway` service and its optional network-bootstrap helper.

## Files

| File | Purpose |
| --- | --- |
| `field-gateway.service.template` | systemd unit template for `field-gateway`. |
| `field-gateway.env.rk3568.example` | Example RK3568 environment file with placeholder values. |
| `install-rk3568.sh` | Installs or updates the `field-gateway` systemd service. |
| `check-rk3568-runtime.sh` | Prints a sanitized runtime snapshot for the gateway. |
| `rk3568-network-bootstrap.py` | Optional STA-first/AP-fallback network helper. |
| `rk3568-network-bootstrap.service.template` | systemd unit template for network bootstrap. |
| `rk3568-network-bootstrap.env.example` | Example network-bootstrap environment file. |
| `install-rk3568-network-bootstrap.sh` | Installs or updates the network-bootstrap service. |
| `check-rk3568-network-bootstrap.sh` | Prints a sanitized network-bootstrap runtime snapshot. |

## Typical Install

Run from the repository root on an RK3568 device:

```bash
sudo bash edge/rk3568-gateway/field-gateway/deploy/install-rk3568.sh \
  --repo-root /opt/landslide-monitoring-v2 \
  --run-user <service-user> \
  --mqtt-url mqtt://<broker-host>:1883
```

The installer preserves an existing `/etc/lsmv2/field-gateway.env` by default. Use `--overwrite-env` when replacing local device configuration.

## Runtime Defaults

| Item | Default |
| --- | --- |
| systemd unit | `lsmv2-field-gateway.service` |
| environment file | `/etc/lsmv2/field-gateway.env` |
| state root | `/var/lib/lsmv2/field-gateway` |
| health file | `/var/lib/lsmv2/field-gateway/health/runtime-health.json` |
| serial baseline | `/dev/ttyS3`, `115200 8N1` |

## Checks

```bash
sudo systemctl status lsmv2-field-gateway --no-pager
sudo journalctl -u lsmv2-field-gateway -n 100 --no-pager
cat /var/lib/lsmv2/field-gateway/health/runtime-health.json
bash edge/rk3568-gateway/field-gateway/deploy/check-rk3568-runtime.sh
```

## Network Bootstrap

The network-bootstrap helper can maintain an STA-first network profile with optional AP fallback. Configure real SSIDs and PSKs only in local environment files:

```bash
sudo bash edge/rk3568-gateway/field-gateway/deploy/install-rk3568-network-bootstrap.sh \
  --repo-root /opt/landslide-monitoring-v2 \
  --sta-ssid <uplink-ssid> \
  --sta-psk <uplink-password> \
  --ap-ssid <setup-ap-ssid> \
  --ap-psk <setup-ap-password>
```

## Local Data

- Do not commit real broker URLs, Wi-Fi PSKs, device passwords, private endpoints, or site-specific node maps.
- Keep generated runtime state under `/var/lib/lsmv2` or another local path outside Git.
- Treat files in this directory as deployment templates and review deployment values per site.
