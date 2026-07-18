#!/usr/bin/env bash
set -euo pipefail

# Installs an RK3568-side cellular link guardian.
# Source of truth is cloud TCP reachability, not merely "usb0 has an IP".

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

CLOUD_HOST_VALUE=${CLOUD_HOST:-}
CHECK_PORTS_VALUE=${CHECK_PORTS:-1883,8080}

if [[ -z "${CLOUD_HOST_VALUE}" ]]; then
  echo "CLOUD_HOST is required" >&2
  exit 2
fi
if [[ ! "${CLOUD_HOST_VALUE}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "CLOUD_HOST contains unsupported characters" >&2
  exit 2
fi
if [[ ! "${CHECK_PORTS_VALUE}" =~ ^[0-9]+(,[0-9]+)*$ ]]; then
  echo "CHECK_PORTS must be a comma-separated list of TCP ports" >&2
  exit 2
fi

install -d -m 0755 /etc/lsmv2 /usr/local/sbin /var/lib/lsmv2/cellular-cloud

cat >/etc/lsmv2/rk3568-cellular-link-guardian.env <<EOF
CLOUD_HOST=${CLOUD_HOST_VALUE}
USB_DEVICE=usb0
USB_GATEWAY=192.168.43.1
LAN_DEVICE=eth0
LAN_GATEWAY=192.168.1.1
DNS_A=223.5.5.5
DNS_B=119.29.29.29
CHECK_PORTS=${CHECK_PORTS_VALUE}
TCP_TIMEOUT_SECONDS=6
ALLOW_LAN_FALLBACK=0
FIELD_GATEWAY_SERVICE=lsmv2-field-gateway.service
REVERSE_TUNNEL_SERVICE=lsmv2-rk3568-reverse-tunnel.service
STATUS_FILE=/var/lib/lsmv2/cellular-cloud/status.json
EOF

cat >/usr/local/sbin/lsmv2-rk3568-cellular-link-guardian.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=/etc/lsmv2/rk3568-cellular-link-guardian.env
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

CLOUD_HOST=${CLOUD_HOST:-}
USB_DEVICE=${USB_DEVICE:-usb0}
USB_GATEWAY=${USB_GATEWAY:-192.168.43.1}
LAN_DEVICE=${LAN_DEVICE:-eth0}
LAN_GATEWAY=${LAN_GATEWAY:-192.168.1.1}
DNS_A=${DNS_A:-223.5.5.5}
DNS_B=${DNS_B:-119.29.29.29}
CHECK_PORTS=${CHECK_PORTS:-1883,8080}
TCP_TIMEOUT_SECONDS=${TCP_TIMEOUT_SECONDS:-6}
ALLOW_LAN_FALLBACK=${ALLOW_LAN_FALLBACK:-0}
FIELD_GATEWAY_SERVICE=${FIELD_GATEWAY_SERVICE:-lsmv2-field-gateway.service}
REVERSE_TUNNEL_SERVICE=${REVERSE_TUNNEL_SERVICE:-lsmv2-rk3568-reverse-tunnel.service}
STATUS_FILE=${STATUS_FILE:-/var/lib/lsmv2/cellular-cloud/status.json}

if [[ -z "${CLOUD_HOST}" ]]; then
  echo "CLOUD_HOST is not configured" >&2
  exit 2
fi

mkdir -p "$(dirname "${STATUS_FILE}")"

resolve_cloud_ipv4() {
  python3 - "${CLOUD_HOST}" <<'PY'
import socket
import sys

addresses = socket.getaddrinfo(sys.argv[1], None, socket.AF_INET)
if not addresses:
    raise SystemExit(1)
print(addresses[0][4][0])
PY
}

if ! CLOUD_IP=$(resolve_cloud_ipv4); then
  echo "unable to resolve CLOUD_HOST=${CLOUD_HOST}" >&2
  exit 2
fi

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])'
}

write_status() {
  local ok="$1" reason="$2" route_device="$3" detail="$4"
  local now detail_json
  now=$(date -Is)
  detail_json=$(printf '%s' "${detail}" | json_escape)
  cat >"${STATUS_FILE}" <<JSON
{"generatedAt":"${now}","ok":${ok},"reason":"${reason}","cloudHost":"${CLOUD_HOST}","cloudIp":"${CLOUD_IP}","usbDevice":"${USB_DEVICE}","usbGateway":"${USB_GATEWAY}","routeDevice":"${route_device}","detail":"${detail_json}"}
JSON
}

previous_reason() {
  if [[ ! -f "${STATUS_FILE}" ]]; then
    echo "none"
    return
  fi
  python3 - "$STATUS_FILE" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        data = json.load(fh)
    print(f"{data.get('ok')}:{data.get('reason')}")
except Exception:
    print("unreadable")
PY
}

tcp_check() {
  local ports_csv="$1"
  python3 - "$CLOUD_HOST" "$ports_csv" "$TCP_TIMEOUT_SECONDS" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
ports = [int(p) for p in sys.argv[2].split(',') if p.strip()]
timeout = float(sys.argv[3])
failures = []
for port in ports:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    start = time.time()
    try:
        s.connect((host, port))
        print(f"tcp:{host}:{port}:ok:{time.time() - start:.3f}s")
    except Exception as exc:
        failures.append(f"tcp:{host}:{port}:{type(exc).__name__}:{exc}")
        print(failures[-1])
    finally:
        s.close()
if failures:
    raise SystemExit(1)
PY
}

route_cloud_via_usb() {
  ip route replace "${CLOUD_IP}/32" via "${USB_GATEWAY}" dev "${USB_DEVICE}" metric 20
  ip route replace "${DNS_A}/32" via "${USB_GATEWAY}" dev "${USB_DEVICE}" metric 20 || true
  ip route replace "${DNS_B}/32" via "${USB_GATEWAY}" dev "${USB_DEVICE}" metric 20 || true
}

route_cloud_via_lan() {
  ip route replace "${CLOUD_IP}/32" via "${LAN_GATEWAY}" dev "${LAN_DEVICE}" metric 10
}

restart_edge_services() {
  if systemctl is-enabled --quiet "${REVERSE_TUNNEL_SERVICE}"; then
    systemctl restart "${REVERSE_TUNNEL_SERVICE}" || true
  fi
  systemctl restart "${FIELD_GATEWAY_SERVICE}" || true
}

if ! ip link show "${USB_DEVICE}" >/dev/null 2>&1; then
  write_status false "usb_device_missing" "none" "${USB_DEVICE} is not present"
  exit 0
fi

prev=$(previous_reason)
route_cloud_via_usb
usb_route=$(ip route get "${CLOUD_IP}" 2>&1 || true)
if tcp_output=$(tcp_check "${CHECK_PORTS}" 2>&1); then
  if [[ "${prev}" != "True:cloud_reachable_via_4g" ]]; then
    restart_edge_services
  fi
  write_status true "cloud_reachable_via_4g" "${USB_DEVICE}" "${usb_route}; ${tcp_output}"
  exit 0
fi

if [[ "${ALLOW_LAN_FALLBACK}" == "1" ]] && ip link show "${LAN_DEVICE}" >/dev/null 2>&1; then
  route_cloud_via_lan
  lan_route=$(ip route get "${CLOUD_IP}" 2>&1 || true)
  if lan_output=$(tcp_check "${CHECK_PORTS}" 2>&1); then
    if [[ "${prev}" != "False:4g_unreachable_lan_fallback_active" ]]; then
      restart_edge_services
    fi
    write_status false "4g_unreachable_lan_fallback_active" "${LAN_DEVICE}" "4g failed: ${usb_route}; ${tcp_output}; lan: ${lan_route}; ${lan_output}"
    exit 0
  fi
fi

if [[ "${prev}" != "False:cloud_unreachable_via_4g" ]]; then
  if systemctl is-enabled --quiet "${REVERSE_TUNNEL_SERVICE}"; then
    systemctl restart "${REVERSE_TUNNEL_SERVICE}" || true
  fi
fi
write_status false "cloud_unreachable_via_4g" "${USB_DEVICE}" "${usb_route}; ${tcp_output}"
exit 0
EOF

chmod 0755 /usr/local/sbin/lsmv2-rk3568-cellular-link-guardian.sh

cat >/etc/systemd/system/lsmv2-rk3568-cellular-link-guardian.service <<'EOF'
[Unit]
Description=LSMV2 RK3568 cellular cloud link guardian
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=-/etc/lsmv2/rk3568-cellular-link-guardian.env
ExecStart=/usr/local/sbin/lsmv2-rk3568-cellular-link-guardian.sh
EOF

cat >/etc/systemd/system/lsmv2-rk3568-cellular-link-guardian.timer <<'EOF'
[Unit]
Description=Run LSMV2 RK3568 cellular cloud link guardian periodically

[Timer]
OnBootSec=20s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=lsmv2-rk3568-cellular-link-guardian.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
# This guardian supersedes the earlier route-only guard. Keep it disabled to
# avoid two timers fighting over the cloud host route.
systemctl disable --now lsmv2-rk3568-cellular-cloud-route.timer >/dev/null 2>&1 || true
systemctl stop lsmv2-rk3568-cellular-cloud-route.service >/dev/null 2>&1 || true
systemctl enable --now lsmv2-rk3568-cellular-link-guardian.timer
systemctl start lsmv2-rk3568-cellular-link-guardian.service || true

echo "installed lsmv2-rk3568-cellular-link-guardian"
echo "status: /var/lib/lsmv2/cellular-cloud/status.json"
