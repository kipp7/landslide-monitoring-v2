#!/usr/bin/env bash
set -euo pipefail

mode=${1:-}
duration=${2:-}
label=${3:-}
aggregation=${4:-4}

if [[ $EUID -ne 0 ]]; then
  echo "run as root" >&2
  exit 2
fi
if [[ "$mode" != "probe" && "$mode" != "live" ]]; then
  echo "mode must be probe or live" >&2
  exit 2
fi
if ! [[ "$duration" =~ ^[0-9]+$ ]] || (( duration < 60 || duration > 1800 )); then
  echo "duration must be an integer in [60, 1800]" >&2
  exit 2
fi
if ! [[ "$label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "label contains unsupported characters" >&2
  exit 2
fi
if ! [[ "$aggregation" =~ ^[1-4]$ ]]; then
  echo "aggregation must be an integer in [1, 4]" >&2
  exit 2
fi

env_file=/etc/lsmv2/field-gateway.env
service=lsmv2-field-gateway.service
health_file=/var/lib/lsmv2/field-gateway/health/runtime-health.json
experiment_dir=/var/lib/lsmv2/experiments
stamp=$(date +%Y%m%d-%H%M%S)
backup_dir=/opt/lsmv2/backups/${label}-${stamp}
monitor_path=${experiment_dir}/${label}-${stamp}.tsv
summary_path=${experiment_dir}/${label}-${stamp}.json
restored=0

mkdir -p "$backup_dir" "$experiment_dir"
cp -a "$env_file" "$backup_dir/field-gateway.env"

set_env_value() {
  local key=$1
  local value=$2
  python3 - "$env_file" "$key" "$value" <<'PY'
from pathlib import Path
import os
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
prefix = key + "="
lines = path.read_text(encoding="utf-8").splitlines()
result = []
updated = False
for line in lines:
    if line.startswith(prefix):
        if not updated:
            result.append(prefix + value)
            updated = True
    else:
        result.append(line)
if not updated:
    result.append(prefix + value)
temporary = path.with_name(path.name + ".stage-attribution-tmp")
temporary.write_text("\n".join(result) + "\n", encoding="utf-8")
os.chmod(temporary, 0o600)
os.replace(temporary, path)
PY
  chown root:root "$env_file"
  chmod 600 "$env_file"
}

restore_fail_closed() {
  if (( restored )); then
    return
  fi
  restored=1
  cp -a "$backup_dir/field-gateway.env" "$env_file"
  set_env_value NTRIP_ENABLED false
  set_env_value RTCM_RUNTIME_MODE probe
  set_env_value RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME 1
  systemctl restart "$service" || true
}

handle_signal() {
  restore_fail_closed
  exit 130
}

trap restore_fail_closed EXIT
trap handle_signal INT TERM HUP

set_env_value NTRIP_ENABLED true
set_env_value NTRIP_MOUNTPOINT RTCM32_GGB
set_env_value RTCM_RUNTIME_MODE "$mode"
set_env_value RTCM_OBSERVATION_INTERVAL_MS 1000
set_env_value RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME "$aggregation"
set_env_value RTCM_MAX_FRAGMENTS_BETWEEN_POLLS 4
set_env_value RTCM_POST_BURST_POLL_GUARD_MS 600
set_env_value RTCM_MIN_CORRECTION_WINDOW_MS 2500
systemctl restart "$service"
systemctl is-active --quiet "$service"

printf '%b\n' 'elapsed_s\tservice\tntrip_state\tntrip_status\tcaster_frames\tcaster_crc_errors\tprepared_frames\tinner_writes\touter_writes\twrite_errors\tpolls_issued\tpolls_completed\tpoll_timeouts\tarmed_nodes\tqueue_p50_ms\tqueue_p95_ms\tqueue_max_ms\tdispatch_p50_ms\tdispatch_p95_ms\tdispatch_max_ms\tprepare_p95_ms\tprepare_max_ms\tserial_p95_ms\tserial_max_ms\tcaster_write_p50_ms\tcaster_write_p95_ms\tcaster_write_max_ms\tactive_block_reason\ta_q\tb_q\tc_q\ta_age_ms\tb_age_ms\tc_age_ms' >"$monitor_path"

started=$(date +%s)
deadline=$(( started + duration ))
while :; do
  now=$(date +%s)
  elapsed=$(( now - started ))
  python3 - "$elapsed" "$health_file" >>"$monitor_path" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

elapsed = int(sys.argv[1])
try:
    data = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
except Exception:
    data = {}
ntrip = data.get("ntrip") or {}
connection = ntrip.get("connection") or {}
downlink = ntrip.get("downlink") or {}
decoder = downlink.get("decoder") or {}
latency = downlink.get("latency") or {}
queue = (latency.get("shaperQueueMs") or {}).get("all") or {}
dispatch = (latency.get("dispatchBlockMs") or {})
dispatch_all = dispatch.get("all") or {}
prepare = latency.get("preparedToWriteStartMs") or {}
serial = latency.get("serialWriteMs") or {}
caster_write = (latency.get("casterToFieldWriteMs") or {}).get("all") or {}
stats = data.get("stats") or {}
nodes = {item.get("fieldNodeId"): item for item in ((data.get("southbound") or {}).get("nodes") or [])}

def metric(label, key):
    latest = (nodes.get(label) or {}).get("latestTelemetry") or {}
    return (latest.get("metrics") or {}).get(key)

values = [
    elapsed,
    subprocess.run(["systemctl", "is-active", "lsmv2-field-gateway.service"], capture_output=True, text=True).stdout.strip(),
    connection.get("state"),
    connection.get("lastStatusLine"),
    decoder.get("validFrames", 0),
    decoder.get("crcOrFrameErrors", 0),
    downlink.get("framesPrepared", 0),
    stats.get("rtcmFragmentWrites", 0),
    stats.get("rtcmFieldFrameWrites", 0),
    stats.get("rtcmWriteFailures", 0),
    stats.get("compactBroadcastPollsIssued", 0),
    stats.get("compactBroadcastPollsCompleted", 0),
    stats.get("compactBroadcastPollTimeouts", 0),
    downlink.get("armedNodeCount", 0),
    queue.get("p50Ms"), queue.get("p95Ms"), queue.get("maxMs"),
    dispatch_all.get("p50Ms"), dispatch_all.get("p95Ms"), dispatch_all.get("maxMs"),
    prepare.get("p95Ms"), prepare.get("maxMs"),
    serial.get("p95Ms"), serial.get("maxMs"),
    caster_write.get("p50Ms"), caster_write.get("p95Ms"), caster_write.get("maxMs"),
    dispatch.get("activeReason"),
]
values += [metric(label, "rtk_gga_quality") for label in "ABC"]
values += [metric(label, "rtk_correction_age_ms") for label in "ABC"]
print("\t".join("" if value is None else str(value) for value in values))
PY
  if (( now >= deadline )); then
    break
  fi
  sleep 10
done

python3 - "$mode" "$duration" "$monitor_path" "$summary_path" "$health_file" "$aggregation" <<'PY'
import csv
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

mode, duration, monitor, summary, health, aggregation = sys.argv[1:]
monitor_path = Path(monitor)
rows = list(csv.DictReader(monitor_path.open(encoding="utf-8"), delimiter="\t"))
health_data = json.loads(Path(health).read_text(encoding="utf-8"))
ntrip = health_data.get("ntrip") or {}
downlink = ntrip.get("downlink") or {}
connection = ntrip.get("connection") or {}
stats = health_data.get("stats") or {}
nodes = {item.get("fieldNodeId"): item for item in ((health_data.get("southbound") or {}).get("nodes") or [])}

def integer(row, key):
    value = row.get(key, "")
    return int(value) if value not in (None, "") else None

def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]

tail_start = max(0, int(duration) - 120)
tail = [row for row in rows if (integer(row, "elapsed_s") or 0) >= tail_start]
node_summary = {}
for label, prefix in (("A", "a"), ("B", "b"), ("C", "c")):
    qualities = [value for row in tail if (value := integer(row, f"{prefix}_q")) is not None]
    ages = [value for row in tail if (value := integer(row, f"{prefix}_age_ms")) is not None]
    node_summary[label] = {
        "tailSamples": len(tail),
        "quality4Samples": sum(value == 4 for value in qualities),
        "ageP95Ms": percentile(ages, 0.95),
        "ageMaxMs": max(ages) if ages else None,
    }

decoder = downlink.get("decoder") or {}
result = {
    "schemaVersion": 1,
    "mode": mode,
    "durationSeconds": int(duration),
    "monitorPath": str(monitor_path),
    "monitorSha256": hashlib.sha256(monitor_path.read_bytes()).hexdigest(),
    "profile": {
        "mountpoint": "RTCM32_GGB",
        "observationIntervalMs": 1000,
        "maxFragmentsPerFieldFrame": int(aggregation),
        "maxFragmentsBetweenPolls": 4,
        "postBurstPollGuardMs": 600,
        "minCorrectionWindowMs": 2500,
    },
    "connection": {
        "state": connection.get("state"),
        "status": connection.get("lastStatusLine"),
    },
    "transport": {
        "casterValidFrames": decoder.get("validFrames", 0),
        "casterCrcErrors": decoder.get("crcOrFrameErrors", 0),
        "preparedFrames": downlink.get("framesPrepared", 0),
        "innerWrites": stats.get("rtcmFragmentWrites", 0),
        "outerWrites": stats.get("rtcmFieldFrameWrites", 0),
        "writeFailures": stats.get("rtcmWriteFailures", 0),
        "pollsIssued": stats.get("compactBroadcastPollsIssued", 0),
        "pollsCompleted": stats.get("compactBroadcastPollsCompleted", 0),
        "pollTimeouts": stats.get("compactBroadcastPollTimeouts", 0),
        "schemaErrors": stats.get("schemaRejected", 0),
        "interleavingErrors": stats.get("interleavingSuspected", 0),
    },
    "latency": downlink.get("latency"),
    "nodes": node_summary,
    "service": {
        "active": subprocess.run(["systemctl", "is-active", "lsmv2-field-gateway.service"], capture_output=True, text=True).stdout.strip(),
        "restarts": int(subprocess.run(["systemctl", "show", "lsmv2-field-gateway.service", "-p", "NRestarts", "--value"], capture_output=True, text=True).stdout.strip() or 0),
    },
    "containsCredentials": False,
    "containsCoordinates": False,
    "containsRawRtcm": False,
}
Path(summary).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"SUMMARY={summary}")
print(json.dumps(result, indent=2, sort_keys=True))
PY
