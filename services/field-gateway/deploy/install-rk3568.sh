#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

REPO_ROOT="${REPO_ROOT:-${REPO_ROOT_DEFAULT}}"
RUN_USER="${RUN_USER:-linaro}"
RUN_GROUP="${RUN_GROUP:-${RUN_USER}}"
SYSTEMD_UNIT_NAME="${SYSTEMD_UNIT_NAME:-lsmv2-field-gateway}"
ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/field-gateway.env}"
STATE_ROOT="${STATE_ROOT:-/var/lib/lsmv2/field-gateway}"
MQTT_URL="${MQTT_URL:-mqtt://127.0.0.1:1883}"
MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"
SERIAL_DEVICE="${SERIAL_DEVICE:-/dev/ttyS3}"
SERIAL_BAUD_RATE="${SERIAL_BAUD_RATE:-115200}"
MQTT_TOPIC_TELEMETRY_PREFIX="${MQTT_TOPIC_TELEMETRY_PREFIX:-telemetry/}"
MQTT_TOPIC_COMMAND_PREFIX="${MQTT_TOPIC_COMMAND_PREFIX:-cmd/}"
MQTT_TOPIC_ACK_PREFIX="${MQTT_TOPIC_ACK_PREFIX:-cmd_ack/}"
BUILD_FIRST=1
ENABLE_NOW=1
OVERWRITE_ENV=0

usage() {
  cat <<'EOF'
Usage:
  sudo bash services/field-gateway/deploy/install-rk3568.sh [options]

Options:
  --repo-root <path>          Repository root on RK3568
  --run-user <user>           Service run user (default: linaro)
  --run-group <group>         Service run group (default: same as user)
  --unit-name <name>          systemd service name without suffix
  --env-file <path>           Environment file target
  --state-root <path>         Runtime writable root
  --mqtt-url <url>            MQTT broker URL
  --mqtt-username <value>     MQTT username
  --mqtt-password <value>     MQTT password
  --serial-device <path>      Serial device path
  --serial-baud-rate <rate>   Serial baud rate
  --mqtt-topic-telemetry-prefix <value>  Telemetry topic prefix
  --mqtt-topic-command-prefix <value>    Command topic prefix
  --mqtt-topic-ack-prefix <value>        Ack topic prefix
  --skip-build                Do not run npm install/build
  --no-enable                 Install only, do not enable/start service
  --overwrite-env             Replace existing environment file
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      REPO_ROOT="$2"
      shift 2
      ;;
    --run-user)
      RUN_USER="$2"
      shift 2
      ;;
    --run-group)
      RUN_GROUP="$2"
      shift 2
      ;;
    --unit-name)
      SYSTEMD_UNIT_NAME="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE_PATH="$2"
      shift 2
      ;;
    --state-root)
      STATE_ROOT="$2"
      shift 2
      ;;
    --mqtt-url)
      MQTT_URL="$2"
      shift 2
      ;;
    --mqtt-username)
      MQTT_USERNAME="$2"
      shift 2
      ;;
    --mqtt-password)
      MQTT_PASSWORD="$2"
      shift 2
      ;;
    --serial-device)
      SERIAL_DEVICE="$2"
      shift 2
      ;;
    --serial-baud-rate)
      SERIAL_BAUD_RATE="$2"
      shift 2
      ;;
    --mqtt-topic-telemetry-prefix)
      MQTT_TOPIC_TELEMETRY_PREFIX="$2"
      shift 2
      ;;
    --mqtt-topic-command-prefix)
      MQTT_TOPIC_COMMAND_PREFIX="$2"
      shift 2
      ;;
    --mqtt-topic-ack-prefix)
      MQTT_TOPIC_ACK_PREFIX="$2"
      shift 2
      ;;
    --skip-build)
      BUILD_FIRST=0
      shift
      ;;
    --no-enable)
      ENABLE_NOW=0
      shift
      ;;
    --overwrite-env)
      OVERWRITE_ENV=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must run as root." >&2
  exit 1
fi

if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
  echo "Run user does not exist: ${RUN_USER}" >&2
  exit 1
fi

if ! getent group "${RUN_GROUP}" >/dev/null 2>&1; then
  echo "Run group does not exist: ${RUN_GROUP}" >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}" ]]; then
  echo "Repository root not found: ${REPO_ROOT}" >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}/services/field-gateway" ]]; then
  echo "Service directory not found under repo root: ${REPO_ROOT}/services/field-gateway" >&2
  exit 1
fi

if [[ "${BUILD_FIRST}" -eq 1 ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found in PATH. Install Node.js/npm first or rerun with --skip-build." >&2
    exit 1
  fi

  runuser -u "${RUN_USER}" -- env PATH="${PATH}" bash -lc "
    cd \"${REPO_ROOT}\"
    npm install
    npm run build --workspace @lsmv2/field-gateway
  "
fi

install -d -m 0755 -o root -g root "$(dirname "${ENV_FILE_PATH}")"
install -d -m 0755 -o "${RUN_USER}" -g "${RUN_GROUP}" "${STATE_ROOT}"
install -d -m 0755 -o "${RUN_USER}" -g "${RUN_GROUP}" "${STATE_ROOT}/spool"
install -d -m 0755 -o "${RUN_USER}" -g "${RUN_GROUP}" "${STATE_ROOT}/health"

if [[ ! -f "${ENV_FILE_PATH}" || "${OVERWRITE_ENV}" -eq 1 ]]; then
cat > "${ENV_FILE_PATH}" <<EOF
SERVICE_NAME=field-gateway
SERIAL_DEVICE=${SERIAL_DEVICE}
SERIAL_BAUD_RATE=${SERIAL_BAUD_RATE}
MQTT_URL=${MQTT_URL}
MQTT_USERNAME=${MQTT_USERNAME}
MQTT_PASSWORD=${MQTT_PASSWORD}
MQTT_TOPIC_TELEMETRY_PREFIX=${MQTT_TOPIC_TELEMETRY_PREFIX}
MQTT_TOPIC_COMMAND_PREFIX=${MQTT_TOPIC_COMMAND_PREFIX}
MQTT_TOPIC_ACK_PREFIX=${MQTT_TOPIC_ACK_PREFIX}
SPOOL_ROOT_DIR=${STATE_ROOT}/spool
HEALTH_FILE_PATH=${STATE_ROOT}/health/runtime-health.json
MQTT_PUBLISH_TIMEOUT_MS=8000
REPLAY_INTERVAL_MS=5000
HEALTH_EMIT_INTERVAL_MS=5000
NODE_DEGRADED_AFTER_MS=15000
NODE_OFFLINE_AFTER_MS=30000
PORT_DEGRADED_AFTER_MS=15000
PORT_OFFLINE_AFTER_MS=30000
MAX_MESSAGE_BYTES=262144
MAX_PENDING_RECORDS=10000
SPOOL_RETENTION_PUBLISHED=200
SPOOL_RETENTION_REJECTED=200
EOF
else
  echo "Keeping existing environment file: ${ENV_FILE_PATH}"
fi

chmod 0640 "${ENV_FILE_PATH}"
chown root:"${RUN_GROUP}" "${ENV_FILE_PATH}"

SYSTEMD_UNIT_PATH="/etc/systemd/system/${SYSTEMD_UNIT_NAME}.service"
sed \
  -e "s|__RUN_USER__|${RUN_USER}|g" \
  -e "s|__RUN_GROUP__|${RUN_GROUP}|g" \
  -e "s|__WORKING_DIRECTORY__|${REPO_ROOT}/services/field-gateway|g" \
  -e "s|__ENV_FILE_PATH__|${ENV_FILE_PATH}|g" \
  -e "s|__STATE_ROOT__|${STATE_ROOT}|g" \
  -e "s|__SERIAL_DEVICE__|${SERIAL_DEVICE}|g" \
  "${SCRIPT_DIR}/field-gateway.service.template" > "${SYSTEMD_UNIT_PATH}"

chmod 0644 "${SYSTEMD_UNIT_PATH}"

systemctl daemon-reload

if [[ "${ENABLE_NOW}" -eq 1 ]]; then
  systemctl enable --now "${SYSTEMD_UNIT_NAME}.service"
else
  systemctl enable "${SYSTEMD_UNIT_NAME}.service"
fi

echo "Installed ${SYSTEMD_UNIT_NAME}.service"
echo "Environment file: ${ENV_FILE_PATH}"
echo "State root: ${STATE_ROOT}"
echo "Working directory: ${REPO_ROOT}/services/field-gateway"
echo "Active state: $(systemctl is-active "${SYSTEMD_UNIT_NAME}.service" 2>/dev/null || true)"
echo "Check status with: systemctl status ${SYSTEMD_UNIT_NAME}.service --no-pager"
