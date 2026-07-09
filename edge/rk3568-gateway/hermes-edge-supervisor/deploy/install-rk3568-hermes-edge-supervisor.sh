#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

REPO_ROOT="${REPO_ROOT:-${REPO_ROOT_DEFAULT}}"
RUN_USER="${RUN_USER:-lsmv2}"
RUN_GROUP="${RUN_GROUP:-${RUN_USER}}"
SYSTEMD_UNIT_NAME="${SYSTEMD_UNIT_NAME:-lsmv2-hermes-edge-supervisor}"
ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/hermes-edge-supervisor.env}"
STATE_ROOT="${STATE_ROOT:-/var/lib/lsmv2/hermes-edge-supervisor}"
AUTOMATION_URL="${AUTOMATION_URL:-http://127.0.0.1:18081/v1/automation}"
SUMMARY_URL="${SUMMARY_URL:-http://127.0.0.1:18081/v1/summary}"
DIAGNOSIS_MODEL_PATH="${DIAGNOSIS_MODEL_PATH:-${REPO_ROOT}/edge/rk3568-gateway/hermes-edge-supervisor/models/edge-diagnosis-rf-v1.json}"
HTTP_HOST="${HTTP_HOST:-0.0.0.0}"
HTTP_PORT="${HTTP_PORT:-18082}"
BUILD_FIRST=1
ENABLE_NOW=1
OVERWRITE_ENV=0

usage() {
  cat <<'EOF'
Usage:
  sudo bash edge/rk3568-gateway/hermes-edge-supervisor/deploy/install-rk3568-hermes-edge-supervisor.sh [options]

Options:
  --repo-root <path>             Repository root on RK3568
  --run-user <user>              Service run user (default: lsmv2)
  --run-group <group>            Service run group (default: same as user)
  --unit-name <name>             systemd service name without suffix
  --env-file <path>              Environment file target
  --state-root <path>            Runtime writable root
  --automation-url <url>         field-link-monitor automation URL
  --summary-url <url>            field-link-monitor summary URL
  --diagnosis-model <path>       Hermes edge diagnosis model artifact
  --http-host <value>            HTTP listen host
  --http-port <value>            HTTP listen port
  --skip-build                   Do not run npm install/build
  --no-enable                    Install only, do not enable/start service
  --overwrite-env                Replace existing environment file
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --run-user) RUN_USER="$2"; shift 2 ;;
    --run-group) RUN_GROUP="$2"; shift 2 ;;
    --unit-name) SYSTEMD_UNIT_NAME="$2"; shift 2 ;;
    --env-file) ENV_FILE_PATH="$2"; shift 2 ;;
    --state-root) STATE_ROOT="$2"; shift 2 ;;
    --automation-url) AUTOMATION_URL="$2"; shift 2 ;;
    --summary-url) SUMMARY_URL="$2"; shift 2 ;;
    --diagnosis-model) DIAGNOSIS_MODEL_PATH="$2"; shift 2 ;;
    --http-host) HTTP_HOST="$2"; shift 2 ;;
    --http-port) HTTP_PORT="$2"; shift 2 ;;
    --skip-build) BUILD_FIRST=0; shift ;;
    --no-enable) ENABLE_NOW=0; shift ;;
    --overwrite-env) OVERWRITE_ENV=1; shift ;;
    --help|-h) usage; exit 0 ;;
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

if [[ ! -d "${REPO_ROOT}/edge/rk3568-gateway/hermes-edge-supervisor" ]]; then
  echo "Service directory not found under repo root: ${REPO_ROOT}/edge/rk3568-gateway/hermes-edge-supervisor" >&2
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
      \"${REPO_ROOT}/edge/rk3568-gateway/hermes-edge-supervisor/dist\" \
      \"${REPO_ROOT}/packages/observability/dist\"
    npm install
    npm run build \
      --workspace @lsmv2/observability \
      --workspace @lsmv2/hermes-edge-supervisor
  "
fi

install -d -m 0755 -o root -g root "$(dirname "${ENV_FILE_PATH}")"
install -d -m 0755 -o "${RUN_USER}" -g "${RUN_GROUP}" "${STATE_ROOT}"
install -d -m 0755 -o "${RUN_USER}" -g "${RUN_GROUP}" "${STATE_ROOT}/status"
install -d -m 0755 -o "${RUN_USER}" -g "${RUN_GROUP}" "${STATE_ROOT}/events"

if [[ ! -f "${ENV_FILE_PATH}" || "${OVERWRITE_ENV}" -eq 1 ]]; then
cat > "${ENV_FILE_PATH}" <<EOF
SERVICE_NAME=hermes-edge-supervisor
AUTOMATION_URL=${AUTOMATION_URL}
SUMMARY_URL=${SUMMARY_URL}
DIAGNOSIS_MODEL_PATH=${DIAGNOSIS_MODEL_PATH}
SUPERVISION_FILE_PATH=${STATE_ROOT}/status/supervision.json
EVENT_LOG_FILE_PATH=${STATE_ROOT}/events/events.jsonl
HTTP_HOST=${HTTP_HOST}
HTTP_PORT=${HTTP_PORT}
POLL_INTERVAL_MS=5000
SOURCE_STALE_AFTER_MS=120000
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
  -e "s|__WORKING_DIRECTORY__|${REPO_ROOT}/edge/rk3568-gateway/hermes-edge-supervisor|g" \
  -e "s|__ENV_FILE_PATH__|${ENV_FILE_PATH}|g" \
  -e "s|__STATE_ROOT__|${STATE_ROOT}|g" \
  "${SCRIPT_DIR}/hermes-edge-supervisor.service.template" > "${SYSTEMD_UNIT_PATH}"

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
echo "Working directory: ${REPO_ROOT}/edge/rk3568-gateway/hermes-edge-supervisor"
echo "Active state: $(systemctl is-active "${SYSTEMD_UNIT_NAME}.service" 2>/dev/null || true)"
