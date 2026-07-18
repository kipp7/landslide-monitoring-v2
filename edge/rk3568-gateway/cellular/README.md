# RK3568 Cellular Uplink

This directory contains the RK3568-side deployment helpers used to keep a
Quectel EC200A cellular uplink available after boot.

## Components

| File | Purpose |
| --- | --- |
| `rk3568-cellular-modem-ensure.py` | Reads SIM, registration, attach, APN, signal, and USB-network state; performs a bounded modem reset only after repeated modem faults. |
| `install-rk3568-cellular-modem-ensure.sh` | Installs the modem ensure script and its systemd service/timer. |
| `install-rk3568-cellular-link-guardian.sh` | Installs the route and cloud business-port guardian. |
| `install-rk3568-tunnel-sshd-keepalive.sh` | Applies server-side SSH keepalive limits for a dedicated reverse-tunnel account. |
| `install-cloud-rk3568-tunnel-cwp-bypass.sh` | Keeps key-only SSH reachable when Tencent CWP/YunJing rejects changing carrier egress addresses. |

## Design Boundary

- Modem readiness is based on AT state and `usb0`, not cloud availability.
- Cloud business health checks MQTT/API ports only. SSH administration is a
  separate path and must not mark a healthy telemetry link as failed.
- Modem recovery requires repeated failures, has a cooldown, and is limited to
  one `AT+CFUN=1,1` reset per boot by default.
- A disabled reverse-tunnel service is not restarted by either guardian.
- Real cloud addresses, credentials, APNs, interface names, and connection
  profile names belong in local environment files.

Tencent CWP/YunJing may classify a carrier-grade NAT address before the RK3568
uses it. A fixed source-IP allowlist is therefore not durable. The optional
cloud installer keeps an SSH-only accept rule before the YunJing input jump and
hardens sshd to public-key authentication for the named admin and tunnel users.
It does not bypass filtering for MQTT, API, database, or other host ports.

## Install

Install modem readiness checks on the RK3568:

```bash
sudo bash edge/rk3568-gateway/cellular/install-rk3568-cellular-modem-ensure.sh
```

Install the business-link guardian with a site-specific cloud endpoint:

```bash
sudo CLOUD_HOST=<cloud-host-or-ip> \
  CHECK_PORTS=1883,8080 \
  bash edge/rk3568-gateway/cellular/install-rk3568-cellular-link-guardian.sh
```

Existing modem-ensure configuration is preserved. The link-guardian installer
writes `/etc/lsmv2/rk3568-cellular-link-guardian.env` from the values supplied
at install time.

On the cloud host, after creating the dedicated tunnel account:

```bash
sudo ADMIN_USER=<admin-user> TUNNEL_USER=<tunnel-user> \
  bash edge/rk3568-gateway/cellular/install-cloud-rk3568-tunnel-cwp-bypass.sh
```

Use this only when SSH password authentication is already disabled and both
accounts have verified public keys. The installer validates sshd before reload
and restores the previous hardening file if validation fails.

## Validate

```bash
python3 edge/rk3568-gateway/cellular/rk3568-cellular-modem-ensure.py --self-test
bash -n edge/rk3568-gateway/cellular/install-rk3568-cellular-modem-ensure.sh
bash -n edge/rk3568-gateway/cellular/install-rk3568-cellular-link-guardian.sh
bash -n edge/rk3568-gateway/cellular/install-rk3568-tunnel-sshd-keepalive.sh
bash -n edge/rk3568-gateway/cellular/install-cloud-rk3568-tunnel-cwp-bypass.sh
```

On a deployed board:

```bash
cat /var/lib/lsmv2/cellular-cloud/modem-status.json
cat /var/lib/lsmv2/cellular-cloud/status.json
systemctl status lsmv2-rk3568-cellular-modem-ensure.timer --no-pager
systemctl status lsmv2-rk3568-cellular-link-guardian.timer --no-pager
```

On the cloud host:

```bash
systemctl status lsmv2-rk3568-cwp-ssh-allow.timer --no-pager
cat /var/lib/lsmv2/cloud-security/cwp-ssh-allow-status.json
sshd -T | grep -E 'permitrootlogin|passwordauthentication|maxauthtries|allowusers'
```

Do not commit populated environment files, SSH keys, SIM identifiers, carrier
addresses, or site-specific cloud endpoints.
