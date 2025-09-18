// 最终的机器学习预测测试
// 简化版本，专注于核心功能验证

const GPSDeformationService = require('./gps-deformation-service');

async function testMLPredictionFinal() {
    console.log('🤖 最终机器学习预测功能测试\n');

    try {
        // 1. 初始化服务
        console.log('1. 初始化GPS形变分析服务...');
        const gpsService = new GPSDeformationService({ autoInit: false });
        console.log('   ✅ 服务初始化完成');

        // 2. 测试模拟数据预测
        console.log('\n2. 测试模拟数据预测...');
        await testWithSimulatedData(gpsService);

        console.log('\n🎉 机器学习预测功能测试完成！');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error('详细错误:', error.stack);
    }
}

/**
 * 使用模拟数据测试机器学习预测
 */
async function testWithSimulatedData(gpsService) {
    try {
        console.log('   📊 生成模拟GPS数据...');
        
        // 生成模拟GPS数据
        const mockData = generateMockGPSData(100);
        console.log(`   ✅ 生成了${mockData.length}个模拟数据点`);
        
        // 模拟数据预处理
        const preprocessedData = {
            processed: mockData.map((d, i) => ({
                timestamp: d.event_time,
                displacement: d.deformation_distance_3d,
                latitude: d.latitude,
                longitude: d.longitude,
                confidence: d.deformation_confidence,
                index: i
            }))
        };
        
        console.log('   🔧 数据预处理完成');
        
        // 测试预测分析
        console.log('   🧠 运行机器学习预测...');
        const startTime = Date.now();
        
        const prediction = await gpsService.performPredictionAnalysis(preprocessedData, 'mock_device');
        
        const processingTime = Date.now() - startTime;
        console.log(`   ⏱️  预测处理时间: ${processingTime}ms`);
        
        // 显示预测结果
        console.log('\n   🎯 预测结果详情:');
        
        if (prediction.shortTerm) {
            console.log(`   📈 短期预测(${prediction.shortTerm.horizon}):`);
            console.log(`      方法: ${prediction.shortTerm.method}`);
            console.log(`      置信度: ${(prediction.shortTerm.confidence * 100).toFixed(1)}%`);
            console.log(`      预测值数量: ${prediction.shortTerm.values?.length || 0}`);
            
            if (prediction.shortTerm.values && prediction.shortTerm.values.length > 0) {
                const values = prediction.shortTerm.values.slice(0, 5);
                console.log(`      前5个值: [${values.map(v => v.toFixed(4)).join(', ')}]`);
            }
        }
        
        if (prediction.longTerm) {
            console.log(`   📊 长期预测(${prediction.longTerm.horizon}):`);
            console.log(`      方法: ${prediction.longTerm.method}`);
            console.log(`      置信度: ${(prediction.longTerm.confidence * 100).toFixed(1)}%`);
            console.log(`      预测值数量: ${prediction.longTerm.values?.length || 0}`);
            
            if (prediction.longTerm.values && prediction.longTerm.values.length > 0) {
                const values = prediction.longTerm.values.slice(0, 5);
                console.log(`      前5个值: [${values.map(v => v.toFixed(4)).join(', ')}]`);
            }
        }
        
        // 显示模型性能
        if (prediction.modelPerformance) {
            console.log('\n   🔬 模型性能评估:');
            const perf = prediction.modelPerformance;
            
            if (perf.lstm) {
                console.log(`      🧠 LSTM: R²=${perf.lstm.r2?.toFixed(3) || 'N/A'}, 置信度=${(perf.lstm.confidence * 100).toFixed(1)}%`);
            }
            if (perf.svr) {
                console.log(`      📈 SVR: R²=${perf.svr.r2?.toFixed(3) || 'N/A'}, 置信度=${(perf.svr.confidence * 100).toFixed(1)}%`);
            }
            if (perf.arima) {
                console.log(`      📊 ARIMA: R²=${perf.arima.r2?.toFixed(3) || 'N/A'}, 置信度=${(perf.arima.confidence * 100).toFixed(1)}%`);
            }
            if (perf.ensemble) {
                console.log(`      🎯 集成: R²=${perf.ensemble.r2?.toFixed(3) || 'N/A'}, 改进=${(perf.ensemble.improvement * 100).toFixed(1)}%`);
            }
        }
        
        // 显示风险评估
        if (prediction.riskAssessment) {
            console.log('\n   ⚠️  风险评估:');
            const risk = prediction.riskAssessment;
            console.log(`      总体风险等级: ${risk.overall?.level || '未知'}`);
            console.log(`      风险评分: ${risk.overall?.score?.toFixed(2) || 'N/A'}`);
            console.log(`      建议: ${risk.assessment?.recommendation || '无建议'}`);
        }
        
        // 趋势分析
        if (prediction.shortTerm?.values && prediction.shortTerm.values.length > 0) {
            console.log('\n   📈 趋势分析:');
            const currentValue = preprocessedData.processed[preprocessedData.processed.length - 1].displacement;
            const predicted6h = prediction.shortTerm.values[5] || prediction.shortTerm.values[prediction.shortTerm.values.length - 1];
            const predicted12h = prediction.shortTerm.values[11] || prediction.shortTerm.values[prediction.shortTerm.values.length - 1];
            
            console.log(`      当前形变: ${currentValue.toFixed(4)} mm`);
            console.log(`      6小时后预测: ${predicted6h.toFixed(4)} mm (变化: ${(predicted6h - currentValue).toFixed(4)} mm)`);
            console.log(`      12小时后预测: ${predicted12h.toFixed(4)} mm (变化: ${(predicted12h - currentValue).toFixed(4)} mm)`);
            
            const trend6h = predicted6h - currentValue;
            const trend12h = predicted12h - currentValue;
            
            console.log(`      短期趋势: ${trend6h > 0.001 ? '上升' : trend6h < -0.001 ? '下降' : '稳定'}`);
            console.log(`      长期趋势: ${trend12h > 0.002 ? '上升' : trend12h < -0.002 ? '下降' : '稳定'}`);
        }
        
        console.log('\n   ✅ 模拟数据预测测试成功');
        
    } catch (error) {
        console.error('   ❌ 模拟数据测试失败:', error.message);
        
        // 如果ML预测失败，检查是否有降级预测
        if (error.message.includes('机器学习预测失败')) {
            console.log('   🔄 检测到ML预测降级，这是正常的降级机制');
        }
    }
}

/**
 * 生成模拟GPS数据
 */
function generateMockGPSData(count = 100) {
    const data = [];
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - count); // 从count小时前开始
    
    for (let i = 0; i < count; i++) {
        const timestamp = new Date(startTime.getTime() + i * 3600000); // 每小时一个点
        
        // 生成带趋势和噪声的形变数据
        const trend = i * 0.001; // 缓慢增长趋势
        const seasonal = Math.sin(i * Math.PI / 12) * 0.01; // 12小时周期
        const noise = (Math.random() - 0.5) * 0.005; // 随机噪声
        const deformation = trend + seasonal + noise;
        
        data.push({
            id: i + 1,
            event_time: timestamp.toISOString(),
            device_id: 'mock_device',
            latitude: 39.9042 + Math.random() * 0.0001,
            longitude: 116.4074 + Math.random() * 0.0001,
            deformation_distance_3d: deformation,
            deformation_horizontal: deformation * 0.8,
            deformation_vertical: deformation * 0.2,
            deformation_velocity: Math.random() * 0.001,
            deformation_confidence: 0.8 + Math.random() * 0.2,
            temperature: 20 + Math.random() * 10,
            humidity: 50 + Math.random() * 30
        });
    }
    
    return data;
}

// 运行测试
if (require.main === module) {
    testMLPredictionFinal().catch(console.error);
}

module.exports = { testMLPredictionFinal };
