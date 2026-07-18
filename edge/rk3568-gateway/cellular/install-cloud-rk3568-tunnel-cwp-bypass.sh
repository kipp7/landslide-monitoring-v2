#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

SSH_PORT=${SSH_PORT:-22}
ADMIN_USER=${ADMIN_USER:-ubuntu}
TUNNEL_USER=${TUNNEL_USER:-rk3568-tunnel}
RULE_TAG=lsmv2-rk3568-tunnel-ssh-allow
HARDENING_PATH=/etc/ssh/sshd_config.d/50-lsmv2-key-only-hardening.conf
HARDENING_BACKUP=${HARDENING_PATH}.bak
ALLOW_SCRIPT=/usr/local/sbin/lsmv2-rk3568-cwp-ssh-allow.sh
STATUS_FILE=/var/lib/lsmv2/cloud-security/cwp-ssh-allow-status.json
SERVICE_NAME=lsmv2-rk3568-cwp-ssh-allow.service
TIMER_NAME=lsmv2-rk3568-cwp-ssh-allow.timer

if [[ ! "${SSH_PORT}" =~ ^[0-9]+$ ]] || ((SSH_PORT < 1 || SSH_PORT > 65535)); then
  echo "SSH_PORT must be between 1 and 65535" >&2
  exit 2
fi
for account in "${ADMIN_USER}" "${TUNNEL_USER}"; do
  if [[ ! "${account}" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
    echo "invalid account name: ${account}" >&2
    exit 2
  fi
  if ! id "${account}" >/dev/null 2>&1; then
    echo "missing account: ${account}" >&2
    exit 2
  fi
  passwd_entry=$(getent passwd "${account}")
  IFS=: read -r _ _ _ _ _ account_home _ <<<"${passwd_entry}"
  if [[ -z "${account_home}" || ! -s "${account_home}/.ssh/authorized_keys" ]]; then
    echo "missing authorized keys for account: ${account}" >&2
    exit 2
  fi
done
if ! command -v nft >/dev/null 2>&1; then
  echo "nft is required" >&2
  exit 2
fi
if ! command -v sshd >/dev/null 2>&1; then
  echo "sshd is required" >&2
  exit 2
fi

install -d -m 0755 /etc/ssh/sshd_config.d /usr/local/sbin \
  /var/lib/lsmv2/cloud-security

hardening_temp=$(mktemp)
cleanup() {
  rm -f "${hardening_temp}"
}
trap cleanup EXIT

cat >"${hardening_temp}" <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowUsers ${ADMIN_USER} ${TUNNEL_USER}
EOF

if [[ -f "${HARDENING_PATH}" ]]; then
  cp -a "${HARDENING_PATH}" "${HARDENING_BACKUP}"
fi
install -m 0644 "${hardening_temp}" "${HARDENING_PATH}"
if ! sshd -t; then
  if [[ -f "${HARDENING_BACKUP}" ]]; then
    mv -f "${HARDENING_BACKUP}" "${HARDENING_PATH}"
  else
    rm -f "${HARDENING_PATH}"
  fi
  echo "sshd validation failed; restored previous configuration" >&2
  exit 1
fi
rm -f "${HARDENING_BACKUP}"

cat >"${ALLOW_SCRIPT}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

SSH_PORT=${SSH_PORT}
RULE_TAG=${RULE_TAG}
STATUS_FILE=${STATUS_FILE}

write_status() {
  local ok="\$1" action="\$2" detail="\$3"
  local now temporary
  now=\$(date -Is)
  temporary="\${STATUS_FILE}.\$\$.tmp"
  python3 - "\${temporary}" "\${now}" "\${ok}" "\${action}" "\${detail}" <<'PY'
import json
import os
import sys

path, generated_at, ok, action, detail = sys.argv[1:]
payload = {
    "generatedAt": generated_at,
    "ok": ok == "true",
    "sshPort": ${SSH_PORT},
    "ruleTag": "${RULE_TAG}",
    "action": action,
    "detail": detail,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    handle.write("\n")
os.chmod(path, 0o644)
PY
  mv -f "\${temporary}" "\${STATUS_FILE}"
}

if ! chain_output=\$(nft -a list chain ip filter INPUT 2>&1); then
  write_status false waiting_for_input_chain "\${chain_output}"
  exit 0
fi

first_rule=\$(printf '%s\n' "\${chain_output}" | awk '
  /# handle/ && \$1 != "chain" && \$1 != "type" {
    line=\$0
    sub(/^[[:space:]]+/, "", line)
    print line
    exit
  }
')
if [[ "\${first_rule}" == *"\${RULE_TAG}"* ]]; then
  write_status true unchanged "SSH allow rule is first in ip filter INPUT"
  exit 0
fi

while IFS= read -r handle; do
  [[ -n "\${handle}" ]] || continue
  nft delete rule ip filter INPUT handle "\${handle}" || true
done < <(printf '%s\n' "\${chain_output}" | awk -v tag="\${RULE_TAG}" '
  index(\$0, tag) {
    for (i = 1; i <= NF; i++) {
      if (\$i == "handle") {
        print \$(i + 1)
      }
    }
  }
')

nft insert rule ip filter INPUT tcp dport "\${SSH_PORT}" counter accept \
  comment "\${RULE_TAG}"

updated=\$(nft -a list chain ip filter INPUT)
first_rule=\$(printf '%s\n' "\${updated}" | awk '
  /# handle/ && \$1 != "chain" && \$1 != "type" {
    line=\$0
    sub(/^[[:space:]]+/, "", line)
    print line
    exit
  }
')
if [[ "\${first_rule}" != *"\${RULE_TAG}"* ]]; then
  write_status false validation_failed "\${first_rule}"
  exit 1
fi
write_status true inserted "\${first_rule}"
EOF
chmod 0755 "${ALLOW_SCRIPT}"

cat >/etc/systemd/system/${SERVICE_NAME} <<EOF
[Unit]
Description=Keep RK3568 tunnel SSH ahead of Tencent CWP/YunJing reject rules
After=network-online.target docker.service ssh.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${ALLOW_SCRIPT}
TimeoutStartSec=15
EOF

cat >/etc/systemd/system/${TIMER_NAME} <<EOF
[Unit]
Description=Periodically verify RK3568 tunnel SSH CWP bypass ordering

[Timer]
OnBootSec=5s
OnUnitActiveSec=10s
AccuracySec=1s
Persistent=true
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "${TIMER_NAME}"
systemctl start "${SERVICE_NAME}"
systemctl reload ssh

echo "installed ${SERVICE_NAME} and ${TIMER_NAME}"
cat "${STATUS_FILE}"
sshd -T | grep -E \
  '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|maxauthtries|logingracetime|x11forwarding|allowusers) '
