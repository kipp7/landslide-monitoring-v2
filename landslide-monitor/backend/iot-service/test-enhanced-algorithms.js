// 测试增强的数据预处理和DTW算法
// 使用Node.js 18+内置的fetch API

const GPSDeformationService = require('./gps-deformation-service');

async function testEnhancedAlgorithms() {
    console.log('🧪 测试增强的GPS形变算法...\n');

    try {
        // 初始化服务
        const gpsService = new GPSDeformationService();
        // GPS服务会在构造函数中自动初始化

        // 1. 测试数据预处理增强功能
        console.log('1. 测试数据预处理增强功能...');
        await testDataPreprocessing(gpsService);

        // 2. 测试DTW算法优化
        console.log('\n2. 测试DTW算法优化...');
        await testDTWOptimization(gpsService);

        // 3. 测试模式学习功能
        console.log('\n3. 测试模式学习功能...');
        await testPatternLearning(gpsService);

        console.log('\n🎉 所有测试完成！');

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        console.error(error.stack);
    }
}

/**
 * 测试数据预处理增强功能
 */
async function testDataPreprocessing(gpsService) {
    // 生成测试数据（包含异常值和噪声）
    const testData = generateTestGPSData();
    
    console.log(`   📊 原始数据: ${testData.length}个点`);
    
    // 测试异常值检测
    const cleanedData = gpsService.removeOutliers(testData);
    console.log(`   🧹 异常值检测: 移除${testData.length - cleanedData.length}个异常点`);
    
    // 测试数据插值
    const interpolatedData = gpsService.interpolateMissingData(cleanedData);
    console.log(`   📈 数据插值: ${interpolatedData.length}个点`);
    
    // 测试平滑滤波
    const smoothedData = gpsService.applySmoothingFilter(interpolatedData);
    console.log(`   🎯 平滑滤波: ${smoothedData.length}个点`);
    
    // 测试不同滤波方法
    console.log('   🔬 测试不同滤波方法:');
    
    const movingAvg = gpsService.applyMovingAverageFilter(testData, 5);
    console.log(`      - 移动平均滤波: ${movingAvg.length}个点`);
    
    const gaussian = gpsService.applyGaussianFilter(testData, 7, 1.5);
    console.log(`      - 高斯滤波: ${gaussian.length}个点`);
    
    const kalman = gpsService.applyKalmanFilter(testData);
    console.log(`      - 卡尔曼滤波: ${kalman.length}个点`);
    
    console.log('   ✅ 数据预处理测试完成');
}

/**
 * 测试DTW算法优化
 */
async function testDTWOptimization(gpsService) {
    // 生成两个测试序列
    const seq1 = generateTestSequence(50, 'linear');
    const seq2 = generateTestSequence(60, 'linear_noisy');
    
    console.log(`   📊 序列1长度: ${seq1.length}, 序列2长度: ${seq2.length}`);
    
    // 测试标准DTW
    const startTime1 = Date.now();
    const dtwDistance = gpsService.calculateDTWDistance(seq1, seq2);
    const dtwTime = Date.now() - startTime1;
    console.log(`   🔄 标准DTW距离: ${dtwDistance.toFixed(4)}, 耗时: ${dtwTime}ms`);
    
    // 测试FastDTW
    const startTime2 = Date.now();
    const fastDtwDistance = gpsService.calculateFastDTWDistance(seq1, seq2);
    const fastDtwTime = Date.now() - startTime2;
    console.log(`   ⚡ FastDTW距离: ${fastDtwDistance.toFixed(4)}, 耗时: ${fastDtwTime}ms`);
    
    // 测试相似度计算
    const similarity = gpsService.calculateSimilarityScore(dtwDistance, seq1.length, seq2.length);
    console.log(`   📈 相似度评分: ${(similarity * 100).toFixed(1)}%`);
    
    // 测试长序列性能
    const longSeq1 = generateTestSequence(200, 'complex');
    const longSeq2 = generateTestSequence(180, 'complex');
    
    const startTime3 = Date.now();
    const longFastDtw = gpsService.calculateFastDTWDistance(longSeq1, longSeq2);
    const longFastDtwTime = Date.now() - startTime3;
    console.log(`   🚀 长序列FastDTW (${longSeq1.length}x${longSeq2.length}): ${longFastDtw.toFixed(4)}, 耗时: ${longFastDtwTime}ms`);
    
    console.log('   ✅ DTW算法优化测试完成');
}

/**
 * 测试模式学习功能
 */
async function testPatternLearning(gpsService) {
    // 生成测试模式
    const testPattern = generateTestSequence(30, 'trend');
    const mockPreprocessedData = {
        processed: testPattern.map((displacement, i) => ({
            displacement,
            confidence: 0.8 + Math.random() * 0.2,
            timestamp: new Date(Date.now() + i * 60000)
        }))
    };
    
    console.log(`   📊 测试模式长度: ${testPattern.length}`);
    
    // 测试模式价值评估
    const isWorthLearning = gpsService.isPatternWorthLearning(testPattern, mockPreprocessedData);
    console.log(`   🎯 模式价值评估: ${isWorthLearning ? '值得学习' : '不值得学习'}`);
    
    if (isWorthLearning) {
        // 测试模式特征分析
        const features = gpsService.analyzePatternFeatures(testPattern);
        console.log(`   🔍 模式特征:`);
        console.log(`      - 类型: ${features.type}`);
        console.log(`      - 趋势: ${features.trend.toFixed(4)}`);
        console.log(`      - 波动率: ${features.volatility.toFixed(4)}`);
        console.log(`      - 峰值数: ${features.peaks.length}`);
        console.log(`      - 变化点数: ${features.changePoints.length}`);
        
        // 测试模式学习
        await gpsService.learnCurrentPattern('test_device', testPattern, mockPreprocessedData);
        console.log(`   📚 模式学习完成`);
    }
    
    // 测试模式预测
    const mockTopMatches = [
        {
            patternId: 'test_pattern',
            similarity: 0.85,
            metadata: { type: 'trend' }
        }
    ];
    
    const prediction = gpsService.predictFromPatterns(mockTopMatches, testPattern);
    console.log(`   🔮 模式预测:`);
    console.log(`      - 预测步数: ${prediction.steps}`);
    console.log(`      - 置信度: ${(prediction.confidence * 100).toFixed(1)}%`);
    console.log(`      - 方法: ${prediction.method}`);
    
    console.log('   ✅ 模式学习测试完成');
}

/**
 * 生成测试GPS数据
 */
function generateTestGPSData() {
    const data = [];
    const baseTime = new Date();
    
    for (let i = 0; i < 100; i++) {
        const timestamp = new Date(baseTime.getTime() + i * 60000); // 每分钟一个点
        
        // 基础位移（带趋势）
        let displacement = i * 0.1 + Math.sin(i * 0.1) * 2;
        
        // 添加噪声
        displacement += (Math.random() - 0.5) * 0.5;
        
        // 添加一些异常值
        if (i === 25 || i === 75) {
            displacement += 10; // 异常值
        }
        
        data.push({
            timestamp: timestamp,
            latitude: 39.9042 + Math.random() * 0.001,
            longitude: 116.4074 + Math.random() * 0.001,
            displacement: displacement,
            horizontal: displacement * 0.8,
            vertical: displacement * 0.2,
            confidence: 0.7 + Math.random() * 0.3
        });
    }
    
    return data;
}

/**
 * 生成测试序列
 */
function generateTestSequence(length, type) {
    const sequence = [];
    
    for (let i = 0; i < length; i++) {
        let value = 0;
        
        switch (type) {
            case 'linear':
                value = i * 0.1;
                break;
            case 'linear_noisy':
                value = i * 0.1 + (Math.random() - 0.5) * 0.2;
                break;
            case 'trend':
                value = i * 0.05 + Math.sin(i * 0.2) * 1.5;
                break;
            case 'complex':
                value = Math.sin(i * 0.1) * 2 + Math.cos(i * 0.05) * 1 + i * 0.02;
                break;
            default:
                value = Math.random();
        }
        
        sequence.push(value);
    }
    
    return sequence;
}

// 运行测试
if (require.main === module) {
    testEnhancedAlgorithms();
}

module.exports = { testEnhancedAlgorithms };
