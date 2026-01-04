// 直接测试后端API
const BASE_URL = 'http://localhost:5100';

async function testBackendAPIs() {
    console.log('🧪 直接测试后端API...\n');

    try {
        // 1. 测试后端健康检查
        console.log('1. 测试后端健康检查...');
        const healthResponse = await fetch(`${BASE_URL}/health`);
        const healthResult = await healthResponse.json();
        
        if (healthResponse.ok) {
            console.log('   ✅ 后端服务正常运行');
            console.log(`   📊 服务: ${healthResult.service}`);
            console.log(`   🕐 时间: ${healthResult.timestamp}`);
        } else {
            console.log('   ❌ 后端服务异常');
            return;
        }

        // 2. 测试服务信息
        console.log('\n2. 测试服务信息...');
        const infoResponse = await fetch(`${BASE_URL}/info`);
        const infoResult = await infoResponse.json();
        
        if (infoResponse.ok) {
            console.log('   ✅ 服务信息获取成功');
            console.log('   📋 可用端点:');
            Object.entries(infoResult.endpoints).forEach(([key, value]) => {
                console.log(`      ${key}: ${value}`);
            });
        }

        // 3. 测试GPS形变分析GET
        console.log('\n3. 测试GPS形变分析GET...');
        const getResponse = await fetch(`${BASE_URL}/iot/api/gps-deformation/device_1`);
        const getResult = await getResponse.json();
        
        if (getResponse.ok) {
            console.log('   ✅ GPS形变分析GET成功');
            console.log(`   📊 结果: ${getResult.message}`);
        } else {
            console.log('   ❌ GPS形变分析GET失败');
            console.log(`   错误: ${getResult.error}`);
        }

        // 4. 测试GPS形变分析POST
        console.log('\n4. 测试GPS形变分析POST...');
        const postResponse = await fetch(`${BASE_URL}/iot/api/gps-deformation/device_1`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                timeRange: '24 hours'
            })
        });

        console.log(`   响应状态: ${postResponse.status}`);
        
        if (postResponse.ok) {
            const postResult = await postResponse.json();
            console.log('   ✅ GPS形变分析POST成功');
            console.log(`   📊 设备ID: ${postResult.deviceId}`);
            console.log(`   📈 数据质量: ${(postResult.dataQuality?.qualityScore * 100).toFixed(1)}%`);
            console.log(`   🎯 风险等级: ${postResult.results?.riskAssessment?.level}`);
        } else {
            const errorText = await postResponse.text();
            console.log('   ❌ GPS形变分析POST失败');
            console.log(`   错误响应: ${errorText}`);
        }

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        console.log('\n💡 请检查：');
        console.log('   1. 后端服务是否在运行 (node iot-server.js)');
        console.log('   2. 端口5100是否正确');
        console.log('   3. 防火墙设置');
    }
}

// 运行测试
testBackendAPIs();
