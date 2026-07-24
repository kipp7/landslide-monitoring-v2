#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

REPO_ROOT="${REPO_ROOT:-${REPO_ROOT_DEFAULT}}"
RUN_USER="${RUN_USER:-lsmv2}"
RUN_GROUP="${RUN_GROUP:-${RUN_USER}}"
SYSTEMD_UNIT_NAME="${SYSTEMD_UNIT_NAME:-lsmv2-field-gateway}"
ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/field-gateway.env}"
STATE_ROOT="${STATE_ROOT:-/var/lib/lsmv2/field-gateway}"
MQTT_URL="${MQTT_URL:-mqtt://127.0.0.1:1883}"
MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD=${MQTT_PASSWORD:-}
SERIAL_DEVICE="${SERIAL_DEVICE:-/dev/ttyS3}"
SERIAL_BAUD_RATE="${SERIAL_BAUD_RATE:-115200}"
FIELD_LINK_MODE="${FIELD_LINK_MODE:-cobs-crc-v1}"
MQTT_TOPIC_TELEMETRY_PREFIX="${MQTT_TOPIC_TELEMETRY_PREFIX:-telemetry/}"
MQTT_TOPIC_COMMAND_PREFIX="${MQTT_TOPIC_COMMAND_PREFIX:-cmd/}"
MQTT_TOPIC_ACK_PREFIX="${MQTT_TOPIC_ACK_PREFIX:-cmd_ack/}"
SOUTHBOUND_NODES_JSON="${SOUTHBOUND_NODES_JSON:-[{\"fieldNodeId\":\"A\",\"deviceId\":\"00000000-0000-0000-0000-000000000001\",\"installLabel\":\"FIELD-NODE-A\",\"southboundPort\":\"/dev/ttyS3\",\"enabled\":true},{\"fieldNodeId\":\"B\",\"deviceId\":\"00000000-0000-0000-0000-000000000002\",\"installLabel\":\"FIELD-NODE-B\",\"southboundPort\":\"/dev/ttyS3\",\"enabled\":true},{\"fieldNodeId\":\"C\",\"deviceId\":\"00000000-0000-0000-0000-000000000003\",\"installLabel\":\"FIELD-NODE-C\",\"southboundPort\":\"/dev/ttyS3\",\"enabled\":true}]}"
COMMAND_ACK_QUIET_WINDOW_MS="${COMMAND_ACK_QUIET_WINDOW_MS:-10000}"
COMMAND_PREWRITE_QUIET_MS="${COMMAND_PREWRITE_QUIET_MS:-400}"
COMMAND_PREWRITE_MAX_WAIT_MS="${COMMAND_PREWRITE_MAX_WAIT_MS:-4000}"
SOUTHBOUND_POLLING_ENABLED="${SOUTHBOUND_POLLING_ENABLED:-true}"
SOUTHBOUND_POLLING_MODE="${SOUTHBOUND_POLLING_MODE:-round-robin-json}"
SOUTHBOUND_POLLING_COMMAND_TYPE="${SOUTHBOUND_POLLING_COMMAND_TYPE:-poll_latest_telemetry}"
SOUTHBOUND_POLLING_INTERVAL_MS="${SOUTHBOUND_POLLING_INTERVAL_MS:-1000}"
SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS="${SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS:-1500}"
SOUTHBOUND_POLLING_PREWRITE_QUIET_MS="${SOUTHBOUND_POLLING_PREWRITE_QUIET_MS:-100}"
SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS="${SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS:-250}"
SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES="${SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES:-64}"
SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS="${SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS:-10}"
SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH="${SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH:-true}"
BUILD_FIRST=1
ENABLE_NOW=1
OVERWRITE_ENV=0

usage() {
  cat <<'EOF'
Usage:
  sudo bash edge/rk3568-gateway/field-gateway/deploy/install-rk3568.sh [options]

Options:
  --repo-root <path>          Repository root on RK3568
  --run-user <user>           Service run user (default: lsmv2)
  --run-group <group>         Service run group (default: same as user)
  --unit-name <name>          systemd service name without suffix
  --env-file <path>           Environment file target
  --state-root <path>         Runtime writable root
  --mqtt-url <url>            MQTT broker URL
  --mqtt-username <value>     MQTT username
  --mqtt-password <value>     MQTT password
  --serial-device <path>      Serial device path
  --serial-baud-rate <rate>   Serial baud rate
  --field-link-mode <mode>    Southbound wire mode (raw-json|cobs-crc-v1)
  --mqtt-topic-telemetry-prefix <value>  Telemetry topic prefix
  --mqtt-topic-command-prefix <value>    Command topic prefix
  --mqtt-topic-ack-prefix <value>        Ack topic prefix
  --southbound-nodes-json <json>         Shared-port node map JSON
  --command-ack-quiet-window-ms <ms>     ACK quiet window on shared port
  --command-prewrite-quiet-ms <ms>       Required quiet time before command write
  --command-prewrite-max-wait-ms <ms>    Max wait for quiet time before write
  --southbound-polling-enabled <bool>    Enable RK3568 internal polling
  --southbound-polling-mode <mode>       round-robin-json or compact-broadcast-v1
  --southbound-polling-command-type <value> Internal poll command type
  --southbound-polling-interval-ms <ms>  Internal polling scheduler tick
  --southbound-polling-session-timeout-ms <ms> Poll command-to-telemetry session timeout
  --southbound-polling-prewrite-quiet-ms <ms> Poll-only quiet time before serial write
  --southbound-polling-prewrite-max-wait-ms <ms> Poll-only max wait for serial quiet
  --southbound-polling-command-chunk-bytes <bytes> Poll-only serial command chunk size
  --southbound-polling-command-chunk-delay-ms <ms> Delay between poll command chunks
  --southbound-polling-suppress-ack-publish <bool> Suppress internal poll ACK northbound publish
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
    --field-link-mode)
      FIELD_LINK_MODE="$2"
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
    --southbound-nodes-json)
      SOUTHBOUND_NODES_JSON="$2"
      shift 2
      ;;
    --command-ack-quiet-window-ms)
      COMMAND_ACK_QUIET_WINDOW_MS="$2"
      shift 2
      ;;
    --command-prewrite-quiet-ms)
      COMMAND_PREWRITE_QUIET_MS="$2"
      shift 2
      ;;
    --command-prewrite-max-wait-ms)
      COMMAND_PREWRITE_MAX_WAIT_MS="$2"
      shift 2
      ;;
    --southbound-polling-enabled)
      SOUTHBOUND_POLLING_ENABLED="$2"
      shift 2
      ;;
    --southbound-polling-mode)
      SOUTHBOUND_POLLING_MODE="$2"
      shift 2
      ;;
    --southbound-polling-command-type)
      SOUTHBOUND_POLLING_COMMAND_TYPE="$2"
      shift 2
      ;;
    --southbound-polling-interval-ms)
      SOUTHBOUND_POLLING_INTERVAL_MS="$2"
      shift 2
      ;;
    --southbound-polling-session-timeout-ms)
      SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS="$2"
      shift 2
      ;;
    --southbound-polling-prewrite-quiet-ms)
      SOUTHBOUND_POLLING_PREWRITE_QUIET_MS="$2"
      shift 2
      ;;
    --southbound-polling-prewrite-max-wait-ms)
      SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS="$2"
      shift 2
      ;;
    --southbound-polling-command-chunk-bytes)
      SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES="$2"
      shift 2
      ;;
    --southbound-polling-command-chunk-delay-ms)
      SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS="$2"
      shift 2
      ;;
    --southbound-polling-suppress-ack-publish)
      SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH="$2"
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

if [[ ! -d "${REPO_ROOT}/edge/rk3568-gateway/field-gateway" ]]; then
  echo "Service directory not found under repo root: ${REPO_ROOT}/edge/rk3568-gateway/field-gateway" >&2
  exit 1
fi

if [[ "${BUILD_FIRST}" -eq 1 ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found in PATH. Install Node.js/npm first or rerun with --skip-build." >&2
    exit 1
  fi

  runuser -u "${RUN_USER}" -- env PATH="${PATH}" bash -lc "
    cd \"${REPO_ROOT}\"
    rm -rf \
      \"${REPO_ROOT}/edge/rk3568-gateway/field-gateway/dist\" \
      \"${REPO_ROOT}/packages/observability/dist\" \
      \"${REPO_ROOT}/packages/validation/dist\"
    npm install
    npm run build \
      --workspace @lsmv2/observability \
      --workspace @lsmv2/validation \
      --workspace @lsmv2/field-gateway
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
FIELD_LINK_MODE=${FIELD_LINK_MODE}
MQTT_URL=${MQTT_URL}
MQTT_USERNAME=${MQTT_USERNAME}
MQTT_PASSWORD=${MQTT_PASSWORD}
MQTT_TOPIC_TELEMETRY_PREFIX=${MQTT_TOPIC_TELEMETRY_PREFIX}
MQTT_TOPIC_COMMAND_PREFIX=${MQTT_TOPIC_COMMAND_PREFIX}
MQTT_TOPIC_ACK_PREFIX=${MQTT_TOPIC_ACK_PREFIX}
SOUTHBOUND_NODES_JSON=${SOUTHBOUND_NODES_JSON}
SPOOL_ROOT_DIR=${STATE_ROOT}/spool
HEALTH_FILE_PATH=${STATE_ROOT}/health/runtime-health.json
MQTT_PUBLISH_TIMEOUT_MS=8000
COMMAND_ACK_QUIET_WINDOW_MS=${COMMAND_ACK_QUIET_WINDOW_MS}
COMMAND_PREWRITE_QUIET_MS=${COMMAND_PREWRITE_QUIET_MS}
COMMAND_PREWRITE_MAX_WAIT_MS=${COMMAND_PREWRITE_MAX_WAIT_MS}
SOUTHBOUND_POLLING_ENABLED=${SOUTHBOUND_POLLING_ENABLED}
SOUTHBOUND_POLLING_MODE=${SOUTHBOUND_POLLING_MODE}
SOUTHBOUND_POLLING_COMMAND_TYPE=${SOUTHBOUND_POLLING_COMMAND_TYPE}
SOUTHBOUND_POLLING_INTERVAL_MS=${SOUTHBOUND_POLLING_INTERVAL_MS}
SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS=${SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS}
SOUTHBOUND_POLLING_PREWRITE_QUIET_MS=${SOUTHBOUND_POLLING_PREWRITE_QUIET_MS}
SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS=${SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS}
SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES=${SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES}
SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS=${SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS}
SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH=${SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH}
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
  -e "s|__WORKING_DIRECTORY__|${REPO_ROOT}/edge/rk3568-gateway/field-gateway|g" \
  -e "s|__ENV_FILE_PATH__|${ENV_FILE_PATH}|g" \
  -e "s|__STATE_ROOT__|${STATE_ROOT}|g" \
  -e "s|__SERIAL_DEVICE__|${SERIAL_DEVICE}|g" \
  "${SCRIPT_DIR}/field-gateway.service.template" > "${SYSTEMD_UNIT_PATH}"

chmod 0644 "${SYSTEMD_UNIT_PATH}"

systemctl daemon-reload

if [[ "${ENABLE_NOW}" -eq 1 ]]; then
  systemctl enable "${SYSTEMD_UNIT_NAME}.service"
  if systemctl is-active --quiet "${SYSTEMD_UNIT_NAME}.service"; then
    systemctl restart "${SYSTEMD_UNIT_NAME}.service"
  else
    systemctl start "${SYSTEMD_UNIT_NAME}.service"
  fi
else
  systemctl enable "${SYSTEMD_UNIT_NAME}.service"
fi

echo "Installed ${SYSTEMD_UNIT_NAME}.service"
echo "Environment file: ${ENV_FILE_PATH}"
echo "State root: ${STATE_ROOT}"
echo "Working directory: ${REPO_ROOT}/edge/rk3568-gateway/field-gateway"
echo "Active state: $(systemctl is-active "${SYSTEMD_UNIT_NAME}.service" 2>/dev/null || true)"
echo "Check status with: systemctl status ${SYSTEMD_UNIT_NAME}.service --no-pager"
