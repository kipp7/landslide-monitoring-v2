// 测试机器学习预测功能
// 使用真实数据库数据进行预测

const GPSDeformationService = require('./gps-deformation-service');
const MLPredictionService = require('./ml-prediction-service');

async function testMLPrediction() {
    console.log('🤖 测试机器学习预测功能...\n');

    try {
        // 1. 初始化服务
        console.log('1. 初始化服务...');
        const gpsService = new GPSDeformationService({ autoInit: false });
        const mlService = new MLPredictionService();
        
        // 2. 测试数据库连接
        console.log('2. 测试数据库连接...');
        await gpsService.verifyDatabaseConnection();
        console.log('   ✅ 数据库连接成功');

        // 3. 获取可用设备列表
        console.log('3. 获取可用设备列表...');
        const devices = await getAvailableDevices(gpsService);
        console.log(`   📱 找到${devices.length}个设备:`, devices.map(d => d.device_id));

        if (devices.length === 0) {
            console.log('   ⚠️  没有找到设备数据，创建模拟数据进行测试...');
            await testWithSimulatedData(mlService);
            return;
        }

        // 4. 选择第一个设备进行测试
        const testDeviceId = devices[0].device_id;
        console.log(`4. 使用设备 ${testDeviceId} 进行测试...`);

        // 5. 测试数据获取
        console.log('5. 测试历史数据获取...');
        const historicalData = await mlService.fetchHistoricalData(testDeviceId, {
            limit: 200,
            timeRange: '7 days'
        });
        console.log(`   📊 获取到${historicalData.length}条历史数据`);

        if (historicalData.length < 50) {
            console.log('   ⚠️  历史数据不足，使用模拟数据补充...');
            await testWithSimulatedData(mlService);
            return;
        }

        // 6. 测试数据预处理
        console.log('6. 测试数据预处理...');
        const preprocessedData = await mlService.preprocessTimeSeriesData(historicalData);
        console.log(`   🧹 预处理完成: ${preprocessedData.original.length} → ${preprocessedData.normalized.length}个点`);
        console.log(`   📈 数据质量评分: ${(preprocessedData.quality.score * 100).toFixed(1)}%`);

        // 7. 测试特征提取
        console.log('7. 测试特征提取...');
        const features = await mlService.extractTimeSeriesFeatures(preprocessedData);
        console.log(`   🔍 提取了${features.summary.featureCount}个特征`);
        console.log(`   📊 统计特征: 均值=${features.statistical.mean.toFixed(3)}, 标准差=${features.statistical.std.toFixed(3)}`);

        // 8. 测试机器学习预测
        console.log('8. 测试机器学习预测...');
        const mlPrediction = await mlService.performComprehensivePrediction(testDeviceId, {
            limit: 200,
            timeRange: '7 days'
        });
        
        console.log('   🎯 预测结果:');
        console.log(`      短期预测(${mlPrediction.predictions.shortTerm.horizon}小时): ${mlPrediction.predictions.shortTerm.values.length}个值`);
        console.log(`      短期置信度: ${(mlPrediction.predictions.shortTerm.confidence * 100).toFixed(1)}%`);
        console.log(`      长期预测(${mlPrediction.predictions.longTerm.horizon}小时): ${mlPrediction.predictions.longTerm.values.length}个值`);
        console.log(`      长期置信度: ${(mlPrediction.predictions.longTerm.confidence * 100).toFixed(1)}%`);

        // 9. 测试模型性能
        console.log('9. 模型性能评估:');
        console.log(`   🧠 LSTM模型: R²=${mlPrediction.modelPerformance.lstm.r2.toFixed(3)}, 置信度=${(mlPrediction.modelPerformance.lstm.confidence * 100).toFixed(1)}%`);
        console.log(`   📈 SVR模型: R²=${mlPrediction.modelPerformance.svr.r2.toFixed(3)}, 置信度=${(mlPrediction.modelPerformance.svr.confidence * 100).toFixed(1)}%`);
        console.log(`   📊 ARIMA模型: R²=${mlPrediction.modelPerformance.arima.r2.toFixed(3)}, 置信度=${(mlPrediction.modelPerformance.arima.confidence * 100).toFixed(1)}%`);

        // 10. 测试集成GPS服务
        console.log('10. 测试集成GPS形变分析...');
        const gpsAnalysis = await gpsService.analyzeGPSDeformation(testDeviceId, {
            limit: 100,
            includeQuality: true
        });
        
        console.log('    🎯 GPS分析结果:');
        console.log(`       处理时间: ${gpsAnalysis.metadata.processingTime}ms`);
        console.log(`       数据点数: ${gpsAnalysis.metadata.dataPoints}`);
        console.log(`       预测方法: ${gpsAnalysis.analysis.prediction.shortTerm?.method || '未知'}`);
        console.log(`       短期预测置信度: ${((gpsAnalysis.analysis.prediction.shortTerm?.confidence || 0) * 100).toFixed(1)}%`);

        // 11. 显示预测趋势
        console.log('11. 预测趋势分析:');
        if (gpsAnalysis.analysis.prediction.shortTerm?.values) {
            const shortTermValues = gpsAnalysis.analysis.prediction.shortTerm.values.slice(0, 10);
            console.log(`    📈 未来10小时预测值: [${shortTermValues.map(v => v.toFixed(3)).join(', ')}]`);
            
            const trend = shortTermValues[shortTermValues.length - 1] - shortTermValues[0];
            console.log(`    📊 预测趋势: ${trend > 0 ? '上升' : trend < 0 ? '下降' : '稳定'} (${trend.toFixed(3)}mm)`);
        }

        console.log('\n🎉 机器学习预测测试完成！');

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        console.error('详细错误:', error.stack);
    }
}

/**
 * 获取可用设备列表
 */
async function getAvailableDevices(gpsService) {
    try {
        const { data, error } = await gpsService.supabase
            .from('iot_data')
            .select('device_id')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .not('deformation_distance_3d', 'is', null)
            .order('event_time', { ascending: false })
            .limit(100);

        if (error) throw error;

        // 去重设备ID
        const uniqueDevices = [];
        const deviceIds = new Set();
        
        for (const record of data) {
            if (!deviceIds.has(record.device_id)) {
                deviceIds.add(record.device_id);
                uniqueDevices.push(record);
            }
        }

        return uniqueDevices;
    } catch (error) {
        console.error('获取设备列表失败:', error);
        return [];
    }
}

/**
 * 使用模拟数据测试
 */
async function testWithSimulatedData(mlService) {
    console.log('📊 使用模拟数据进行测试...');
    
    // 生成模拟时间序列数据
    const simulatedData = generateSimulatedTimeSeriesData();
    console.log(`   生成了${simulatedData.length}个模拟数据点`);
    
    // 测试数据预处理
    const preprocessedData = await mlService.preprocessTimeSeriesData(simulatedData);
    console.log(`   预处理完成: ${preprocessedData.original.length} → ${preprocessedData.normalized.length}个点`);
    
    // 测试特征提取
    const features = await mlService.extractTimeSeriesFeatures(preprocessedData);
    console.log(`   提取了${features.summary.featureCount}个特征`);
    
    // 测试多模型预测
    const predictions = await mlService.runMultiModelPrediction(preprocessedData, features);
    console.log(`   LSTM预测: ${predictions.lstm.shortTerm.values.length}个短期值`);
    console.log(`   SVR预测: ${predictions.svr.shortTerm.values.length}个短期值`);
    console.log(`   ARIMA预测: ${predictions.arima.shortTerm.values.length}个短期值`);
    
    // 测试模型集成
    const ensemble = await mlService.ensembleModels(predictions);
    console.log(`   集成预测: 短期置信度${(ensemble.shortTerm.confidence * 100).toFixed(1)}%`);
    
    console.log('   ✅ 模拟数据测试完成');
}

/**
 * 生成模拟时间序列数据
 */
function generateSimulatedTimeSeriesData() {
    const data = [];
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 7); // 7天前开始
    
    for (let i = 0; i < 200; i++) {
        const timestamp = new Date(startTime.getTime() + i * 60000); // 每分钟一个点
        
        // 生成带趋势和噪声的形变数据
        const trend = i * 0.01; // 线性趋势
        const seasonal = Math.sin(i * 0.1) * 0.5; // 季节性变化
        const noise = (Math.random() - 0.5) * 0.2; // 随机噪声
        const deformation = trend + seasonal + noise;
        
        data.push({
            id: i + 1,
            event_time: timestamp.toISOString(),
            device_id: 'simulated_device',
            latitude: 39.9042 + Math.random() * 0.001,
            longitude: 116.4074 + Math.random() * 0.001,
            deformation_distance_3d: deformation,
            deformation_horizontal: deformation * 0.8,
            deformation_vertical: deformation * 0.2,
            deformation_velocity: Math.random() * 0.1,
            deformation_confidence: 0.8 + Math.random() * 0.2,
            temperature: 20 + Math.random() * 10,
            humidity: 50 + Math.random() * 30
        });
    }
    
    return data;
}

// 运行测试
if (require.main === module) {
    testMLPrediction();
}

module.exports = { testMLPrediction };
