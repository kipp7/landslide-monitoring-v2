const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 修复异常记录中的设备ID，将原始ID替换为简洁ID
 */
async function fixAnomalyDeviceIds() {
  console.log('🔧 修复异常记录中的设备ID...\n');

  try {
    // 1. 查看当前异常记录中的设备ID
    const { data: anomalies, error: anomaliesError } = await supabase
      .from('iot_anomalies')
      .select('id, device_id, event_time')
      .order('event_time', { ascending: false });

    if (anomaliesError) {
      console.error('❌ 查询异常记录失败:', anomaliesError);
      return;
    }

    console.log(`📊 找到 ${anomalies.length} 条异常记录`);
    
    // 统计设备ID
    const deviceIdCounts = {};
    anomalies.forEach(anomaly => {
      deviceIdCounts[anomaly.device_id] = (deviceIdCounts[anomaly.device_id] || 0) + 1;
    });

    console.log('📋 当前异常记录中的设备ID分布:');
    Object.entries(deviceIdCounts).forEach(([deviceId, count]) => {
      console.log(`  ${deviceId}: ${count} 条记录`);
    });

    // 2. 定义设备ID映射关系
    const deviceIdMapping = {
      '6815a14f9314d118511807c6_rk2206': 'device_1'
    };

    console.log('\n🔄 设备ID映射关系:');
    Object.entries(deviceIdMapping).forEach(([originalId, simpleId]) => {
      console.log(`  ${originalId} → ${simpleId}`);
    });

    // 3. 更新异常记录中的设备ID
    let updatedCount = 0;
    for (const [originalId, simpleId] of Object.entries(deviceIdMapping)) {
      const { error: updateError } = await supabase
        .from('iot_anomalies')
        .update({ device_id: simpleId })
        .eq('device_id', originalId);

      if (updateError) {
        console.error(`❌ 更新设备ID ${originalId} → ${simpleId} 失败:`, updateError);
      } else {
        const recordCount = deviceIdCounts[originalId] || 0;
        console.log(`✅ 更新设备ID ${originalId} → ${simpleId} 成功 (${recordCount} 条记录)`);
        updatedCount += recordCount;
      }
    }

    // 4. 同样更新风险趋势表
    console.log('\n🔄 更新风险趋势表中的设备ID...');
    for (const [originalId, simpleId] of Object.entries(deviceIdMapping)) {
      const { error: updateError } = await supabase
        .from('iot_anomaly_trends')
        .update({ device_id: simpleId })
        .eq('device_id', originalId);

      if (updateError) {
        console.error(`❌ 更新趋势表设备ID ${originalId} → ${simpleId} 失败:`, updateError);
      } else {
        console.log(`✅ 更新趋势表设备ID ${originalId} → ${simpleId} 成功`);
      }
    }

    console.log(`\n🎉 修复完成！总共更新了 ${updatedCount} 条异常记录`);

  } catch (error) {
    console.error('❌ 修复过程中发生错误:', error);
  }
}

/**
 * 验证修复结果
 */
async function verifyFix() {
  console.log('\n🔍 验证修复结果...\n');

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
        console.log(`  ${index + 1}. ${deviceId}`);
      });
    }

  } catch (error) {
    console.error('❌ 验证过程中发生错误:', error);
  }
}

// 运行修复
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--verify-only')) {
    verifyFix();
  } else if (args.includes('--confirm')) {
    fixAnomalyDeviceIds().then(() => {
      verifyFix();
    });
  } else {
    console.log('⚠️  这将修改异常记录中的设备ID！');
    console.log('如果确认要修复，请运行: npm run fix:device-ids');
    console.log('如果只想查看当前状态，请运行: npm run fix:verify');
  }
}

module.exports = { fixAnomalyDeviceIds, verifyFix };
