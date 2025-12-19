// 测试GPS形变监测页面的API连接
// 使用Node.js 18+内置的fetch API

const BASE_URL = 'http://localhost:3000'; // 前端服务地址

async function testGPSDeformationAPIs() {
    console.log('🧪 测试GPS形变监测API连接...\n');

    try {
        // 1. 测试获取基准点列表
        console.log('1. 测试获取基准点列表...');
        const baselinesResponse = await fetch(`${BASE_URL}/api/baselines`);
        const baselinesResult = await baselinesResponse.json();
        
        if (baselinesResult.success) {
            console.log(`   ✅ 成功获取${baselinesResult.count}个基准点`);
            if (baselinesResult.data.length > 0) {
                console.log(`   📍 第一个设备: ${baselinesResult.data[0].device_id}`);
            }
        } else {
            console.log(`   ❌ 获取基准点失败: ${baselinesResult.error}`);
        }

        // 2. 测试获取特定设备基准点
        if (baselinesResult.success && baselinesResult.data.length > 0) {
            const testDeviceId = baselinesResult.data[0].device_id;
            console.log(`\n2. 测试获取设备${testDeviceId}的基准点...`);
            
            const deviceBaselineResponse = await fetch(`${BASE_URL}/api/baselines/${testDeviceId}`);
            const deviceBaselineResult = await deviceBaselineResponse.json();
            
            if (deviceBaselineResult.success) {
                console.log('   ✅ 成功获取设备基准点');
                console.log(`   📍 坐标: (${deviceBaselineResult.data.baseline_latitude}, ${deviceBaselineResult.data.baseline_longitude})`);
            } else {
                console.log(`   ❌ 获取设备基准点失败: ${deviceBaselineResult.error}`);
            }

            // 3. 测试GPS形变分析
            console.log(`\n3. 测试GPS形变分析...`);
            
            const analysisResponse = await fetch(`${BASE_URL}/iot/api/gps-deformation/${testDeviceId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timeRange: '24 hours'
                })
            });
            
            const analysisResult = await analysisResponse.json();
            
            if (analysisResult.success) {
                console.log('   ✅ GPS形变分析成功');
                console.log(`   📊 数据质量评分: ${(analysisResult.data.dataQuality.qualityScore * 100).toFixed(1)}%`);
                console.log(`   📈 风险等级: ${analysisResult.data.results.riskAssessment.level} - ${analysisResult.data.results.riskAssessment.description}`);
                console.log(`   📏 最大位移: ${analysisResult.data.results.statisticalAnalysis.summary.maxDisplacement.toFixed(2)}mm`);
            } else {
                console.log(`   ❌ GPS形变分析失败: ${analysisResult.error}`);
            }

            // 4. 测试设备管理API（获取GPS数据）
            console.log(`\n4. 测试获取设备GPS数据...`);

            const deviceDataResponse = await fetch(`${BASE_URL}/api/device-management?device_id=${testDeviceId}&limit=10&data_only=true`);
            const deviceDataResult = await deviceDataResponse.json();
            
            if (deviceDataResult.success) {
                console.log(`   ✅ 成功获取${deviceDataResult.data?.length || 0}条GPS数据`);
                if (deviceDataResult.data && deviceDataResult.data.length > 0) {
                    const latestData = deviceDataResult.data[0];
                    console.log(`   📍 最新坐标: (${latestData.latitude}, ${latestData.longitude})`);
                    console.log(`   📏 最新位移: ${(latestData.deformation_distance_3d * 1000).toFixed(2)}mm`);
                }
            } else {
                console.log(`   ❌ 获取GPS数据失败: ${deviceDataResult.error}`);
            }
        }

        console.log('\n🎉 API测试完成！');
        console.log('\n💡 现在可以访问 http://localhost:3000/gps-deformation 查看GPS形变监测页面');

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        console.log('\n💡 请确保：');
        console.log('   1. 前端服务正在运行 (npm run dev)');
        console.log('   2. 数据库中有GPS数据和基准点');
        console.log('   3. 后端服务正常运行');
    }
}

// 运行测试
testGPSDeformationAPIs();
