# App 扫码能力（QR/条码）与技术选型（v2）

## 1. 为什么需要扫码

扫码用于“现场快速进入目标对象”，常见场景：

- 扫描设备铭牌二维码：直接打开设备详情页（deviceId）
- 扫描站点二维码：直接打开站点详情页（stationId）
- 扫描运维工单/告警二维码：直接打开告警详情页（alertId，可选）

原则：扫码只负责“定位对象”，不承载敏感凭据发放（避免泄露 `device_secret`）。

## 2. 选型建议

优先选择：

- Flutter 插件：`mobile_scanner`

理由：

- API 简洁、维护活跃、Android 适配相对成熟
- 便于封装成独立组件（不污染业务层）

备选：

- `qr_code_scanner`（如遇到机型兼容问题再评估）

## 3. 统一二维码内容规范（必须）

二维码内容必须是“可读/可校验/可扩展”的格式，建议使用 URL 形式：

- 设备：`lsm://v2/device/{deviceId}`
- 站点：`lsm://v2/station/{stationId}`
- 告警：`lsm://v2/alert/{alertId}`

约束：

- `deviceId/stationId/alertId` 必须是 UUID
- 不允许把 `device_secret` 放入二维码（这属于烧录链路，见 `device-onboarding`）
- App 收到非预期 scheme/路径必须拒绝并提示（避免钓鱼/误扫）

## 4. UI/交互规范

- 扫码入口必须受权限控制（例如只有 `device:view` 才能进入设备扫码）
- 扫码成功后：
  - 先做本地校验（UUID 格式）
  - 再请求 API 校验是否存在（404 显示“未找到/无权限”）
- 扫码页面必须显式处理：相机权限、失败重试、闪光灯开关（如可用）

## 5. 与契约的闭环

- 扫码跳转后的数据仍然来自 API：
  - 设备：`GET /devices/{deviceId}`、`GET /data/state/{deviceId}`
  - 站点：`GET /stations/{stationId}`
  - 告警：`GET /alerts/{alertId}/events`（或从列表跳转）

相关引用：

- App PRD：`docs/features/prd/mobile-app.md`
- API：`docs/integrations/api/openapi.yaml`

