import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

/**
 * 获取基准点质量评估
 * GET /api/baselines/[deviceId]/quality-assessment
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('📊 获取基准点质量评估，deviceId:', deviceId);

    // 首先检查是否有基准点
    const { data: baseline, error: baselineError } = await supabase
      .from('gps_baselines')
      .select('*')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .single();

    if (baselineError || !baseline) {
      return NextResponse.json({
        success: false,
        error: '该设备没有活跃的基准点',
        hasBaseline: false
      });
    }

    // 获取最近的质量评估记录
    const { data: qualityRecord, error: qualityError } = await supabase
      .from('baseline_quality_assessments')
      .select('*')
      .eq('device_id', deviceId)
      .order('assessment_time', { ascending: false })
      .limit(1);

    if (qualityError) {
      console.error('获取质量评估记录失败:', qualityError);
    }

    // 如果没有质量评估记录或记录过旧，重新计算
    const latestAssessment = qualityRecord && qualityRecord.length > 0 ? qualityRecord[0] : null;
    const shouldRecalculate = !latestAssessment || 
      (new Date().getTime() - new Date(latestAssessment.assessment_time).getTime()) > 24 * 60 * 60 * 1000; // 24小时

    if (shouldRecalculate) {
      console.log('🔄 重新计算质量评估...');
      
      // 调用数据库函数进行质量评估
      const { data: functionResult, error: functionError } = await supabase
        .rpc('assess_baseline_quality_simple', {
          p_device_id: deviceId,
          p_analysis_hours: 24
        });

      if (functionError) {
        console.error('质量评估函数调用失败:', functionError);
        
        // 如果函数调用失败，返回基础评估
        const basicAssessment = await calculateBasicQuality(deviceId, baseline);
        return NextResponse.json({
          success: true,
          data: basicAssessment,
          source: 'basic_calculation'
        });
      }

      // 解析函数结果并创建标准格式
      const assessment = parseAssessmentResult(functionResult, baseline);
      
      return NextResponse.json({
        success: true,
        data: assessment,
        source: 'database_function'
      });
    }

    // 返回已有的评估记录
    const assessment = formatStoredAssessment(latestAssessment, baseline);
    
    return NextResponse.json({
      success: true,
      data: assessment,
      source: 'stored_record'
    });

  } catch (error) {
    console.error(`获取设备${deviceId}质量评估失败:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取质量评估失败'
    }, { status: 500 });
  }
}

// 计算基础质量评估
async function calculateBasicQuality(deviceId: string, baseline: any) {
  try {
    // 获取最近24小时的数据
    const { data: recentData, error } = await supabase
      .from('iot_data')
      .select('latitude, longitude, event_time')
      .eq('device_id', deviceId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('event_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('event_time', { ascending: false })
      .limit(100);

    if (error || !recentData || recentData.length < 5) {
      return {
        overallScore: 0.5,
        qualityGrade: 'poor',
        stabilityScore: 0.5,
        dataQualityScore: 0.3,
        precisionScore: baseline.position_accuracy ? 
          (baseline.position_accuracy <= 2.0 ? 0.8 : 0.5) : 0.5,
        recommendations: ['数据不足，建议增加监测时间', '检查设备连接状态']
      };
    }

    // 计算与基准点的距离
    const distances = recentData.map(d => calculateDistance(
      parseFloat(d.latitude), parseFloat(d.longitude),
      baseline.baseline_latitude, baseline.baseline_longitude
    ));

    const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const maxDistance = Math.max(...distances);
    const within2m = distances.filter(d => d <= 2.0).length / distances.length;

    // 评分计算
    const stabilityScore = avgDistance <= 1.0 ? 0.95 : 
                          avgDistance <= 2.0 ? 0.85 :
                          avgDistance <= 5.0 ? 0.70 : 0.50;

    const dataQualityScore = recentData.length >= 50 && within2m >= 0.8 ? 0.90 :
                            recentData.length >= 20 && within2m >= 0.6 ? 0.75 : 0.60;

    const precisionScore = baseline.position_accuracy <= 1.0 ? 0.95 :
                          baseline.position_accuracy <= 2.0 ? 0.85 :
                          baseline.position_accuracy <= 5.0 ? 0.70 : 0.50;

    const overallScore = (stabilityScore * 0.4 + dataQualityScore * 0.35 + precisionScore * 0.25);

    const qualityGrade = overallScore >= 0.90 ? 'excellent' :
                        overallScore >= 0.80 ? 'good' :
                        overallScore >= 0.65 ? 'fair' :
                        overallScore >= 0.50 ? 'poor' : 'critical';

    const recommendations = [];
    if (stabilityScore < 0.70) recommendations.push('基准点稳定性不佳，建议重新选择稳定期数据');
    if (dataQualityScore < 0.70) recommendations.push('数据量或质量不足，建议延长采集时间');
    if (precisionScore < 0.70) recommendations.push('GPS精度不足，检查设备位置和信号质量');
    if (recommendations.length === 0) recommendations.push('基准点质量良好，建议定期监控');

    return {
      overallScore,
      qualityGrade,
      stabilityScore,
      dataQualityScore,
      precisionScore,
      avgDistance,
      maxDistance,
      within2mPercent: within2m * 100,
      dataPointsAnalyzed: recentData.length,
      recommendations
    };

  } catch (error) {
    console.error('基础质量计算失败:', error);
    return {
      overallScore: 0.5,
      qualityGrade: 'unknown',
      stabilityScore: 0.5,
      dataQualityScore: 0.5,
      precisionScore: 0.5,
      recommendations: ['质量评估计算失败，请检查数据连接']
    };
  }
}

// 解析数据库函数结果
function parseAssessmentResult(functionResult: string, baseline: any) {
  try {
    // 解析函数返回的文本结果
    const resultText = functionResult || '';
    const grade = resultText.includes('excellent') ? 'excellent' :
                  resultText.includes('good') ? 'good' :
                  resultText.includes('fair') ? 'fair' :
                  resultText.includes('poor') ? 'poor' : 'critical';

    const score = grade === 'excellent' ? 0.95 :
                  grade === 'good' ? 0.85 :
                  grade === 'fair' ? 0.70 :
                  grade === 'poor' ? 0.55 : 0.30;

    return {
      overallScore: score,
      qualityGrade: grade,
      stabilityScore: score,
      dataQualityScore: score * 0.9,
      precisionScore: baseline.position_accuracy <= 2.0 ? 0.9 : 0.7,
      recommendations: [resultText]
    };
  } catch (error) {
    return {
      overallScore: 0.5,
      qualityGrade: 'unknown',
      stabilityScore: 0.5,
      dataQualityScore: 0.5,
      precisionScore: 0.5,
      recommendations: ['解析评估结果失败']
    };
  }
}

// 格式化存储的评估记录
function formatStoredAssessment(record: any, baseline: any) {
  return {
    overallScore: record.confidence_score || 0.5,
    qualityGrade: record.overall_grade || 'unknown',
    stabilityScore: record.stability_score || 0.5,
    dataQualityScore: record.data_quality_score || 0.5,
    precisionScore: baseline.position_accuracy <= 2.0 ? 0.9 : 0.7,
    recommendations: record.recommendations || ['无具体建议'],
    assessmentTime: record.assessment_time,
    dataPointsAnalyzed: record.data_points_analyzed,
    algorithmVersion: record.algorithm_version
  };
}

// 计算两点间距离(米)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // 地球半径(米)
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}
