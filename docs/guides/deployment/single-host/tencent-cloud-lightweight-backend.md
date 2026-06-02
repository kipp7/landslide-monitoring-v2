---
title: Tencent Cloud Lightweight Backend Deployment
type: guide
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/single-host/tencent-cloud-lightweight-backend
---

# 腾讯云轻量服务器后端中心平台部署 Runbook

本文记录 2026-05-21 在腾讯云轻量服务器上完成的后端中心平台部署流程。目标是让后续任意 CLI 窗口可以按同一口径重新部署或迁移，不依赖当前对话上下文。

## 1. 部署目标

当前云端部署只承担“中心后端平台”职责：

- Windows 桌面端连接云端 API 和 MQTT。
- RK3568 通过 4G/LAN 主动连接云端 MQTT/API。
- 云端不直接反向访问 4G/NAT 后面的 RK3568 HTTP sidecar。
- 云端不把 `apps/web` 作为默认验收面；当前默认验收面仍是 Windows 桌面端。

已验证服务器：

- 公网 IP：`134.175.187.208`
- SSH 用户：`ubuntu`
- OS：Ubuntu 22.04.5 LTS
- 规格：约 4C / 8GB / 180GB SSD / 12Mbps
- 部署目录：`/opt/lsmv2/current`
- 数据目录：`/opt/lsmv2/data`

## 2. 端口策略

当前云端只需要对外开放：

| 端口 | 用途 | 当前状态 | 建议 |
|---:|---|---|---|
| `22/tcp` | SSH | 腾讯云控制台控制 | 只允许可信 IP 更好 |
| `8080/tcp` | API 服务 | 已开放 | 桌面端和 RK3568 需要 |
| `1883/tcp` | MQTT | 已开放 | RK3568/设备上行需要 |
| `18083/tcp` | EMQX Dashboard | 已开放 | 仅临时运维，后续最好限源 |

不要对公网开放：

| 端口 | 服务 |
|---:|---|
| `5432` | PostgreSQL |
| `6379` | Redis |
| `8123` | ClickHouse HTTP |
| `9000` | ClickHouse native |
| `9094` | Kafka external listener |

本次云端 override 已将这些内部端口绑定到 `127.0.0.1`。

## 3. 本地准备

从仓库根目录执行。当前默认仓库路径：

```powershell
cd 'E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline'
```

SSH key 路径：

```powershell
$Server = '134.175.187.208'
$User = 'ubuntu'
$Key = 'key\1.pem'
```

如果 Windows OpenSSH 提示私钥权限过宽，收紧 ACL：

```powershell
icacls $Key /inheritance:r
icacls $Key /grant:r "$($env:USERNAME):(R)"
```

连通性测试：

```powershell
ssh -i $Key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$Server" "whoami; hostname; cat /etc/os-release | grep PRETTY_NAME"
```

## 4. 源码包打包与上传

严禁上传本地 `.env`、私钥、pem、node_modules、artifacts、`.tmp`。

```powershell
New-Item -ItemType Directory -Force -Path '.tmp' | Out-Null
$Archive = '.tmp\lsmv2-cloud-src.tar.gz'
if (Test-Path $Archive) { Remove-Item -LiteralPath $Archive -Force }

tar.exe -czf $Archive `
  --exclude='.git' `
  --exclude='node_modules' `
  --exclude='**/node_modules' `
  --exclude='dist' `
  --exclude='**/dist' `
  --exclude='build' `
  --exclude='**/build' `
  --exclude='.tmp' `
  --exclude='artifacts' `
  --exclude='key' `
  --exclude='*.pem' `
  --exclude='.env' `
  --exclude='**/.env' `
  --exclude='**/.env.*' `
  -C $PWD .

scp -i $Key -o IdentitiesOnly=yes $Archive "$User@$Server:/tmp/lsmv2-cloud-src.tar.gz"
```

远端解压：

```powershell
ssh -i $Key -o IdentitiesOnly=yes "$User@$Server" @'
set -euo pipefail
sudo mkdir -p /opt/lsmv2/current
sudo tar -xzf /tmp/lsmv2-cloud-src.tar.gz -C /opt/lsmv2/current
sudo chown -R ubuntu:ubuntu /opt/lsmv2/current
du -sh /opt/lsmv2/current
'@
```

当前实测干净源码包约 `4.87MB`，远端展开约 `24MB`。

## 5. 服务器基础环境

检查：

```bash
cat /etc/os-release
df -hT /
free -h
docker --version || true
docker compose version || true
```

推荐部署后状态：

- Docker：`29.5.2`
- Docker Compose：`v5.1.4`
- swap：`4.0GiB`
- 根分区可用空间：大于 `100GB`

如果没有 Docker，安装 Docker Engine。若使用腾讯云 Docker 镜像系统，可跳过安装，直接检查版本。

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

创建 4GB swap：

```bash
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
```

配置 Docker 镜像加速和日志轮转：

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
JSON
sudo systemctl daemon-reload
sudo systemctl restart docker
sudo docker info --format 'mirrors={{json .RegistryConfig.Mirrors}} log={{.LoggingDriver}}'
```

说明：首次拉 Docker Hub 镜像如果出现 `i/o timeout`，优先确认上面的腾讯云镜像源已生效。

## 6. 云端 `.env` 生成

不要上传本地 `infra/compose/.env`。在服务器上生成云端专用 `.env`：

```bash
cd /opt/lsmv2/current
sudo mkdir -p /opt/lsmv2/data

rand() { openssl rand -base64 36 | tr -d '\n'; }
PG_PASSWORD="$(rand)"
REDIS_PASSWORD="$(rand)"
CH_PASSWORD="$(rand)"
EMQX_DASHBOARD_PASSWORD="$(rand)"
JWT_ACCESS_SECRET="$(rand)$(rand)"
JWT_REFRESH_SECRET="$(rand)$(rand)"
ADMIN_API_TOKEN="$(rand)$(rand)"
MQTT_INTERNAL_PASSWORD="$(rand)"
EMQX_WEBHOOK_TOKEN="$(rand)$(rand)"

sudo install -m 600 /dev/null infra/compose/.env
sudo tee infra/compose/.env >/dev/null <<EOF
# Cloud deployment env generated on $(date -Iseconds)
TZ=Asia/Shanghai
DATA_DIR=/opt/lsmv2/data
CH_DATA_DIR=/opt/lsmv2/data/clickhouse

PG_USER=landslide
PG_PASSWORD=${PG_PASSWORD}
PG_DATABASE=landslide_monitor
PG_HOST=localhost
PG_PORT=5432

REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_HOST=localhost
REDIS_PORT=6379

CH_DATABASE=landslide
CH_USER=landslide
CH_PASSWORD=${CH_PASSWORD}
CH_HOST=localhost
CH_HTTP_PORT=8123
CH_NATIVE_PORT=9000

MQTT_HOST=134.175.187.208
MQTT_PORT=1883
MQTT_URL=mqtt://134.175.187.208:1883
MQTT_INTERNAL_USERNAME=ingest-service
MQTT_INTERNAL_PASSWORD=${MQTT_INTERNAL_PASSWORD}
EMQX_DASHBOARD_USER=admin
EMQX_DASHBOARD_PASSWORD=${EMQX_DASHBOARD_PASSWORD}
EMQX_WEBHOOK_TOKEN=${EMQX_WEBHOOK_TOKEN}

KAFKA_BROKERS=localhost:9094
KAFKA_BROKERS_INTERNAL=kafka:9092
KAFKA_LOG_RETENTION_HOURS=24
CLUSTER_ID=5L6g3nShT-eMCtK--X86sw
KAFKA_UI_PORT=8081

AUTH_REQUIRED=true
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN_SECONDS=7200
JWT_REFRESH_EXPIRES_IN_SECONDS=604800
ADMIN_API_TOKEN=${ADMIN_API_TOKEN}
DB_ADMIN_ENABLED=false
CORS_ORIGINS=http://134.175.187.208:3000

JPUSH_APP_KEY=
JPUSH_MASTER_SECRET=

# Cloud cannot directly call a 4G/NAT RK3568 over LAN.
# Keep these empty until reverse tunnel, VPN, or MQTT downlink is enabled.
RK3568_ALARM_ACTUATOR_URL=
RK3568_FIELD_LINK_MONITOR_URL=
RK3568_HERMES_EDGE_SUPERVISOR_URL=
EOF
sudo chmod 600 infra/compose/.env
```

替换服务器 IP 时，至少改：

- `MQTT_HOST`
- `MQTT_URL`
- `CORS_ORIGINS`

## 7. 云端 Compose Override

创建云端专用 override，限制内部端口仅本机访问：

```bash
cd /opt/lsmv2/current
sudo tee infra/compose/docker-compose.cloud.yml >/dev/null <<'YAML'
# Cloud-only deployment override.
# Public: API 8080, MQTT 1883, EMQX dashboard 18083.
# Local-only: databases, Redis, Kafka external listener, optional web.
services:
  postgres:
    ports: !override
      - "127.0.0.1:5432:5432"
  redis:
    ports: !override
      - "127.0.0.1:6379:6379"
  clickhouse:
    ports: !override
      - "127.0.0.1:8123:8123"
      - "127.0.0.1:9000:9000"
  kafka:
    environment:
      KAFKA_HEAP_OPTS: "-Xms384m -Xmx768m"
    ports: !override
      - "127.0.0.1:9094:9094"
  emqx:
    ports: !override
      - "1883:1883"
      - "18083:18083"
  web:
    ports: !override
      - "127.0.0.1:3000:3000"
YAML

sudo docker compose \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.app.yml \
  -f infra/compose/docker-compose.cloud.yml \
  --env-file infra/compose/.env \
  config -q
```

如果 compose 版本不支持 `!override`，升级 Docker Compose。不要为了省事把数据库端口暴露到 `0.0.0.0`。

## 8. 启动基础设施

```bash
cd /opt/lsmv2/current
sudo docker compose \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.app.yml \
  -f infra/compose/docker-compose.cloud.yml \
  --env-file infra/compose/.env \
  up -d postgres redis clickhouse emqx kafka
```

等待健康：

```bash
for i in $(seq 1 60); do
  sudo docker inspect -f '{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    lsmv2_postgres lsmv2_redis lsmv2_clickhouse lsmv2_kafka | sed 's#^/##'
  sleep 5
done
```

期望：

- `lsmv2_postgres healthy`
- `lsmv2_redis healthy`
- `lsmv2_clickhouse healthy`
- `lsmv2_kafka healthy`

## 9. Kafka Topics

```bash
cd /opt/lsmv2/current
for t in \
  telemetry.raw.v1 \
  telemetry.dlq.v1 \
  alerts.events.v1 \
  device.commands.v1 \
  device.command_acks.v1 \
  device.command_events.v1 \
  presence.events.v1 \
  ai.predictions.v1
do
  echo "ensuring:$t"
  sudo docker exec lsmv2_kafka /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server kafka:9092 \
    --create --if-not-exists \
    --topic "$t" \
    --partitions 6 \
    --replication-factor 1 >/dev/null
done

sudo docker exec lsmv2_kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list | sort
```

## 10. 启动应用服务

当前桌面端是正式验收面，云端无需默认启动 `web` 容器。启动后端应用：

```bash
cd /opt/lsmv2/current
sudo docker compose \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.app.yml \
  -f infra/compose/docker-compose.cloud.yml \
  --env-file infra/compose/.env \
  up -d --build \
  api \
  ingest \
  telemetry-writer \
  rule-engine-worker \
  command-dispatcher \
  command-ack-receiver \
  command-events-recorder \
  command-timeout-worker
```

检查：

```bash
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -fsS http://127.0.0.1:8080/health
```

## 11. EMQX HTTP 鉴权

EMQX 必须走 API 的 HTTP authn/authz，否则 MQTT 会变成裸连。

```bash
cd /opt/lsmv2/current
while IFS='=' read -r key value; do
  case "$key" in ''|'#'*) continue ;; esac
  case "$key" in EMQX_DASHBOARD_USER|EMQX_DASHBOARD_PASSWORD|EMQX_WEBHOOK_TOKEN) export "$key=$value" ;; esac
done < <(sudo cat infra/compose/.env)

sudo docker exec lsmv2_emqx emqx ctl admins passwd "$EMQX_DASHBOARD_USER" "$EMQX_DASHBOARD_PASSWORD" >/dev/null

LOGIN_JSON=$(curl -fsS -X POST http://127.0.0.1:18083/api/v5/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$EMQX_DASHBOARD_USER\",\"password\":\"$EMQX_DASHBOARD_PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN_JSON" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
test -n "$TOKEN"

AUTHN_JSON=$(cat <<JSON
{
  "mechanism": "password_based",
  "backend": "http",
  "enable": true,
  "method": "post",
  "url": "http://api:8080/emqx/authn",
  "headers": {"x-emqx-token": "$EMQX_WEBHOOK_TOKEN", "content-type": "application/json"},
  "body": {"username": "\${username}", "password": "\${password}", "clientid": "\${clientid}"}
}
JSON
)

if ! curl -fsS -X PUT http://127.0.0.1:18083/api/v5/authentication/password_based:http \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$AUTHN_JSON" >/tmp/emqx-authn.out 2>/tmp/emqx-authn.err; then
  curl -fsS -X POST http://127.0.0.1:18083/api/v5/authentication \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$AUTHN_JSON" >/tmp/emqx-authn.out
fi

AUTHZ_JSON=$(cat <<JSON
{
  "type": "http",
  "enable": true,
  "method": "post",
  "url": "http://api:8080/emqx/acl",
  "headers": {"x-emqx-token": "$EMQX_WEBHOOK_TOKEN", "content-type": "application/json"},
  "body": {"username": "\${username}", "topic": "\${topic}", "action": "\${action}"}
}
JSON
)

if ! curl -fsS -X PUT http://127.0.0.1:18083/api/v5/authorization/sources/http \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$AUTHZ_JSON" >/tmp/emqx-authz.out 2>/tmp/emqx-authz.err; then
  curl -fsS -X POST http://127.0.0.1:18083/api/v5/authorization/sources \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$AUTHZ_JSON" >/tmp/emqx-authz.out
fi

SETTINGS=$(curl -fsS http://127.0.0.1:18083/api/v5/authorization/settings -H "Authorization: Bearer $TOKEN")
UPDATED=$(printf '%s' "$SETTINGS" | sed 's/"no_match"[[:space:]]*:[[:space:]]*"[^"]*"/"no_match":"deny"/')
curl -fsS -X PUT http://127.0.0.1:18083/api/v5/authorization/settings \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$UPDATED" >/tmp/emqx-settings.out

echo "emqx http auth configured"
```

验证错误账号会被拒绝：

```bash
sudo docker exec lsmv2_ingest node -e "const mqtt=require('mqtt'); const c=mqtt.connect(process.env.MQTT_URL||'mqtt://emqx:1883',{username:'bad-user',password:'bad-password',reconnectPeriod:0,connectTimeout:5000}); const t=setTimeout(()=>{console.error('auth test timeout'); process.exit(2)},7000); c.on('connect',()=>{clearTimeout(t); console.error('unexpected mqtt auth success'); c.end(true,()=>process.exit(1));}); c.on('error',e=>{clearTimeout(t); console.log('mqtt auth denied as expected: '+e.message); process.exit(0);});"
```

期望输出：

```text
mqtt auth denied as expected: Connection refused: Not authorized
```

## 12. 基础业务数据 Seed

云端至少需要站点、A/B/C 分节点、RK3568 中心节点、传感器字典、演示账号。当前已部署口径：

| 对象 | ID / 编码 |
|---|---|
| 站点 | `GX-YL-DEMO-001` |
| A 分节点 | `00000000-0000-0000-0000-000000000001` |
| B 分节点 | `00000000-0000-0000-0000-000000000002` |
| C 分节点 | `00000000-0000-0000-0000-000000000003` |
| RK3568 中心节点 | `10000000-0000-0000-0000-000000003568` |
| admin | `admin / 123456` |
| viewer | `viewer / 123456` |

执行 seed：

```bash
cd /opt/lsmv2/current
cat >/tmp/lsmv2_cloud_seed.sql <<'SQL'
INSERT INTO stations (station_code, station_name, province, city, district, latitude, longitude, description, status, metadata)
VALUES (
  'GX-YL-DEMO-001',
  '玉林滑坡监测演示区',
  '广西壮族自治区',
  '玉林市',
  NULL,
  22.681519,
  110.195541,
  'RK3568 汇聚 + RK2206 A/B/C 分节点现场联调区域',
  'active',
  jsonb_build_object(
    'region_level', 'site',
    'region_code', 'GX-YL-DEMO-001',
    'scenario', 'cloud_deploy_field_demo',
    'node_count_expected', 3,
    'map_label', '玉林演示区'
  )
)
ON CONFLICT (station_code) DO UPDATE
SET station_name = EXCLUDED.station_name,
    province = EXCLUDED.province,
    city = EXCLUDED.city,
    district = EXCLUDED.district,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

INSERT INTO sensors (sensor_key, display_name, unit, data_type, description, tags)
VALUES
  ('soil_temperature_c', '土壤温度', '°C', 'float', '3458812510 土壤温度水分变送器温度通道', '["soil","rs485","field"]'::jsonb),
  ('soil_moisture_pct', '土壤水分', '%', 'float', '3458812510 土壤温度水分变送器水分通道', '["soil","rs485","field"]'::jsonb),
  ('soil_conductivity_us_cm', '土壤电导率', 'μS/cm', 'float', '土壤电导率/扩展土壤指标', '["soil","rs485","field"]'::jsonb),
  ('tilt_x_deg', '倾角 X', '°', 'float', 'RS485 倾角传感器 X 轴', '["tilt","rs485","field"]'::jsonb),
  ('tilt_y_deg', '倾角 Y', '°', 'float', 'RS485 倾角传感器 Y 轴', '["tilt","rs485","field"]'::jsonb),
  ('tilt_z_deg', '倾角 Z', '°', 'float', 'RS485 倾角传感器 Z 轴', '["tilt","rs485","field"]'::jsonb),
  ('gps_latitude', 'GPS 纬度', '°', 'float', 'UM220 GPS 纬度', '["gps","field"]'::jsonb),
  ('gps_longitude', 'GPS 经度', '°', 'float', 'UM220 GPS 经度', '["gps","field"]'::jsonb),
  ('warning_flag', '节点预警标志', NULL, 'bool', '边缘节点预警布尔标志', '["alarm","field"]'::jsonb),
  ('battery_pct', '电量', '%', 'float', '节点供电/电池状态', '["power","field"]'::jsonb)
ON CONFLICT (sensor_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    unit = EXCLUDED.unit,
    data_type = EXCLUDED.data_type,
    description = EXCLUDED.description,
    tags = EXCLUDED.tags,
    is_enabled = TRUE,
    updated_at = NOW();

INSERT INTO devices (device_id, device_name, device_type, station_id, status, device_secret_hash, metadata, last_seen_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'A 分节点',
    'field_node_rk2206',
    (SELECT station_id FROM stations WHERE station_code='GX-YL-DEMO-001'),
    'active',
    'internal-gateway-only',
    jsonb_build_object('node_label','A','field_node_id','A','node_addr','0001','install_label','FIELD-NODE-A','chart_legend_name','A 分节点','role','field_node','southbound','XLS1/XL01','sensors',jsonb_build_array('soil','tilt','gps')),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'B 分节点',
    'field_node_rk2206',
    (SELECT station_id FROM stations WHERE station_code='GX-YL-DEMO-001'),
    'inactive',
    'internal-gateway-only',
    jsonb_build_object('node_label','B','field_node_id','B','node_addr','0002','install_label','FIELD-NODE-B','chart_legend_name','B 分节点','role','field_node','southbound','XLS1/XL01','sensors',jsonb_build_array('soil','tilt','gps')),
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'C 分节点',
    'field_node_rk2206',
    (SELECT station_id FROM stations WHERE station_code='GX-YL-DEMO-001'),
    'inactive',
    'internal-gateway-only',
    jsonb_build_object('node_label','C','field_node_id','C','node_addr','0003','install_label','FIELD-NODE-C','chart_legend_name','C 分节点','role','field_node','southbound','XLS1/XL01','sensors',jsonb_build_array('soil','tilt','gps')),
    NULL
  ),
  (
    '10000000-0000-0000-0000-000000003568',
    'RK3568 中心节点',
    'edge_gateway_rk3568',
    (SELECT station_id FROM stations WHERE station_code='GX-YL-DEMO-001'),
    'active',
    'internal-gateway-only',
    jsonb_build_object('node_label','RK3568','role','edge_gateway','northbound','4G/LAN MQTT','southbound','中心节点汇聚串口 /dev/ttyS3','chart_legend_name','RK3568 中心节点'),
    NOW()
  )
ON CONFLICT (device_id) DO UPDATE
SET device_name = EXCLUDED.device_name,
    device_type = EXCLUDED.device_type,
    station_id = EXCLUDED.station_id,
    status = CASE WHEN devices.status = 'revoked' THEN devices.status ELSE EXCLUDED.status END,
    metadata = EXCLUDED.metadata,
    last_seen_at = COALESCE(devices.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = NOW();

INSERT INTO device_sensors (device_id, sensor_key, status, metadata)
SELECT d.device_id, s.sensor_key, 'enabled', jsonb_build_object('source','cloud_seed')
FROM devices d
CROSS JOIN sensors s
WHERE d.device_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
)
AND s.sensor_key IN ('soil_temperature_c','soil_moisture_pct','soil_conductivity_us_cm','tilt_x_deg','tilt_y_deg','tilt_z_deg','gps_latitude','gps_longitude','warning_flag','battery_pct')
ON CONFLICT (device_id, sensor_key) DO UPDATE
SET status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

UPDATE roles
SET display_name = CASE role_name
      WHEN 'super_admin' THEN '超级管理员'
      WHEN 'admin' THEN '管理员'
      WHEN 'user' THEN '普通用户'
      ELSE display_name
    END,
    description = CASE role_name
      WHEN 'super_admin' THEN '系统全部权限'
      WHEN 'admin' THEN '设备、告警、数据与运维操作权限'
      WHEN 'user' THEN '监测数据只读权限'
      ELSE description
    END,
    updated_at = NOW()
WHERE role_name IN ('super_admin', 'admin', 'user');

INSERT INTO users (user_id, username, password_hash, email, real_name, status, deleted_at)
VALUES
  ('20000000-0000-0000-0000-000000000001','admin','$2b$10$tVOq3ED2r0XZm.zhKj1dc.bVLbt4fa5HN3lvVzDqTacYHyEGn8n6e','admin@example.com','Local Admin','active',NULL),
  ('20000000-0000-0000-0000-000000000002','viewer','$2b$10$tVOq3ED2r0XZm.zhKj1dc.bVLbt4fa5HN3lvVzDqTacYHyEGn8n6e','viewer@example.com','Local Viewer','active',NULL)
ON CONFLICT (user_id) DO UPDATE
SET username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    email = EXCLUDED.email,
    real_name = EXCLUDED.real_name,
    status = EXCLUDED.status,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT '20000000-0000-0000-0000-000000000001'::uuid, role_id FROM roles WHERE role_name IN ('admin','super_admin')
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT '20000000-0000-0000-0000-000000000002'::uuid, role_id FROM roles WHERE role_name = 'user'
ON CONFLICT DO NOTHING;
SQL

sudo docker exec -i lsmv2_postgres psql -v ON_ERROR_STOP=1 -U landslide -d landslide_monitor < /tmp/lsmv2_cloud_seed.sql
rm -f /tmp/lsmv2_cloud_seed.sql
```

## 13. 倾角突变规则 Seed

规则文件来自仓库：

```text
docs/integrations/rules/examples/rule-tilt-mutation-field-alarm.v1.json
```

同步到云端：

```bash
cd /opt/lsmv2/current
sudo docker cp docs/integrations/rules/examples/rule-tilt-mutation-field-alarm.v1.json lsmv2_postgres:/tmp/rule-tilt-mutation-field-alarm.v1.json

cat >/tmp/seed_rule.sql <<'SQL'
DO $$
DECLARE
  v_rule_id uuid;
  v_dsl jsonb;
BEGIN
  v_dsl := pg_read_file('/tmp/rule-tilt-mutation-field-alarm.v1.json')::jsonb;

  SELECT rule_id INTO v_rule_id
  FROM alert_rules
  WHERE rule_name = 'field_tilt_mutation_alarm_demo_v1'
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    INSERT INTO alert_rules(rule_name, description, scope, is_active)
    VALUES (
      'field_tilt_mutation_alarm_demo_v1',
      'Tilt X/Y/Z delta over 2 telemetry points exceeds 0.08deg; cloud deployment emits alert events, field actuation should use MQTT downlink or edge-side local rule when RK3568 is behind 4G NAT.',
      'global',
      TRUE
    )
    RETURNING rule_id INTO v_rule_id;
  ELSE
    UPDATE alert_rules
    SET is_active = TRUE,
        description = 'Tilt X/Y/Z delta over 2 telemetry points exceeds 0.08deg; cloud deployment emits alert events, field actuation should use MQTT downlink or edge-side local rule when RK3568 is behind 4G NAT.',
        updated_at = NOW()
    WHERE rule_id = v_rule_id;
  END IF;

  INSERT INTO alert_rule_versions(rule_id, rule_version, dsl_version, dsl_json, conditions, window_json, hysteresis, severity, enabled)
  VALUES (
    v_rule_id,
    COALESCE((SELECT MAX(rule_version) + 1 FROM alert_rule_versions WHERE rule_id = v_rule_id), 1),
    1,
    v_dsl,
    v_dsl->'when',
    v_dsl->'window',
    v_dsl->'hysteresis',
    'high',
    TRUE
  );
END
$$;
SQL

sudo docker exec -i lsmv2_postgres psql -v ON_ERROR_STOP=1 -U landslide -d landslide_monitor < /tmp/seed_rule.sql
rm -f /tmp/seed_rule.sql
```

## 14. 验证清单

服务器内部 API：

```bash
curl -fsS http://127.0.0.1:8080/health
```

本机公网 API：

```powershell
Invoke-RestMethod -Uri 'http://134.175.187.208:8080/health' -TimeoutSec 15
```

本机公网 TCP：

```powershell
Test-NetConnection -ComputerName 134.175.187.208 -Port 8080
Test-NetConnection -ComputerName 134.175.187.208 -Port 1883
Test-NetConnection -ComputerName 134.175.187.208 -Port 18083
```

端口监听：

```bash
sudo ss -tulpen | egrep ':(8080|1883|18083|5432|6379|8123|9000|9094)\b'
```

期望：

- `8080`、`1883`、`18083` 监听 `0.0.0.0`。
- `5432`、`6379`、`8123`、`9000`、`9094` 监听 `127.0.0.1`。

资源：

```bash
free -h
df -hT /
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## 15. 端到端遥测验证

在 `lsmv2_ingest` 容器内用内部 MQTT 账号发布一条遥测：

```bash
sudo docker exec -i lsmv2_ingest node - <<'NODE'
const mqtt = require('mqtt');
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://emqx:1883', {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 0,
  connectTimeout: 5000
});
const payload = {
  schema_version: 1,
  device_id: '00000000-0000-0000-0000-000000000001',
  event_ts: new Date().toISOString(),
  seq: Date.now(),
  metrics: {
    soil_temperature_c: 25.4,
    soil_moisture_pct: 12.8,
    soil_conductivity_us_cm: 322,
    tilt_x_deg: 1.18,
    tilt_y_deg: 0.24,
    tilt_z_deg: 0.03,
    warning_flag: false,
    gps_latitude: 22.681519,
    gps_longitude: 110.195541
  },
  meta: { source: 'cloud_deploy_smoke_after_device_seed', node_addr: '0001' }
};
client.on('connect', () => {
  client.publish('telemetry/0001', JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('published telemetry smoke after device seed');
    client.end(false, () => process.exit(0));
  });
});
client.on('error', (err) => { console.error(err); process.exit(1); });
NODE
```

查 ClickHouse：

```bash
CH_PASSWORD=$(sudo awk -F= '$1=="CH_PASSWORD"{print $2}' /opt/lsmv2/current/infra/compose/.env)
sudo docker exec lsmv2_clickhouse clickhouse-client \
  --user landslide \
  --password "$CH_PASSWORD" \
  --database landslide \
  --query "SELECT sensor_key, count() AS rows, max(received_ts) AS latest FROM telemetry_raw WHERE device_id='00000000-0000-0000-0000-000000000001' GROUP BY sensor_key ORDER BY sensor_key FORMAT TabSeparated"
```

查 Postgres 状态影子表：

```bash
sudo docker exec lsmv2_postgres psql -U landslide -d landslide_monitor -tAc \
  "SELECT device_id::text || ' state_updated=' || COALESCE(updated_at::text,'null') FROM device_state WHERE device_id='00000000-0000-0000-0000-000000000001'; SELECT device_name || ' last_seen=' || COALESCE(last_seen_at::text,'null') FROM devices WHERE device_id='00000000-0000-0000-0000-000000000001';"
```

## 16. 规则告警验证

发送两条相邻倾角变化超过 `0.08°` 的遥测：

```bash
sudo docker exec -i lsmv2_ingest node - <<'NODE'
const mqtt = require('mqtt');
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://emqx:1883', {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 0,
  connectTimeout: 5000
});
function payload(seq, x) {
  return {
    schema_version: 1,
    device_id: '00000000-0000-0000-0000-000000000001',
    event_ts: new Date(Date.now() + seq).toISOString(),
    seq,
    metrics: {
      soil_temperature_c: 25.6,
      soil_moisture_pct: 13.0,
      soil_conductivity_us_cm: 326,
      tilt_x_deg: x,
      tilt_y_deg: 0.20,
      tilt_z_deg: 0.03,
      warning_flag: x > 1.3,
      gps_latitude: 22.681519,
      gps_longitude: 110.195541
    },
    meta: { source: 'cloud_rule_smoke', node_addr: '0001' }
  };
}
client.on('connect', async () => {
  const messages = [payload(Date.now(), 1.20), payload(Date.now() + 1, 1.36)];
  for (const m of messages) {
    await new Promise((resolve, reject) => client.publish('telemetry/0001', JSON.stringify(m), { qos: 1 }, (err) => err ? reject(err) : resolve()));
  }
  console.log('published rule trigger smoke pair');
  client.end(false, () => process.exit(0));
});
client.on('error', (err) => { console.error(err); process.exit(1); });
NODE

sleep 8
sudo docker exec lsmv2_postgres psql -U landslide -d landslide_monitor -tAc \
  "SELECT event_type || ':' || severity || ':' || device_id::text || ':' || to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') FROM alert_events ORDER BY created_at DESC LIMIT 5;"
```

期望出现：

```text
ALERT_TRIGGER:high:00000000-0000-0000-0000-000000000001:...
```

## 17. 命令下行验证

验证 `API -> Kafka -> command-dispatcher -> MQTT cmd/<deviceId>`：

```bash
sudo docker exec -i lsmv2_ingest node - <<'NODE'
const mqtt = require('mqtt');
const deviceId = '00000000-0000-0000-0000-000000000001';
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://emqx:1883', {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 0,
  connectTimeout: 5000
});
const timeout = setTimeout(() => {
  console.error('timeout waiting for command mqtt message');
  client.end(true, () => process.exit(2));
}, 12000);
client.on('connect', async () => {
  client.subscribe(`cmd/${deviceId}`, { qos: 1 }, async (err) => {
    if (err) { console.error(err); process.exit(1); }
    try {
      const login = await fetch('http://api:8080/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '123456' })
      }).then((r) => r.json());
      const token = login?.data?.token;
      if (!token) throw new Error('login token missing');
      const issued = await fetch(`http://api:8080/api/v1/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ commandType: 'manual_collect', payload: { source: 'cloud_command_smoke' }, notifyOnAck: false })
      }).then((r) => r.json());
      if (!issued?.success) throw new Error(`command issue failed: ${JSON.stringify(issued)}`);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });
});
client.on('message', (_topic, payload) => {
  clearTimeout(timeout);
  const msg = JSON.parse(payload.toString('utf8'));
  console.log(JSON.stringify({ received: true, device_id: msg.device_id, command_id: msg.command_id, command_type: msg.command_type }));
  client.end(false, () => process.exit(0));
});
client.on('error', (err) => { console.error(err); process.exit(1); });
NODE
```

期望输出类似：

```json
{"received":true,"device_id":"00000000-0000-0000-0000-000000000001","command_id":"...","command_type":"manual_collect"}
```

## 18. 桌面端连接

安全组放行后：

- API Base URL：`http://134.175.187.208:8080`
- MQTT URL：`mqtt://134.175.187.208:1883`
- 登录账号：`admin / 123456`

桌面端 Windows 壳支持环境变量：

```powershell
$env:DESK_API_BASE_URL='http://134.175.187.208:8080'
```

如果使用已打包的 `artifacts/desk-win/latest.zip`，也可以在桌面端设置页把 API 改到云端。

## 19. RK3568 上云注意事项

RK3568 使用 4G 时，一般在 NAT 后面，云端不能稳定直接访问 RK3568 的 HTTP sidecar。因此：

- Northbound 应由 RK3568 主动连接 `mqtt://134.175.187.208:1883`。
- 云端命令下行应走 `cmd/<deviceId>` MQTT topic。
- RK3568 回执应发布到 `cmd_ack/<deviceId>`。
- 声光报警不要依赖云端 HTTP 调 `RK3568_ALARM_ACTUATOR_URL`。
- 真实声光联动推荐两种方案：
  - 云端规则触发后写 `device_commands`，通过 MQTT 下发给 RK3568。
  - RK3568 本地边缘规则直接根据倾角突变触发 YX75R，同时云端只记录告警事件。

## 20. 常见故障

### Docker Hub 拉取超时

症状：

```text
failed to resolve reference "docker.io/...": i/o timeout
```

处理：

- 配置 `/etc/docker/daemon.json` 的 `registry-mirrors`。
- `sudo systemctl restart docker`。
- 重新 `docker compose up`。

### 公网访问超时但服务器内部正常

症状：

- `curl http://127.0.0.1:8080/health` 正常。
- 本机访问 `http://公网IP:8080/health` 超时。
- `sudo ufw status` 为 inactive。
- `sudo ss -tulpen` 显示 `0.0.0.0:8080` 已监听。

结论：

- 多半是腾讯云安全组/防火墙没放行。

处理：

- 控制台放行 `8080/tcp`、`1883/tcp`。
- `18083/tcp` 只建议临时放行或限源。

### `infra/compose/.env` Permission denied

本次 `.env` 权限为 `600` 且通常 root-owned。读取时使用：

```bash
sudo cat infra/compose/.env
```

不要把 `.env` 权限改成全员可读。

### `device_state` 外键失败

症状：

```text
insert or update on table "device_state" violates foreign key constraint
```

原因：

- 遥测 `device_id` 没有先注册到 `devices` 表。

处理：

- 先执行基础业务数据 seed。
- 再发布遥测。

### 规则数为 0

症状：

- 遥测入库正常。
- 没有 `ALERT_TRIGGER`。
- `rule-engine-worker` 日志显示 `rules=0`。

处理：

- 执行倾角突变规则 seed。
- 重启或等待 `rule-engine-worker` 规则刷新。

## 21. 当前已验证结果

2026-05-21 18:16 左右复测：

- `http://134.175.187.208:8080/health` 公网可访问。
- `1883/tcp` 公网 TCP 可连接。
- `18083/tcp` 公网 TCP 可连接。
- API、MQTT、Kafka、ClickHouse、Postgres device_state、规则告警、命令下行、EMQX 鉴权均通过。

