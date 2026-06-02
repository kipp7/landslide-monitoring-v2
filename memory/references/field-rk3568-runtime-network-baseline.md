---
title: field-rk3568-runtime-network-baseline
type: note
tags:
- reference
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/field-rk3568-runtime-network-baseline
---

# Reference: field-rk3568-runtime-network-baseline

## Purpose

Store the current stable runtime, network, and sidecar boundary truth for the RK3568 edge gateway role.

## Commands

```text
ssh linaro@192.168.124.179
```

## Files

- `docs/unified/reports/field-rk3568-edge-runtime-network-architecture-2026-04.md`
  - authority report for runtime and networking policy
- `memory/references/field-rk3568-access-baseline.md`
  - current access and UART ingress truth

## Notes

- role:
  - `edge gateway + edge control node`
- network policy:
  - `STA first, AP fallback`
- fallback hotspot SSID:
  - `rk3568-1`
- current active UART ingress:
  - `/dev/ttyS3`
  - `115200 8N1`
- service layering:
  - Layer 0: OS/device management
  - Layer 1: southbound I/O
  - Layer 2: gateway core
  - Layer 3: local control plane
  - Layer 4: edge intelligence/UI sidecars
- hard rule:
  - display and OpenClaw are sidecars only
  - they must not block serial ingest, spool, or uplink
- Hermes edge supervisor baseline:
  - active RK3568 host discovered on 2026-05-05:
    - `192.168.124.179`
    - hostname `rk3568-ubuntu`
  - service:
    - `lsmv2-hermes-edge-supervisor.service`
  - role:
    - read-only Hermes-style task supervision sidecar
  - input:
    - `http://127.0.0.1:18081/v1/automation`
  - output:
    - `http://127.0.0.1:18082/v1/supervision`
    - `/var/lib/lsmv2/hermes-edge-supervisor/status/supervision.json`
  - lightweight model:
    - type: `RandomForestClassifier`
    - artifact: `services/hermes-edge-supervisor/models/edge-diagnosis-rf-v1.json`
    - training report: `docs/unified/reports/hermes-edge-diagnosis-model-training-latest.json`
    - model version: `2026-05-06`
    - feature count: `64`
    - feature groups:
      - link status
      - network mode
      - source freshness/existence
      - node status
      - parser quality
      - task queue
      - local resource pressure
    - on-device latest diagnosis: `center_mqtt_route_unreachable`
    - on-device confidence: `0.992188`
  - Hermes action/intent surface:
    - `GET http://127.0.0.1:18082/v1/intent-catalog`
    - `GET http://127.0.0.1:18082/v1/actions`
    - `POST http://127.0.0.1:18082/v1/actions/recheck`
    - `POST http://127.0.0.1:18082/v1/actions/collect_logs`
    - `POST http://127.0.0.1:18082/v1/actions/generate_report`
    - action event log: `/var/lib/lsmv2/hermes-edge-supervisor/events/events.jsonl`
    - board-side `recheck` smoke passed with `gatewayCoreTouched=false`, `serialTouched=false`, `mqttTouched=false`
  - model registry output:
    - `/v1/supervision.aiModels[]`
    - current registry count: `1`
    - current task: `edge_link_diagnosis`
  - Hermes pressure-test evidence:
    - script: `scripts/dev/stress-hermes-edge-supervisor.mjs`
    - report: `docs/unified/reports/hermes-edge-supervisor-stress-latest.json`
    - readable summary: `docs/unified/reports/hermes-edge-supervisor-stress-latest.md`
    - competition backup root: `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\02_边缘链路与硬件运行证明\hermes-edge-ai-supervisor-stress-20260506`
    - run location: RK3568 board-local
    - duration: `30s`
    - concurrency: `12`
    - total requests: `8143`
    - successful requests: `8143`
    - error rate: `0`
    - throughput: `271.254 rps`
    - latency p95: `72.650 ms`
    - latency p99: `94.818 ms`
    - `GET /v1/supervision` success count: `7872`
    - `POST /v1/actions/recheck` success count: `271`
    - recheck safety: `gatewayCoreTouched=false`, `serialTouched=false`, `mqttTouched=false`
  - desktop system monitor integration:
    - status surface: existing Windows desktop system monitor page, not a standalone page
    - API contract: `/api/v1/system/status.hermesEdge`
    - frontend boundary: desktop reads API only; no hardcoded RK3568 IP and no direct SSH/serial/board call in UI
    - backend evidence source: `docs/unified/reports/rk3568-hermes-edge-supervisor-latest.json` and `docs/unified/reports/hermes-edge-supervisor-stress-latest.json`
    - verification on 2026-05-06:
      - local source API smoke: `http://127.0.0.1:18080/api/v1/system/status`
      - `hermesEdge` returned with `boardHost=192.168.124.179`, `modelLoaded=true`, `modelKey=hermes-edge-diagnosis-rf`, `featureCount=64`, `confidence=0.992188`
      - stress fields returned with `throughputRps=271.254`, `p95Ms=72.65`, `errorRate=0`
      - safety fields returned with `gatewayCoreTouched=false`, `serialTouched=false`, `mqttTouched=false`
      - temporary local API was stopped after verification
  - desktop 3D health volatility visualization:
    - name: `RK3568 端侧 AI 健康波动曲面`
    - API contract: `/api/v1/system/status.hermesEdge.volatilitySurface`
    - surface type: `edge_health_volatility_surface`
    - method: derived from Hermes RF diagnosis, source freshness, local resource pressure, and stress latency
    - axes:
      - X: recheck horizon minutes `0,5,15,30,60`
      - Y: health dimensions `serial_link,mqtt_uplink,spool_queue,data_freshness,parser_quality,node_fleet,resource_pressure,hermes_task_queue`
      - Z/color: health instability volatility score
    - verification on 2026-05-06:
      - dimensions: `8`
      - points: `40`
      - peakScore: `93.67`
      - peakDimensionKey: `mqtt_uplink`
      - peakHorizonMinutes: `0`
      - modelConfidence: `0.992188`
  - Hermes supervisor live center bridge:
    - Current target architecture is LAN-readable edge sidecars: `field-link-monitor` and `hermes-edge-supervisor` should set `HTTP_HOST=0.0.0.0` on RK3568 so the Windows/center API can fetch `http://192.168.124.179:18081/v1/summary` and `http://192.168.124.179:18082/v1/supervision` directly.
    - If `18081/18082` refuse connections while `18087` is reachable, first check `/etc/lsmv2/field-link-monitor.env` and `/etc/lsmv2/hermes-edge-supervisor.env`, then restart `lsmv2-field-link-monitor.service` and `lsmv2-hermes-edge-supervisor.service`.
    - On 2026-05-11 the local repo deployment defaults were corrected to `HTTP_HOST=0.0.0.0`; the RK3568 live env still requires a successful SSH session or manual board-side edit if SSH banner exchange is stuck.
    - center-side latest artifact refresh script:
      - `scripts/dev/refresh-rk3568-hermes-edge-supervisor.ps1`
    - normal refresh command:
      - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\refresh-rk3568-hermes-edge-supervisor.ps1 -Password <password> -Recheck`
    - output artifact:
      - `docs/unified/reports/rk3568-hermes-edge-supervisor-latest.json`
    - current refreshed evidence on 2026-05-08:
      - `generatedAt=2026-05-08T14:43:05Z`
      - `accepted=true`
      - `diagnosisType=field_nodes_not_reporting`
      - `confidence=0.335938`
      - `modelLoaded=true`
      - `featureCount=64`
      - `actionRecheckStatus=completed`
      - `gatewayCoreTouched=false`
      - `serialTouched=false`
      - `mqttTouched=false`
    - product implication:
      - if the local artifact is older than 24 hours, API marks `hermesEdge.stale=true` and the desktop hides the old 3D curve.
      - once the RK3568 HTTP sidecar listens on `0.0.0.0`, the center API should prefer live HTTP over stale artifacts and the Hermes 3D curve can recover realtime display.
  - boundary:
    - advisory-first
    - no serial ownership
    - no MQTT ownership
    - no automatic `field-gateway` restart
- redundancy principle:
  - selective layered redundancy
  - not uniform full dual-hot redundancy everywhere

## 2026-05-08 RK3568 + RK2206 Post-Burn Runtime Baseline

- Current default RK3568 access remains:
  - `192.168.124.179`
  - SSH `linaro / linaro`
  - hostname `rk3568-ubuntu`
  - active uplink `eth0=192.168.124.179/24`
- Current field-gateway runtime:
  - service `lsmv2-field-gateway.service`
  - state `active/enabled`
  - serial `/dev/ttyS3`
  - MQTT `mqtt://192.168.124.17:1883`
  - field-link mode `cobs-crc-v1`
- Current deployed node boundary:
  - A / `00000000-0000-0000-0000-000000000001` is the only real enabled online field node.
  - B / `...0002` and C / `...0003` are retained in `SOUTHBOUND_NODES_JSON` as preprovisioned nodes but set `enabled=false` until the physical nodes are present.
  - This avoids burning polling windows on absent nodes and prevents product UI from treating undeployed nodes as field failures.
- After disabling B/C in southbound runtime:
  - `enabledNodeCount=1`
  - `pollSessionTimeouts=0`
  - A telemetry cadence improved from about `25s` to about `5s`
  - latest API fieldEdge summary: `overallLevel=attention`, `score=80`, `portStatus=online`, `spoolPending=0`, `rejectedMessages=0`
- API system monitor contract now preserves:
  - `nodes[].enabled`
  - `nodes[].deferred=true` when a runtime node is `enabled=false`
  - `lastTelemetryAgeSeconds`

## 2026-05-11 RK3568 Sidecar LAN HTTP Restored

- After reboot, SSH to `linaro@192.168.124.179` recovered.
- Board-side env files were backed up and updated:
  - `/etc/lsmv2/field-link-monitor.env`: `HTTP_HOST=0.0.0.0`, `HTTP_PORT=18081`
  - `/etc/lsmv2/hermes-edge-supervisor.env`: `HTTP_HOST=0.0.0.0`, `HTTP_PORT=18082`
- Services restarted successfully:
  - `lsmv2-field-link-monitor.service`: `active`
  - `lsmv2-hermes-edge-supervisor.service`: `active`
- RK3568 is now listening on LAN:
  - `0.0.0.0:18081`
  - `0.0.0.0:18082`
- Windows-side validation:
  - `http://192.168.124.179:18081/v1/summary` returns HTTP 200 with fresh `generatedAt`.
  - `http://192.168.124.179:18082/v1/supervision` returns HTTP 200 with fresh `generatedAt`.
- Center API validation through `http://127.0.0.1:8080/api/v1/system/status` after `admin / 123456` login:
  - `fieldEdge.available=true`
  - `fieldEdge.stale=false`
  - `fieldEdge.detail=已连接 RK3568 field-link-monitor 实时状态口`
  - `hermesEdge.available=true`
  - `hermesEdge.stale=false`
  - `hermesEdge.modelKey=hermes-edge-diagnosis-rf`
  - `hermesEdge.diagnosisType=center_mqtt_route_unreachable`
  - `hermesEdge.confidence=0.359375`
- Remaining operational note:
  - Sidecar realtime visibility is fixed.
  - Current edge diagnosis still reports field/link quality issues because node reporting and gateway status are not fully healthy after reboot; handle that separately from the sidecar HTTP binding fix.
  - `lastAckAgeSeconds`
- Current known non-blocker:
  - Old logs still contain historical `cobs code exceeded input length`, but the fresh post-restart runtime has `lastError=null`, `schemaRejected=0`, `rejectedMessages=0`, `rejectedWriteFailures=0`.

## 2026-05-11 RK3568 ENOSPC Root Cause And Log Guard

- After a later reboot, SSH recovered and the actual failure was confirmed as disk exhaustion, not RAM pressure:
  - memory available: about `3.3GiB`
  - root filesystem before cleanup: `/dev/root 57G used 55G available 0, 100%`
  - `/var/log` alone used about `49G`
  - `/var/log/syslog` about `24G`
  - `/var/log/kern.log` about `24G`
- `lsmv2-field-gateway`, `lsmv2-field-link-monitor`, and `lsmv2-hermes-edge-supervisor` were repeatedly failing with `ENOSPC: no space left on device` while writing status JSON under `/var/lib/lsmv2/...`.
- Safe cleanup performed:
  - truncated `/var/log/syslog`
  - truncated `/var/log/kern.log`
  - vacuumed systemd journal to `100M`
  - root filesystem after cleanup: `/dev/root 57G used 6.3G available 49G, 12%`
- Services recovered:
  - `lsmv2-field-gateway.service`: active
  - `lsmv2-field-link-monitor.service`: active, `0.0.0.0:18081`
  - `lsmv2-hermes-edge-supervisor.service`: active, `0.0.0.0:18082`
  - `lsmv2-rk3568-alarm-actuator.service`: active, `0.0.0.0:18087`
- Preventive guard installed:
  - script: `/usr/local/sbin/lsmv2-log-guard.sh`
  - service: `/etc/systemd/system/lsmv2-log-guard.service`
  - timer: `/etc/systemd/system/lsmv2-log-guard.timer`
  - interval: every 5 minutes
  - threshold: truncate `/var/log/syslog` and `/var/log/kern.log` if either exceeds `256MB`
  - status file: `/var/lib/lsmv2/log-guard/status.json`
- journald cap installed:
  - `/etc/systemd/journald.conf.d/lsmv2-limits.conf`
  - `SystemMaxUse=100M`
  - `RuntimeMaxUse=50M`
  - `MaxFileSec=1day`
- Alarm actuator noisy platform polling was disabled because the embedded JWT expires and was generating repeated `platform status http 401` warnings:
  - `/etc/lsmv2/rk3568-alarm-actuator.env`
  - `PLATFORM_API_URL=`
  - `PLATFORM_API_TOKEN=`
  - `ALARM_RECONCILE_INTERVAL_MS=60000`
  - This does not block direct platform/rule-engine calls to RK3568 actuator HTTP endpoints.
- As of this checkpoint, the user had powered off B, so node-not-reporting status is expected and should not be treated as a new uplink software failure.

## 2026-05-21 EC200A 4G Cloud Uplink And Reverse Tunnel Baseline

- EC200A-CN has been promoted from temporary test path to formal RK3568 cloud uplink.
- Known-good APN:
  - `cmnet`
- Previous restricted APN:
  - `cmiot`
  - symptom: outbound counter increased but public/cloud downlink did not return.
- Current cellular/RK3568 addressing:
  - cellular PDP address: `10.217.14.146`
  - RK3568 `usb0`: `192.168.43.100/24`
  - gateway: `192.168.43.1`
- Current cloud server:
  - `134.175.187.208`
- Routing policy:
  - default external route prefers `usb0`
  - `eth0` remains for LAN management and fallback
  - cloud host route pins `134.175.187.208/32` to `usb0`
  - DNS pinned to `223.5.5.5` and `119.29.29.29`
- RK3568 field gateway cloud MQTT:
  - `MQTT_URL=mqtt://134.175.187.208:1883`
- Reverse SSH tunnel is the official remote access path because carrier NAT prevents direct public inbound SSH.
- Cloud localhost tunnel ports:
  - `127.0.0.1:22079` -> RK3568 SSH `127.0.0.1:22`
  - `127.0.0.1:28081` -> RK3568 field-link-monitor `127.0.0.1:18081`
  - `127.0.0.1:28082` -> RK3568 Hermes supervisor `127.0.0.1:18082`
  - `127.0.0.1:28087` -> RK3568 alarm actuator `127.0.0.1:18087`
- Cloud Docker bridge access for API/rule-engine containers:
  - service: `lsmv2-docker-loopback-bridge.service`
  - reproducible installer: `scripts/deploy/install-cloud-rk3568-loopback-bridge.sh`
  - status: `active/enabled` as of 2026-05-21
  - status file: `/var/lib/lsmv2/docker-loopback-bridge/status.json`
  - `172.18.0.1:28081` -> cloud host `127.0.0.1:28081` -> RK3568 field-link-monitor
  - `172.18.0.1:28082` -> cloud host `127.0.0.1:28082` -> RK3568 Hermes supervisor
  - `172.18.0.1:28087` -> cloud host `127.0.0.1:28087` -> RK3568 alarm actuator
- Cloud API env verified on 2026-05-21:
  - `RK3568_ALARM_ACTUATOR_URL=http://172.18.0.1:28087`
  - `RK3568_FIELD_LINK_MONITOR_URL=http://172.18.0.1:28081/v1/summary`
  - `RK3568_HERMES_EDGE_SUPERVISOR_URL=http://172.18.0.1:28082/v1/supervision`
  - `RK3568_STATUS_HTTP_TIMEOUT_MS=6000`
- Public API verification on 2026-05-21:
  - `/api/v1/system/status`: `fieldEdge.available=true`, `hermesEdge.available=true`, `fieldEdge.summary.mqttConnected=true`, `fieldEdge.summary.serialOpen=true`, `hermesEdge.modelLoaded=true`
  - `/api/v1/field-alarm/status`: `actuator.available=true`, `actuator.dryRun=false`, `actuator.state=idle`
  - `/api/v1/field-alarm/actions` with `action=status`: `accepted=true`, `actuator.available=true`, `actuator.state=idle`
- Non-blocker for this verification:
  - RK2206 field nodes are currently offline by user expectation, so stale/no new telemetry after `2026-05-21T10:11:07Z` is not treated as cloud/RK3568 configuration failure.
- Hard rule:
  - do not bind those tunnel ports to cloud `0.0.0.0`
  - do not directly expose RK3568 SSH or sidecar ports to the public internet
- Server replacement checklist:
  - `docs/guides/deployment/cloud-server-migration-and-rk3568-public-access.md`
- Decision note:
  - `memory/decisions/use-reverse-tunnel-and-domain-ready-cloud-endpoint-for-rk3568.md`
