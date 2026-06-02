---
title: field-hardware-gateway-architecture-eval
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval
---

# field-hardware-gateway-architecture-eval

## Status

- topic: `field-hardware-gateway-architecture`
- state: `proposal-drafted`
- updated_at: `2026-03-24`

## 1. 当前综合判断

当前最合理的长期方案不是“节点直接裸连平台”，也不是“平台去适配现场私有协议”，而是：

1. `field node`
- RK2206 采集节点
- 负责采样、本地最小缓存、看门狗、低功耗调度

2. `field gateway`
- 负责接收现场链路数据
- 负责 framing 重组、缓存、重放、转发、健康上报
- 负责把现场链路接入现有平台标准契约

3. `central platform`
- 继续沿用现有 v2 主链：
  - MQTT / ingest
  - Kafka
  - ClickHouse / PostgreSQL
  - API / Desk / Web

## 2. 身份模型建议

### 平台主身份

- `device_id`
  - UUID
  - 唯一机器身份
  - 用于认证、topic、数据库主键、命令与审计

### 现场标签

- `install_label`
  - 只作为现场可读标签
  - 用于贴纸、施工、巡检、口头沟通
  - 不参与认证、topic、数据库主键

### 追溯字段

- `hardware_serial`
  - 可选
  - 用于制造、返修、追溯

## 3. 协议方向建议

### 方向

- 节点协议尽量直接对齐软件主链语义
- 但不能把“完整、冗长”的标准 JSON 原样硬塞给 XL01

### 推荐方式

- 节点直接使用：
  - `device_id`
  - canonical metrics key
- 节点输出：
  - 轻量版 `Field Telemetry Profile`
- 网关只做：
  - 收包
  - 重组
  - 缓存
  - 转发
  - 健康监控

### 不推荐方式

- 保留长期私有 JSON 并让网关承担厚重业务映射
- 让 `install_label` 成为第二机器身份

## 4. XL01 相关约束

### 已确认真值

- 当前节点程序本身没有主动应用层分包
- 当前节点是“一次组完整 JSON，再一次性写 UART”
- XL01 用户串口链路会：
  - 缓存
  - 聚包
  - 排队
  - 在接收端呈现非连续字节流
- 用户串口单向速率量级约 `900Byte/s`

### 工程含义

- 不能把“应用层一条 JSON”直接等同于“链路层完整一条消息”
- 必须单独定义：
  - framing
  - length budget
  - high-frequency / low-frequency packet split

## 5. `Ubuntu + RK3568` 网关评估

### 结论

- 可行
- 推荐作为网关候选

### 适合原因

- 算力和内存足以承载：
  - 串口/无线接入
  - 协议转换
  - 本地缓存
  - MQTT / HTTP client
  - 健康监控与日志
- Ubuntu 生态成熟，适合开发与运维

### 约束

- 它适合作为网关，不适合作为低功耗野外采集节点
- 必须考虑：
  - 稳定供电
  - 自启动与掉电恢复
  - eMMC/SSD 写入策略
  - 本地 spool/cache
  - 4G/5G/有线回传
  - 防雷、防水、温度与外壳

## 6. 软件优先联调建议

### 顺序

1. 节点 -> 网关 软件联调
2. 网关 -> 平台 软件联调
3. 端到端 rehearsal
4. 最后用真实节点替换模拟器

### 推荐工具策略

- 调试期：
  - Node-RED
  - MQTTX
  - 自定义节点模拟器 / 回放脚本
- 长期：
  - 自研轻量网关适配器

### 原则

- 现成成熟软件适合做调试和探针
- 不适合作为长期架构真相替代品

## 7. 当前最推荐的下一步

1. 继续评审并冻结当前 OpenSpec 草案
2. 先做软件优先联调，不急着上真实硬件
3. 先收：
- 节点模拟器格式
- 网关适配器最小契约
- 平台 acceptance probes
- 联调证据目录
4. 最后再进入真实 RK2206 + XL01 联调

## 8. 当前阶段决策

### 结论

当前项目期应选择：

- `A` 路线
- 先用成熟工具把联调打通
- 不默认在本阶段投入较重的自研网关开发

### 当前推荐组合

- Node-RED
  - 用于串口/字段/流转调试
- MQTTX
  - 用于 MQTT topic/payload 探针与人工验收
- 轻量回放脚本 / 节点模拟器
  - 用于稳定产生测试消息
- 现有平台主链
  - 用于 ingest / API / Desk / Web 验证

### 说明

- 当前阶段的目标是“联调成功并有证据”
- 不是“现在就把网关长期产品化”
- 若后续证明这条链需要长期保留，再单独评估是否值得收口成 bounded custom adapter
- 补充调研结论：
  - MQTTX 官方确实已有 MCP 相关能力与官方博文
  - 但当前更偏向“在 MQTTX 内接 AI / MCP 工具能力”，不是我们当前会话里现成可用的 MQTT MCP 运行时
  - 当前环境也没有已配置的 MCP 资源或模板可直接拿来接本地 broker

## 9. 当前执行入口

当前 A 路线联调执行指南已经单独落到：

- `docs/guides/testing/field-software-rehearsal.md`

建议后续按该文档推进：

1. 节点模拟器样例库
2. Node-RED 串口/字段联调
3. MQTTX 探针与平台接入验证
4. evidence bundle 留证

## 10. 当前已落地的第一批联调物料

当前已真实新增：

- `docs/tools/field-rehearsal/README.md`
- `docs/tools/field-rehearsal/payload-samples/`
  - `hf-normal.json`
  - `lf-meta.json`
  - `hf-duplicate.json`
  - `hf-out-of-order.json`
  - `hf-oversized.json`
  - `hf-replay.json`
- `docs/tools/field-rehearsal/node-red/flow-template.json`
- `docs/tools/field-rehearsal/mqttx/probe-checklist.md`
- `docs/tools/field-rehearsal/evidence/summary.template.json`
- `scripts/dev/check-field-rehearsal-samples.js`
- `scripts/dev/check-field-rehearsal-samples.ps1`
- `scripts/dev/generate-field-rehearsal-sample.js`
- `scripts/dev/generate-field-rehearsal-sample.ps1`
- `scripts/dev/prepare-field-rehearsal.js`
- `scripts/dev/prepare-field-rehearsal.ps1`
- `scripts/dev/run-field-rehearsal.js`
- `scripts/dev/run-field-rehearsal.ps1`
- `scripts/dev/check-field-platform-acceptance.js`
- `scripts/dev/check-field-platform-acceptance.ps1`
- `scripts/dev/check-field-local-runtime.ps1`
- `scripts/dev/check-field-docker-runtime.ps1`
- `scripts/dev/check-field-docker-acceptance.ps1`
- `scripts/dev/check-field-runtime-delta.ps1`
- `scripts/dev/create-field-rehearsal-device.ps1`
- `scripts/dev/publish-field-rehearsal-sample-docker.ps1`
- `scripts/dev/configure-emqx-docker-webhook.ps1`
- `scripts/dev/run-field-rehearsal-docker.ps1`
- `scripts/dev/publish-field-rehearsal-sample.js`
- `scripts/dev/publish-field-rehearsal-sample.ps1`

当前样例校验结论：

- 高频正常包样例已压到预算内
- 高频超限样例保留为“拒绝/降级候选”
- 全部样例均通过 `TelemetryEnvelope` schema 校验

补充说明：

- 样例发布脚本当前已支持：
  - MQTT
  - HTTP fallback
- 样例生成脚本当前已支持：
  - 基于样例库覆写 `device_id`
  - 覆写 `seq`
  - 增加额外 metrics
  - 直接输出到 evidence 目录
- rehearsal 准备脚本当前已支持：
  - 一键创建 `backups/evidence/field-rehearsal-<timestamp>/`
  - 拷贝样例包
  - 生成 `profile-summary.json`
  - 生成 `summary.json`
- rehearsal wrapper 当前已支持：
  - 串起 `prepare`
  - 写回 `summary.json`
  - 为后续 `mqtt/http` 模式预留统一入口
- 平台 acceptance probe 当前已支持：
  - `/health`
  - `/api/v1/dashboard`
  - `/api/v1/system/status`
  - `/api/v1/stations`
  - `/api/v1/devices`
  - legacy `/api/dashboard/*`
  - 可选 `/api/v1/data/state/{deviceId}`
- 本地联调总探针当前已支持一次性汇总：
  - 1883 / 9094 / 8080 / 8081 / 3000 TCP 状态
  - 8080 / 8081 / 3000 HTTP 状态
  - 本地 API `/api/v1/system/status` 返回情况
- Docker 运行态探针当前已支持一次性确认：
  - `lsmv2_api`
  - `lsmv2_web`
  - `lsmv2_postgres`
  - `lsmv2_clickhouse`
  - `lsmv2_kafka`
  - `lsmv2_emqx`
  在容器内视角是否正常
- Docker 容器内 acceptance 探针当前已支持：
  - 真实 `/api/v1/auth/login`
  - `system/status`
  - `stations`
  - `devices`
- 当前这条探针已形成平台半边成功留证
- 当前成功留证文件：
  - `docs/unified/reports/field-docker-acceptance-latest.json`
- 当前差异诊断文件：
  - `docs/unified/reports/field-runtime-delta-latest.json`
- 当前补充判断：
  - 已观察到 WSL NAT / localhost forwarding 警告
  - 当前更应优先把问题视为 Docker Desktop / WSL 本地转发层异常，而不是业务脚本或平台契约异常
- 当前已实际验证低风险恢复动作可解除宿主机 relay blocker：
  - 关闭 Docker Desktop
  - `wsl --shutdown`
  - 重启 Docker Desktop
- 恢复后当前差异诊断已变为：
  - `host-path-recovered`
- 这意味着当前宿主机 relay/path 已恢复
  - 当前 host relay 不再是阶段 blocker
- 当前对应排查文档：
  - `docs/guides/testing/field-host-path-troubleshooting.md`
- 当前已补充宿主机路径上下文探针：
  - `scripts/dev/check-field-host-path-context.ps1`
- 当前已补充宿主机路径修复计划生成：
  - `scripts/dev/render-field-host-remediation-plan.ps1`
- 当前最新修复计划报告：
  - `docs/unified/reports/field-host-remediation-plan-latest.md`
- 当前该文档已补充：
  - Docker Desktop / WSL 官方资料导向的修复顺序
  - Host networking / mirrored networking 作为环境实验项
- 当前宿主机路径已新增一键采证脚本：
  - `scripts/dev/collect-field-host-triage.ps1`
- 当前一键采证已同时包含：
  - `field-host-remediation-plan.md`
- 当前 Docker 网络内 MQTT 发布路径已成功验证：
  - rehearsal 设备可通过 API 创建并返回 `deviceId + deviceSecret`
  - EMQX webhook 可重配到容器内 `lsmv2_api:8080`
  - 使用真实凭据的 `publish-field-rehearsal-sample-docker.ps1` 可成功发布 MQTT 样例包
- 当前已存在结构化总报告：
  - `docs/unified/reports/field-docker-mqtt-path-latest.json`
- 当前已存在简洁摘要：
  - `docs/unified/reports/field-docker-mqtt-summary-latest.json`
- 当前成功 workflow 已支持：
  - `-CleanupAfter`
  - 可在成功留证后自动清理 rehearsal 设备与关联测试数据
- MQTT 发布脚本已加入快速失败机制，避免本地 broker/credentials 异常时长期挂住
- 当前已确认本地 blocker：
  - 当前宿主机 relay 与宿主机 Kafka 连通性已恢复
  - 当前不再把 `127.0.0.1:9094` 视为阶段 blocker
- 当前已新增专用探针：
  - `scripts/dev/check-host-kafka-connectivity.ps1`
  - `scripts/dev/check-host-kafka-connectivity.js`
- 当前宿主机 Kafka 成功留证：
  - `docs/unified/reports/host-kafka-connectivity-latest.json`