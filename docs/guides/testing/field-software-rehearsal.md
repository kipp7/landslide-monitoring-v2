# 现场链路软件优先联调（A 路线）

适用范围：当前硬件方案收口阶段，先不依赖真实硬件大规模接入，优先用成熟工具和轻量脚本把“节点 -> 网关 -> 平台”边界打顺。

目标：

- 先把协议、分帧、字段、缓存、转发边界调顺
- 先定位问题归属：节点侧、网关侧、还是平台侧
- 先形成结构化证据，再决定是否进入真实硬件联调

当前阶段推荐工具：

- `Node-RED`
  - 串口/字段/流转快速联调
- `MQTTX`
  - MQTT topic/payload 探针与人工验收
- `节点模拟器 / 回放脚本`
  - 稳定产生测试消息
- 现有平台主链
  - `ingest -> Kafka -> ClickHouse/Postgres -> API -> Desk/Web`
- `docs/tools/field-rehearsal/`
  - 第一批样例包、Node-RED 模板、MQTTX probe 清单、evidence 模板

不建议当前阶段做的事：

- 一上来直接改真实 RK2206 固件
- 一上来直接写长期生产级网关
- 一上来同时联调节点、网关、平台和现场无线链路

## 1) 联调范围

当前 A 路线只覆盖：

1. 节点消息 profile 是否合理
2. 网关适配与缓存是否合理
3. 平台 ingress 与可见性是否合理

当前 A 路线不覆盖：

- 最终现场天线与点位
- 最终供电与防雷
- 最终温度/外壳/工业环境验证
- 二期命令/回执闭环

## 2) 分阶段顺序

### 2.1 第一步：节点 -> 网关

先验证：

- Field Telemetry Profile
- 分帧与重组
- 高低频字段分层
- 包长预算

这一步只回答：

- 节点应该发什么
- 网关应该怎样把它接住

### 2.2 第二步：网关 -> 平台

再验证：

- MQTT uplink
- 可选 HTTP fallback uplink
- 缓存重放
- 平台 schema 接收

这一步只回答：

- 网关能不能把节点消息安全地送进现有平台主链

### 2.3 第三步：平台可见性

最后验证：

- ingest 接收
- Kafka/raw 写链
- API 可见
- Desk/Web 可见

这一步只回答：

- 消息进平台后，现有软件能不能看到

### 2.4 第四步：真实硬件替换

前三步都稳定后，再把真实节点替换进来。

## 3) 节点模拟器要求

节点模拟器不要求模拟真实电气行为，但必须稳定产出以下包类型：

- `hf-normal`
  - 高频正常包
- `lf-meta`
  - 低频补充包
- `hf-duplicate`
  - 重复包
- `hf-out-of-order`
  - 乱序包
- `hf-oversized`
  - 超预算包
- `hf-replay`
  - 断链后重放包

模拟器输出字段要求：

- 机器身份始终使用 `device_id`
- 现场标签 `install_label` 不进入高频包
- 字段名尽量使用平台 canonical key
- 高频包只带必要字段

当前可直接使用的起步工具：

- 样例库：
  - `docs/tools/field-rehearsal/payload-samples/`
- 样例生成器：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/generate-field-rehearsal-sample.ps1 -Sample hf-normal -Seq 2001`

## 4) 网关适配器最小职责

当前调试阶段，网关适配器最少要做：

1. 收包
2. 重组完整逻辑消息
3. 做长度/字段/profile 检查
4. 写本地 spool/cache
5. 转发到 MQTT 或临时 HTTP adapter
6. 输出健康状态

当前不要求网关承担：

- 复杂业务语义推断
- 平台侧数据口径重算
- 长期产品级运维界面

## 5) MQTT 与 HTTP 的使用边界

### MQTT

这是当前长期方向。

用来验证：

- topic 是否正确
- payload 是否符合平台主链约束
- ingest 是否可正常接收

推荐入口：

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-field-rehearsal-sample.ps1 -Sample hf-normal -Mode mqtt`

注意：

- 若本地 MQTT 鉴权已开启，必须附带有效 `device_id / device_secret`
- 若当前本地 broker 活着但 credentials 未对齐，样例发布脚本会快速失败，而不会长期挂住
- 当前若仍无法从宿主机稳定连入本地 broker，应先把该问题视为“本地联调环境 blocker”，不要误判成样例包或协议设计问题

### HTTP fallback

这是当前早期调试备用路径，不是长期真相。

只用于：

- 快速验证字段映射
- 快速验证平台可见性
- 在 MQTT 还没完全顺之前缩短反馈回路

推荐入口：

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-field-rehearsal-sample.ps1 -Sample hf-normal -Mode http`

注意：

- 当前 HTTP fallback 仍依赖本地 `huawei-iot-adapter -> Kafka` 路径
- 如果宿主机进程无法稳定连入本地 Kafka，对应的 HTTP fallback 也会被阻塞
- 这种情况应优先修正本地 adapter/Kafka 联调环境，而不是回头推翻节点 profile 设计

## 6) Node-RED 和 MQTTX 怎么用

### Node-RED

建议只做：

- 串口读取
- 字节流观察
- 快速字段转换实验
- MQTT/HTTP 临时转发

不建议长期保留：

- 缓存重放主逻辑
- 审计真值
- 协议版本管理

### MQTTX

建议只做：

- topic 订阅/发布探针
- payload 可视化检查
- 人工验收

不承担：

- 网关逻辑
- 缓存重放
- 长期运行服务

## 7) 每一步的通过标准

### 节点 -> 网关 通过标准

- 高频包与低频包边界明确
- 乱序/重复/超预算包都能被识别
- 分帧重组后能稳定拿到完整逻辑消息

### 网关 -> 平台 通过标准

- MQTT 主路径可用，或 HTTP fallback 可临时验证
- spool/cache 状态可观察
- 重放不会破坏平台主身份与字段语义

### 平台可见性 通过标准

- schema 接收通过
- ingest 接收通过
- Kafka/raw 路径可见
- API 能查到
- Desk/Web 至少一条目标路径可见

推荐平台探针：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-platform-acceptance.ps1 -BaseUrl http://127.0.0.1:8080
```

说明：

- 当前主线 Docker app 路径下，宿主机 API 联调端口以 `8080` 为准
- 若后续切回其他本地运行形态，再按实际运行态显式传入 `-BaseUrl`

## 8) 证据目录要求

每次联调建议落到：

```text
backups/evidence/field-rehearsal-<timestamp>/
  node/
    payload-samples/
    profile-summary.json
  gateway/
    adapter.log
    framing.log
    spool-before.json
    spool-after.json
  platform/
    ingest-proof.json
    api-proof.json
    desk-proof.json
  summary.json
```

`summary.json` 至少记录：

- 本次联调范围
- 使用了哪些包类型
- 接收/拒绝/重放统计
- 当前结论

## 9) 当前最省弯路的执行顺序

1. 先做节点模拟器样例库
2. 再用 Node-RED 快速打通节点 -> 网关
3. 再用 MQTTX 和现有平台打通网关 -> 平台
4. 形成第一轮 evidence bundle
5. 最后再决定是否把真实 RK2206 替换进来

当前可用的 Docker 网络内成功路径：

1. `create-field-rehearsal-device.ps1`
2. 如有需要，执行 `configure-emqx-docker-webhook.ps1`
3. `publish-field-rehearsal-sample-docker.ps1 -Mode mqtt`
4. `check-field-docker-acceptance.ps1`

推荐总入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal
```

如果你想一次性看多类样例当前是否都能跑通 Docker-network MQTT workflow：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-sample-matrix.ps1
```

对应矩阵报告：

- `docs/unified/reports/field-docker-mqtt-matrix-latest.json`

如果你想把“transport 跑通”和“样例预算/语义定位”合并成一份当前态治理报告：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-sample-governance.ps1
```

对应治理报告：

- `docs/unified/reports/field-docker-mqtt-governance-latest.json`

如果你要确认 `hf-oversized` 当前到底有没有被真正 reject/downgrade，而不只是看 transport 成功：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-hf-oversized-semantic-proof.ps1
```

对应语义对比报告：

- `docs/unified/reports/field-hf-oversized-semantic-proof-latest.json`

如果你要确认 duplicate / out-of-order / replay 在当前链路里的真实语义行为：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-sequence-semantic-proofs.ps1
```

对应序列语义报告：

- `docs/unified/reports/field-sequence-semantic-proofs-latest.json`

如果你要确认这些 guard 不只是存在，而且真的带着正确 `reason_code` 进了 `telemetry.dlq.v1`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-dlq-reason-proofs.ps1
```

对应 DLQ reason 报告：

- `docs/unified/reports/field-dlq-reason-proofs-latest.json`

如果你要确认 `lf-meta` 不会把已有高频 state 冲掉，而是按稀疏字段合并：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-lf-meta-semantic-proof.ps1
```

对应 `lf-meta` 语义报告：

- `docs/unified/reports/field-lf-meta-semantic-proof-latest.json`

如果你要确认“缺失字段保留旧值、显式 `null` 只清空目标字段”：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-missing-null-semantic-proof.ps1
```

对应 missing/null 语义报告：

- `docs/unified/reports/field-missing-null-semantic-proof-latest.json`

如果你要确认 `raise_missing_alert` 已经开始尊重设备传感器声明：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-missing-alert-policy-proof.ps1
```

对应 missing alert policy 报告：

- `docs/unified/reports/field-missing-alert-policy-proof-latest.json`

如果你要确认缺失告警在传感器恢复上报后会自动 resolve：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-missing-alert-recovery-proof.ps1
```

对应 missing alert recovery 报告：

- `docs/unified/reports/field-missing-alert-recovery-proof-latest.json`

如果你要确认 missing alert 不只是落到 `alert_events`，还会产生用户通知：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-alert-notification-proof.ps1
```

对应 alert notification 报告：

- `docs/unified/reports/field-alert-notification-proof-latest.json`

如果你要确认设备命令超时不只是写出 `device_command_events`，还会产生可消费的命令通知：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-notification-proof.ps1
```

对应 command notification 报告：

- `docs/unified/reports/field-command-notification-proof-latest.json`

如果你要确认 `COMMAND_FAILED` 事件进入 `device.command_events.v1` 后，也会产生命令通知：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-failed-notification-proof.ps1
```

对应 command failed notification 报告：

- `docs/unified/reports/field-command-failed-notification-proof-latest.json`

如果你要确认 `device.command_acks.v1` 经 `command-ack-receiver` 后，真的会把命令状态、事件流和通知一起带通：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-failed-receipt-proof.ps1
```

对应 command failed receipt 报告：

- `docs/unified/reports/field-command-failed-receipt-proof-latest.json`

如果你要确认 MQTT `cmd_ack/<device_id>` ingress 真的会经 `command-ack-receiver` 把命令状态、事件流和通知一起带通：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-failed-mqtt-receipt-proof.ps1
```

对应 command failed MQTT receipt 报告：

- `docs/unified/reports/field-command-failed-mqtt-receipt-proof-latest.json`

如果你要确认 MQTT `cmd_ack/<device_id>` 的 `acked` 回执会把命令和事件带通，但不会生成命令通知：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-acked-mqtt-receipt-proof.ps1
```

对应 command acked MQTT receipt 报告：

- `docs/unified/reports/field-command-acked-mqtt-receipt-proof-latest.json`

如果你要确认 `notifyOnAck=true` 时，`COMMAND_ACKED` 不再保持静默，而会进入命令通知链路：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-acked-notification-proof.ps1
```

对应 command acked notification 报告：

- `docs/unified/reports/field-command-acked-notification-proof-latest.json`

如果你要确认 success-notification 已经支持 `inherit -> command-type default -> system default`，即使命令没有显式打开 `notifyOnAck` 也会因命令类型默认策略而产生成功通知：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-success-notification-type-default-proof.ps1
```

对应 command success-notification type default 报告：

- `docs/unified/reports/field-command-success-notification-type-default-proof-latest.json`

当前 full-path readiness 报告：

- `docs/unified/reports/field-full-path-readiness-latest.json`
- `docs/unified/reports/field-host-kafka-consumer-path-latest.json`

执行 host-run HTTP full-path proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-http-full-path.ps1 -Sample hf-normal -HttpPort 18091
```

对应 full-path proof 报告：

- `docs/unified/reports/field-http-full-path-latest.json`

当前已实测通过的 Docker-network matrix 样例：

- `hf-normal`
- `hf-duplicate`
- `hf-out-of-order`
- `hf-replay`
- `lf-meta`
- `hf-oversized`

说明：

- `hf-oversized` 当前在“传输链路 + 平台 acceptance”层面可执行
- 但它仍然是业务侧“拒绝或降级候选”，不应自动解读成 high-frequency budget 已放宽
- 当前 Docker app stack 仍未运行 `ingest-service` / `telemetry-writer`
- 因此这批 matrix / governance 报告的当前边界仍是：
  - `broker-and-api-selfcheck-only`
- 进一步补充：
  - 当前宿主机 Kafka producer path 已验证可写入 `telemetry.raw.v1`
  - 当前 host-run HTTP full-path proof 已经可以绕过这个 gap，直接给出 ClickHouse + `device_state` 落库证据
  - 当前 `hf-oversized` 语义对比 proof 已证实：它现在会在 writer 侧转入 DLQ，不再落库到 ClickHouse + `device_state`
  - 当前序列语义 proof 已证实：
    - duplicate 已具备幂等守卫
    - out-of-order 不再用更低 seq 覆盖最新 `device_state`
    - replay 不再覆盖最新 `device_state`
  - 当前 DLQ reason proof 已证实：
    - `hf_oversized -> high_frequency_budget_exceeded`
    - `duplicate -> duplicate_seq`
    - `out_of_order/replay -> stale_seq`
  - 当前 `lf-meta` 语义 proof 已证实：
    - 低频包会补充低频 `metrics/meta`
    - 但不会删除已有高频倾角状态
  - 当前 missing/null 语义 proof 已证实：
    - 缺失字段会保留旧值
    - 显式 `null` 只会清空目标字段
  - 当前 missing alert policy proof 已证实：
    - 已声明的缺失传感器会触发 missing alert
    - 未声明的传感器缺失不会触发同类 alert
  - 当前 missing alert recovery proof 已证实：
    - declared missing alert 会在传感器恢复上报后自动 `ALERT_RESOLVE`
  - 当前 alert notification proof 已证实：
    - missing alert 会为订阅用户写出 `alert_notifications`
  - 当前 command notification proof 已证实：
    - command timeout 会写出 `device_command_notifications`
    - 且 `list/stats/detail/read` 四步 API 已闭环
  - 当前 command failed notification proof 已证实：
    - `COMMAND_FAILED` 事件会写出 `device_command_notifications`
    - 且 `list/stats/detail/read` 四步 API 已闭环
  - 当前 command failed receipt proof 已证实：
    - `device.command_acks.v1` 经 `command-ack-receiver` 后会把命令状态更新为 `failed`
    - 同时写出 `COMMAND_FAILED` 事件与 `device_command_notifications`
    - 且 `list/stats/detail/read` 四步 API 已闭环
  - 当前 command failed MQTT receipt proof 已证实：
    - MQTT `cmd_ack/<device_id>` ingress 也会把命令状态更新为 `failed`
    - 同时写出 `COMMAND_FAILED` 事件与 `device_command_notifications`
    - 且 `list/stats/detail/read` 四步 API 已闭环
  - 当前 command acked MQTT receipt proof 已证实：
    - MQTT `cmd_ack/<device_id>` ingress 会把命令状态更新为 `acked`
    - 同时写出 `COMMAND_ACKED` 事件
    - 但当前策略不会为 `COMMAND_ACKED` 生成 `device_command_notifications`
  - 当前 command acked notification proof 已证实：
    - 当命令显式设置 `notifyOnAck=true`
    - `COMMAND_ACKED` 会生成 `device_command_notifications`
    - 且 `list/stats/detail/read` 四步 API 已闭环
  - 当前 command success-notification type default proof 已证实：
    - 当命令未显式传 `notifyOnAck` / `successNotificationPolicy`
    - 只要命中 command-type default，`effectiveSuccessNotificationPolicy` 也会解析为 `always_notify`
    - 并继续生成 `COMMAND_ACKED` 的 `device_command_notifications`

如果你只想验证链路、又不希望环境持续堆积 rehearsal 设备：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal -CleanupAfter
```

推荐准备命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-field-rehearsal.ps1 -Scope node-gateway
```

推荐最小 wrapper 命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal.ps1 -Mode prepare -Scope node-gateway
```

## 10) 当前已知本地 blocker

当前已观察到的本地联调环境 blocker：

- 宿主机 TCP 可达 `127.0.0.1:1883`，EMQX 容器也在运行，但当前样例发布仍未形成成功留证
- 当前宿主机 relay 与 Kafka 探针都已恢复
- 当前可用快速回归探针：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-host-kafka-connectivity.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-host-path-context.ps1`

当前解释：

- 当前已不再观察到宿主机 relay 或宿主机 Kafka 的阶段 blocker
- 这意味着样例包、Field Telemetry Profile 与主线 Docker 环境之间的基础联调前置条件已恢复
- 当前对应留证文件：
  - `docs/unified/reports/field-local-runtime-latest.json`
  - `docs/unified/reports/field-runtime-delta-latest.json`
  - `docs/unified/reports/host-kafka-connectivity-latest.json`

当前建议动作：

1. 继续补 HTTP fallback 成功留证
2. 继续补 MQTT 成功留证
3. 仅在回归探针失败时再重新打开环境治理

详细排查入口：

- `docs/guides/testing/field-host-path-troubleshooting.md`

推荐本地总探针：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-local-runtime.ps1
```

该探针会一次性给出：

- 1883 / 9094 / 8080 / 3000 的 TCP 可达性
- 8080 / 3000 的 HTTP 层状态
- 本地 API `/api/v1/system/status` 当前是否已能返回结构化健康摘要

如需进一步区分“容器内服务本身正常”与“宿主机访问映射端口异常”，可再执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-runtime.ps1
```

容器内 acceptance 成功基线：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-acceptance.ps1
```

说明：

- 该探针在 `lsmv2_api` 容器内完成：
  - 真实 `/api/v1/auth/login`
  - `system/status`
  - `stations`
  - `devices`
- 当前它是 A 路线里最可靠的平台半边成功留证入口
- 当前默认报告输出：
  - `docs/unified/reports/field-docker-acceptance-latest.json`

当前解释规则：

- 如果 `check-field-docker-runtime.ps1` 全绿，而 `check-field-local-runtime.ps1` 仍失败：
  - 应优先判断为宿主机访问 Docker 映射端口/协议层的问题
  - 而不是容器内应用本身未启动
- 如果 `127.0.0.1` 和 `::1` 都表现为空回复或 socket hang up：
  - 不应继续把问题理解成简单的 IPv4/IPv6 切换问题
  - 应直接按“host-to-docker relay/path problem”处理
- 若同时观察到 WSL NAT / localhost forwarding 警告：
  - 优先怀疑 Docker Desktop / WSL localhost 转发层
  - 不要先回头修改节点协议、Field Telemetry Profile 或平台 acceptance probe

如需把这个判断直接固化成结构化结论，可再执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-runtime-delta.ps1
```
