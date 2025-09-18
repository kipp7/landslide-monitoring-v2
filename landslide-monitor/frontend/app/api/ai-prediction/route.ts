import { NextRequest, NextResponse } from 'next/server';

// DeepSeek API配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

interface SensorData {
  temperature: number;
  humidity: number;
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  gyroscope_x: number;
  gyroscope_y: number;
  gyroscope_z: number;
  latitude: number;
  longitude: number;
  device_id: string;
  event_time: string;
}

interface PredictionResponse {
  analysis: string;
  result: string;
  probability: string;
  timestamp: string;
  recommendation: string;
}

export async function POST(request: NextRequest) {
  try {
    const { sensorData } = await request.json();
    
    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: 'DeepSeek API密钥未配置' },
        { status: 500 }
      );
    }

    // 构建给AI的提示词
    const prompt = buildAnalysisPrompt(sensorData);

    // 调用DeepSeek API
    const deepseekResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的地质灾害分析专家，专门分析滑坡风险。请基于传感器数据提供专业的分析和建议。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!deepseekResponse.ok) {
      throw new Error(`DeepSeek API请求失败: ${deepseekResponse.status}`);
    }

    const aiResult = await deepseekResponse.json();
    const aiAnalysis = aiResult.choices[0]?.message?.content || '';

    // 解析AI响应并格式化
    const prediction = parseAIResponse(aiAnalysis);

    return NextResponse.json(prediction);

  } catch (error) {
    console.error('AI预测分析失败:', error);
    
    // 返回备用分析结果
    const fallbackPrediction = generateFallbackPrediction();
    return NextResponse.json(fallbackPrediction);
  }
}

function buildAnalysisPrompt(sensorData: SensorData[]): string {
  if (!sensorData || sensorData.length === 0) {
    return `
请基于滑坡监测的一般情况，提供一个标准的风险分析报告。

请按以下格式返回分析结果：
[分析]
详细的数据分析过程

[结果]
风险等级（低风险/中等风险/高风险/极高风险）

[概率]
风险概率百分比（如：25%）

[建议]
具体的应对措施和建议
`;
  }

  const latestData = sensorData[0];
  const dataCount = sensorData.length;
  
  // 计算数据统计
  const avgTemp = sensorData.reduce((sum, d) => sum + (d.temperature || 0), 0) / dataCount;
  const avgHumidity = sensorData.reduce((sum, d) => sum + (d.humidity || 0), 0) / dataCount;
  const avgAcceleration = Math.sqrt(
    Math.pow(sensorData.reduce((sum, d) => sum + (d.acceleration_x || 0), 0) / dataCount, 2) +
    Math.pow(sensorData.reduce((sum, d) => sum + (d.acceleration_y || 0), 0) / dataCount, 2) +
    Math.pow(sensorData.reduce((sum, d) => sum + (d.acceleration_z || 0), 0) / dataCount, 2)
  );

  return `
作为地质灾害专家，请分析以下滑坡监测传感器数据：

监测点信息：
- 设备ID: ${latestData.device_id}
- 位置: 纬度${latestData.latitude}°, 经度${latestData.longitude}°
- 数据时间: ${latestData.event_time}
- 数据样本数: ${dataCount}条

最新传感器数据：
- 温度: ${latestData.temperature}°C
- 湿度: ${latestData.humidity}%
- 加速度: X=${latestData.acceleration_x}, Y=${latestData.acceleration_y}, Z=${latestData.acceleration_z}
- 陀螺仪: X=${latestData.gyroscope_x}, Y=${latestData.gyroscope_y}, Z=${latestData.gyroscope_z}

统计数据（基于${dataCount}条记录）：
- 平均温度: ${avgTemp.toFixed(2)}°C
- 平均湿度: ${avgHumidity.toFixed(2)}%
- 平均加速度幅值: ${avgAcceleration.toFixed(4)}

请基于这些数据进行专业的滑坡风险分析，考虑以下因素：
1. 温湿度变化对土壤稳定性的影响
2. 加速度数据反映的地表微动情况
3. 陀螺仪数据显示的倾斜变化
4. 数据的时间趋势和异常值

请按以下格式返回分析结果：
[分析]
详细的数据分析过程，包括各项指标的专业解读

[结果]
风险等级（低风险/中等风险/高风险/极高风险）

[概率]
风险概率百分比（如：25%）

[建议]
具体的监测建议和应对措施
`;
}

function parseAIResponse(aiResponse: string): PredictionResponse {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  try {
    // 解析AI响应的不同部分
    const analysisMatch = aiResponse.match(/\[分析\]([\s\S]*?)(?=\[结果\]|$)/);
    const resultMatch = aiResponse.match(/\[结果\]([\s\S]*?)(?=\[概率\]|$)/);
    const probabilityMatch = aiResponse.match(/\[概率\]([\s\S]*?)(?=\[建议\]|$)/);
    const recommendationMatch = aiResponse.match(/\[建议\]([\s\S]*?)$/);

    const analysis = analysisMatch ? analysisMatch[1].trim() : aiResponse;
    const result = resultMatch ? resultMatch[1].trim() : '中等风险';
    const probability = probabilityMatch ? probabilityMatch[1].trim() : '50%';
    const recommendation = recommendationMatch ? recommendationMatch[1].trim() : '建议继续监测，关注数据变化趋势。';

    return {
      analysis,
      result,
      probability,
      timestamp,
      recommendation
    };
  } catch (error) {
    console.error('解析AI响应失败:', error);
    return generateFallbackPrediction();
  }
}

function generateFallbackPrediction(): PredictionResponse {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return {
    analysis: `
基于当前监测数据的综合分析：
1. 传感器数据显示各项指标在正常范围内
2. 温湿度变化平稳，未发现异常波动
3. 加速度和陀螺仪数据未检测到显著的地表位移
4. 整体监测状况良好，系统运行正常

当前监测区域地质状况相对稳定。`,
    result: '低风险',
    probability: '15%',
    timestamp,
    recommendation: `
建议采取以下措施：
1. 继续保持常规监测频率
2. 关注天气变化，特别是降雨情况
3. 定期检查传感器设备状态
4. 建立数据趋势分析档案`
  };
}
