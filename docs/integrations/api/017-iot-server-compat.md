# 17) iot-server 兼容端点（/devices/*）

参考区的 Next API（`landslide-monitor/landslide-monitor/frontend/app/api/iot/devices/*`）会将请求代理到 `IOT_SERVICE_BASE`，并调用 **无 `/api` 前缀** 的 iot-server 风格端点（如 `/devices/mappings`）。

v2 的权威接口仍然是 `api-service` 的 legacy compat 前缀（`/api/*`、`/iot/api/*`），但为避免参考区逻辑/脚本依赖缺失，v2 额外提供以下兼容别名（不引入 Supabase 直连）：

## 1) 兼容端点

- 以下端点同时支持**无前缀**与 **`/iot` 前缀**两种访问方式（对齐参考区默认 `apiBase=${host}/iot` 的拼接逻辑）：
  - 例：`GET /devices/mappings` 与 `GET /iot/devices/mappings` 均可用

- `GET /info`：返回服务信息与可用端点索引（最小实现）
- `GET /devices/mappings`：等价于 `GET /api/iot/devices/mappings`，并补充 `count`
- `GET /devices/{deviceId}`：等价于 `GET /api/iot/devices/{deviceId}`，并补充 `count`
- `GET /devices/list`：基于 `GET /api/iot/devices/mappings` 生成简化列表（参考区 iot-server 的 `devices/list` 形状）
- `GET /devices/info/{simpleId}`：基于 `GET /api/iot/devices/mappings` 做 `simple_id` 查找并返回简化详情

说明：
- 这些端点主要用于兼容参考区的代理调用链；新代码/新 UI 仍应优先使用 v2 `/api/v1/*` 或 legacy compat `/api/*`。
