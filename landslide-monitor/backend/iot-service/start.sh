#!/bin/bash

echo "🏔️  启动滑坡监测IoT服务..."

# 停止可能存在的进程
pkill -f "iot-server.js" 2>/dev/null || true

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，请先安装Node.js"
    exit 1
fi

echo "✅ Node.js版本: $(node -v)"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动服务
echo "🚀 启动服务..."
nohup node iot-server.js > server.log 2>&1 &
SERVER_PID=$!

echo "📋 进程ID: $SERVER_PID"

# 等待服务启动
sleep 2

# 检查服务状态
if curl -f http://localhost:5100/health > /dev/null 2>&1; then
    echo "✅ 服务启动成功!"
    echo ""
    echo "📡 服务地址:"
    echo "  健康检查: http://localhost:5100/health"
    echo "  服务信息: http://localhost:5100/info"
    echo "  IoT接收: http://localhost:5100/iot/huawei"
    echo ""
    echo "📝 管理命令:"
    echo "  查看日志: tail -f server.log"
    echo "  停止服务: pkill -f iot-server.js"
    echo "  重启服务: ./start.sh"
    echo ""
    echo "🔄 数据处理:"
    echo "  服务已集成数据处理器，会自动："
    echo "  - 管理设备信息 (iot_devices表)"
    echo "  - 更新设备位置 (iot_device_locations表)"
    echo "  - 检测数据异常 (iot_anomalies表)"
    echo "  - 分析风险趋势 (iot_anomaly_trends表)"
    echo ""
    echo "⚠️  重要提醒:"
    echo "  请确保已在Supabase中执行 database_migration.sql"
    echo "  数据流: 华为IoT → iot_data表 → 自动处理 → 其他业务表"
else
    echo "❌ 服务启动失败"
    echo "查看错误日志:"
    cat server.log
    exit 1
fi
