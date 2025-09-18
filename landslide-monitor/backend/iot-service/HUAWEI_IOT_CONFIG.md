# 华为云IoT配置指南

## 概述

本文档说明如何配置华为云IoT服务，以实现前端通过后端向设备下发命令的功能。

## 配置步骤

### 1. 获取华为云认证信息

您需要从华为云控制台获取以下信息：

#### IAM认证信息
- **HUAWEI_DOMAIN_NAME**: 华为云账户名（主账户名）
- **HUAWEI_IAM_USERNAME**: IAM子账户用户名
- **HUAWEI_IAM_PASSWORD**: IAM子账户密码

#### 项目信息
- **HUAWEI_PROJECT_ID**: 项目ID，可在"我的凭证"页面查看

#### 设备信息
- **HUAWEI_DEVICE_ID**: 设备ID，可在IoT设备管理页面查看
- **HUAWEI_PRODUCT_ID**: 产品ID（可选）

### 2. 配置环境变量

1. 复制 `.env.example` 文件为 `.env`：
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，填入您的实际配置信息：
   ```env
   HUAWEI_DOMAIN_NAME=your-actual-domain-name
   HUAWEI_IAM_USERNAME=your-actual-iam-username
   HUAWEI_IAM_PASSWORD=your-actual-iam-password
   HUAWEI_PROJECT_ID=your-actual-project-id
   HUAWEI_DEVICE_ID=6815a14f9314d118511807c6_rk2206
   ```

### 3. 安装依赖

确保安装了axios依赖：
```bash
npm install axios
```

### 4. 测试配置

启动服务器后，访问以下接口测试配置：

```bash
# 检查配置状态
curl http://localhost:5100/huawei/config

# 获取设备影子（测试连接）
curl http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/shadow

# 获取命令模板
curl http://localhost:5100/huawei/command-templates
```

## API接口说明

### 配置检查
- **GET** `/huawei/config` - 检查华为云IoT配置状态

### 设备管理
- **GET** `/huawei/devices/:deviceId/shadow` - 获取设备影子信息

### 命令下发
- **POST** `/huawei/devices/:deviceId/commands` - 向设备下发自定义命令
- **POST** `/huawei/devices/:deviceId/led` - LED控制快捷命令
- **POST** `/huawei/devices/:deviceId/motor` - 电机控制快捷命令
- **POST** `/huawei/devices/:deviceId/reboot` - 系统重启快捷命令

### 命令模板
- **GET** `/huawei/command-templates` - 获取预定义命令模板

## 命令示例

### LED控制
```bash
# 开启LED
curl -X POST http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/led \
  -H "Content-Type: application/json" \
  -d '{"action": "on"}'

# 关闭LED
curl -X POST http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/led \
  -H "Content-Type: application/json" \
  -d '{"action": "off"}'
```

### 自定义命令
```bash
curl -X POST http://localhost:5100/huawei/devices/6815a14f9314d118511807c6_rk2206/commands \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "IntelligentCockpit",
    "command_name": "light_control",
    "paras": {
      "onoff": "ON"
    }
  }'
```

## 故障排除

### 常见错误

1. **认证失败**
   - 检查IAM用户名和密码是否正确
   - 确认域名（主账户名）是否正确

2. **设备不存在**
   - 检查设备ID是否正确
   - 确认设备是否在线

3. **命令下发失败**
   - 检查命令格式是否正确
   - 确认设备是否支持该命令
   - 检查设备是否在线

### 调试方法

1. 查看服务器日志，了解详细错误信息
2. 使用华为云控制台的API Explorer进行在线调试
3. 检查设备端是否正确处理命令

## 安全注意事项

1. 不要将 `.env` 文件提交到版本控制系统
2. 定期更换IAM账户密码
3. 使用最小权限原则配置IAM账户
4. 在生产环境中使用HTTPS

## 参考文档

- [华为云IoT设备接入API文档](https://support.huaweicloud.com/api-iothub/iot_06_v5_0001.html)
- [华为云IAM认证文档](https://support.huaweicloud.com/api-iothub/iot_06_v5_0091.html)
