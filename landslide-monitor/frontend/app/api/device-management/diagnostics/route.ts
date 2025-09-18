import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 诊断结果接口
interface DiagnosticResult {
  category: string;
  status: 'healthy' | 'warning' | 'critical';
  score: number;
  message: string;
  details?: string[];
  recommendations?: string[];
}

// 设备诊断API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_id = 'device_1' } = body;

    const diagnostics: DiagnosticResult[] = [];

    // 1. 数据连通性诊断
    const { data: recentData, error: dataError } = await supabase
      .from('iot_data')
      .select('*')
      .eq('device_id', device_id)
      .order('event_time', { ascending: false })
      .limit(10);

    if (dataError) {
      diagnostics.push({
        category: '数据连通性',
        status: 'critical',
        score: 0,
        message: '无法获取设备数据',
        details: [`数据库查询失败: ${dataError.message}`],
        recommendations: ['检查网络连接', '验证设备配置', '联系技术支持']
      });
    } else if (!recentData || recentData.length === 0) {
      diagnostics.push({
        category: '数据连通性',
        status: 'critical',
        score: 0,
        message: '设备无数据传输',
        details: ['最近10条记录为空', '设备可能离线或故障'],
        recommendations: ['检查设备电源', '检查网络连接', '重启设备']
      });
    } else {
      const latestRecord = recentData[0];
      const dataAge = Date.now() - new Date(latestRecord.event_time).getTime();
      const ageMinutes = Math.floor(dataAge / (60 * 1000));

      let connectivityStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let connectivityScore = 100;
      let connectivityMessage = '数据传输正常';

      if (ageMinutes > 10) {
        connectivityStatus = 'critical';
        connectivityScore = 0;
        connectivityMessage = `数据传输中断 ${ageMinutes} 分钟`;
      } else if (ageMinutes > 5) {
        connectivityStatus = 'warning';
        connectivityScore = 60;
        connectivityMessage = `数据传输延迟 ${ageMinutes} 分钟`;
      }

      diagnostics.push({
        category: '数据连通性',
        status: connectivityStatus,
        score: connectivityScore,
        message: connectivityMessage,
        details: [
          `最新数据时间: ${new Date(latestRecord.event_time).toLocaleString()}`,
          `数据延迟: ${ageMinutes} 分钟`,
          `最近10条记录完整性: ${recentData.length}/10`
        ]
      });
    }

    // 2. 传感器数据质量诊断
    if (recentData && recentData.length > 0) {
      const validTemperature = recentData.filter(r => r.temperature !== null && r.temperature !== undefined);
      const validHumidity = recentData.filter(r => r.humidity !== null && r.humidity !== undefined);
      
      const temperatureRange = validTemperature.length > 0 ? {
        min: Math.min(...validTemperature.map(r => r.temperature)),
        max: Math.max(...validTemperature.map(r => r.temperature))
      } : null;

      const humidityRange = validHumidity.length > 0 ? {
        min: Math.min(...validHumidity.map(r => r.humidity)),
        max: Math.max(...validHumidity.map(r => r.humidity))
      } : null;

      let sensorStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let sensorScore = 100;
      let sensorMessage = '传感器工作正常';
      const sensorDetails: string[] = [];
      const sensorRecommendations: string[] = [];

      // 温度传感器检查
      if (!temperatureRange) {
        sensorStatus = 'critical';
        sensorScore -= 50;
        sensorDetails.push('温度传感器无有效数据');
        sensorRecommendations.push('检查温度传感器连接');
      } else if (temperatureRange.max - temperatureRange.min > 50) {
        sensorStatus = 'warning';
        sensorScore -= 20;
        sensorDetails.push(`温度波动异常: ${temperatureRange.min}°C - ${temperatureRange.max}°C`);
        sensorRecommendations.push('检查温度传感器稳定性');
      } else {
        sensorDetails.push(`温度范围正常: ${temperatureRange.min}°C - ${temperatureRange.max}°C`);
      }

      // 湿度传感器检查
      if (!humidityRange) {
        sensorStatus = 'critical';
        sensorScore -= 50;
        sensorDetails.push('湿度传感器无有效数据');
        sensorRecommendations.push('检查湿度传感器连接');
      } else if (humidityRange.min < 0 || humidityRange.max > 100) {
        sensorStatus = 'warning';
        sensorScore -= 30;
        sensorDetails.push(`湿度数值异常: ${humidityRange.min}% - ${humidityRange.max}%`);
        sensorRecommendations.push('校准湿度传感器');
      } else {
        sensorDetails.push(`湿度范围正常: ${humidityRange.min}% - ${humidityRange.max}%`);
      }

      if (sensorScore < 70) {
        sensorMessage = '传感器存在异常';
      } else if (sensorScore < 90) {
        sensorMessage = '传感器工作基本正常';
      }

      diagnostics.push({
        category: '传感器质量',
        status: sensorStatus,
        score: Math.max(0, sensorScore),
        message: sensorMessage,
        details: sensorDetails,
        recommendations: sensorRecommendations.length > 0 ? sensorRecommendations : undefined
      });
    }

    // 3. 数据完整性诊断
    if (recentData && recentData.length > 0) {
      const requiredFields = ['temperature', 'humidity', 'event_time'];
      let completenessScore = 0;
      const completenessDetails: string[] = [];

      requiredFields.forEach(field => {
        const validCount = recentData.filter(r => r[field] !== null && r[field] !== undefined).length;
        const percentage = (validCount / recentData.length) * 100;
        completenessScore += percentage / requiredFields.length;
        completenessDetails.push(`${field}: ${validCount}/${recentData.length} (${percentage.toFixed(1)}%)`);
      });

      let completenessStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let completenessMessage = '数据完整性良好';

      if (completenessScore < 50) {
        completenessStatus = 'critical';
        completenessMessage = '数据完整性严重不足';
      } else if (completenessScore < 80) {
        completenessStatus = 'warning';
        completenessMessage = '数据完整性需要改善';
      }

      diagnostics.push({
        category: '数据完整性',
        status: completenessStatus,
        score: Math.round(completenessScore),
        message: completenessMessage,
        details: completenessDetails
      });
    }

    // 4. 计算总体健康度
    const overallScore = diagnostics.length > 0 
      ? Math.round(diagnostics.reduce((sum, d) => sum + d.score, 0) / diagnostics.length)
      : 0;

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (overallScore < 50) {
      overallStatus = 'critical';
    } else if (overallScore < 80) {
      overallStatus = 'warning';
    }

    return NextResponse.json({
      success: true,
      data: {
        device_id,
        overall_status: overallStatus,
        overall_score: overallScore,
        diagnostics,
        timestamp: new Date().toISOString(),
        recommendations: [
          '定期检查设备连接状态',
          '监控传感器数据质量',
          '及时处理异常告警',
          '按计划进行设备维护'
        ]
      }
    });

  } catch (error) {
    console.error('设备诊断失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '设备诊断失败' 
    }, { status: 500 });
  }
}
