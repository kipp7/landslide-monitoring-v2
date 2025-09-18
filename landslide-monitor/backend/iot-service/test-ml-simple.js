// 简化的机器学习预测测试
// 直接测试算法功能

console.log('🤖 开始机器学习预测算法测试...\n');

// 模拟时间序列数据
function generateTestData() {
    const data = [];
    const startTime = new Date();
    
    for (let i = 0; i < 100; i++) {
        const timestamp = new Date(startTime.getTime() + i * 60000);
        const trend = i * 0.01;
        const seasonal = Math.sin(i * 0.1) * 0.5;
        const noise = (Math.random() - 0.5) * 0.2;
        const deformation = trend + seasonal + noise;
        
        data.push({
            event_time: timestamp.toISOString(),
            deformation_distance_3d: deformation,
            latitude: 39.9042 + Math.random() * 0.001,
            longitude: 116.4074 + Math.random() * 0.001
        });
    }
    
    return data;
}

// 简化的统计函数
function mean(array) {
    return array.reduce((sum, val) => sum + val, 0) / array.length;
}

function std(array) {
    const avg = mean(array);
    const variance = array.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / array.length;
    return Math.sqrt(variance);
}

function calculateLinearTrend(sequence) {
    const n = sequence.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = sequence;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
}

// 简化的LSTM预测
function simpleLSTMPredict(timeSeries, steps = 24) {
    console.log('📊 运行简化LSTM预测...');
    
    const sequenceLength = Math.min(30, timeSeries.length);
    const lastSequence = timeSeries.slice(-sequenceLength);
    
    const predictions = [];
    
    for (let step = 1; step <= steps; step++) {
        const weights = lastSequence.map((_, idx) => Math.exp(idx / lastSequence.length));
        const weightedAvg = lastSequence.reduce((sum, val, idx) => sum + val * weights[idx], 0) / 
                           weights.reduce((sum, w) => sum + w, 0);
        
        const trend = calculateLinearTrend(lastSequence);
        const prediction = weightedAvg + trend * step;
        
        predictions.push(prediction);
        
        // 更新序列
        lastSequence.shift();
        lastSequence.push(prediction);
    }
    
    return {
        values: predictions,
        confidence: 0.8,
        method: 'Simplified_LSTM'
    };
}

// 简化的SVR预测
function simpleSVRPredict(timeSeries, steps = 24) {
    console.log('📈 运行简化SVR预测...');
    
    const windowSize = Math.min(10, timeSeries.length);
    const predictions = [];
    let currentSeries = [...timeSeries];
    
    for (let step = 1; step <= steps; step++) {
        const window = currentSeries.slice(-windowSize);
        const features = [
            ...window,
            mean(window),
            std(window),
            calculateLinearTrend(window)
        ];
        
        // 简化的线性预测
        const prediction = mean(window) + calculateLinearTrend(window) * step * 0.1;
        predictions.push(prediction);
        currentSeries.push(prediction);
    }
    
    return {
        values: predictions,
        confidence: 0.7,
        method: 'Simplified_SVR'
    };
}

// 简化的ARIMA预测
function simpleARIMAPredict(timeSeries, steps = 24) {
    console.log('📊 运行简化ARIMA预测...');
    
    // 计算一阶差分
    const diff = [];
    for (let i = 1; i < timeSeries.length; i++) {
        diff.push(timeSeries[i] - timeSeries[i-1]);
    }
    
    const predictions = [];
    const lastValue = timeSeries[timeSeries.length - 1];
    const avgDiff = mean(diff);
    
    for (let step = 1; step <= steps; step++) {
        const prediction = lastValue + avgDiff * step;
        predictions.push(prediction);
    }
    
    return {
        values: predictions,
        confidence: 0.6,
        method: 'Simplified_ARIMA'
    };
}

// 模型集成
function ensembleModels(predictions) {
    console.log('🔄 集成多个模型...');
    
    const models = Object.keys(predictions);
    const steps = predictions[models[0]].values.length;
    const ensemble = [];
    
    // 基于置信度的权重
    const totalConfidence = models.reduce((sum, model) => sum + predictions[model].confidence, 0);
    const weights = {};
    models.forEach(model => {
        weights[model] = predictions[model].confidence / totalConfidence;
    });
    
    for (let step = 0; step < steps; step++) {
        let weightedSum = 0;
        models.forEach(model => {
            weightedSum += predictions[model].values[step] * weights[model];
        });
        ensemble.push(weightedSum);
    }
    
    const avgConfidence = mean(models.map(model => predictions[model].confidence));
    
    return {
        values: ensemble,
        confidence: avgConfidence,
        method: 'Ensemble',
        weights: weights
    };
}

// 主测试函数
async function runTest() {
    try {
        // 1. 生成测试数据
        console.log('1. 生成测试数据...');
        const testData = generateTestData();
        const timeSeries = testData.map(d => d.deformation_distance_3d);
        console.log(`   ✅ 生成了${testData.length}个数据点`);
        console.log(`   📊 数据范围: ${Math.min(...timeSeries).toFixed(3)} ~ ${Math.max(...timeSeries).toFixed(3)}`);
        
        // 2. 数据统计
        console.log('\n2. 数据统计分析...');
        const stats = {
            mean: mean(timeSeries),
            std: std(timeSeries),
            trend: calculateLinearTrend(timeSeries)
        };
        console.log(`   📈 均值: ${stats.mean.toFixed(3)}`);
        console.log(`   📊 标准差: ${stats.std.toFixed(3)}`);
        console.log(`   📉 趋势: ${stats.trend.toFixed(6)}`);
        
        // 3. 运行各个模型
        console.log('\n3. 运行机器学习模型...');
        const predictions = {
            lstm: simpleLSTMPredict(timeSeries, 24),
            svr: simpleSVRPredict(timeSeries, 24),
            arima: simpleARIMAPredict(timeSeries, 24)
        };
        
        // 4. 模型集成
        console.log('\n4. 模型集成...');
        const ensemble = ensembleModels(predictions);
        
        // 5. 结果展示
        console.log('\n5. 预测结果:');
        console.log(`   🧠 LSTM: 置信度${(predictions.lstm.confidence * 100).toFixed(1)}%, 前5个值: [${predictions.lstm.values.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);
        console.log(`   📈 SVR: 置信度${(predictions.svr.confidence * 100).toFixed(1)}%, 前5个值: [${predictions.svr.values.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);
        console.log(`   📊 ARIMA: 置信度${(predictions.arima.confidence * 100).toFixed(1)}%, 前5个值: [${predictions.arima.values.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);
        console.log(`   🎯 集成: 置信度${(ensemble.confidence * 100).toFixed(1)}%, 前5个值: [${ensemble.values.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);
        
        // 6. 权重分析
        console.log('\n6. 模型权重:');
        Object.entries(ensemble.weights).forEach(([model, weight]) => {
            console.log(`   ${model.toUpperCase()}: ${(weight * 100).toFixed(1)}%`);
        });
        
        // 7. 趋势分析
        console.log('\n7. 预测趋势分析:');
        const firstValue = ensemble.values[0];
        const lastValue = ensemble.values[ensemble.values.length - 1];
        const predictedTrend = lastValue - firstValue;
        
        console.log(`   📊 预测起始值: ${firstValue.toFixed(3)}`);
        console.log(`   📈 预测结束值: ${lastValue.toFixed(3)}`);
        console.log(`   📉 预测趋势: ${predictedTrend > 0 ? '上升' : predictedTrend < 0 ? '下降' : '稳定'} (${predictedTrend.toFixed(3)})`);
        
        console.log('\n🎉 机器学习预测算法测试完成！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

// 运行测试
runTest();
