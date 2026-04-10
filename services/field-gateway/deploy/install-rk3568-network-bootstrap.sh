#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

REPO_ROOT="${REPO_ROOT:-${REPO_ROOT_DEFAULT}}"
UNIT_NAME="${UNIT_NAME:-lsmv2-rk3568-network-bootstrap}"
ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/network-bootstrap.env}"
STATE_ROOT="${STATE_ROOT:-/var/lib/lsmv2/network-bootstrap}"
GATEWAY_SERVICE_NAME="${GATEWAY_SERVICE_NAME:-lsmv2-field-gateway.service}"
WIFI_DEVICE="${WIFI_DEVICE:-}"
STA_CONNECTION_NAME="${STA_CONNECTION_NAME:-lsmv2-uplink}"
STA_SSID="${STA_SSID:-}"
STA_PSK="${STA_PSK:-}"
AP_CONNECTION_NAME="${AP_CONNECTION_NAME:-lsmv2-ap-fallback}"
AP_SSID="${AP_SSID:-rk3568-1}"
AP_PSK="${AP_PSK:-rk3568-setup-2026}"
BOOTSTRAP_LOOP_INTERVAL_SECONDS="${BOOTSTRAP_LOOP_INTERVAL_SECONDS:-20}"
STA_CONNECT_TIMEOUT_SECONDS="${STA_CONNECT_TIMEOUT_SECONDS:-45}"
STA_RETRY_INTERVAL_SECONDS="${STA_RETRY_INTERVAL_SECONDS:-60}"
ENABLE_NOW=1
OVERWRITE_ENV=0

usage() {
  cat <<'EOF'
Usage:
  sudo bash services/field-gateway/deploy/install-rk3568-network-bootstrap.sh [options]

Options:
  --repo-root <path>
  --unit-name <name>
  --env-file <path>
  --state-root <path>
  --gateway-service-name <value>
  --wifi-device <value>
  --sta-connection-name <value>
  --sta-ssid <value>
  --sta-psk <value>
  --ap-connection-name <value>
  --ap-ssid <value>
  --ap-psk <value>
  --loop-seconds <value>
  --sta-timeout-seconds <value>
  --sta-retry-seconds <value>
  --overwrite-env
  --no-enable
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --unit-name) UNIT_NAME="$2"; shift 2 ;;
    --env-file) ENV_FILE_PATH="$2"; shift 2 ;;
    --state-root) STATE_ROOT="$2"; shift 2 ;;
    --gateway-service-name) GATEWAY_SERVICE_NAME="$2"; shift 2 ;;
    --wifi-device) WIFI_DEVICE="$2"; shift 2 ;;
    --sta-connection-name) STA_CONNECTION_NAME="$2"; shift 2 ;;
    --sta-ssid) STA_SSID="$2"; shift 2 ;;
    --sta-psk) STA_PSK="$2"; shift 2 ;;
    --ap-connection-name) AP_CONNECTION_NAME="$2"; shift 2 ;;
    --ap-ssid) AP_SSID="$2"; shift 2 ;;
    --ap-psk) AP_PSK="$2"; shift 2 ;;
    --loop-seconds) BOOTSTRAP_LOOP_INTERVAL_SECONDS="$2"; shift 2 ;;
    --sta-timeout-seconds) STA_CONNECT_TIMEOUT_SECONDS="$2"; shift 2 ;;
    --sta-retry-seconds) STA_RETRY_INTERVAL_SECONDS="$2"; shift 2 ;;
    --overwrite-env) OVERWRITE_ENV=1; shift ;;
    --no-enable) ENABLE_NOW=0; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must run as root." >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}/services/field-gateway" ]]; then
  echo "Service directory not found under repo root: ${REPO_ROOT}/services/field-gateway" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found in PATH." >&2
  exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli not found in PATH. This bootstrap line requires NetworkManager." >&2
  exit 1
fi

install -d -m 0755 -o root -g root "$(dirname "${ENV_FILE_PATH}")"
install -d -m 0755 -o root -g root "${STATE_ROOT}"
install -d -m 0755 -o root -g root "${STATE_ROOT}/status"

if [[ ! -f "${ENV_FILE_PATH}" || "${OVERWRITE_ENV}" -eq 1 ]]; then
cat > "${ENV_FILE_PATH}" <<EOF
WIFI_DEVICE=${WIFI_DEVICE}
STA_CONNECTION_NAME=${STA_CONNECTION_NAME}
STA_SSID=${STA_SSID}
STA_PSK=${STA_PSK}
AP_CONNECTION_NAME=${AP_CONNECTION_NAME}
AP_SSID=${AP_SSID}
AP_PSK=${AP_PSK}
BOOTSTRAP_LOOP_INTERVAL_SECONDS=${BOOTSTRAP_LOOP_INTERVAL_SECONDS}
STA_CONNECT_TIMEOUT_SECONDS=${STA_CONNECT_TIMEOUT_SECONDS}
STA_RETRY_INTERVAL_SECONDS=${STA_RETRY_INTERVAL_SECONDS}
GATEWAY_SERVICE_NAME=${GATEWAY_SERVICE_NAME}
STATUS_FILE_PATH=${STATE_ROOT}/status/runtime-status.json
EOF
else
  echo "Keeping existing environment file: ${ENV_FILE_PATH}"
fi

chmod 0640 "${ENV_FILE_PATH}"
chown root:root "${ENV_FILE_PATH}"

UNIT_PATH="/etc/systemd/system/${UNIT_NAME}.service"
sed \
  -e "s|__WORKING_DIRECTORY__|${REPO_ROOT}/services/field-gateway|g" \
  -e "s|__ENV_FILE_PATH__|${ENV_FILE_PATH}|g" \
  -e "s|__STATE_ROOT__|${STATE_ROOT}|g" \
  -e "s|__GATEWAY_SERVICE_NAME__|${GATEWAY_SERVICE_NAME}|g" \
  "${SCRIPT_DIR}/rk3568-network-bootstrap.service.template" > "${UNIT_PATH}"
chmod 0644 "${UNIT_PATH}"

if [[ -n "${GATEWAY_SERVICE_NAME}" ]]; then
  dropin_dir="/etc/systemd/system/${GATEWAY_SERVICE_NAME}.d"
  install -d -m 0755 -o root -g root "${dropin_dir}"
  cat > "${dropin_dir}/bootstrap-order.conf" <<EOF
[Unit]
Wants=${UNIT_NAME}.service
After=${UNIT_NAME}.service
EOF
  chmod 0644 "${dropin_dir}/bootstrap-order.conf"
fi

systemctl daemon-reload

if [[ "${ENABLE_NOW}" -eq 1 ]]; then
  systemctl enable "${UNIT_NAME}.service"
  if systemctl is-active --quiet "${UNIT_NAME}.service"; then
    systemctl restart "${UNIT_NAME}.service"
  else
    systemctl start "${UNIT_NAME}.service"
  fi
else
  systemctl enable "${UNIT_NAME}.service"
fi

echo "Installed ${UNIT_NAME}.service"
echo "Environment file: ${ENV_FILE_PATH}"
echo "State root: ${STATE_ROOT}"
echo "Gateway service order target: ${GATEWAY_SERVICE_NAME}"
echo "Active state: $(systemctl is-active "${UNIT_NAME}.service" 2>/dev/null || true)"
