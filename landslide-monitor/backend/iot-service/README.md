# 滑坡监测IoT服务

## 📁 文件结构

### 🚀 核心服务文件
- **`iot-server.js`** - 主服务器，包含IoT数据处理和设备控制功能
- **`huawei-iot-service.js`** - 华为云IoT服务封装，处理设备命令下发
- **`data-processor.js`** - 数据处理器，处理传感器数据和异常检测
- **`device-registry.js`** - 设备注册管理
- **`device-mapper.js`** - 设备映射管理

### ⚙️ 配置文件
- **`.env`** - 环境变量配置（华为云IoT、Supabase等）
- **`.env.example`** - 环境变量配置示例
- **`package.json`** - Node.js项目配置和依赖

### 📚 文档文件
- **`HUAWEI_IOT_CONFIG.md`** - 华为云IoT配置指南

### 🗄️ 数据库相关
- **`database_migration.sql`** - 数据库迁移脚本
- **`device-mapping-migration.sql`** - 设备映射表迁移
- **`gps-deformation-migration.sql`** - GPS和形变数据迁移
- **各种修复脚本** - 数据库维护和修复

### 🔧 工具脚本
- **`anomaly-config.js`** - 异常检测配置
- **`check-*.js`** - 检查脚本（数据库、设备状态等）
- **`clean-*.js`** - 数据清理脚本
- **`fix-*.js`** - 数据修复脚本
- **`start.sh`** - 服务启动脚本

## 🚀 快速启动

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入您的华为云IoT和Supabase配置
```

### 3. 启动服务
```bash
npm start
# 或
node iot-server.js
```

### 4. 验证服务
```bash
# 健康检查
curl http://localhost:5100/health

# 检查华为云IoT配置
curl http://localhost:5100/huawei/config

# 获取设备影子
curl http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/shadow
```

## 📡 主要API接口

### 华为云IoT设备控制
- **GET** `/huawei/config` - 检查华为云IoT配置
- **GET** `/huawei/devices/:deviceId/shadow` - 获取设备影子
- **POST** `/huawei/devices/:deviceId/commands` - 下发自定义命令
- **POST** `/huawei/devices/:deviceId/motor` - 电机控制
- **POST** `/huawei/devices/:deviceId/buzzer` - 蜂鸣器控制
- **POST** `/huawei/devices/:deviceId/reboot` - 系统重启
- **GET** `/huawei/command-templates` - 获取命令模板

### 数据处理和存储
- **POST** `/data` - 接收IoT设备数据
- **GET** `/devices` - 获取设备列表
- **GET** `/devices/:deviceId/latest` - 获取设备最新数据
- **GET** `/devices/:deviceId/history` - 获取设备历史数据
- **GET** `/anomalies` - 获取异常记录

## 🎯 主要功能

### ✅ 数据监控
- 实时接收和处理传感器数据
- 温湿度、光照度、振动监测
- GPS定位和形变监测
- 异常检测和报警

### ✅ 设备控制
- 电机控制（启动/停止、速度、方向、持续时间）
- 蜂鸣器控制（开关、频率、持续时间、模式）
- 系统重启和自定义命令
- 实时命令下发和响应

### ✅ 数据管理
- 自动数据清理和归档
- 设备状态监控
- 数据完整性检查
- 性能优化

## 🔧 配置说明

### 华为云IoT配置
```env
HUAWEI_IAM_ENDPOINT=https://iam.myhuaweicloud.com
HUAWEI_IOT_ENDPOINT=https://361017cfc6.st1.iotda-app.cn-north-4.myhuaweicloud.com:443
HUAWEI_DOMAIN_NAME=your-domain-name
HUAWEI_IAM_USERNAME=your-iam-username
HUAWEI_IAM_PASSWORD=your-iam-password
HUAWEI_PROJECT_ID=your-project-id
HUAWEI_DEVICE_ID=6815a14f9314d118511807c6_rk2206
```

### Supabase配置
```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 📊 设备控制示例

### 电机控制
```bash
# 启动电机（5秒）
curl -X POST http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/motor \
  -H "Content-Type: application/json" \
  -d '{"enable": true, "speed": 100, "direction": 1, "duration": 5}'

# 停止电机
curl -X POST http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/motor \
  -H "Content-Type: application/json" \
  -d '{"enable": false}'
```

### 蜂鸣器控制
```bash
# 开启蜂鸣器报警
curl -X POST http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/buzzer \
  -H "Content-Type: application/json" \
  -d '{"enable": true, "frequency": 2000, "duration": 3, "pattern": 2}'
```

## 🆘 故障排除

### 常见问题
1. **华为云IoT连接失败** - 检查配置和网络连接
2. **设备命令超时** - 确认设备在线状态
3. **数据库连接问题** - 检查Supabase配置

### 调试方法
1. 查看服务器日志
2. 检查环境变量配置
3. 验证网络连接
4. 测试API接口响应
