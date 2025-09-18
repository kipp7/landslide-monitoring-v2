import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
);

/**
 * 基于最近数据自动建立基准点
 * POST /api/baselines/[deviceId]/auto-establish
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('🤖 自动建立基准点，deviceId:', deviceId);
    const body = await request.json();
    
    const {
      dataPoints = 20,
      establishedBy = '系统自动建立',
      notes = '基于最近数据自动建立的基准点'
    } = body;
    
    // 获取最近的GPS数据
    const { data: recentData, error: dataError } = await supabase
      .from('iot_data')
      .select('latitude, longitude, event_time')
      .eq('device_id', deviceId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('event_time', { ascending: false })
      .limit(dataPoints);
    
    if (dataError) {
      throw new Error(`获取GPS数据失败: ${dataError.message}`);
    }
    
    if (!recentData || recentData.length < 10) {
      return NextResponse.json({
        success: false,
        error: `数据点不足，需要至少10个点，当前只有${recentData?.length || 0}个点`
      }, { status: 400 });
    }
    
    // 过滤有效数据
    const validData = recentData.filter(d => 
      d.latitude && d.longitude && 
      Math.abs(d.latitude) <= 90 && 
      Math.abs(d.longitude) <= 180
    );
    
    if (validData.length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有有效的GPS数据'
      }, { status: 400 });
    }
    
    // 计算平均坐标
    const avgLatitude = validData.reduce((sum, d) => sum + parseFloat(d.latitude), 0) / validData.length;
    const avgLongitude = validData.reduce((sum, d) => sum + parseFloat(d.longitude), 0) / validData.length;
    
    // 计算位置精度（标准差）
    const latStd = Math.sqrt(
      validData.reduce((sum, d) => sum + Math.pow(parseFloat(d.latitude) - avgLatitude, 2), 0) / validData.length
    );
    const lonStd = Math.sqrt(
      validData.reduce((sum, d) => sum + Math.pow(parseFloat(d.longitude) - avgLongitude, 2), 0) / validData.length
    );
    const positionAccuracy = Math.max(latStd, lonStd) * 111000; // 转换为米
    
    // 创建基准点
    const { data: baselineData, error: baselineError } = await supabase
      .from('gps_baselines')
      .upsert({
        device_id: deviceId,
        baseline_latitude: avgLatitude,
        baseline_longitude: avgLongitude,
        established_by: establishedBy,
        data_points_used: validData.length,
        position_accuracy: positionAccuracy,
        confidence_level: 0.9, // 自动建立的基准点置信度稍低
        status: 'active',
        established_time: new Date().toISOString(),
        notes: `${notes}，使用${validData.length}个数据点，位置精度约${positionAccuracy.toFixed(2)}米`
      })
      .select()
      .single();
    
    if (baselineError) {
      throw new Error(`保存基准点失败: ${baselineError.message}`);
    }
    
    return NextResponse.json({
      success: true,
      data: baselineData,
      message: `基准点自动建立成功，使用了${validData.length}个数据点`,
      statistics: {
        dataPointsUsed: validData.length,
        positionAccuracy: positionAccuracy,
        timeRange: {
          start: validData[validData.length - 1].event_time,
          end: validData[0].event_time
        },
        coordinates: {
          latitude: avgLatitude,
          longitude: avgLongitude
        }
      }
    });
    
  } catch (error) {
    console.error(`自动建立设备${deviceId}基准点失败:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '自动建立基准点失败'
    }, { status: 500 });
  }
}
