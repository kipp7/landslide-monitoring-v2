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

## Cold-Boot Baseline

A five-cycle physical power-off/power-on acceptance run on the reference
RK3568 and EC200A hardware produced the following baseline:

- the outbound MQTT connection was available in `24.7-24.9 s` on four cycles;
- one cycle needed `55.7 s` to become stable after a stale reverse-forward
  listener from the previous abrupt power loss was released and retried;
- the modem was registered and attached before the periodic readiness check
  reported an explicit `SIM READY` at about `144 s`;
- no cycle issued an EC200A `AT+CFUN=1,1` reset.

The first readiness check may report `sim_not_ready` while the module is still
initializing. That is a normal startup wait, not a recovery action. Recovery is
used only after the configured repeated-failure threshold is reached. Data can
already be flowing before the slower periodic diagnostic records explicit SIM
readiness.

## Replacing the SIM

Power the RK3568 and EC200A off before inserting or removing a SIM. Do not rely
on hot-swap behavior during a field deployment.

A China Mobile consumer phone SIM normally uses the same `cmnet` APN as the
reference China Mobile IoT SIM, so it usually works without changing the
application or cloud host. Before using a replacement SIM:

- activate mobile data and verify the plan has remaining traffic;
- disable the SIM PIN in a phone, because the guardian does not store or enter
  a PIN;
- confirm the subscription has no device/IMEI restriction or private APN;
- perform a cold boot and verify registration, attach, MQTT, and API reachability
  from the status files below.

Carrier-grade NAT does not prevent this deployment from working because MQTT,
API traffic, and the reverse tunnel are outbound connections from the RK3568.
If a replacement SIM requires an APN other than `cmnet`, update
`EXPECTED_APN` in `/etc/lsmv2/rk3568-cellular-modem-ensure.env`, then restart
the modem readiness service and validate the new profile before competition.

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
