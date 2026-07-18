#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

TUNNEL_USER=${TUNNEL_USER:-rk3568-tunnel}
CLIENT_ALIVE_INTERVAL=${CLIENT_ALIVE_INTERVAL:-15}
CLIENT_ALIVE_COUNT_MAX=${CLIENT_ALIVE_COUNT_MAX:-2}
CONFIG_PATH=/etc/ssh/sshd_config.d/60-lsmv2-rk3568-tunnel.conf
BACKUP_PATH=${CONFIG_PATH}.bak
TEMP_PATH=$(mktemp)

cleanup() {
  rm -f "${TEMP_PATH}"
}
trap cleanup EXIT

if ! id "${TUNNEL_USER}" >/dev/null 2>&1; then
  echo "missing tunnel user ${TUNNEL_USER}" >&2
  exit 1
fi

cat >"${TEMP_PATH}" <<EOF
Match User ${TUNNEL_USER}
    ClientAliveInterval ${CLIENT_ALIVE_INTERVAL}
    ClientAliveCountMax ${CLIENT_ALIVE_COUNT_MAX}
    AllowTcpForwarding remote
    GatewayPorts no
    X11Forwarding no
    PermitTTY no
Match all
EOF

install -d -m 0755 /etc/ssh/sshd_config.d
if [[ -f "${CONFIG_PATH}" ]]; then
  cp -a "${CONFIG_PATH}" "${BACKUP_PATH}"
fi
install -m 0644 "${TEMP_PATH}" "${CONFIG_PATH}"

if ! sshd -t; then
  if [[ -f "${BACKUP_PATH}" ]]; then
    mv -f "${BACKUP_PATH}" "${CONFIG_PATH}"
  else
    rm -f "${CONFIG_PATH}"
  fi
  echo "sshd validation failed; restored previous configuration" >&2
  exit 1
fi

rm -f "${BACKUP_PATH}"
systemctl reload ssh

# The privileged sshd monitor keeps the TCP session alive after its low-privilege
# child exits, so terminate both processes for this dedicated account only.
pkill -TERM -f "^sshd: ${TUNNEL_USER}( |$)" >/dev/null 2>&1 || true

echo "installed ${CONFIG_PATH}"
sshd -T -C "user=${TUNNEL_USER},host=rk3568-ubuntu,addr=127.0.0.1" \
  | grep -E 'clientaliveinterval|clientalivecountmax|allowtcpforwarding|gatewayports'
