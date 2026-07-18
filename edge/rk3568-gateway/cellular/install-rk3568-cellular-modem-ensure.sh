#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_PATH="${SCRIPT_DIR}/rk3568-cellular-modem-ensure.py"
ENV_PATH=/etc/lsmv2/rk3568-cellular-modem-ensure.env
SERVICE_NAME=lsmv2-rk3568-cellular-modem-ensure.service
TIMER_NAME=lsmv2-rk3568-cellular-modem-ensure.timer

if [[ ! -f "${SOURCE_PATH}" ]]; then
  echo "missing ${SOURCE_PATH}" >&2
  exit 1
fi

if ! python3 -c 'import serial' >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3-serial
fi

install -d -m 0755 /etc/lsmv2 /usr/local/sbin /var/lib/lsmv2/cellular-cloud
install -m 0755 "${SOURCE_PATH}" /usr/local/sbin/lsmv2-rk3568-cellular-modem-ensure.py

if [[ ! -f "${ENV_PATH}" ]]; then
  cat >"${ENV_PATH}" <<'EOF'
AT_PORT=/dev/ttyUSB2
EXPECTED_APN=cmnet
ENUM_WAIT_SECONDS=45
POST_RESET_WAIT_SECONDS=20
POST_RESET_ENUM_WAIT_SECONDS=90
RECOVERY_FAILURE_THRESHOLD=2
REGISTRATION_FAILURE_THRESHOLD=4
RECOVERY_COOLDOWN_SECONDS=600
MAX_RESETS_PER_BOOT=1
USB_DEVICE=usb0
USB_CONNECTION_NAME="有线连接 2"
FIELD_GATEWAY_SERVICE=lsmv2-field-gateway.service
REVERSE_TUNNEL_SERVICE=lsmv2-rk3568-reverse-tunnel.service
GUARDIAN_SERVICE=lsmv2-rk3568-cellular-link-guardian.service
MODEM_STATUS_FILE=/var/lib/lsmv2/cellular-cloud/modem-status.json
MODEM_STATE_FILE=/var/lib/lsmv2/cellular-cloud/modem-state.json
MODEM_LOCK_FILE=/run/lsmv2-cellular-modem-ensure.lock
EOF
fi
chmod 0644 "${ENV_PATH}"

cat >/etc/systemd/system/${SERVICE_NAME} <<'EOF'
[Unit]
Description=LSMV2 RK3568 EC200A modem readiness and recovery
Wants=NetworkManager.service
After=systemd-udev-trigger.service NetworkManager.service
Before=lsmv2-rk3568-reverse-tunnel.service lsmv2-rk3568-cellular-link-guardian.service

[Service]
Type=oneshot
EnvironmentFile=-/etc/lsmv2/rk3568-cellular-modem-ensure.env
ExecStart=/usr/bin/python3 /usr/local/sbin/lsmv2-rk3568-cellular-modem-ensure.py
TimeoutStartSec=180
Nice=5

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/${TIMER_NAME} <<'EOF'
[Unit]
Description=Periodically verify RK3568 EC200A modem readiness

[Timer]
OnUnitInactiveSec=60s
AccuracySec=5s
Persistent=true
Unit=lsmv2-rk3568-cellular-modem-ensure.service

[Install]
WantedBy=timers.target
EOF

if [[ -f /etc/systemd/system/lsmv2-rk3568-reverse-tunnel.service ]]; then
  sed -i '/^StartLimitIntervalSec=/d' \
    /etc/systemd/system/lsmv2-rk3568-reverse-tunnel.service
  sed -i -E 's/^RestartSec=.*/RestartSec=15s/' \
    /etc/systemd/system/lsmv2-rk3568-reverse-tunnel.service
  install -d -m 0755 \
    /etc/systemd/system/lsmv2-rk3568-reverse-tunnel.service.d
  cat >/etc/systemd/system/lsmv2-rk3568-reverse-tunnel.service.d/10-start-limit.conf <<'EOF'
[Unit]
StartLimitIntervalSec=0
EOF
fi

if [[ -f /usr/local/sbin/lsmv2-rk3568-reverse-tunnel.sh ]]; then
  sed -i -E \
    -e 's/ServerAliveInterval=[0-9]+/ServerAliveInterval=10/' \
    -e 's/ServerAliveCountMax=[0-9]+/ServerAliveCountMax=2/' \
    /usr/local/sbin/lsmv2-rk3568-reverse-tunnel.sh
  if ! grep -q 'ConnectTimeout=' \
    /usr/local/sbin/lsmv2-rk3568-reverse-tunnel.sh; then
    sed -i '/ExitOnForwardFailure=yes/a\  -o ConnectTimeout=8 \\' \
      /usr/local/sbin/lsmv2-rk3568-reverse-tunnel.sh
  fi
fi

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" "${TIMER_NAME}"
systemctl start "${TIMER_NAME}"
systemctl start "${SERVICE_NAME}"
systemctl try-restart lsmv2-rk3568-reverse-tunnel.service || true

echo "installed ${SERVICE_NAME} and ${TIMER_NAME}"
echo "status: /var/lib/lsmv2/cellular-cloud/modem-status.json"
