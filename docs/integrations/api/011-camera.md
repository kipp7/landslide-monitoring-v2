# 11) Camera（ESP32-CAM）

权限：
- `GET /camera/*`：`data:view`
- `POST/DELETE /camera/*`：`system:config`

说明：
- v2 目前以“最小可用对齐”为目标：API service 维护**内存**摄像头列表（重启会丢失），并支持主动探测 `http://{ip}/api/status`。
- Web 侧默认直接使用 `http://{ip}/stream`（MJPEG）展示视频流（对齐参考区 `analysis` 的视频模式）。

## 1) API（/api/v1）

### 1.1 列出摄像头

**GET** `/camera/devices`

返回：`devices[]/total/online`

### 1.2 获取摄像头实时状态

**GET** `/camera/devices/{cameraId}/status`

Query：
- `timeoutMs`：超时（ms，默认 5000）

说明：会尝试访问 `http://{ip}/api/status` 更新状态与 stats。

### 1.3 添加摄像头

**POST** `/camera/devices`

Body：
- `id`：设备 ID（例如 `ESP32CAM_001`）
- `ip`：摄像头 IP（例如 `192.168.74.55`）
- `name`：显示名称

### 1.4 删除摄像头

**DELETE** `/camera/devices/{cameraId}`

## 2) Legacy 兼容路径

为对齐参考区 Next API 的调用方式，API service 额外提供：

- `GET /api/camera`（也支持 `GET /iot/api/camera`）
  - `?deviceId=...&action=status`：返回单设备状态
  - 不带参数：返回 `{devices,total,online}`
- `POST /api/camera`（也支持 `POST /iot/api/camera`）
  - `action=add|update_status|test_connection`（参考区同名 action）
  - `action=test_connection` 返回：`{ ip, http, websocket, stats, message }`
- `PUT /api/camera`（也支持 `PUT /iot/api/camera`）
  - Body：`{ deviceId, ip?, name?, config? }`
  - 如设备在线：会尝试透传配置到设备 `POST http://{ip}/api/config`
- `DELETE /api/camera?deviceId=...`（也支持 `DELETE /iot/api/camera?deviceId=...`）：删除设备
