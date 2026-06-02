---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/docs/tools/field-rehearsal/readme
---

# field-rehearsal tools

本目录提供 A 路线“软件优先联调”的第一批可执行物料：

- `payload-samples/`
  - 节点模拟器/回放脚本可直接复用的样例包
- `node-red/`
  - Node-RED 调试流模板
- `mqttx/`
  - MQTTX 人工探针清单

目标不是一上来做完整系统，而是先把以下三件事跑顺：

1. 节点消息 profile 是否合理
2. 网关适配器是否能稳定重组/转发
3. 平台主链是否能接收并可见

推荐配合使用：

- 指南：`docs/guides/testing/field-software-rehearsal.md`
- 样例校验脚本：
  - `scripts/dev/check-field-rehearsal-samples.ps1`
  - `scripts/dev/check-field-rehearsal-samples.js`
- 样例生成脚本：
  - `scripts/dev/generate-field-rehearsal-sample.ps1`
  - `scripts/dev/generate-field-rehearsal-sample.js`
- 样例发布脚本：
  - `scripts/dev/publish-field-rehearsal-sample.ps1`
  - `scripts/dev/publish-field-rehearsal-sample.js`
- rehearsal 准备脚本：
  - `scripts/dev/prepare-field-rehearsal.ps1`
  - `scripts/dev/prepare-field-rehearsal.js`
- rehearsal wrapper：
  - `scripts/dev/run-field-rehearsal.ps1`
  - `scripts/dev/run-field-rehearsal.js`
- 平台 acceptance probe：
  - `scripts/dev/check-field-platform-acceptance.ps1`
  - `scripts/dev/check-field-platform-acceptance.js`
- 本地联调总探针：
  - `scripts/dev/check-field-local-runtime.ps1`
- Docker 运行态探针：
  - `scripts/dev/check-field-docker-runtime.ps1`
- Docker 容器内 acceptance 探针：
  - `scripts/dev/check-field-docker-acceptance.ps1`
- EMQX Docker 内 webhook 重配脚本：
  - `scripts/dev/configure-emqx-docker-webhook.ps1`
- 运行态差异诊断：
  - `scripts/dev/check-field-runtime-delta.ps1`
- 宿主机路径上下文探针：
  - `scripts/dev/check-field-host-path-context.ps1`
- 宿主机路径一键采证：
  - `scripts/dev/collect-field-host-triage.ps1`
- 宿主机路径修复计划生成：
  - `scripts/dev/render-field-host-remediation-plan.ps1`
- Docker 多样例成功矩阵：
  - `scripts/dev/check-field-docker-sample-matrix.ps1`
- Docker 样例语义治理矩阵：
  - `scripts/dev/check-field-docker-sample-governance.ps1`
- `hf-oversized` 语义对比 proof：
  - `scripts/dev/check-field-hf-oversized-semantic-proof.ps1`
- 序列语义 proof：
  - `scripts/dev/check-field-sequence-semantic-proofs.ps1`
- DLQ reason proof：
  - `scripts/dev/check-field-dlq-reason-proofs.ps1`
- `lf-meta` 语义 proof：
  - `scripts/dev/check-field-lf-meta-semantic-proof.ps1`
- missing/null 语义 proof：
  - `scripts/dev/check-field-missing-null-semantic-proof.ps1`
- semantic scorecard：
  - `scripts/dev/render-field-semantic-scorecard.ps1`
- missing alert policy proof：
  - `scripts/dev/check-field-missing-alert-policy-proof.ps1`
- missing alert recovery proof：
  - `scripts/dev/check-field-missing-alert-recovery-proof.ps1`
- alert notification proof：
  - `scripts/dev/check-field-alert-notification-proof.ps1`

当前成功留证文件：

- `docs/unified/reports/field-docker-acceptance-latest.json`

生成一个新样例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/generate-field-rehearsal-sample.ps1 -Sample hf-normal -Seq 2001 -PacketClass hf_generated
```

生成并写入 evidence 目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/generate-field-rehearsal-sample.ps1 -Sample hf-normal -Seq 2002 -RepeatMetrics 8 -OutFile 'backups/evidence/field-rehearsal-test/generated-hf.json'
```

准备一次 rehearsal evidence 包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-field-rehearsal.ps1 -Scope node-gateway
```

执行一次最小 rehearsal wrapper（prepare 模式）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal.ps1 -Mode prepare -Scope node-gateway
```

检查当前本地联调运行态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-local-runtime.ps1
```

创建一台 rehearsal 设备并获取 MQTT 凭据：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/create-field-rehearsal-device.ps1
```

在 Docker 网络内发布样例包（绕过宿主机 MQTT 路径异常）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-field-rehearsal-sample-docker.ps1 -Sample hf-normal -Mode mqtt -Username <device_id> -Password <device_secret> -Topic telemetry/<device_id>
```

发布样例包（MQTT）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-field-rehearsal-sample.ps1 -Sample hf-normal -Mode mqtt
```

发布样例包（HTTP fallback）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-field-rehearsal-sample.ps1 -Sample hf-normal -Mode http
```

说明：

- 如果 MQTT 鉴权已开启，必须提供有效 `device_id / device_secret`
- 如果当前本地 MQTT credentials 还未对齐，可以先走 HTTP fallback 验证字段和平台可见性

执行 Docker 成功路径 workflow：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal
```

执行并在成功后自动清理 rehearsal 设备：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal -CleanupAfter
```

成功结果会写到：

- `docs/unified/reports/field-docker-mqtt-path-latest.json`
- `docs/unified/reports/field-docker-mqtt-summary-latest.json`

生成“宿主机 vs 容器内”差异诊断：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-runtime-delta.ps1
```

采集宿主机路径上下文并生成修复计划：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-host-path-context.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-field-host-remediation-plan.ps1
```

当前宿主机路径修复计划报告：

- `docs/unified/reports/field-host-remediation-plan-latest.md`

执行 Docker 多样例成功矩阵：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-sample-matrix.ps1
```

当前 Docker 多样例矩阵报告：

- `docs/unified/reports/field-docker-mqtt-matrix-latest.json`

执行 Docker 样例语义治理矩阵：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-sample-governance.ps1
```

当前 Docker 样例语义治理报告：

- `docs/unified/reports/field-docker-mqtt-governance-latest.json`

执行 `hf-oversized` 语义对比 proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-hf-oversized-semantic-proof.ps1
```

当前 `hf-oversized` 语义对比报告：

- `docs/unified/reports/field-hf-oversized-semantic-proof-latest.json`

执行序列语义 proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-sequence-semantic-proofs.ps1
```

当前序列语义报告：

- `docs/unified/reports/field-sequence-semantic-proofs-latest.json`

执行 DLQ reason proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-dlq-reason-proofs.ps1
```

当前 DLQ reason 报告：

- `docs/unified/reports/field-dlq-reason-proofs-latest.json`

执行 `lf-meta` 语义 proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-lf-meta-semantic-proof.ps1
```

当前 `lf-meta` 语义报告：

- `docs/unified/reports/field-lf-meta-semantic-proof-latest.json`

执行 missing/null 语义 proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-missing-null-semantic-proof.ps1
```

当前 missing/null 语义报告：

- `docs/unified/reports/field-missing-null-semantic-proof-latest.json`

生成当前 semantic scorecard：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-field-semantic-scorecard.ps1
```

当前 semantic scorecard：

- `docs/unified/reports/field-semantic-scorecard-latest.md`

执行 missing alert policy proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-missing-alert-policy-proof.ps1
```

当前 missing alert policy 报告：

- `docs/unified/reports/field-missing-alert-policy-proof-latest.json`

执行 missing alert recovery proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-missing-alert-recovery-proof.ps1
```

当前 missing alert recovery 报告：

- `docs/unified/reports/field-missing-alert-recovery-proof-latest.json`

执行 alert notification proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-alert-notification-proof.ps1
```

当前 alert notification 报告：

- `docs/unified/reports/field-alert-notification-proof-latest.json`

执行 command notification proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-notification-proof.ps1
```

当前 command notification 报告：

- `docs/unified/reports/field-command-notification-proof-latest.json`

执行 command failed notification proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-failed-notification-proof.ps1
```

当前 command failed notification 报告：

- `docs/unified/reports/field-command-failed-notification-proof-latest.json`

执行 command failed receipt proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-failed-receipt-proof.ps1
```

当前 command failed receipt 报告：

- `docs/unified/reports/field-command-failed-receipt-proof-latest.json`

执行 command failed MQTT receipt ingress proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-failed-mqtt-receipt-proof.ps1
```

当前 command failed MQTT receipt 报告：

- `docs/unified/reports/field-command-failed-mqtt-receipt-proof-latest.json`

执行 command acked MQTT receipt proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-acked-mqtt-receipt-proof.ps1
```

当前 command acked MQTT receipt 报告：

- `docs/unified/reports/field-command-acked-mqtt-receipt-proof-latest.json`

执行 command acked notification policy proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-acked-notification-proof.ps1
```

当前 command acked notification 报告：

- `docs/unified/reports/field-command-acked-notification-proof-latest.json`

执行 command success-notification type default proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-success-notification-type-default-proof.ps1
```

当前 command success-notification type default 报告：

- `docs/unified/reports/field-command-success-notification-type-default-proof-latest.json`

检查当前 full-path readiness 边界：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-full-path-readiness.ps1
```

当前 full-path readiness 报告：

- `docs/unified/reports/field-full-path-readiness-latest.json`

执行 host-run HTTP full-path proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-http-full-path.ps1 -Sample hf-normal -HttpPort 18091
```

当前 host-run HTTP full-path 报告：

- `docs/unified/reports/field-http-full-path-latest.json`

当前目录物料定位：

- 用于联调和探针
- 用于留证
- 不等于最终生产网关实现

## hardware-stable-version 命令样本

当前已新增：

- `docs/tools/field-rehearsal/payload-samples/hardware-stable-version/`

用途：

- 为当前硬件稳定版 `DEVICE_ID` 直接生成可注入 `cmd/{device_id}` 的 pretty JSON 命令样本
- 同时提供：
  - `suggestedChunks80`
  - `mismatchSample`
  便于做 UART/gateway 分片与守卫验证

生成与报告：

- `scripts/dev/check-hardware-stable-version-gateway-command-samples.ps1`
- `docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json`

若要进一步跑 OpenHarmony 风格源码级接收仿真：

- `scripts/dev/check-hardware-stable-version-openharmony-command-harness.ps1`
- `docs/unified/reports/hardware-stable-version-openharmony-command-harness-latest.json`

当前这条 harness 已直接消费上面的 `hardware-stable-version` 命令样本，而不是手写测试场景。

若要检查“gateway 样本 -> OpenHarmony harness”注入 proof：

- `scripts/dev/check-hardware-stable-version-gateway-injection-proof.ps1`
- `docs/unified/reports/hardware-stable-version-gateway-injection-proof-latest.json`

当前这条 proof 会自动断言：

- `alignedCommandTopicStable`
- `harnessLocalDeviceMatchesHardware`
- `setSamplingExecuted`
- `setConfigExecuted`
- `mismatchRejected`

若要把同一批样本直接拿去做 gateway / UART 注入：

- `scripts/dev/inject-hardware-stable-version-command.ps1`
- `scripts/dev/inject-hardware-stable-version-command.js`
- `scripts/dev/check-hardware-stable-version-gateway-uart-injection-readiness.ps1`
- `scripts/dev/check-hardware-stable-version-mqtt-command-publish-proof.ps1`
- `scripts/dev/relay-hardware-stable-version-command-to-uart.js`
- `scripts/dev/check-hardware-stable-version-mqtt-to-uart-relay-proof.ps1`
- `scripts/dev/check-hardware-stable-version-mqtt-to-uart-relay-matrix.ps1`
- `scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1`
- `scripts/dev/stop-hardware-stable-version-mqtt-uart-relay.ps1`
- `scripts/dev/check-hardware-stable-version-live-relay-wrapper-proof.ps1`
- `scripts/dev/show-hardware-stable-version-serial-ports.ps1`
- `scripts/dev/check-hardware-stable-version-serial-root-cause.ps1`
- `scripts/dev/check-hardware-stable-version-passive-serial-probe.ps1`

先输出 UART 注入计划：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample manual_collect -Mode uart-plan
```

直接发布到 `cmd/{device_id}`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample reboot -Mode mqtt -MqttUrl mqtt://127.0.0.1:1883
```

直接写到 Windows 串口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample set_config -Mode uart-com -Port COM5 -ChunkStrategy suggested -InterChunkDelayMs 50
```

说明：

- `-Sample` 可直接用命令名，例如：
  - `set_config`
  - `manual_collect`
  - `reboot`
  - `motor_start`
  - `buzzer_off`
- mismatch 守卫样本可用：
  - `mismatch`
  - `manual_collect.mismatched-device`
- `-ChunkStrategy suggested` 会优先使用当前 proof 已验证过的 `suggestedChunks80`
- `-ChunkStrategy whole` 则更接近“gateway 侧一次串口写完整 JSON，再由链路自行分段”的注入方式

若要同时检查：

- 样本是否都能生成 UART 注入计划
- 本机 `mqtt://127.0.0.1:1883` 是否在监听
- 当前 Windows 会话是否可见 `COM` 串口

可执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-gateway-uart-injection-readiness.ps1
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-gateway-uart-injection-readiness-latest.json`

若要验证“样本已真发到本机 EMQX，并且 `cmd/{device_id}` 上确实能收到”：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-mqtt-command-publish-proof.ps1 -Sample manual_collect
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-mqtt-command-publish-proof-latest.json`

若要验证“命令已从本机 EMQX 进入 gateway-style relay，并被转换成 UART-ready chunk 计划”：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-mqtt-to-uart-relay-proof.ps1 -Sample manual_collect
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-mqtt-to-uart-relay-proof-latest.json`

说明：

- 当前这条 relay proof 默认使用：
  - `ingest-service` 内部 MQTT 账号
  - `file` sink
- 也就是说，它当前证明的是：
  - `MQTT broker -> gateway relay -> UART-ready chunk plan`
- 一旦有真实 `COM` 口，可把 relay sink 切到：
  - `uart-com`

若要把 10 条 aligned 样本加 1 条 mismatch 样本整组回跑成 relay 矩阵：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-mqtt-to-uart-relay-matrix.ps1
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-mqtt-to-uart-relay-matrix-latest.json`

若要把 relay 常驻挂起来，等待 `cmd/{device_id}` 实时下沉到 `file/stdout/uart-com`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1 -RunInBackground -TimeoutSeconds 60
```

若已接好真实串口，可直接切到：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1 -Sink uart-com -Port COM5
```

若希望“串口一出现就自动选第一个 COM 口”：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1 -Sink uart-com -Port auto -WaitForPortSeconds 300
```

停止最近一次后台 relay：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/stop-hardware-stable-version-mqtt-uart-relay.ps1
```

若要验证这对后台 wrapper 本身已经具备：

- 后台拉起
- 订阅成功
- metadata 落盘
- 停止/已退出判定

可执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-live-relay-wrapper-proof.ps1
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-live-relay-wrapper-proof-latest.json`

若只想观察当前机器是否已经识别到串口，可执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-hardware-stable-version-serial-ports.ps1
```

若要连续观察 60 秒：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-hardware-stable-version-serial-ports.ps1 -WatchSeconds 60
```

若要生成“为什么当前没有物理 `COM` 口”的诊断报告：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-serial-root-cause.ps1
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-serial-root-cause-latest.json`

若要对当前 `COM` 口做只读被动探针，不发送任何字节：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-hardware-stable-version-passive-serial-probe.ps1 -Port COM5
```

当前报告会写到：

- `docs/unified/reports/hardware-stable-version-passive-serial-probe-latest.json`
