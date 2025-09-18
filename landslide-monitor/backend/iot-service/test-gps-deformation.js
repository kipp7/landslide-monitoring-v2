/**
 * GPS形变分析测试
 * 使用数据库中的基准点进行真实的GPS形变分析
 * 
 * @author 派派
 * @version 1.0
 * @date 2025-07-26
 */

const GPSDeformationService = require('./gps-deformation-service');

async function testDeformationAnalysis() {
    console.log('============================================================');
    console.log('GPS形变分析测试 - 使用数据库基准点');
    console.log('============================================================');
    
    try {
        // 创建服务实例
        const service = new GPSDeformationService({ autoInit: false });
        service.initializeBasicPatterns();
        
        console.log('\n1. 测试数据库连接...');
        await service.verifyDatabaseConnection();
        console.log('   ✅ 数据库连接成功');
        
        console.log('\n2. 查找有基准点的设备...');
        
        // 查找有基准点的设备
        const { data: baselineDevices, error: baselineError } = await service.supabase
            .from('gps_baselines')
            .select('device_id, baseline_latitude, baseline_longitude, established_by, notes')
            .eq('status', 'active')
            .limit(5);
            
        if (baselineError || !baselineDevices || baselineDevices.length === 0) {
            console.log('   ❌ 没有找到有基准点的设备');
            return;
        }
        
        console.log(`   ✅ 找到${baselineDevices.length}个有基准点的设备:`);
        baselineDevices.forEach((device, index) => {
            console.log(`      ${index + 1}. ${device.device_id}: (${device.baseline_latitude.toFixed(6)}, ${device.baseline_longitude.toFixed(6)}) - ${device.established_by}`);
        });
        
        const testDeviceId = baselineDevices[0].device_id;
        console.log(`\n   📍 使用设备: ${testDeviceId}`);
        
        console.log('\n3. 获取设备GPS数据...');
        
        const gpsData = await service.fetchGPSData(testDeviceId, { limit: 200 });
        console.log(`   ✅ 获取到${gpsData.length}条GPS数据`);
        
        if (gpsData.length < 50) {
            console.log(`   ⚠️  数据量较少(${gpsData.length}条)，建议至少50条数据进行分析`);
        }
        
        // 显示数据时间范围
        if (gpsData.length > 0) {
            const firstTime = new Date(gpsData[0].event_time);
            const lastTime = new Date(gpsData[gpsData.length - 1].event_time);
            const timeSpan = (lastTime - firstTime) / (1000 * 60 * 60); // 小时
            
            console.log(`   📅 数据时间范围: ${firstTime.toLocaleString()} ~ ${lastTime.toLocaleString()}`);
            console.log(`   ⏱️  时间跨度: ${timeSpan.toFixed(1)}小时`);
        }
        
        console.log('\n4. 执行GPS形变分析...');
        
        try {
            const startTime = Date.now();
            const preprocessedData = await service.preprocessGPSData(gpsData, testDeviceId);
            const processingTime = Date.now() - startTime;
            
            console.log(`   ✅ 数据预处理完成，用时${processingTime}ms`);
            console.log(`   📍 使用基准点: (${preprocessedData.baseline.latitude.toFixed(8)}, ${preprocessedData.baseline.longitude.toFixed(8)})`);
            console.log(`   📊 基准点来源: ${preprocessedData.baseline.source}`);
            console.log(`   📈 数据处理: ${gpsData.length}条原始 → ${preprocessedData.processed.length}条有效`);
            
            // 分析位移数据
            const displacements = preprocessedData.processed.map(d => d.displacement);
            const maxDisplacement = Math.max(...displacements);
            const minDisplacement = Math.min(...displacements);
            const avgDisplacement = displacements.reduce((sum, d) => sum + d, 0) / displacements.length;
            const stdDisplacement = Math.sqrt(displacements.reduce((sum, d) => sum + Math.pow(d - avgDisplacement, 2), 0) / displacements.length);
            
            console.log('\n   📏 位移统计分析:');
            console.log(`      最小位移: ${minDisplacement.toFixed(2)}mm (${(minDisplacement/1000).toFixed(3)}米)`);
            console.log(`      最大位移: ${maxDisplacement.toFixed(2)}mm (${(maxDisplacement/1000).toFixed(3)}米)`);
            console.log(`      平均位移: ${avgDisplacement.toFixed(2)}mm (${(avgDisplacement/1000).toFixed(3)}米)`);
            console.log(`      标准差: ${stdDisplacement.toFixed(2)}mm (${(stdDisplacement/1000).toFixed(3)}米)`);
            console.log(`      位移范围: ${(maxDisplacement - minDisplacement).toFixed(2)}mm`);
            
            // 位移合理性检查
            if (maxDisplacement <= 1000) { // 1米
                console.log('   ✅ 位移数据合理，在正常范围内');
            } else if (maxDisplacement <= 10000) { // 10米
                console.log('   ⚠️  位移数据较大，可能存在设备移动或数据质量问题');
            } else {
                console.log('   ❌ 位移数据异常，建议检查基准点设置或数据质量');
            }
            
            // 计算数据质量评分
            const qualityScore = service.calculateDataQualityScore(gpsData, preprocessedData.processed);
            console.log(`   📊 数据质量评分: ${qualityScore.toFixed(2)}/1.0`);
            
            console.log('\n5. 统计特征分析...');
            
            const statisticalFeatures = await service.extractStatisticalFeatures(preprocessedData);
            
            console.log(`   📊 基础统计:`);
            console.log(`      均值: ${statisticalFeatures.basic.mean.toFixed(2)}mm`);
            console.log(`      中位数: ${statisticalFeatures.basic.median.toFixed(2)}mm`);
            console.log(`      标准差: ${statisticalFeatures.basic.standardDeviation.toFixed(2)}mm`);
            console.log(`      偏度: ${statisticalFeatures.basic.skewness.toFixed(4)}`);
            console.log(`      峰度: ${statisticalFeatures.basic.kurtosis.toFixed(4)}`);
            console.log(`      变异系数: ${statisticalFeatures.basic.coefficientOfVariation.toFixed(4)}`);
            
            console.log(`   🔄 时域特征:`);
            console.log(`      波动率: ${statisticalFeatures.time.volatility.toFixed(4)}`);
            console.log(`      自相关: ${statisticalFeatures.time.autocorrelation.toFixed(4)}`);
            
            // 风险指标分析
            if (statisticalFeatures.summary.riskIndicators.length > 0) {
                console.log(`   ⚠️  风险指标: ${statisticalFeatures.summary.riskIndicators.join(', ')}`);
            } else {
                console.log(`   ✅ 未发现明显风险指标`);
            }
            
            console.log('\n6. DTW模式匹配分析...');
            
            const dtwResults = await service.performDTWAnalysis(testDeviceId, preprocessedData);
            
            console.log(`   🔍 模式匹配结果:`);
            console.log(`      总模式数: ${dtwResults.totalPatterns}`);
            console.log(`      匹配模式数: ${dtwResults.topMatches.length}`);
            console.log(`      匹配精度: ${dtwResults.accuracy.toFixed(4)}`);
            
            if (dtwResults.topMatches.length > 0) {
                console.log(`   🏆 最佳匹配:`);
                const bestMatch = dtwResults.topMatches[0];
                console.log(`      模式ID: ${bestMatch.patternId}`);
                console.log(`      相似度: ${bestMatch.similarity.toFixed(4)}`);
                console.log(`      风险等级: ${bestMatch.riskLevel}`);
            }
            
            console.log('\n7. 形变趋势分析...');
            
            const trendAnalysis = await service.analyzeTrends(preprocessedData);
            
            console.log(`   📈 趋势分析结果:`);
            console.log(`      趋势方向: ${trendAnalysis.trend}`);
            console.log(`      趋势幅度: ${trendAnalysis.magnitude.toFixed(2)}mm`);
            console.log(`      置信度: ${trendAnalysis.confidence.toFixed(2)}`);
            
            console.log('\n8. 风险评估...');
            
            const riskAssessment = await service.assessDeformationRisk(
                null, // CEEMD结果（简化测试中跳过）
                dtwResults,
                statisticalFeatures,
                trendAnalysis
            );
            
            console.log(`   🎯 风险评估结果:`);
            console.log(`      风险等级: ${riskAssessment.level}/4`);
            console.log(`      风险描述: ${riskAssessment.description}`);
            console.log(`      评估置信度: ${riskAssessment.confidence.toFixed(2)}`);
            
            console.log(`   📊 风险因子:`);
            console.log(`      最大位移: ${riskAssessment.factors.maxDisplacement.toFixed(2)}mm`);
            console.log(`      趋势幅度: ${riskAssessment.factors.trendMagnitude.toFixed(2)}mm`);
            console.log(`      模式相似度: ${riskAssessment.factors.patternSimilarity.toFixed(4)}`);
            
            console.log('\n============================================================');
            console.log('🎉 GPS形变分析测试完成！');
            console.log('============================================================');
            
            console.log('\n📋 分析总结:');
            console.log(`✅ 使用数据库基准点进行分析`);
            console.log(`✅ 处理了${gpsData.length}条GPS数据`);
            console.log(`✅ 位移计算${maxDisplacement <= 10000 ? '正常' : '异常'}`);
            console.log(`✅ 数据质量评分: ${qualityScore.toFixed(2)}`);
            console.log(`✅ 风险等级: ${riskAssessment.level} - ${riskAssessment.description}`);
            
            console.log('\n💡 分析建议:');
            if (maxDisplacement <= 1000) {
                console.log('• 设备位置稳定，形变在正常范围内');
            } else if (maxDisplacement <= 10000) {
                console.log('• 检测到一定程度的位移，建议持续监控');
            } else {
                console.log('• 检测到较大位移，建议立即检查设备和基准点设置');
            }
            
            if (riskAssessment.level >= 3) {
                console.log('• 风险等级较高，建议加强监控频率');
            }
            
            if (qualityScore < 0.8) {
                console.log('• 数据质量有待改善，建议检查设备状态');
            }
            
        } catch (error) {
            console.error(`   ❌ 形变分析失败: ${error.message}`);
            console.error(error.stack);
        }
        
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
if (require.main === module) {
    testDeformationAnalysis().catch(console.error);
}

module.exports = testDeformationAnalysis;
