# 存储设计概览（v2：PostgreSQL + ClickHouse）

本文件是存储层的对接契约入口（What/Why），DDL 见本目录下的 `postgres/` 与 `clickhouse/`。

## 设计原则

1. 不写死：新增/删除传感器不依赖频繁改表结构
2. 写路径削峰：设备高频上报先入 Kafka，再由写入服务批量落库
3. 读写分离：查询曲线/聚合走 ClickHouse；规则/告警/权限走 PostgreSQL
4. 可回放：规则版本化，支持按历史遥测回测/重算

## 存储分工

### PostgreSQL（强一致、业务与配置）

- 用户/权限：`users`、`roles`、`permissions`、`user_roles`
- 站点/设备/字典：`stations`、`devices`、`sensors`、`device_sensors`
- 设备影子与命令：`device_state`、`device_commands`
- 规则与告警：`alert_rules`、`alert_rule_versions`、`alert_events`、`alert_notifications`
- 审计与日志：`audit_logs`、`operation_logs`、`api_logs`、`system_configs`

### ClickHouse（遥测时序与聚合）

- `telemetry_raw`：稀疏点位模型（每个 metric 一行），支持高吞吐写入
- 聚合表（规划）：`telemetry_agg_1m`、`telemetry_agg_1h`（长期保留与快查询）

## “不写死”的关键点

- 遥测不在 PostgreSQL 存“宽表 iot_data”；新增指标只需向 `sensors` 字典表插入定义即可。
- `telemetry_raw` 按 `device_id + sensor_key + time` 存储；设备缺传感器时可不上传该 key。
- 设备控制/非数值状态不混入遥测曲线：通过 `device_state`（影子）与 `device_commands`（下发/回执）完成闭环。

## 目录结构

- PostgreSQL DDL：`docs/integrations/storage/postgres/tables/`
- ClickHouse DDL：`docs/integrations/storage/clickhouse/`

建议执行顺序（实现阶段）：

1. PostgreSQL：先执行 `postgres/tables/00-extensions.sql`，再按编号顺序执行其他 DDL
2. ClickHouse：执行 `clickhouse/01-telemetry.sql`，再按需引入聚合表

可选初始化数据：

- PostgreSQL：`postgres/tables/14-seed-data.sql`
