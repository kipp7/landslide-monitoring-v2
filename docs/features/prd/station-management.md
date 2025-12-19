# PRD：站点管理（Stations）

## 1. 背景

站点是“边坡/监测点位”的业务实体。现有实现存在“站点信息硬编码/直接查库”的问题，v2 需要把站点作为元数据中心的一部分，供设备绑定、规则范围（station scope）、仪表盘聚合使用。

## 2. 目标

- 支持站点 CRUD、状态管理（active/inactive/maintenance）。
- 支持站点与设备绑定关系管理（一个站点多个设备）。
- 前端不硬编码站点坐标/名称，全部通过 API 获取。

## 3. 功能需求

- API：
  - 站点列表/详情/创建/更新/删除（见 `docs/integrations/api/04-stations.md`）
- 存储：
  - 站点与设备元数据落 PostgreSQL（见 `docs/integrations/storage/overview.md`）
- 规则范围：
  - 支持 station scope（见 `docs/integrations/rules/rule-dsl-spec.md` 的 scope 章节）

## 4. 验收标准

- 新增站点后可绑定设备；解绑/换绑不会影响设备 ID 与上报 topic。
- 前端展示站点列表时不依赖任何硬编码配置文件。

## 5. 依赖

- API：`docs/integrations/api/04-stations.md`
- Storage：`docs/integrations/storage/postgres/tables/03-devices.sql`

