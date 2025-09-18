const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 清理风险趋势表中的测试数据
 */
async function cleanTrendsData() {
  console.log('🧹 清理风险趋势表中的测试数据...\n');

  try {
    // 1. 查看当前风险趋势表中的数据
    const { data: trends, error: trendsError } = await supabase
      .from('iot_anomaly_trends')
      .select('device_id, event_time')
      .order('event_time', { ascending: false });

    if (trendsError) {
      console.error('❌ 查询风险趋势失败:', trendsError);
      return;
    }

    console.log(`📊 找到 ${trends.length} 条风险趋势记录`);
    
    // 统计设备ID
    const deviceIdCounts = {};
    trends.forEach(trend => {
      deviceIdCounts[trend.device_id] = (deviceIdCounts[trend.device_id] || 0) + 1;
    });

    console.log('📋 当前风险趋势中的设备ID分布:');
    Object.entries(deviceIdCounts).forEach(([deviceId, count]) => {
      console.log(`  ${deviceId}: ${count} 条记录`);
    });

    // 2. 定义要保留的设备ID（只保留真实设备）
    const keepDeviceIds = ['device_1'];
    
    // 定义要删除的设备ID
    const deleteDeviceIds = Object.keys(deviceIdCounts).filter(id => !keepDeviceIds.includes(id));

    console.log('\n✅ 保留的设备ID:');
    keepDeviceIds.forEach(id => {
      const count = deviceIdCounts[id] || 0;
      console.log(`  ${id} (${count} 条记录)`);
    });

    console.log('\n🗑️  要删除的设备ID:');
    deleteDeviceIds.forEach(id => {
      const count = deviceIdCounts[id] || 0;
      console.log(`  ${id} (${count} 条记录)`);
    });

    // 3. 删除测试数据
    let deletedCount = 0;
    for (const deviceId of deleteDeviceIds) {
      const { error: deleteError } = await supabase
        .from('iot_anomaly_trends')
        .delete()
        .eq('device_id', deviceId);

      if (deleteError) {
        console.error(`❌ 删除设备 ${deviceId} 的趋势数据失败:`, deleteError);
      } else {
        const recordCount = deviceIdCounts[deviceId] || 0;
        console.log(`✅ 删除设备 ${deviceId} 的趋势数据成功 (${recordCount} 条记录)`);
        deletedCount += recordCount;
      }
    }

    console.log(`\n🎉 清理完成！总共删除了 ${deletedCount} 条趋势记录`);

  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
  }
}

/**
 * 清理剩余的异常记录中的原始设备ID
 */
async function cleanRemainingAnomalies() {
  console.log('\n🧹 清理剩余的异常记录...\n');

  try {
    // 删除原始设备ID的异常记录
    const { error: deleteError } = await supabase
      .from('iot_anomalies')
      .delete()
      .eq('device_id', '6815a14f9314d118511807c6_rk2206');

    if (deleteError) {
      console.error('❌ 删除原始设备ID的异常记录失败:', deleteError);
    } else {
      console.log('✅ 删除原始设备ID的异常记录成功');
    }

  } catch (error) {
    console.error('❌ 清理异常记录失败:', error);
  }
}

/**
 * 验证清理结果
 */
async function verifyCleanup() {
  console.log('\n🔍 验证清理结果...\n');

  try {
    // 检查异常记录
    const { data: anomalies, error: anomaliesError } = await supabase
      .from('iot_anomalies')
      .select('device_id')
      .order('event_time', { ascending: false });

    if (anomaliesError) {
      console.error('❌ 查询异常记录失败:', anomaliesError);
    } else {
      const uniqueDevices = [...new Set(anomalies.map(a => a.device_id))];
      console.log(`⚠️  异常记录中的设备ID (${uniqueDevices.length} 个):`);
      uniqueDevices.forEach((deviceId, index) => {
        const count = anomalies.filter(a => a.device_id === deviceId).length;
        console.log(`  ${index + 1}. ${deviceId} (${count} 条记录)`);
      });
    }

    // 检查风险趋势
    const { data: trends, error: trendsError } = await supabase
      .from('iot_anomaly_trends')
      .select('device_id')
      .order('event_time', { ascending: false });

    if (trendsError) {
      console.error('❌ 查询风险趋势失败:', trendsError);
    } else {
      const uniqueTrendDevices = [...new Set(trends.map(t => t.device_id))];
      console.log(`\n📈 风险趋势中的设备ID (${uniqueTrendDevices.length} 个):`);
      uniqueTrendDevices.forEach((deviceId, index) => {
        const count = trends.filter(t => t.device_id === deviceId).length;
        console.log(`  ${index + 1}. ${deviceId} (${count} 条记录)`);
      });
    }

    // 检查数据记录
    const { data: iotData, error: iotDataError } = await supabase
      .from('iot_data')
      .select('device_id')
      .order('event_time', { ascending: false })
      .limit(10);

    if (iotDataError) {
      console.error('❌ 查询数据记录失败:', iotDataError);
    } else {
      const uniqueDataDevices = [...new Set(iotData.map(d => d.device_id))];
      console.log(`\n📊 数据记录中的设备ID (${uniqueDataDevices.length} 个):`);
      uniqueDataDevices.forEach((deviceId, index) => {
        const count = iotData.filter(d => d.device_id === deviceId).length;
        console.log(`  ${index + 1}. ${deviceId} (${count} 条记录)`);
      });
    }

  } catch (error) {
    console.error('❌ 验证过程中发生错误:', error);
  }
}

// 运行清理
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--verify-only')) {
    verifyCleanup();
  } else if (args.includes('--confirm')) {
    cleanTrendsData()
      .then(() => cleanRemainingAnomalies())
      .then(() => verifyCleanup());
  } else {
    console.log('⚠️  这将删除风险趋势表中的测试数据！');
    console.log('如果确认要清理，请运行: npm run clean:trends');
    console.log('如果只想查看当前状态，请运行: npm run clean:trends-verify');
  }
}

module.exports = { cleanTrendsData, cleanRemainingAnomalies, verifyCleanup };
