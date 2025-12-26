# 17) iot-server 兼容端点（/devices/*）

参考区的 Next API（`landslide-monitor/landslide-monitor/frontend/app/api/iot/devices/*`）会将请求代理到 `IOT_SERVICE_BASE`，并调用 **无 `/api` 前缀** 的 iot-server 风格端点（如 `/devices/mappings`）。

v2 的权威接口仍然是 `api-service` 的 legacy compat 前缀（`/api/*`、`/iot/api/*`），但为避免参考区逻辑/脚本依赖缺失，v2 额外提供以下兼容别名（不引入 Supabase 直连）：

## 1) 兼容端点

- `GET /info`：返回服务信息与可用端点索引（最小实现）
- `GET /devices/mappings`：等价于 `GET /api/iot/devices/mappings`，并补充 `count`
- `GET /devices/{deviceId}`：等价于 `GET /api/iot/devices/{deviceId}`，并补充 `count`
- `GET /devices/{deviceId}/management`：对齐参考区 iot-server 的设备管理聚合接口（内部转发到 v2 legacy `/api/device-management*`，并尽量补齐 `deformation_data`）
- `GET /devices/{deviceId}/status`：对齐参考区 iot-server 的设备状态接口（基于 v2 legacy `/api/device-management` 做最小映射）
- `GET /devices/list`：基于 `GET /api/iot/devices/mappings` 生成简化列表（参考区 iot-server 的 `devices/list` 形状）
- `GET /devices/info/{simpleId}`：基于 `GET /api/iot/devices/mappings` 做 `simple_id` 查找并返回简化详情
- `GET /debug/latest-data`、`GET /debug/latest-data/{deviceId}`：参考区调试接口（v2 基于 ClickHouse 返回最近 10 条遥测点：`device_id/sensor_key/received_ts/value/data_age_seconds`；需具备 `data:view` 权限）

说明：
- 这些端点主要用于兼容参考区的代理调用链；新代码/新 UI 仍应优先使用 v2 `/api/v1/*` 或 legacy compat `/api/*`。
