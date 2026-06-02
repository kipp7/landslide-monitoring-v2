#!/usr/bin/env bash
set -Eeuo pipefail

# Install the cloud-host bridge that lets Docker containers reach RK3568
# reverse-tunnel sidecars without exposing those sidecars to the public network.

BIND_ADDR="${BIND_ADDR:-172.18.0.1}"
PORT_MAPS="${PORT_MAPS:-28081:127.0.0.1:28081,28082:127.0.0.1:28082,28087:127.0.0.1:28087}"
STATUS_DIR="${STATUS_DIR:-/var/lib/lsmv2/docker-loopback-bridge}"
RUNNER_PATH="${RUNNER_PATH:-/usr/local/sbin/lsmv2-docker-loopback-bridge-runner.sh}"
UNIT_PATH="${UNIT_PATH:-/etc/systemd/system/lsmv2-docker-loopback-bridge.service}"
NO_INSTALL_PACKAGES="${NO_INSTALL_PACKAGES:-0}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This installer must run as root. Use sudo." >&2
  exit 1
fi

case "${BIND_ADDR}" in
  ""|"0.0.0.0"|"::")
    echo "Refusing unsafe BIND_ADDR=${BIND_ADDR}; this bridge must not bind to a public wildcard address." >&2
    exit 1
    ;;
esac

if ! command -v socat >/dev/null 2>&1; then
  if [[ "${NO_INSTALL_PACKAGES}" == "1" ]]; then
    echo "socat is required but not installed." >&2
    exit 1
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y socat
  else
    echo "socat is required. Install it manually and rerun this script." >&2
    exit 1
  fi
fi

mkdir -p "${STATUS_DIR}"

cat >"${RUNNER_PATH}" <<'RUNNER'
#!/usr/bin/env bash
set -Eeuo pipefail

BIND_ADDR="${BIND_ADDR:-172.18.0.1}"
PORT_MAPS="${PORT_MAPS:-28081:127.0.0.1:28081,28082:127.0.0.1:28082,28087:127.0.0.1:28087}"
STATUS_DIR="${STATUS_DIR:-/var/lib/lsmv2/docker-loopback-bridge}"
STATUS_FILE="${STATUS_FILE:-${STATUS_DIR}/status.json}"

case "${BIND_ADDR}" in
  ""|"0.0.0.0"|"::")
    echo "Refusing unsafe BIND_ADDR=${BIND_ADDR}; this bridge must not bind to a public wildcard address." >&2
    exit 1
    ;;
esac

mkdir -p "${STATUS_DIR}"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "${pid}" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT INT TERM

write_status() {
  local now
  now="$(date -Iseconds)"
  python3 - "$STATUS_FILE" "$now" "$BIND_ADDR" "$PORT_MAPS" <<'PY'
import json
import sys

status_file, generated_at, bind_addr, port_maps = sys.argv[1:5]
maps = []
for item in port_maps.split(","):
    listen, target_host, target_port = item.split(":", 2)
    maps.append({
        "listen": f"{bind_addr}:{listen}",
        "target": f"{target_host}:{target_port}",
    })

payload = {
    "generatedAt": generated_at,
    "service": "lsmv2-docker-loopback-bridge",
    "bindAddress": bind_addr,
    "portMaps": maps,
    "publicExposure": False,
}

with open(status_file, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
}

IFS=',' read -r -a maps <<<"${PORT_MAPS}"
for item in "${maps[@]}"; do
  IFS=':' read -r listen_port target_host target_port <<<"${item}"
  socat "TCP-LISTEN:${listen_port},bind=${BIND_ADDR},fork,reuseaddr" "TCP:${target_host}:${target_port}" &
  pids+=("$!")
done

write_status

wait -n "${pids[@]}"
RUNNER

chmod 0755 "${RUNNER_PATH}"

cat >"${UNIT_PATH}" <<UNIT
[Unit]
Description=LSMV2 Docker loopback bridge for RK3568 reverse-tunnel sidecars
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
Environment=BIND_ADDR=${BIND_ADDR}
Environment=PORT_MAPS=${PORT_MAPS}
Environment=STATUS_DIR=${STATUS_DIR}
ExecStart=${RUNNER_PATH}
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$(basename "${UNIT_PATH}")"

systemctl --no-pager --full status "$(basename "${UNIT_PATH}")"
echo "Installed ${UNIT_PATH}"
echo "Status file: ${STATUS_DIR}/status.json"
