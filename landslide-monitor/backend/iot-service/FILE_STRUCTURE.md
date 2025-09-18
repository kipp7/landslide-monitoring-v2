# IoT服务文件结构

## 🚀 核心服务文件
```
iot-server.js                    # 主服务器（包含华为云IoT设备控制）
huawei-iot-service.js           # 华为云IoT服务封装
data-processor.js               # 数据处理器
device-registry.js              # 设备注册管理
device-mapper.js                # 设备映射管理
```

## ⚙️ 配置文件
```
.env                            # 环境变量配置
.env.example                    # 配置示例
package.json                    # 项目配置
package-lock.json               # 依赖锁定
```

## 📚 文档文件
```
README.md                       # 项目说明
HUAWEI_IOT_CONFIG.md           # 华为云IoT配置指南
FILE_STRUCTURE.md              # 文件结构说明（本文件）
```

## 🗄️ 数据库文件
```
database_migration.sql          # 主数据库迁移
device-mapping-migration.sql    # 设备映射表
gps-deformation-migration.sql   # GPS和形变数据
add-deformation-fields.sql      # 添加形变字段
fix-*.sql                       # 数据库修复脚本
```

## 🔧 工具脚本
```
anomaly-config.js               # 异常检测配置
check-*.js                      # 各种检查脚本
clean-*.js                      # 数据清理脚本
fix-*.js                        # 数据修复脚本
start.sh                        # 服务启动脚本
```

## 📊 日志文件
```
server.log                      # 服务器运行日志
```

## 📁 依赖文件夹
```
node_modules/                   # Node.js依赖包
```

---

## 🎯 主要功能文件说明

### `iot-server.js`
- 主服务器文件
- 包含所有API接口
- 华为云IoT设备控制功能
- 数据接收和处理

### `huawei-iot-service.js`
- 华为云IoT API封装
- 设备命令下发
- 设备影子获取
- 认证管理

### `data-processor.js`
- 传感器数据处理
- 异常检测
- 数据验证和清理

### `device-registry.js`
- 设备注册和管理
- 设备状态监控

### `device-mapper.js`
- 设备ID映射
- 多平台设备管理

---

## 🚀 快速启动
```bash
npm install
cp .env.example .env
# 编辑 .env 配置
npm start
```

## 📡 主要端口
- **5100** - IoT服务器端口
- **3000** - 前端服务端口（需单独启动）
