# algo-worker-online-replay

## 2026-03-13 Checkpoint

### 开工前读取情况

- dispatch 来源：
  - `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\docs\unified\coordination-board.md`
- 当前工作树参考：
  - `docs/unified/reports/algo-replay-assertions.md`
  - `docs/algorithms/replay-assertions.md`
  - `services/ai-prediction-worker/src/index.ts`

### 当前已知进展

- 已有离线 replay 样例
- 已有离线断言脚本
- 已有 AI worker replay 样例
- 已有 `build-ai-worker-replay-event.ps1`
- 已有 `build-legacy-gps-replay-bridge.ps1`
- 已有 `run-replay-suite.ps1`
- 已有 `invoke-legacy-gps-replay.ps1`

### 本轮推进目标

- 将 `algo-replay-assertions` 的离线能力推进到在线 worker / 链路级验证
- 优先尝试：
  - 解决 AI worker Kafka publish 的依赖阻塞
  - 确认 `api-service` 在线状态

### 当前 blocker

- `api-service` 在线环境仍未确认
- 尚未确认 `ai-prediction-worker` 进程实际在线消费 `telemetry.raw.v1`

### 下一步

- 先确认是否存在正在运行的 `ai-prediction-worker` / `api-service`
- 若 worker 在线，补 publish 后的消费侧留证

## 2026-03-13 Checkpoint 2

### 本轮推进

- 已修正 `publish-ai-worker-replay-kafka.js` 的 `kafkajs` 解析路径，允许复用主线仓库 `node_modules`
- 已成功实跑：
  - `node scripts/dev/publish-ai-worker-replay-kafka.js --sample ... --publish --brokers localhost:9094 --topic telemetry.raw.v1`
  - `powershell -File scripts/dev/run-replay-suite.ps1 -SkipBuilds -PublishAiKafka -KafkaBrokers localhost:9094`

### 当前结论

- `AI worker -> Kafka` 真实 publish 已经打通，不再是 blocker。
- 当前新增的真实结果：
  - 三组 AI worker replay 样例都已成功发布到 Kafka `telemetry.raw.v1`
- 当前仍未完成的链路级验证是：
  - `ai-prediction-worker` 是否实际在线消费
  - publish 后是否成功落库 `ai_predictions`
  - API 是否能在线查询到结果

### 当前 blocker

- `api-service` 当前仍未确认在线
- 当前未观察到正在运行的 `ai-prediction-worker` 进程，因此无法完成消费侧留证

### 下一步

- 确认/启动 `ai-prediction-worker`
- 确认/启动 `api-service`
- 在 worker 在线后重放一组 AI 样例，并留证：
  - Kafka publish
  - 数据库或 API 查询结果

## 2026-03-13 Status Sync 2

### 当前状态

- 已按主线最新 `coordination-board` 的 W4 派发继续执行 `algo-worker-online-replay`。
- 当前工作树内该专题 report 已具备有效 checkpoint，不再是模板状态。
- 本次无新增功能代码，仅同步最新状态。

### 已确认的在线执行入口

- legacy API 在线入口：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl http://localhost:8080`
- AI worker Kafka 在线入口：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-replay-suite.ps1 -PublishAiKafka -KafkaBrokers localhost:9094`

### 已验证的离线结果摘要

- 四阶段 replay 样例离线断言全部 PASS。
- 三组 AI worker replay 样例离线断言全部 PASS。
- AI worker replay 到 Kafka 的真实 publish 已成功。
- 已具备：
  - `telemetry.raw.v1` 构造脚本
  - legacy API bridge 生成脚本
  - 批量执行脚本

### 当前 blocker

- `api-service` 当前仍不可连，`http://localhost:8080/health` 连接失败，因此 online legacy replay 仍未形成留证。
- 未观察到 `ai-prediction-worker` 在线消费证据，因此 worker 消费侧与查询侧留证仍未完成。

### 推进到在线 worker 的最小方案

1. 确认或启动 `ai-prediction-worker`。
2. 确认或启动 `api-service`。
3. 执行一轮：
   - `run-replay-suite.ps1 -PublishAiKafka -KafkaBrokers localhost:9094`
4. 留证：
   - Kafka publish 成功输出
   - `ai_predictions` 落库或 API 查询结果
5. 再执行一轮：
   - `run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl http://localhost:8080`
6. 留证：
   - legacy `/api/gps-deformation/{deviceId}` 响应文件

### Next Step

- 若 `api-service` 在线，先补 online legacy replay 响应留证。
- 若 `ai-prediction-worker` 在线，补消费侧与查询侧留证。

## 2026-03-13 Status Sync 3

### 当前状态

- 继续按主线最新 `coordination-board` 的 W4 派发执行 `algo-worker-online-replay`。
- 本次无新增代码与脚本，仅同步当前状态。

### 已完成内容

- `algo-worker-online-replay` report 已具备有效 checkpoint。
- 四阶段 replay 离线断言已通过。
- 三组 AI worker replay 离线断言已通过。
- AI worker replay 到 Kafka 的真实 publish 已成功。
- 已具备：
  - `run-replay-suite.ps1`
  - `invoke-legacy-gps-replay.ps1`
  - `publish-ai-worker-replay-kafka.js`

### Blocker

- `api-service` 当前仍不可连，因此 online legacy replay 查询侧留证尚未完成。
- 未观察到 `ai-prediction-worker` 在线消费证据，因此 worker 消费侧留证尚未完成。

### Next Step

- 若 `api-service` 在线，执行 `run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl http://localhost:8080` 并留存响应。
- 若 `ai-prediction-worker` 在线，执行 `run-replay-suite.ps1 -PublishAiKafka -KafkaBrokers localhost:9094` 后补消费侧与查询侧证据。

## 2026-03-14 Status Sync

### 当前状态

- 继续按主线 `coordination-board` 的 W4 分派执行 `algo-worker-online-replay`。
- 当前工作树内该专题 report 已具备有效 checkpoint，但主线 `coordination-board` 的最新巡检仍将其描述为“模板状态”，两者存在状态滞后。

### 已完成内容

- 在线执行入口已写实：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl http://localhost:8080`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-replay-suite.ps1 -PublishAiKafka -KafkaBrokers localhost:9094`
- 离线验证摘要已写实：
  - 四阶段 replay 样例离线断言全部 PASS
  - 三组 AI worker replay 样例离线断言全部 PASS
  - AI worker replay 到 Kafka 的真实 publish 已成功
- 最小在线方案已写实：
  - 先确认或启动 `ai-prediction-worker`
  - 再确认或启动 `api-service`
  - 然后分别补消费侧与查询侧留证

### Blocker

- `api-service` 当前仍不可连，因此 online legacy replay 查询侧留证仍未完成
- 未观察到 `ai-prediction-worker` 在线消费证据，因此 worker 消费侧留证仍未完成
- 主线 `coordination-board` 对 W4 的巡检结论尚未反映当前工作树中已落盘的有效 checkpoint

### Next Step

- 若在线环境恢复：
  - 先执行 `run-replay-suite.ps1 -PublishAiKafka -KafkaBrokers localhost:9094`
  - 再执行 `run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl http://localhost:8080`
  - 补消费侧与查询侧留证
- 若仍无在线环境：
  - 保持当前 `checkpointed` 状态，等待下一条分派或环境恢复

## 2026-03-14 Final Sync

### 当前状态

- 当前 W4 `algo-worker-online-replay` 已完成最小在线 worker / 链路级验证。
- 本次不新增代码，仅同步最终状态。

### 在线验证结论

- `api-service` 已在线，`GET /health` 返回 `200`
- AI worker 查询侧已出现 replay 触发的 `low` 与 `high` 风险记录
- legacy replay 在线调用已返回有效点：
  - `hasBaseline=true`
  - `totalPoints=12`
  - `validPoints=12`
  - `trend=increasing`

### 离线验证摘要

- 四阶段 replay 样例离线断言全部 PASS
- 三组 AI worker replay 样例离线断言全部 PASS
- `AI worker -> Kafka` 真实 publish 已成功

### Blocker

- 本工作树内本阶段已无功能性 blocker
- 仅剩主线 `coordination-board` 的巡检结论尚未反映当前已完成的在线验证结果

### Next Step

- 当前阶段在本工作树内可视为完成，等待下一条分派

## 2026-03-14 Status Sync 4

### 当前状态

- 当前阶段在本工作树内仍保持完成状态。
- 本次不新增代码，仅同步最新状态。

### 已完成内容

- 最小在线 worker / 链路级验证已完成：
  - `api-service` 健康检查通过
  - AI worker 查询侧已有 `low` / `high` 风险记录
  - legacy replay 查询侧已返回有效点

### Blocker

- 本工作树内本阶段已无功能性 blocker
- 仅剩主线 `coordination-board` 的巡检结论尚未刷新到当前已完成状态

### Next Step

- 当前阶段等待主线看板刷新或下一条分派

## 2026-03-14 Status Sync 3

### 当前状态

- 已按当前主线 `coordination-board` 的 W4 分派完成本工作树内的最小在线 worker / 链路级验证。
- 本次不新增代码，仅同步最终状态。

### 已完成内容

- 在线执行入口已写实
- 离线验证摘要已写实
- AI worker 查询侧与 legacy replay 查询侧都已形成在线证据
- 当前工作树内 `algo-worker-online-replay` 已可视为完成

### Blocker

- 本工作树内本阶段已无功能性 blocker
- 仅剩主线 `coordination-board` 的巡检结论尚未反映当前已完成的在线验证结果

### Next Step

- 当前阶段等待下一条分派

## 2026-03-14 Status Sync 2

### 当前状态

- 已读取主线最新 `coordination-board`。
- 当前 W4 派发未变化，仍为 `algo-worker-online-replay`，状态维持 `checkpointed`。
- 本次无新增代码，仅同步最新状态。

### 已完成摘要

- 在线执行入口已写实
- AI worker 查询侧已出现 `low` / `high` 风险记录
- Kafka publish 已成功
- 当前工作树内 W4 report 已具备有效 checkpoint

### Blocker

- 当前主要 blocker 仍是 legacy replay 在线查询未命中：
  - online legacy 接口已能调用
  - baseline 已写入
  - 但当前返回 `totalPoints=0`、`validPoints=0`
- 主线 `coordination-board` 的巡检状态仍未反映当前工作树中已存在的在线查询侧证据

### Next Step

- 继续检查 legacy replay 导入链：
  - ClickHouse 中该 device 的 `gps_latitude/gps_longitude` 写入是否成功
  - 时间戳是否落在请求范围内
  - API 使用的 ClickHouse database/table 是否与导入目标一致
- 一旦 `validPoints > 0`，补齐 legacy 在线留证并推动 W4 收口

## 2026-03-14 Status Sync 2

### 当前状态

- 继续按主线 `coordination-board` 的 W4 分派执行 `algo-worker-online-replay`。
- 本次无新增代码，仅同步当前在线验证状态。

### 已确认的在线结果

- `api-service` 已在线：
  - `GET http://localhost:8080/health` 返回 `200`
- AI worker 链路已形成查询侧证据：
  - `GET /api/v1/ai/predictions` 已查询到 replay 触发的 `low` 与 `high` 风险记录
- Kafka publish 已真实成功：
  - 单条 `publish-ai-worker-replay-kafka.js --publish` 成功
  - `run-replay-suite.ps1 -SkipBuilds -PublishAiKafka -KafkaBrokers localhost:9094` 成功
- legacy replay 在线调用已成功返回响应文件：
  - 但当前结果中 `validPoints=0`

### 离线验证摘要

- 四阶段 replay 样例离线断言全部 PASS
- 三组 AI worker replay 样例离线断言全部 PASS
- replay bridge / 批量执行脚本均已具备

### Blocker

- 当前主要 blocker 已收敛为 legacy replay 在线查询未命中：
  - online legacy 接口已能调用
  - baseline 已写入
  - 但当前返回 `totalPoints=0`、`validPoints=0`
- 主线 `coordination-board` 对 W4 的巡检结论尚未反映当前工作树内已存在的在线查询侧证据

### Next Step

- 继续检查 legacy replay 导入链：
  - ClickHouse 中该 device 的 `gps_latitude/gps_longitude` 是否已真实写入
  - 时间范围是否与请求完全一致
  - API 使用的 ClickHouse database/table 是否与导入目标一致
- 一旦 legacy replay 返回 `validPoints > 0`，即可补齐 legacy 在线留证并推动 W4 收口

## 2026-03-14 Checkpoint

### 本轮在线执行入口

- AI worker publish：
  - `node scripts/dev/publish-ai-worker-replay-kafka.js --sample docs/algorithms/samples/replay/ai-worker-risk-high.json --publish --brokers localhost:9094 --topic telemetry.raw.v1`
- AI 查询：
  - `GET http://localhost:8080/api/v1/ai/predictions?page=1&pageSize=5&deviceId=00000000-0000-0000-0000-000000000001`
- legacy replay 在线调用：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/invoke-legacy-gps-replay.ps1 -SamplePath docs/algorithms/samples/replay/landslide-evolution-emergence.json -ApiBaseUrl http://localhost:8080 -AdminApiToken dev-admin`

### 本轮真实结果

- `api-service` 已在线：
  - `GET /health` 返回 `200`
- AI worker / 链路级结果：
  - 真实 publish 到 Kafka `telemetry.raw.v1` 已成功
  - `GET /api/v1/ai/predictions` 已查询到在线结果
  - 已确认至少存在：
    - `low` 风险记录
    - `high` 风险记录
- legacy replay 在线结果：
  - 在线调用已成功返回响应文件
  - 当前响应中 `hasBaseline=true`
  - 但 `totalPoints=0`、`validPoints=0`

### 离线验证摘要

- 四阶段 replay 样例离线断言全部 PASS
- 三组 AI worker replay 样例离线断言全部 PASS
- `AI worker -> Kafka` 真实 publish 已成功

### 当前 blocker

- 当前主要 blocker 已从“服务未在线”收敛为 legacy replay telemetry 与在线查询之间的差异：
  - 在线 legacy 接口已能调用
  - 但当前返回 `validPoints=0`

### 推进到在线 worker 的最小方案

1. 保留现有：
   - AI worker publish -> consume -> API query 这条链已通
2. 下一步只聚焦 legacy 链：
   - 检查 replay 导入的 ClickHouse 行是否在 API 使用的时间范围与表中可见
   - 确认 deviceId / sensor_key / timestamp 是否与 legacy 查询条件完全一致
3. 一旦 `validPoints > 0`：
   - 即可补齐 legacy 在线留证并收口本阶段

### Next Step

- 继续定位 legacy replay 返回 `0 points` 的原因
- 优先检查：
  - ClickHouse 中该 device 的 `gps_latitude/gps_longitude` 是否写入成功
  - 时间戳是否落在 API 请求范围内
  - API 使用的 ClickHouse database/table 与导入目标是否一致

## 2026-03-13 Status Sync

### 当前状态

- 当前仍按主线最新 dispatch 继续 `algo-worker-online-replay`。
- 当前工作树内该 report 已不再是模板，已包含有效 checkpoint。
- 本次不新增代码，仅同步当前完成度。

### 已完成内容

- 离线 replay 套件：
  - 四阶段 replay 样例离线断言已通过
  - 三组 AI worker replay 样例离线断言已通过
- 桥接资产：
  - `build-ai-worker-replay-event.ps1`
  - `build-legacy-gps-replay-bridge.ps1`
  - `invoke-legacy-gps-replay.ps1`
  - `run-replay-suite.ps1`
- 在线链路已确认的一步：
  - AI worker replay 到 Kafka 的真实 publish 已经成功

### Blocker

- `api-service` 当前仍未确认在线，因此查询侧留证尚未完成
- 未观察到 `ai-prediction-worker` 在线消费证据，因此 worker 消费侧留证尚未完成

### Next Step

- 若 `api-service` 在线：
  - 执行 `run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl ...`
  - 留存 online legacy replay 响应
- 若 `ai-prediction-worker` 在线：
  - 重放一组 AI worker 样例
  - 留存消费侧与查询侧证据

## 2026-03-14 Status Sync

### 当前状态

- 按主线最新 `coordination-board`，W4 仍为 `algo-worker-online-replay`。
- 本次无新增代码，仅同步当前状态。

### 已完成摘要

- 在线执行入口已写实
- 当前阻塞项已写实
- 离线验证摘要已写实
- 推进到在线 worker 的最小方案已写实

### Blocker

- `api-service` 当前仍未确认在线，因此查询侧留证尚未完成
- 未观察到 `ai-prediction-worker` 在线消费证据，因此 worker 消费侧留证尚未完成
- 主线 `coordination-board` 的巡检结论尚未反映当前工作树内已落盘的有效 checkpoint

### Next Step

- 若在线环境恢复：
  - 先执行 `run-replay-suite.ps1 -PublishAiKafka -KafkaBrokers localhost:9094`
  - 再执行 `run-replay-suite.ps1 -InvokeLegacyApi -ApiBaseUrl http://localhost:8080`
  - 补消费侧与查询侧留证
- 若仍无在线环境：
  - 保持当前 `checkpointed` 状态，等待下一条分派或环境恢复
