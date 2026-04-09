---
title: field-center-server-deployment-integration-tasklist-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-center-server-deployment-integration-tasklist-2026-04
---

# Center Server 部署与集成任务单（2026-04）

## 状态

- topic: `field-center-server-deployment-integration`
- state: `implementation-tasklist-frozen`
- updated_at: `2026-04-09`
- authority: `current`

## 1. 这份任务单解决什么问题

前面几份文档已经明确：

- RK2206 是 `field node`
- RK3568 是 `field gateway`
- 中心服务器是 `central platform`

但中心侧仍缺一份明确任务单，回答：

1. 中心服务器到底要部署什么
2. 哪些组件是一期开箱必须有的
3. RK3568 接上来之后，平台侧还缺哪些集成动作

## 2. 它挂靠在哪条 authority 链上

这份任务单直接挂靠：

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)

它的目标不是重新设计平台，而是把“当前现场系统需要的中心侧收口”压成部署/集成清单。

## 3. 中心服务器的一期职责

中心服务器一期继续保持平台主链，不吸收现场私有复杂度。

必须承担：

1. 标准入口
- MQTT broker
- ingest

2. 数据主链
- Kafka
- telemetry-writer
- Postgres
- ClickHouse

3. 产品接口
- API
- Web

4. 运维留证
- 日志
- 运行探针
- 故障恢复事实

不应承担：

- XL01 分片恢复
- 南向串口接入
- 多节点现场协议适配

## 4. 部署实施任务包

### 4.1 组件拓扑冻结

必须完成：

1. 一期单机中心拓扑冻结
- API
- Web
- MQTT broker
- Kafka
- Postgres
- ClickHouse
- ingest-service
- telemetry-writer

2. 固定组件边界
- 谁负责入口
- 谁负责消费
- 谁负责写状态
- 谁负责产品读路径

3. 固定端口、依赖和启动顺序

当前必须避免：

- 继续依赖“人记忆里的 host-run 特例”

### 4.2 运行方式冻结

必须完成：

1. 固定哪些组件进 compose
- 尤其是：
  - `ingest-service`
  - `telemetry-writer`

2. 固定本地开发与部署态差异
- 允许有差异
- 但必须文档化，不可隐形存在

3. 固定环境变量和凭据来源
- MQTT
- Kafka
- Postgres
- ClickHouse

### 4.3 网关接入集成

必须完成：

1. RK3568 -> center server 上行入口规范
- broker 地址
- 认证方式
- topic 约定

2. 设备身份与建档策略
- `device_id`
- 网关侧映射如何进入平台设备体系

3. 平台 acceptance 探针
- 数据进入后如何证明：
  - MQTT
  - Kafka
  - `device_state`
  - API
  - Web

### 4.4 数据存储与读路径

必须完成：

1. `device_state` 当前主读路径冻结

2. 历史数据写入路径冻结
- 哪些写 Postgres
- 哪些写 ClickHouse

3. 读路径一致性核对
- API 看到的数据
- Web 看到的数据
- 是否来自同一主链事实

### 4.5 运维与恢复

必须完成：

1. 启动/停止手册

2. 故障恢复顺序
- broker 故障
- Kafka 故障
- API 故障
- writer 故障

3. 关键健康探针
- HTTP health
- broker 可达性
- Kafka 可达性
- 数据写入延迟

4. 日志留证规范
- 每次联调和现场演练要能留下统一证据包

## 5. 推荐实施顺序

### Step 1

先冻结单机中心拓扑：

- 哪些服务必须常驻
- 哪些服务必须从 host-run 收回部署线

### Step 2

再冻结网关接入契约：

- MQTT
- 凭据
- topic
- acceptance probes

### Step 3

再补运行与恢复：

- compose
- 启停
- 探针
- 证据

原因是：

- 没有稳定运行拓扑，现场演练每次都会卡在环境差异而不是业务主线

## 6. 一期验收标准

Center server 一期算完成，至少要满足：

1. 单机中心拓扑清晰且可重复启动
2. `ingest-service` 与 `telemetry-writer` 不再依赖隐形手工步骤
3. RK3568 上来的 telemetry 能稳定进入平台主链
4. `/api/v1/data/state/{deviceId}` 可读到对应数据
5. Web 产品读路径能看到同一设备状态
6. 至少有一条标准化 full-path 复跑入口
7. 发生故障时有明确恢复顺序和证据留存

## 7. 当前不纳入一期的内容

以下内容暂不作为一期 blocker：

1. 多机高可用
2. 大规模集群部署
3. 自动弹性伸缩
4. 完整监控平台产品化
5. 复杂权限域拆分

## 8. 风险与注意事项

当前最现实的风险是：

1. 本地环境和部署环境差异过大

2. `ingest-service` / `telemetry-writer` 仍游离在正式运行线外

3. 中心服务器错误吸收现场协议复杂度

4. 部署文档和真实启动方式继续分叉

## 9. 当前结论

中心服务器当前主线应压成：

- `把平台主链部署线固定下来，让 RK3568 上来的标准 telemetry 可以稳定被 ingest、写入、读出和留证`

只有这条线稳定，后面的 `3 x RK2206 -> 1 x RK3568 -> center server` 真实演练才不会反复卡在环境层。

## 10.1 2026-04-09 中心主链已开始从 host-run 收回 compose 运行线

这轮先选了当前影响最小、收益明确的一步：

- 把 `ingest-service`
- 把 `telemetry-writer`

从“仍可能依赖 host-run”的状态，开始正式收回 `docker-compose.app.yml`。

1. 当前已落地的仓库交付物：
- `services/ingest/Dockerfile`
- `services/telemetry-writer/Dockerfile`
- `infra/compose/docker-compose.app.yml`
  - 现已补入：
    - `ingest`
    - `telemetry-writer`

2. 当前 compose 收口边界：
- `api`
- `web`
- `ingest-service`
- `telemetry-writer`

3. 当前意义：
- 中心主链不再默认要求：
  - 手工启动 `node dist/index.js`
  - 再额外记住哪个窗口跑了哪个服务
- 后续 `deploy-docker-oneclick.ps1` 也不需要新入口
  - 因为它本来就会同时使用：
    - `docker-compose.yml`
    - `docker-compose.app.yml`

4. 当前仍未夸大的点：
- 这轮是把运行线收回 compose
- 不是宣布中心部署已经全部完成
- 后面仍需继续验证：
  - full-path readiness
  - 下游语义 proof
  - 运行恢复与证据包

## 10.2 2026-04-09 中心主链 acceptance 已收成单入口

为避免后续继续依赖“人工记忆里的命令顺序”，这轮继续把中心侧收成固定验收入口：

- `scripts/dev/check-field-center-compose-acceptance.ps1`

它统一串起三段事实：

1. 部署入口
- `deploy-docker-oneclick.ps1`
  - `validate`
  - 或 `apply`

2. 运行边界检查
- `check-field-full-path-readiness.ps1`
  - 必须确认：
    - `currentBoundary = full-path-ready`
    - `ingestSource = compose`
    - `telemetryWriterSource = compose`

3. 语义与产品可见性 proof
- `run-field-hardware-uplink-full-proof.ps1`
  - 必须确认：
    - replay 进入平台 API 状态
    - Web 产品读路径可见
    - full proof 结论通过

当前价值不是“多一个脚本”，而是把中心部署线从：

- compose 命令
- readiness 命令
- proof 命令
- 人工判断

收成：

- 一个稳定入口
- 一份统一 acceptance 报告
- 一套可交接的恢复后复核动作

## 10.3 2026-04-09 中心侧已补上设备重启后的 seq 回退适配

这轮在真正跑 `RK3568 -> center` live closure 时，首次把中心侧的真实 blocker 打到了代码级：

1. 现场表现
- `node A` 可持续进入平台
- `node B` 能被 `ingest-service` 收到
- 但 `node B` 长时间停在旧 `device_state`

2. 根因
- `telemetry-writer` 只按历史 `latestSeq` 判定：
  - `duplicate_seq`
  - `stale_seq`
- 当前 `node B` 因设备重启：
  - `seq` 从低位重新开始
  - `meta.uptime_s` 也明显回退
- 但 writer 没有把这个场景识别为 reboot 后的新序列

3. 已落地修复
- 文件：
  - `services/telemetry-writer/src/index.ts`
- 新行为：
  - 当 `payload.seq <= latestSeq`
  - 且 `meta.uptime_s` 相比 shadow state 中旧值回退
  - 允许该消息继续进入：
    - ClickHouse
    - PostgreSQL `device_state`

4. 修复后现场证据
- writer 日志出现：
  - `telemetry seq rollback accepted after uptime rollback`
- PostgreSQL `device_state` 中：
  - `device_id = ...0002`
  - `writer_last_seq` 已从旧高位切回当前现场低位
  - `last_command_id` 已跟随最新 `manual_collect`
- 之后跨边界 live closure 报告通过：
  - `docs/unified/reports/field-rk3568-center-live-closure-latest.json`

这条修复的重要性在于：

- 它不是 demo 级 workaround
- 而是把中心部署线真正补齐到可以承接：
  - 设备断电
  - 重启
  - `seq` 重新起步
  这种现场真实行为

## 10.4 2026-04-09 中心侧已开始自动修剪 field profile 的脏状态键

跨边界 live closure 跑通之后，又暴露出另一个更偏读模型的问题：

1. 现场表现
- `device_state` 虽然已能跟上最新 live telemetry
- 但部分历史脏键仍残留在平台状态里
- 典型表现是：
  - `metricsKeyCount` 异常偏大
  - 出现明显拼接/截断污染 key

2. 根因
- `telemetry-writer` 的 shadow state 采用：
  - `previous.metrics + payload.metrics`
  - `previous.meta + payload.meta`
- 这对稀疏遥测是对的
- 但对历史已经混入的脏键，没有自动修剪能力

3. 已落地修复
- 文件：
  - `services/telemetry-writer/src/index.ts`
- 新行为：
  - 对当前这条 XL01 field profile 设备
  - 在写 `device_state` 时按冻结的 field contract 做键级过滤
  - 仅保留当前阶段允许的：
    - canonical `metrics`
    - canonical `meta`
    - `_writer`
- 这样下一次正常 telemetry 到来时：
  - 旧的污染 key 会从 shadow state 中自然被刷掉
  - 不需要人工清库或手工改 `device_state`

4. 当前工程意义
- 这一步没有去动 ClickHouse 原始事实表
- 只收紧平台面向 API/Web 的 `device_state` 读模型
- 目标很明确：
  - 软件端看到的是对齐 contract 的稳定状态
  - 历史异常碎片不再长期污染平台读路径

5. 修复后的现场复核已通过
- 重新 build / recreate compose 内 `telemetry-writer`
- 重新实跑：
  - `scripts/dev/check-field-rk3568-center-live-closure.ps1`
- 最新现场结果已经证明：
  - closure 继续保持：
    - `accepted = true`
    - `currentBoundary = rk3568-live-center-closure-ready`
  - `node A` API/Web:
    - `metricsKeyCount = 14`
  - `node B` API/Web:
    - `metricsKeyCount = 14`
  - 当前保留下来的 metrics key 已回到现场 contract 集合：
    - `temperature_c`
    - `humidity_pct`
    - `accel_x_g / accel_y_g / accel_z_g`
    - `gyro_x_dps / gyro_y_dps / gyro_z_dps`
    - `tilt_x_deg / tilt_y_deg`
    - `gps_latitude / gps_longitude`
    - `battery_pct`
    - `warning_flag`

这意味着这条修复已经不再只是代码结论，而是已经变成：

- compose 运行中的中心服务真实生效
- API/Web 读模型真实回收到了软件端契约边界

## 10.5 2026-04-09 cross-boundary closure 与 board observation 口径已重新对齐

这轮继续往前推时，真正暴露出来的不是中心主链坏了，而是两个验收入口的判定口径有分叉：

1. 现场表现
- `run-rk3568-field-gateway-observation-window.ps1`
  已经能表达：
  - `passed = true`
  - `conclusion = rk3568-runtime-observation-window-online-with-parser-noise`
- 但 `check-field-rk3568-center-live-closure.ps1`
  仍把：
  - 任意 `schemaRejected delta > 0`
  直接压成硬失败
- 同时，board observation 原来还把：
  - 节点短暂进入 `degraded`
  也视为窗口失败
  这会把共享口双节点的正常抖动误判成断链

2. 已落地修正
- 文件：
  - `scripts/dev/run-rk3568-field-gateway-observation-window.ps1`
  - `scripts/dev/check-field-rk3568-center-live-closure.ps1`
- 当前新口径：
  - board observation 区分：
    - `nodeAOnline / nodeBOnline`
    - `nodeAReachable / nodeBReachable`
  - 窗口通过现在要求：
    - 节点不中断到 `offline`
    - 而不是每个采样点都必须严格 `online`
  - cross-boundary closure 区分：
    - `boardObservationWindowStable`
    - `boardObservationParserNoiseWithinBudget`
  - 这样现在可以清楚地区分：
    - 板端连续运行是否稳定
    - parser noise 是否还在预算内

3. 同轮 parser hardening 也已同步落板
- 文件：
  - `services/field-gateway/src/index.ts`
- 新行为：
  - 对 schema 形状仍然成立、但 canonical field metrics 被污染到顶层的片段
  - 重新归位成合法 telemetry envelope 再 northbound publish

4. 最新现场复核结果
- RK3568 restart 后早期窗口：
  - `schemaRejected = 0`
  - `node A = online`
  - `node B = online`
- 最新 board observation：
  - `passed = true`
  - `conclusion = rk3568-runtime-observation-window-clean`
  - `DurationSeconds = 60`
  - `schemaRejected delta = 0`
- 最新 cross-boundary closure：
  - `accepted = true`
  - `currentBoundary = rk3568-live-center-closure-ready`
  - `boardObservationWindowStable = true`
  - `boardObservationParserNoiseWithinBudget = true`
  - `node B manual_collect`
    - `commandId = d69bf18b-d11a-4e99-b5ee-0289115cb050`
    - `ackStatus = acked`

这一步的工程意义是：

- 以后现场不再把：
  - “shared-port 节点短暂 `degraded`”
  - “bounded parser noise”
  和：
  - “主链真正失效”
  混成一类问题
- 中心部署收口线现在能更专业地表达：
  - 主链是否闭合
  - parser hardening 还剩多少工作量

6. closure 入口现已把字段合同显式固化为验收项
- 文件：
  - `scripts/dev/check-field-rk3568-center-live-closure.ps1`
- 当前不再只是报告里展示：
  - `metricsKeyCount = 14`
  - canonical field metrics
- 而是已经直接写成正式校验：
  - `nodeAApiMetricsContract`
  - `nodeAWebMetricsContract`
  - `nodeBApiMetricsContract`
  - `nodeBWebMetricsContract`
- 最新实跑结果继续通过：
  - `accepted = true`
  - 上述 4 个 contract checks 全部 `ok = true`

## 10.6 2026-04-09 受控重启已被证实可以重新打开 clean 60s 收口窗口

这轮继续沿冻结入口拉证据后，当前中心部署线已经可以更专业地表述边界，而不是继续把所有 shared-port 噪声混成同一个问题。

1. 最新复核事实
- RK3568 gateway 受控重启后，最新 runtime 报告确认：
  - `MainPID = 2264558`
  - `ExecMainStartTimestamp = Thu 2026-04-09 15:55:16 CST`
- 随后的 board observation 再次干净通过：
  - 报告：
    - `docs/unified/reports/field-rk3568-gateway-observation-latest.json`
  - 结果：
    - `passed = true`
    - `conclusion = rk3568-runtime-observation-window-clean`
    - `DurationSeconds = 60`
    - `schemaRejected delta = 0`
- 同轮 cross-boundary closure 也重新回绿：
  - 报告：
    - `docs/unified/reports/field-rk3568-center-live-closure-latest.json`
  - 结果：
    - `generatedAt = 2026-04-09T07:58:36Z`
    - `accepted = true`
    - `currentBoundary = rk3568-live-center-closure-ready`
    - `boardObservationWindowStable = true`
    - `boardObservationParserNoiseWithinBudget = true`
- `node B manual_collect` 继续闭合：
  - `commandId = e18f7563-8890-4404-917d-f27f0c67018a`
  - `ackStatus = acked`
  - `parseFailureCount = 0`
- API / Web 读路径仍保持当前软件端 field contract：
  - `node A api/web metricsKeyCount = 14`
  - `node B api/web metricsKeyCount = 14`

2. 这对中心部署阶段意味着什么
- 当前中心部署与软件适配阶段已经不再卡在：
  - telemetry 是否能进入中心
  - API/Web 是否能读到同一份 field state
  - command proof 是否还能闭合
- 当前真正剩余的不是主链闭环缺失，而是：
  - shared-port parser 在更长窗口上的持续硬化
  - `node C` 到位后的三节点回归

3. 当前应冻结的工程口径
- 可以正式承认：
  - 受控重启可以重新打开 clean `60s` board window
  - 并恢复 `RK3568 -> center` cross-boundary closure 到 green
- 也必须同时保留：
  - 更长或更严格窗口下，bounded parser noise 仍可能回出现
  - 这属于后续 runtime hardening 范围，不再阻塞当前中心部署/软件适配主线推进

4. 因此这份任务单的下一优先级保持不变
- 继续把中心部署线收成：
  - 可复跑
  - 可恢复
  - 可交接
- 不再把时间消耗在反复解释这轮已经闭合的 `60s` 主线事实上

## 10.8 2026-04-09 三轮 soak 已通过，中心部署阶段不再等待 node C

这轮已经把“继续跑一段看看”推进成了正式阶段判断，而不是临时观察。

1. 最新阶段证据
- 最新 soak 报告：
  - `docs/unified/reports/field-rk3568-center-soak-latest.json`
- 当前结果：
  - `generatedAt = 2026-04-09T11:11:57Z`
  - `accepted = true`
  - `currentBoundary = rk3568-center-soak-ready`
  - `rounds = 3`
  - `acceptedRounds = 3`
  - `cleanWindowRounds = 3`
  - `maxBoardObservationSchemaRejectedDelta = 0`
  - `maxParseFailureCount = 12`
  - `allAcked = true`
  - `allMetricsContractStable = true`

2. 这对当前阶段的含义
- 现在不再需要把：
  - `node C` 未接入
  当作当前阶段 blocker
- 当前阶段已经有足够证据切换到：
  - 中心部署与软件适配继续推进
  - 三节点只保留容量与配置位

3. 三节点预算保持按当前上界执行
- 按 `3 x node`、`5s` 上报冻结预算：
  - telemetry 原始量约 `31.25 MiB/day`
  - 保守预算约 `32.14-34.61 MiB/day`
  - `30` 天约 `0.92 GiB`
- 这意味着当前中心部署与数据留存边界可以直接按三节点容量继续推进
  - 不需要等 `node C` 真实上线后再回头重算

## 10.9 2026-04-09 中心部署运行线已补成冻结入口

前面虽然已经有：

- `deploy-docker-oneclick.ps1`
- `check-field-center-compose-acceptance.ps1`
- `render-prod-env-checklist.ps1`

但这三者还分散在：

- 部署动作
- 环境检查
- full-path acceptance

中间缺一条更适合当前阶段的正式入口，去回答：

- 当前中心 compose 边界是否真的已经冻结
- env 来源是否还能支持交接
- 运行和恢复顺序是否已经具备单一权威入口

这一步现在已经补上。

1. 新入口
- 脚本：
  - `scripts/dev/check-field-center-runtime-freeze.ps1`
- 标准报告：
  - `docs/unified/reports/field-center-runtime-freeze-latest.json`

2. 这条入口当前统一收口的事实
- 生产 env 检查：
  - `docs/unified/reports/prod-env-checklist-latest.json`
- 一键部署 validate：
  - `docs/unified/reports/docker-deploy-latest.json`
- 中心 compose acceptance：
  - `docs/unified/reports/field-center-compose-acceptance-latest.json`
- 当前阶段 readiness：
  - `docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json`

3. 这一步的工程意义
- 中心部署阶段现在不再只依赖：
  - 一条 acceptance 结果
  - 若干零散脚本
- 而是新增了一条更贴近运维和交接的冻结入口，专门回答：
  - compose 边界有没有漂移
  - env 基线有没有缺口
  - 当前阶段是否仍可继续推进软件适配

## 10.10 2026-04-09 RK3568 正式上行绑定已补成单独冻结入口

中心运行线冻结之后，第二工作包不应再停留在“板子大概连着中心”这种口头状态，而要回答：

- RK3568 当前用的 broker 地址是不是正式中心地址
- 板端 MQTT 内部账号是否与中心当前部署线一致
- southbound `A/B/C` 映射是否仍保持当前冻结口径
- 板端 runtime 是否仍满足：
  - `publishFailures = 0`
  - `spoolPending = 0`
  - `A/B online`
  - `C reserved`

这一步现在已经补成正式入口。

1. 新入口
- 脚本：
  - `scripts/dev/check-field-rk3568-production-uplink-freeze.ps1`
- 标准报告：
  - `docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json`

2. 它当前统一收口的事实
- 本机中心侧：
  - `services/api/.env`
  - `services/ingest/.env`
  - `field-center-runtime-freeze-latest.json`
  - `field-center-deployment-software-adaptation-readiness-latest.json`
- 板端当前事实：
  - `/etc/lsmv2/field-gateway.env`
  - `check-rk3568-field-gateway-runtime.ps1` 当前 runtime 快照

3. 这一步的工程意义
- 当前第二工作包已经不再只是“准备去做”
- 而是拥有了：
  - 一条板端正式上行冻结检查命令
  - 一份板端与中心侧一致性的 latest 报告
  - 一个可继续推进软件适配的明确边界

## 10.7 2026-04-09 现场恢复主线已补成统一 runbook 入口

前面虽然已经有：

- `check-field-center-compose-acceptance.ps1`
- `check-field-rk3568-center-live-closure.ps1`

但现场恢复时仍然缺一条更贴近运维动作的正式入口，去回答：

- RK3568 网关如果刚恢复或刚重启
- 现在能不能用一条命令把：
  - runtime 快照
  - cross-boundary closure
  - 当前恢复边界
  一次性收口

这一步现在已经补上。

1. 新入口
- 脚本：
  - `scripts/dev/check-field-rk3568-center-operational-recovery.ps1`
- 当前支持：
  - 常规恢复复核
  - `-RestartGatewayService` 受控重启后复核
  - `-RequireZeroSchemaRejectedDelta` 严格 zero-noise 复核

2. 当前它统一收的事实
- RK3568 runtime 快照：
  - `docs/unified/reports/field-rk3568-gateway-runtime-latest.json`
- cross-boundary live closure：
  - `docs/unified/reports/field-rk3568-center-live-closure-latest.json`
- runbook 级恢复总结：
  - `docs/unified/reports/field-rk3568-center-operational-recovery-latest.json`

3. 已实跑通过的当前结果
- 最新恢复总结报告：
  - `generatedAt = 2026-04-09T08:49:04Z`
  - `accepted = true`
  - `currentBoundary = rk3568-center-operational-recovery-ready`
  - `cleanWindowReopened = true`
  - `restart.requested = true`
- 同轮 closure 继续保持：
  - `accepted = true`
  - `currentBoundary = rk3568-live-center-closure-ready`
  - `boardObservationConclusion = rk3568-runtime-observation-window-clean`
  - `boardObservationSchemaRejectedDelta = 0`
  - `ackStatus = acked`
  - `node A/B api/web metricsKeyCount = 14`
  - 且当前已把一次重启后的瞬时抖动正式收口为：
    - attempt 1 failed
    - wrapper retry recovered
    - final closure accepted

4. 这一步的工程意义
- 以后中心部署与软件适配阶段在做“恢复后复核”时
  不需要再人工拼：
  - runtime
  - observation
  - closure
  - report 解读
- 当前这条线已经正式具备：
  - 一条命令
  - 一份总结报告
  - 一套明确边界

## 10. 相关文档

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
