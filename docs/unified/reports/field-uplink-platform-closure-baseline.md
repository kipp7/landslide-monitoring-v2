---
title: field-uplink-platform-closure-baseline
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline
---

# 现场上行数据闭环基线

## 状态

- topic: `field-uplink-platform-closure`
- state: `phase-1-baseline-frozen`
- updated_at: `2026-04-07`
- authority: `current`

## 1. 这份基线解决什么问题

这份文档用于收口一个已经出现的事实冲突：

- `2026-03-25` 的 [hardware-stable-version-adaptation-gap.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/hardware-stable-version-adaptation-gap.md)
  仍把硬件稳定版描述为：
  - 旧式扁平 JSON
  - 缺少 `schema_version / device_id / metrics / meta`
  - 需要较厚的 legacy -> `TelemetryEnvelope` 适配层
- `2026-04-06` 之后的真机证据已经说明：
  - 当前现场节点上行内容已经明显靠近平台遥测语义
  - 当前真正未闭环的重点不再是“旧协议大改造”，而是“网关如何把真实现场上行稳定送入平台并留证”

因此，从现在开始：

- 这份文档作为“现场上行闭环”阶段的权威基线
- 旧的 `adaptation-gap` 报告保留为历史背景，不再作为当前上行阶段的主判断

## 2. 已被真机证据坐实的事实

### 2.1 节点到中心节点的透明上行已经成立

当前冻结的现场链路基线是：

- `COM9` = 命令出口 / 对端 XL01 host 口
- `COM5` = 板端日志观察口
- XL01 模式 = `transparent USR`
- 串口写策略 = `ChunkStrategy=whole`
- 当前观测上报频率 = `report_interval_s=5`

直接证据已经留在：

- [hardware-stable-version-gateway-uart-board-proof.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/memory/tasks/hardware-stable-version-gateway-uart-board-proof.md)
- [2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/journal/2026-04.md)

### 2.2 当前真机上行 payload 已经是“近平台标准”而不是旧扁平 JSON

在 `2026-04-06` 的中心节点串口实测里，收到的上行 JSON 已经包含：

- `schema_version`
- `device_id`
- `seq`
- `metrics.*`
- `meta.*`

已观测到的字段包括：

- `metrics.temperature_c`
- `metrics.humidity_pct`
- `metrics.accel_x_g`
- `metrics.tilt_x_deg`
- `metrics.gps_latitude`
- `metrics.gps_longitude`
- `metrics.battery_pct`
- `metrics.warning_flag`
- `meta.install_label`
- `meta.legacy_node`
- `meta.uptime_s`
- `meta.upload_trigger`
- `meta.legacy_valid_flags`

这说明当前节点上行不再符合“旧式扁平 JSON 仍需整体翻译”的老判断。

### 2.3 当前命令闭环已经不是主 blocker

命令主线已经稳定并推送：

- 正式入口仍是：
  - `POST /api/v1/devices/{deviceId}/commands`
- 最新统一总结为：
  - [command-entry-stable-route-summary-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/command-entry-stable-route-summary-latest.json)

所以当前下一阶段必须切回：

- `field uplink -> gateway adaptation -> platform acceptance -> API/Desk visibility`

而不是继续把命令链当成主线。

## 3. 哪些旧判断已经过时，哪些仍然成立

### 3.1 已过时的判断

以下判断在当前阶段不再适合作为主前提：

- “节点仍只发 `node/temp/humi/lat/lon` 这类旧扁平 JSON”
- “网关一期必须承担厚重的 legacy JSON -> `TelemetryEnvelope v1` 字段重命名工程”
- “当前上行闭环的第一优先级仍是固件协议字段大改”

这些说法没有覆盖 `2026-04-06` 之后的真机证据。

### 3.2 仍然成立的判断

以下架构判断依然成立，而且这轮要保留：

- 平台核心不直接理解 XL01 私有链路与分片字节流
- 网关仍然拥有：
  - 分片重组
  - 长度/完整性校验
  - 本地缓存/重放
  - 网关健康观测
  - 向平台标准入口转发
- `device_id` 仍是平台唯一机器身份
- `install_label` 仍只能是现场展示标签，不能替代 `device_id`

也就是说：

- 旧报告错在“把当前节点输出描述得过旧”
- 但“网关拥有适配边界、平台不吸收现场协议细节”这条长期原则没有错

## 4. 一期最小网关适配合同

## 4.1 网关输入合同

一期网关接收的现场输入，按当前真机事实冻结为：

- 来源：
  - XL01 透明链路到达中心节点串口侧的 UTF-8 文本流
- 传输表现：
  - 可能被拆成多个串口 chunk
  - 单个 chunk 不等于完整业务消息
- 业务消息目标形态：
  - 一条完整 JSON 遥测消息
- 当前业务字段形态：
  - 已接近平台 `TelemetryEnvelope` 语义
  - 但仍可能带有现场/兼容性字段，例如：
    - `meta.install_label`
    - `meta.legacy_node`
    - `meta.legacy_valid_flags`

因此，一期网关的首要任务不是“大翻译”，而是“把字节流稳定恢复成完整 JSON 消息”。

## 4.2 网关必须做的事

一期网关必须承担以下最小职责：

1. 重组
- 从串口分片字节流中恢复完整 JSON 消息边界

2. 校验
- 校验 UTF-8 / JSON 可解析
- 校验 `schema_version`
- 校验 `device_id`
- 校验 `metrics` 是否存在

3. 轻量补齐
- 若现场消息缺少平台要求但网关可确定补齐的内容，可在网关侧补齐
- 当前最现实的补齐项是：
  - `gateway_received_ts`
  - 或在后续平台入口使用接收时间作为辅助时间戳

4. 转发
- 向平台标准入口发出平台可接受的遥测消息
- 一期主路径仍推荐：
  - MQTT uplink
- 早期调试允许：
  - HTTP fallback
- 但 HTTP 只允许作为调试旁路，不是长期架构真值

5. 留证
- 为每次 rehearsal 保留：
  - 原始输入样本
  - 重组结果
  - 校验结果
  - 转发结果
  - 平台可见性结果

## 4.3 网关当前不该做的事

一期网关不该承担以下不必要动作：

- 不要重新发明一个新的机器身份
- 不要把当前已是 canonical 的 metrics key 再改成另一套名字
- 不要要求平台核心去理解 XL01 chunk、透明串口碎片或现场链路 ACK
- 不要把“高频遥测瘦身优化”和“上行能不能进平台”混成一个 blocker

一句话讲，一期最小合同是：

- `thin adapter`

不是：

- `thick translator`

## 5. 一期网关输出合同

一期网关输出到平台侧时，按当前基线冻结为：

- 机器身份：
  - 保持 `device_id` 不变
- 遥测语义：
  - 保持当前 `schema_version + device_id + seq + metrics + meta`
- topic:
  - 继续遵循平台现有遥测入口约定
- 字段处理原则：
  - 已经是 canonical 的字段原样保留
  - 仅对缺失的必要平台字段做确定性补齐
  - 不引入网关私有业务字段污染平台核心遥测契约

对当前真机上行来说，最合理的一期输出策略是：

- `near-pass-through with reconstruction and validation`

而不是：

- `legacy full remap`

## 6. 这一阶段仍未闭环的点

以下问题仍然真实存在，但它们不再阻止我们进入一期上行 rehearsal：

### 6.1 平台可见性证据已经补齐，但重复性还要继续收口

目前我们已经有：

- 现场串口可见
- 命令闭环可见
- 真机样本经 replay 进入平台后的：
  - ingest acceptance
  - API visibility
  - Desk/Web visibility

当前已经存在两条关键证据：

- `docs/unified/reports/field-hardware-uplink-replay-latest.json`
  - 证明真机样本已经进入：
    - MQTT
    - `device_state`
    - `/api/v1/data/state/{deviceId}`
- `docs/unified/reports/field-hardware-uplink-product-visibility-latest.json`
  - 证明同一 replay 设备已经能通过：
    - `http://127.0.0.1:3000/api/v1/devices`
    - `http://127.0.0.1:3000/api/v1/data/state/{deviceId}`
    - `apps/web/lib/api/*`
    被产品侧读到

因此，当前剩下的问题已经不再是“能不能看见”，而是：

- 这条现场上行 -> 平台 -> 产品读路径怎样变成更稳定、可重复、少人工的标准 rehearsal 线

### 6.2 时间戳策略还没冻结

当前观测里的 `event_ts` 仍可能为 `null`。

因此一期需要明确：

- 是节点补 `event_ts`
- 还是网关按接收时间补齐可接受时间字段
- 或一期先接受 `event_ts=null`，只用平台接收时间跑通 rehearsal

### 6.3 高频消息仍偏胖，但这不是本轮 blocker

当前真机上报里仍包含一些可以后续再瘦身的内容，例如：

- `meta.install_label`
- `meta.legacy_valid_flags`

这会影响长期链路成本，但不应阻塞一期“先把数据进平台”的目标。

## 7. 下一条单一执行线

下一条执行线现在已经可以压成一条：

1. 固定一条真实或回放的现场遥测样本
- 优先直接取现有 `COM9` 真机捕获样本

2. 做一个最薄的 gateway rehearsal
- 输入：串口分片文本流或已捕获文本
- 输出：平台可接受遥测消息

3. 保持三段 acceptance probe 为固定验收项
- ingest acceptance
- API visibility
- Desk/Web visibility
- 当前这三段都已经至少成功留证一次
- 当前可直接复跑的统一入口为：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-hardware-uplink-full-proof.ps1`

4. 生成一份单次 rehearsal 证据包
- 原始样本
- adapter 输出
- 平台探针结果
- 总结结论

## 8. 当前结论

当前最重要的收口结论是：

- 现场节点上行已经不是“老旧扁平 JSON 还没贴平台”的状态
- 当前一期网关应按“薄适配器”来设计
- 当前阶段主 blocker 也不再是命令链，而是：
  - 把已接近标准的现场遥测稳定送进平台
  - 并把这条 rehearsal 线做成可重复、低人工依赖的固定流程

因此，从这份基线开始，当前阶段的主问题不再表述为：

- `real-hardware-contract-adaptation-pending`

而应更准确地表述为：

- `real-field-uplink-platform-closure-pending`

## 9. 相关证据与依赖文档

- [field-uplink-platform-closure.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/memory/tasks/field-uplink-platform-closure.md)
- [hardware-stable-version-gateway-uart-board-proof.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/memory/tasks/hardware-stable-version-gateway-uart-board-proof.md)
- [hardware-stable-version-adaptation-gap.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/hardware-stable-version-adaptation-gap.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [command-entry-stable-route-summary-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/command-entry-stable-route-summary-latest.json)
- [field-hardware-uplink-replay-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-uplink-replay-latest.json)
- [field-hardware-uplink-product-visibility-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-uplink-product-visibility-latest.json)
- [field-hardware-uplink-full-proof-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-uplink-full-proof-latest.json)
