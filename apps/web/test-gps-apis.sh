#!/bin/bash

# GPS形变监测API测试脚本
echo "🧪 测试GPS形变监测API连接..."
echo ""

BASE_URL="http://localhost:3000"

# 检查前端服务是否运行
echo "1. 检查前端服务状态..."
if curl -s "$BASE_URL" > /dev/null; then
    echo "   ✅ 前端服务运行正常"
else
    echo "   ❌ 前端服务未运行，请先启动: npm run dev"
    exit 1
fi

# 测试获取基准点列表
echo ""
echo "2. 测试获取基准点列表..."
response=$(curl -s "$BASE_URL/api/baselines")
if echo "$response" | grep -q '"success":true'; then
    count=$(echo "$response" | grep -o '"count":[0-9]*' | cut -d':' -f2)
    echo "   ✅ 成功获取基准点列表，共 $count 个基准点"
    
    # 提取第一个设备ID
    device_id=$(echo "$response" | grep -o '"device_id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ ! -z "$device_id" ]; then
        echo "   📍 第一个设备: $device_id"
        
        # 测试获取特定设备基准点
        echo ""
        echo "3. 测试获取设备 $device_id 的基准点..."
        device_response=$(curl -s "$BASE_URL/api/baselines/$device_id")
        if echo "$device_response" | grep -q '"success":true'; then
            echo "   ✅ 成功获取设备基准点"
            latitude=$(echo "$device_response" | grep -o '"baseline_latitude":[0-9.]*' | cut -d':' -f2)
            longitude=$(echo "$device_response" | grep -o '"baseline_longitude":[0-9.]*' | cut -d':' -f2)
            echo "   📍 坐标: ($latitude, $longitude)"
        else
            echo "   ❌ 获取设备基准点失败"
        fi
        
        # 测试GPS形变分析
        echo ""
        echo "4. 测试GPS形变分析..."
        analysis_response=$(curl -s -X POST "$BASE_URL/iot/api/gps-deformation/$device_id" \
            -H "Content-Type: application/json" \
            -d '{"timeRange": "24 hours"}')
        
        if echo "$analysis_response" | grep -q '"success":true'; then
            echo "   ✅ GPS形变分析成功"
            
            # 提取关键信息
            if echo "$analysis_response" | grep -q '"qualityScore"'; then
                quality=$(echo "$analysis_response" | grep -o '"qualityScore":[0-9.]*' | cut -d':' -f2)
                quality_percent=$(echo "$quality * 100" | bc -l 2>/dev/null || echo "N/A")
                echo "   📊 数据质量评分: ${quality_percent}%"
            fi
            
            if echo "$analysis_response" | grep -q '"level"'; then
                risk_level=$(echo "$analysis_response" | grep -o '"level":[0-9]*' | cut -d':' -f2)
                echo "   🎯 风险等级: $risk_level"
            fi
            
            if echo "$analysis_response" | grep -q '"maxDisplacement"'; then
                max_disp=$(echo "$analysis_response" | grep -o '"maxDisplacement":[0-9.]*' | cut -d':' -f2)
                echo "   📏 最大位移: ${max_disp}mm"
            fi
        else
            echo "   ❌ GPS形变分析失败"
            echo "   详情: $analysis_response"
        fi
        
        # 测试设备管理API
        echo ""
        echo "5. 测试获取设备GPS数据..."
        device_data_response=$(curl -s "$BASE_URL/api/device-management?device_id=$device_id&limit=5")
        if echo "$device_data_response" | grep -q '"success":true'; then
            echo "   ✅ 成功获取设备GPS数据"
            
            # 计算数据条数
            data_count=$(echo "$device_data_response" | grep -o '"latitude"' | wc -l)
            echo "   📊 获取到 $data_count 条GPS数据"
        else
            echo "   ❌ 获取设备GPS数据失败"
        fi
    else
        echo "   ⚠️  没有找到设备ID"
    fi
else
    echo "   ❌ 获取基准点列表失败"
    echo "   详情: $response"
fi

echo ""
echo "🎉 API测试完成！"
echo ""
echo "💡 现在可以访问以下页面："
echo "   - GPS形变监测: http://localhost:3000/gps-deformation"
echo "   - 设备管理: http://localhost:3000/device-management"
echo ""
echo "📝 如果测试失败，请检查："
echo "   1. 前端服务是否运行: npm run dev"
echo "   2. 后端服务是否运行: node iot-server.js"
echo "   3. 数据库中是否有GPS数据和基准点"
