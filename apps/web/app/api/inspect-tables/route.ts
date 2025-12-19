import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 开始检查数据库表结构...');

    // 表列表（根据代码分析得出）
    const tables = [
      'iot_data',
      'gps_baselines', 
      'devices_new',
      'monitoring_regions',
      'monitoring_networks',
      'device_mapping',
      'iot_anomalies',
      'baseline_quality_assessments',
      'iot_devices',
      'iot_device_locations',
      'monitoring_stations_view',
      'device_mapping_view',
      'chart_configurations',
      'station_config_history'
    ];

    const tableInfo: any = {};

    // 检查每个表
    for (const tableName of tables) {
      console.log(`📊 检查表: ${tableName}`);
      
      try {
        // 获取表结构（通过查询第一行来推断）
        const { data, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .limit(1);

        if (error) {
          tableInfo[tableName] = {
            exists: false,
            error: error.message,
            code: error.code
          };
          console.log(`❌ 表 ${tableName} 错误:`, error.message);
        } else {
          // 获取字段结构
          const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
          
          tableInfo[tableName] = {
            exists: true,
            rowCount: count || 0,
            columns: columns,
            hasData: (data && data.length > 0),
            sampleData: data && data.length > 0 ? data[0] : null
          };
          
          console.log(`✅ 表 ${tableName} - 行数: ${count}, 字段: ${columns.length}`);
        }
      } catch (err: any) {
        tableInfo[tableName] = {
          exists: false,
          error: err.message,
          type: 'exception'
        };
        console.log(`💥 表 ${tableName} 异常:`, err.message);
      }
    }

    // 尝试获取系统表信息
    const systemInfo: any = {};
    try {
      // 查询系统表信息（如果有权限）
      const { data: tablesList, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name, table_type')
        .eq('table_schema', 'public');

      if (!tablesError && tablesList) {
        systemInfo.allTables = tablesList;
      } else {
        systemInfo.tablesError = tablesError?.message;
      }
    } catch (err: any) {
      systemInfo.systemQueryError = err.message;
    }

    const summary = {
      totalTablesChecked: tables.length,
      existingTables: Object.keys(tableInfo).filter(t => tableInfo[t].exists).length,
      missingTables: Object.keys(tableInfo).filter(t => !tableInfo[t].exists).length,
      tablesWithData: Object.keys(tableInfo).filter(t => tableInfo[t].exists && tableInfo[t].rowCount > 0).length,
      emptyTables: Object.keys(tableInfo).filter(t => tableInfo[t].exists && tableInfo[t].rowCount === 0).length
    };

    console.log('📈 检查摘要:', summary);

    return NextResponse.json({
      success: true,
      summary,
      tableInfo,
      systemInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 检查数据库表失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '检查数据库表失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
