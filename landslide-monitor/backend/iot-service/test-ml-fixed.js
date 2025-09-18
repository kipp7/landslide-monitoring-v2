// 修复后的机器学习预测测试
// 测试数据库连接和基本预测功能

const GPSDeformationService = require('./gps-deformation-service');

async function testMLPredictionFixed() {
    console.log('🤖 测试修复后的机器学习预测功能...\n');

    try {
        // 1. 初始化GPS服务（包含ML预测服务）
        console.log('1. 初始化GPS形变分析服务...');
        const gpsService = new GPSDeformationService({ autoInit: false });
        
        // 2. 测试数据库连接
        console.log('2. 测试数据库连接...');
        await gpsService.verifyDatabaseConnection();
        console.log('   ✅ 数据库连接成功');

        // 3. 获取可用设备
        console.log('3. 获取可用设备列表...');
        const { data: devices, error } = await gpsService.supabase
            .from('iot_data')
            .select('device_id')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .not('deformation_distance_3d', 'is', null)
            .order('event_time', { ascending: false })
            .limit(10);

        if (error) {
            throw new Error(`获取设备列表失败: ${error.message}`);
        }

        const uniqueDevices = [...new Set(devices.map(d => d.device_id))];
        console.log(`   📱 找到${uniqueDevices.length}个设备:`, uniqueDevices);

        if (uniqueDevices.length === 0) {
            console.log('   ⚠️  没有找到设备数据，使用模拟数据测试...');
            await testWithSimulatedData(gpsService);
            return;
        }

        // 4. 选择第一个设备进行测试
        const testDeviceId = uniqueDevices[0];
        console.log(`4. 使用设备 ${testDeviceId} 进行测试...`);

        // 5. 测试GPS形变分析（包含ML预测）
        console.log('5. 运行GPS形变分析（包含ML预测）...');
        const startTime = Date.now();

        const analysisResult = await gpsService.performComprehensiveAnalysis(testDeviceId, {
            limit: 50,  // 减少数据量以提高测试速度
            includeQuality: true
        });
        
        const processingTime = Date.now() - startTime;
        console.log(`   ⏱️  处理时间: ${processingTime}ms`);

        // 6. 分析结果
        console.log('6. 分析结果:');
        console.log(`   📊 数据点数: ${analysisResult.dataInfo?.validPoints || '未知'}`);
        console.log(`   📈 数据质量: ${(analysisResult.dataInfo?.qualityScore * 100).toFixed(1)}%`);

        // 7. 预测结果
        if (analysisResult.results.prediction) {
            console.log('7. 预测结果:');
            const prediction = analysisResult.results.prediction;
            
            if (prediction.shortTerm) {
                console.log(`   🔮 短期预测(${prediction.shortTerm.horizon}):`);
                console.log(`      方法: ${prediction.shortTerm.method}`);
                console.log(`      置信度: ${(prediction.shortTerm.confidence * 100).toFixed(1)}%`);
                if (prediction.shortTerm.values && prediction.shortTerm.values.length > 0) {
                    const values = prediction.shortTerm.values.slice(0, 5);
                    console.log(`      前5个值: [${values.map(v => v.toFixed(4)).join(', ')}]`);
                }
            }
            
            if (prediction.longTerm) {
                console.log(`   📈 长期预测(${prediction.longTerm.horizon}):`);
                console.log(`      方法: ${prediction.longTerm.method}`);
                console.log(`      置信度: ${(prediction.longTerm.confidence * 100).toFixed(1)}%`);
                if (prediction.longTerm.values && prediction.longTerm.values.length > 0) {
                    const values = prediction.longTerm.values.slice(0, 5);
                    console.log(`      前5个值: [${values.map(v => v.toFixed(4)).join(', ')}]`);
                }
            }
            
            // 8. 模型性能
            if (prediction.modelPerformance) {
                console.log('8. 模型性能:');
                const perf = prediction.modelPerformance;
                
                if (perf.lstm) {
                    console.log(`   🧠 LSTM: R²=${perf.lstm.r2?.toFixed(3) || 'N/A'}, 置信度=${(perf.lstm.confidence * 100).toFixed(1)}%`);
                }
                if (perf.svr) {
                    console.log(`   📈 SVR: R²=${perf.svr.r2?.toFixed(3) || 'N/A'}, 置信度=${(perf.svr.confidence * 100).toFixed(1)}%`);
                }
                if (perf.arima) {
                    console.log(`   📊 ARIMA: R²=${perf.arima.r2?.toFixed(3) || 'N/A'}, 置信度=${(perf.arima.confidence * 100).toFixed(1)}%`);
                }
                if (perf.ensemble) {
                    console.log(`   🎯 集成: R²=${perf.ensemble.r2?.toFixed(3) || 'N/A'}, 改进=${(perf.ensemble.improvement * 100).toFixed(1)}%`);
                }
            }
            
            // 9. 风险评估
            if (prediction.riskAssessment) {
                console.log('9. 风险评估:');
                const risk = prediction.riskAssessment;
                console.log(`   ⚠️  总体风险等级: ${risk.overall?.level || '未知'}`);
                console.log(`   📊 风险评分: ${risk.overall?.score?.toFixed(2) || 'N/A'}`);
                console.log(`   💡 建议: ${risk.assessment?.recommendation || '无建议'}`);
            }
        }

        console.log('\n🎉 机器学习预测测试成功完成！');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        
        // 如果是数据库连接问题，尝试模拟数据测试
        if (error.message.includes('fetch failed') || error.message.includes('数据库')) {
            console.log('\n🔄 尝试使用模拟数据进行测试...');
            await testWithSimulatedData();
        }
    }
}

/**
 * 使用模拟数据测试
 */
async function testWithSimulatedData(gpsService = null) {
    console.log('📊 使用模拟数据测试机器学习预测...');
    
    try {
        if (!gpsService) {
            gpsService = new GPSDeformationService({ autoInit: false });
        }
        
        // 生成模拟GPS数据
        const mockData = generateMockGPSData(100);
        console.log(`   生成了${mockData.length}个模拟数据点`);
        
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
        
        console.log('   数据预处理完成');
        
        // 测试预测分析
        const prediction = await gpsService.performPredictionAnalysis(preprocessedData, 'mock_device');
        
        console.log('   🎯 预测结果:');
        if (prediction.shortTerm) {
            console.log(`      短期预测: ${prediction.shortTerm.values?.length || 0}个值, 置信度${(prediction.shortTerm.confidence * 100).toFixed(1)}%`);
        }
        if (prediction.longTerm) {
            console.log(`      长期预测: ${prediction.longTerm.values?.length || 0}个值, 置信度${(prediction.longTerm.confidence * 100).toFixed(1)}%`);
        }
        
        console.log('   ✅ 模拟数据测试完成');
        
    } catch (error) {
        console.error('   ❌ 模拟数据测试失败:', error.message);
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
    testMLPredictionFixed();
}

module.exports = { testMLPredictionFixed };
