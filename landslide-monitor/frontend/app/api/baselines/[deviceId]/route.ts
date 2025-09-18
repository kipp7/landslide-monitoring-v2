import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
);

/**
 * 获取指定设备的基准点
 * GET /api/baselines/[deviceId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('🔍 获取设备基准点，deviceId:', deviceId);

    const { data, error } = await supabase
      .from('gps_baselines')
      .select('*')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .single();

    if (error) {
      console.error(`获取设备${deviceId}基准点错误:`, error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          error: '该设备没有设置基准点',
          hasBaseline: false
        });
      }
      // 不要抛出错误，而是返回错误响应
      return NextResponse.json({
        success: false,
        error: `数据库查询失败: ${error.message}`,
        hasBaseline: false
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data,
      hasBaseline: true
    });

  } catch (error) {
    console.error(`获取设备${deviceId}基准点失败:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取基准点失败'
    }, { status: 500 });
  }
}

/**
 * 创建或更新设备基准点
 * POST /api/baselines/[deviceId]
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('🔧 设置设备基准点，deviceId:', deviceId);
    const body = await request.json();
    console.log('📝 请求参数:', body);

    const {
      latitude,
      longitude,
      altitude,
      establishedBy = '前端用户',
      notes,
      positionAccuracy,
      measurementDuration,
      satelliteCount,
      pdopValue
    } = body;

    console.log('📍 解析的坐标:', { latitude, longitude, type_lat: typeof latitude, type_lng: typeof longitude });

    // 验证必需参数
    if (!latitude || !longitude) {
      console.log('❌ 参数验证失败: 纬度或经度为空');
      return NextResponse.json({
        success: false,
        error: '纬度和经度是必需的参数',
        received: { latitude, longitude }
      }, { status: 400 });
    }
    
    // 验证坐标范围
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({
        success: false,
        error: '坐标值超出有效范围'
      }, { status: 400 });
    }
    
    // 先删除现有的基准点（如果存在）
    await supabase
      .from('gps_baselines')
      .delete()
      .eq('device_id', deviceId);

    // 然后插入新的基准点
    const { data, error } = await supabase
      .from('gps_baselines')
      .insert({
        device_id: deviceId,
        baseline_latitude: parseFloat(latitude),
        baseline_longitude: parseFloat(longitude),
        baseline_altitude: altitude ? parseFloat(altitude) : null,
        established_by: establishedBy,
        notes: notes,
        position_accuracy: positionAccuracy ? parseFloat(positionAccuracy) : null,
        measurement_duration: measurementDuration ? parseInt(measurementDuration) : null,
        satellite_count: satelliteCount ? parseInt(satelliteCount) : null,
        pdop_value: pdopValue ? parseFloat(pdopValue) : null,
        status: 'active',
        established_time: new Date().toISOString(),
        confidence_level: 0.95
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: '基准点设置成功'
    });
    
  } catch (error) {
    console.error(`设置设备${deviceId}基准点失败:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '基准点设置失败'
    }, { status: 500 });
  }
}

/**
 * 删除设备基准点
 * DELETE /api/baselines/[deviceId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('🗑️ 删除设备基准点，deviceId:', deviceId);
    
    const { error } = await supabase
      .from('gps_baselines')
      .delete()
      .eq('device_id', deviceId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json({
      success: true,
      message: '基准点删除成功'
    });
    
  } catch (error) {
    console.error(`删除设备${deviceId}基准点失败:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '基准点删除失败'
    }, { status: 500 });
  }
}
