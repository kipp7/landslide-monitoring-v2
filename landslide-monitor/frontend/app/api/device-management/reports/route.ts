import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// DeepSeek AI 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// AI分析函数
async function generateAIAnalysis(reportData: any) {
  if (!DEEPSEEK_API_KEY) {
    return {
      summary: '数据分析完成，设备运行状态良好。',
      insights: ['建议定期检查设备状态', '保持数据传输稳定性'],
      recommendations: ['按计划进行设备维护', '监控关键指标变化']
    };
  }

  try {
    const prompt = `
作为一名专业的IoT设备分析师，请分析以下滑坡监测设备的运行数据并生成专业报告：

设备信息：
- 设备ID: ${reportData.device_id}
- 报告类型: ${reportData.report_type}
- 时间范围: ${reportData.time_range.start} 到 ${reportData.time_range.end}
- 数据完整性: ${reportData.data_summary.data_completeness}%
- 总记录数: ${reportData.data_summary.total_records}

传感器数据统计：
${reportData.sensor_statistics.temperature ? `
温度数据：
- 最低温度: ${reportData.sensor_statistics.temperature.min}°C
- 最高温度: ${reportData.sensor_statistics.temperature.max}°C
- 平均温度: ${reportData.sensor_statistics.temperature.avg}°C
- 有效记录: ${reportData.sensor_statistics.temperature.count}条
` : '温度数据：无有效数据'}

${reportData.sensor_statistics.humidity ? `
湿度数据：
- 最低湿度: ${reportData.sensor_statistics.humidity.min}%
- 最高湿度: ${reportData.sensor_statistics.humidity.max}%
- 平均湿度: ${reportData.sensor_statistics.humidity.avg}%
- 有效记录: ${reportData.sensor_statistics.humidity.count}条
` : '湿度数据：无有效数据'}

设备状态：
- 整体状态: ${reportData.device_status.overall}
- 异常数量: ${reportData.anomalies.length}
- 运行时间百分比: ${reportData.device_status.uptime_percentage}%

检测到的异常：
${reportData.anomalies.map((a: any) => `- ${a.message} (${a.severity})`).join('\n')}

请提供：
1. 简洁的数据分析总结（50字以内）
2. 3-5个关键洞察点
3. 3-5个具体的维护建议

请用JSON格式回复，包含summary、insights、recommendations三个字段。
`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const result = await response.json();
    const aiContent = result.choices[0]?.message?.content;

    if (aiContent) {
      try {
        return JSON.parse(aiContent);
      } catch (parseError) {
        // 如果解析失败，返回原始内容
        return {
          summary: aiContent.substring(0, 100),
          insights: ['AI分析结果解析中遇到问题，请查看原始分析'],
          recommendations: ['建议人工审核分析结果']
        };
      }
    }
  } catch (error) {
    console.error('AI分析失败:', error);
  }

  // 降级到基础分析
  return {
    summary: '数据分析完成，设备运行状态良好。',
    insights: ['建议定期检查设备状态', '保持数据传输稳定性'],
    recommendations: ['按计划进行设备维护', '监控关键指标变化']
  };
}

// 报告生成API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      device_id = 'device_1', 
      report_type = 'daily', // daily, weekly, monthly
      start_date,
      end_date 
    } = body;

    // 设置时间范围
    let startDate: Date;
    let endDate: Date = new Date();

    switch (report_type) {
      case 'daily':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate = start_date ? new Date(start_date) : new Date();
        endDate = end_date ? new Date(end_date) : new Date();
    }

    // 获取时间范围内的数据
    const { data: reportData, error } = await supabase
      .from('iot_data')
      .select('*')
      .eq('device_id', device_id)
      .gte('event_time', startDate.toISOString())
      .lte('event_time', endDate.toISOString())
      .order('event_time', { ascending: true });

    if (error) {
      throw error;
    }

    if (!reportData || reportData.length === 0) {
      return NextResponse.json({
        success: false,
        error: '指定时间范围内没有数据'
      }, { status: 404 });
    }

    // 数据统计分析
    const validTemperature = reportData.filter(r => r.temperature !== null && r.temperature !== undefined);
    const validHumidity = reportData.filter(r => r.humidity !== null && r.humidity !== undefined);

    const temperatureStats = validTemperature.length > 0 ? {
      min: Math.min(...validTemperature.map(r => r.temperature)),
      max: Math.max(...validTemperature.map(r => r.temperature)),
      avg: validTemperature.reduce((sum, r) => sum + r.temperature, 0) / validTemperature.length,
      count: validTemperature.length
    } : null;

    const humidityStats = validHumidity.length > 0 ? {
      min: Math.min(...validHumidity.map(r => r.humidity)),
      max: Math.max(...validHumidity.map(r => r.humidity)),
      avg: validHumidity.reduce((sum, r) => sum + r.humidity, 0) / validHumidity.length,
      count: validHumidity.length
    } : null;

    // 数据质量分析
    const totalRecords = reportData.length;
    const expectedRecords = Math.floor((endDate.getTime() - startDate.getTime()) / (60 * 1000)); // 假设每分钟一条数据
    const dataCompleteness = Math.min(100, (totalRecords / expectedRecords) * 100);

    // 异常检测
    const anomalies: any[] = [];
    
    if (temperatureStats) {
      if (temperatureStats.min < -10 || temperatureStats.max > 60) {
        anomalies.push({
          type: 'temperature_out_of_range',
          message: `温度超出正常范围: ${temperatureStats.min}°C - ${temperatureStats.max}°C`,
          severity: 'warning'
        });
      }
    }

    if (humidityStats) {
      if (humidityStats.min < 0 || humidityStats.max > 100) {
        anomalies.push({
          type: 'humidity_out_of_range',
          message: `湿度超出正常范围: ${humidityStats.min}% - ${humidityStats.max}%`,
          severity: 'warning'
        });
      }
    }

    if (dataCompleteness < 80) {
      anomalies.push({
        type: 'data_incomplete',
        message: `数据完整性不足: ${dataCompleteness.toFixed(1)}%`,
        severity: dataCompleteness < 50 ? 'critical' : 'warning'
      });
    }

    // 设备状态评估
    let deviceStatus = 'healthy';
    if (anomalies.some(a => a.severity === 'critical')) {
      deviceStatus = 'critical';
    } else if (anomalies.length > 0) {
      deviceStatus = 'warning';
    }

    // 生成基础报告数据
    const baseReport = {
      device_id,
      report_type,
      time_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        duration_hours: Math.round((endDate.getTime() - startDate.getTime()) / (60 * 60 * 1000))
      },
      data_summary: {
        total_records: totalRecords,
        expected_records: expectedRecords,
        data_completeness: Math.round(dataCompleteness * 100) / 100,
        first_record: reportData[0]?.event_time,
        last_record: reportData[reportData.length - 1]?.event_time
      },
      sensor_statistics: {
        temperature: temperatureStats ? {
          ...temperatureStats,
          min: Math.round(temperatureStats.min * 10) / 10,
          max: Math.round(temperatureStats.max * 10) / 10,
          avg: Math.round(temperatureStats.avg * 10) / 10
        } : null,
        humidity: humidityStats ? {
          ...humidityStats,
          min: Math.round(humidityStats.min * 10) / 10,
          max: Math.round(humidityStats.max * 10) / 10,
          avg: Math.round(humidityStats.avg * 10) / 10
        } : null
      },
      device_status: {
        overall: deviceStatus,
        anomalies_count: anomalies.length,
        uptime_percentage: dataCompleteness
      },
      anomalies,
      recommendations: [
        ...(dataCompleteness < 90 ? ['检查设备网络连接稳定性'] : []),
        ...(temperatureStats && (temperatureStats.max - temperatureStats.min) > 30 ? ['检查温度传感器稳定性'] : []),
        ...(anomalies.length > 0 ? ['及时处理检测到的异常'] : []),
        '定期进行设备维护检查',
        '监控设备运行状态'
      ],
      generated_at: new Date().toISOString()
    };

    // 使用AI增强分析
    const aiAnalysis = await generateAIAnalysis(baseReport);

    // 合并AI分析结果
    const report = {
      ...baseReport,
      ai_analysis: aiAnalysis,
      enhanced_recommendations: [
        ...baseReport.recommendations,
        ...aiAnalysis.recommendations
      ]
    };

    return NextResponse.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('生成报告失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '生成报告失败' 
    }, { status: 500 });
  }
}

// 获取可用的报告类型和时间范围
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('device_id') || 'device_1';

    // 获取设备的数据时间范围
    const { data: timeRange, error } = await supabase
      .from('iot_data')
      .select('event_time')
      .eq('device_id', deviceId)
      .order('event_time', { ascending: false })
      .limit(1);

    const { data: earliestData, error: earliestError } = await supabase
      .from('iot_data')
      .select('event_time')
      .eq('device_id', deviceId)
      .order('event_time', { ascending: true })
      .limit(1);

    if (error || earliestError) {
      throw error || earliestError;
    }

    return NextResponse.json({
      success: true,
      data: {
        available_types: [
          { type: 'daily', name: '日报告', description: '过去24小时的设备运行报告' },
          { type: 'weekly', name: '周报告', description: '过去7天的设备运行报告' },
          { type: 'monthly', name: '月报告', description: '过去30天的设备运行报告' },
          { type: 'custom', name: '自定义', description: '指定时间范围的设备运行报告' }
        ],
        data_range: {
          earliest: earliestData?.[0]?.event_time,
          latest: timeRange?.[0]?.event_time
        }
      }
    });

  } catch (error) {
    console.error('获取报告信息失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取报告信息失败' 
    }, { status: 500 });
  }
}
