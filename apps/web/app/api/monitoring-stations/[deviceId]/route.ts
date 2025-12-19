// 单个监测站管理API接口
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';

// 获取单个监测站信息
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;
    
    const { data, error } = await supabase
      .from('monitoring_stations_view')
      .select('*')
      .eq('device_id', deviceId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          message: `监测站 ${deviceId} 不存在`
        }, { status: 404 });
      }
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: '获取监测站信息成功'
    });
  } catch (error) {
    console.error(`获取监测站 ${(await params).deviceId} 信息失败:`, error);
    return NextResponse.json({
      success: false,
      message: '获取监测站信息失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 更新单个监测站信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;
    const updates = await request.json();
    
    // 验证必要字段
    if (updates.station_name && updates.station_name.trim().length === 0) {
      return NextResponse.json({
        success: false,
        message: '监测站名称不能为空'
      }, { status: 400 });
    }
    
    // 记录配置变更日志
    await logConfigChange(deviceId, updates, 'API_UPDATE');
    
    // 更新监测站信息
    const { data, error } = await supabase
      .from('devices_new')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('device_id', deviceId)
      .select('*')
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          message: `监测站 ${deviceId} 不存在`
        }, { status: 404 });
      }
      throw error;
    }
    
    // 如果更新了风险等级，同时更新相关IoT数据的风险评估
    if (updates.risk_level) {
      await updateIoTRiskLevels(deviceId, updates.risk_level);
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: `监测站 ${deviceId} 信息更新成功`
    });
  } catch (error) {
    console.error(`更新监测站 ${(await params).deviceId} 信息失败:`, error);
    return NextResponse.json({
      success: false,
      message: '更新监测站信息失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 删除监测站（谨慎操作）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;
    
    // 检查是否有相关的IoT数据
    const { data: iotDataCount } = await supabase
      .from('iot_data')
      .select('device_id', { count: 'exact' })
      .eq('device_id', deviceId);
    
    if (iotDataCount && iotDataCount.length > 0) {
      return NextResponse.json({
        success: false,
        message: `监测站 ${deviceId} 存在关联的IoT数据，无法删除。请先清理相关数据。`
      }, { status: 400 });
    }
    
    // 记录删除操作
    await logConfigChange(deviceId, { deleted: true }, 'API_DELETE');
    
    // 删除监测站
    const { error } = await supabase
      .from('devices_new')
      .delete()
      .eq('device_id', deviceId);
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      message: `监测站 ${deviceId} 删除成功`
    });
  } catch (error) {
    console.error(`删除监测站 ${(await params).deviceId} 失败:`, error);
    return NextResponse.json({
      success: false,
      message: '删除监测站失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 记录配置变更日志
async function logConfigChange(deviceId: string, updates: any, changedBy: string) {
  try {
    // 获取当前配置
    const { data: currentConfig } = await supabase
      .from('devices_new')
      .select('*')
      .eq('device_id', deviceId)
      .single();
    
    if (currentConfig) {
      // 记录每个字段的变更
      const logEntries = Object.entries(updates).map(([fieldName, newValue]) => ({
        device_id: deviceId,
        field_name: fieldName,
        old_value: currentConfig[fieldName]?.toString() || null,
        new_value: newValue?.toString() || null,
        changed_by: changedBy,
        change_reason: changedBy === 'API_DELETE' ? '监测站删除' : 'API配置更新'
      }));
      
      const { error } = await supabase
        .from('station_config_history')
        .insert(logEntries);
      
      if (error) {
        console.warn('记录配置变更日志失败:', error);
      }
    }
  } catch (error) {
    console.warn('记录配置变更日志失败:', error);
    // 不抛出错误，避免影响主要功能
  }
}

// 更新IoT数据的风险等级（基于新的监测站风险等级）
async function updateIoTRiskLevels(deviceId: string, newRiskLevel: string) {
  try {
    // 获取基础风险分数
    let baseRiskScore = 0.3;
    switch (newRiskLevel) {
      case 'critical':
        baseRiskScore = 0.9;
        break;
      case 'high':
        baseRiskScore = 0.7;
        break;
      case 'medium':
        baseRiskScore = 0.4;
        break;
      case 'low':
        baseRiskScore = 0.2;
        break;
    }
    
    // 更新最近7天的IoT数据风险等级（避免影响历史数据分析）
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { error } = await supabase
      .from('iot_data')
      .update({ risk_level: baseRiskScore })
      .eq('device_id', deviceId)
      .gte('event_time', sevenDaysAgo.toISOString());
    
    if (error) {
      console.warn(`更新设备 ${deviceId} 的IoT数据风险等级失败:`, error);
    }
  } catch (error) {
    console.warn(`更新设备 ${deviceId} 的IoT数据风险等级失败:`, error);
    // 不抛出错误，避免影响主要功能
  }
}
