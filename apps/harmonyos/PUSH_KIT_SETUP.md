# HarmonyOS Push Kit 接入

App 已具备前台告警 SSE 和本地通知。Push Kit 用于 App 退到后台或进程未运行时的告警送达，不替代服务器告警数据，也不新增独立业务数据库。

## 当前交付状态

- App 前台告警已接入 `GET /api/v1/alerts/stream`，新告警会刷新列表并生成系统通知。
- Push Token 注册接口已收口到现有 API：`POST/DELETE /api/v1/push/devices`。
- Push Token 只存入现有 PostgreSQL 的 `app_push_devices` 表，不建 App 专用业务库。
- `alert-notify-worker` 已增加华为 Push Kit 发送器，未配置 AGC 凭据时保持关闭，不影响现有告警链路。
- 生产服务器尚未执行本次迁移和重建；下方步骤是主线部署时的唯一交接清单。

## 启用条件

1. 在 AppGallery Connect 创建 HarmonyOS 应用，包名使用 `com.kipp7.landslide.monitoring`。
2. 在 AGC 开通 Push Kit，并让 AGC 应用证书与 DevEco Studio 正式签名保持一致。
3. 将 AGC 配置文件放到官方文档要求的工程位置。配置文件可能包含应用标识，但不得提交客户端密钥。
4. 对已有 PostgreSQL 执行 `docs/integrations/storage/postgres/tables/22-app-push-devices.sql`。新建数据库会由 Compose 初始化目录自动执行。
5. 在服务器 `.env` 中填写：
   - `HUAWEI_PUSH_ENABLED=true`
   - `HUAWEI_PUSH_SEND_URL`：AGC 当前 Push Kit 服务端 API 的完整发送地址
   - `HUAWEI_PUSH_CLIENT_ID`
   - `HUAWEI_PUSH_CLIENT_SECRET`
6. 重新构建并启动 `api` 与 `alert-notify-worker`。

部署后应先用已登录账号验证 `/api/v1/alerts/stream` 可持续连接，再用真机验证 Push Token 注册和后台通知。不要在 AGC 凭据未准备好时开启 `HUAWEI_PUSH_ENABLED`。

## 数据流

登录后，App 调用 Push Kit 获取 Token，并通过 `POST /api/v1/push/devices` 绑定到当前用户。退出账号或更换服务器时，App 调用 `DELETE /api/v1/push/devices` 停用绑定。

规则引擎产生 `alerts.events.v1` 后，`alert-notify-worker` 按现有订阅和最低告警等级筛选用户，再通过 Push Kit 发送。Token 只存放在现有 PostgreSQL 的 `app_push_devices` 表中，不进入 App 普通缓存。

## 验证

- 前台：触发新告警后，SSE 在约 2 秒内刷新告警列表并发布本地通知。
- 后台：真机退到后台后触发告警，Push Kit 应显示系统通知；点击通知进入对应告警地图。
- 退出：退出账号后，该 Token 的服务器绑定应变为停用。

模拟器可能不支持 Push Kit Token。前台 SSE、地图和数据监测不受影响；后台推送验收应使用已安装华为移动服务的 HarmonyOS 真机。
