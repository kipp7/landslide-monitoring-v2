const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 检查数据库中的设备数据
 */
async function checkDatabaseData() {
  console.log('🔍 检查数据库中的设备数据...\n');

  try {
    // 1. 检查 iot_data 表中的设备ID
    console.log('📊 检查 iot_data 表中的设备ID:');
    const { data: iotData, error: iotError } = await supabase
      .from('iot_data')
      .select('device_id')
      .order('event_time', { ascending: false })
      .limit(100);

    if (iotError) {
      console.error('❌ 查询 iot_data 失败:', iotError);
    } else {
      const deviceIds = [...new Set(iotData.map(record => record.device_id))];
      console.log(`找到 ${deviceIds.length} 个不同的设备ID:`);
      deviceIds.forEach((id, index) => {
        const count = iotData.filter(record => record.device_id === id).length;
        console.log(`  ${index + 1}. ${id} (${count} 条记录)`);
      });
    }

    console.log('');

    // 2. 检查 iot_devices 表
    console.log('📱 检查 iot_devices 表:');
    const { data: devicesData, error: devicesError } = await supabase
      .from('iot_devices')
      .select('*')
      .order('install_date', { ascending: false });

    if (devicesError) {
      console.error('❌ 查询 iot_devices 失败:', devicesError);
    } else {
      console.log(`找到 ${devicesData.length} 个注册设备:`);
      devicesData.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.device_id}`);
        console.log(`     友好名称: ${device.friendly_name || '未设置'}`);
        console.log(`     设备类型: ${device.device_type || '未知'}`);
        console.log(`     最后活跃: ${device.last_active || '未知'}`);
        console.log('');
      });
    }

    // 3. 检查 iot_anomalies 表
    console.log('⚠️  检查 iot_anomalies 表:');
    const { data: anomaliesData, error: anomaliesError } = await supabase
      .from('iot_anomalies')
      .select('device_id')
      .order('event_time', { ascending: false })
      .limit(50);

    if (anomaliesError) {
      console.error('❌ 查询 iot_anomalies 失败:', anomaliesError);
    } else {
      const anomalyDeviceIds = [...new Set(anomaliesData.map(record => record.device_id))];
      console.log(`异常记录中的设备ID (${anomalyDeviceIds.length} 个):`);
      anomalyDeviceIds.forEach((id, index) => {
        const count = anomaliesData.filter(record => record.device_id === id).length;
        console.log(`  ${index + 1}. ${id} (${count} 条异常记录)`);
      });
    }

    console.log('');

    // 4. 检查最新的数据记录
    console.log('📈 最新的数据记录:');
    const { data: latestData, error: latestError } = await supabase
      .from('iot_data')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(5);

    if (latestError) {
      console.error('❌ 查询最新数据失败:', latestError);
    } else {
      latestData.forEach((record, index) => {
        console.log(`  ${index + 1}. 设备: ${record.device_id}`);
        console.log(`     时间: ${record.event_time}`);
        console.log(`     温度: ${record.temperature}°C`);
        console.log(`     湿度: ${record.humidity}%`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ 检查数据库失败:', error);
  }
}

/**
 * 清理测试数据
 */
async function cleanTestData() {
  console.log('🧹 清理测试数据...\n');

  try {
    // 删除模拟设备的数据
    const testDevicePatterns = ['device_1', 'device_2', 'device_3', 'device_4', 'device_5'];
    
    for (const deviceId of testDevicePatterns) {
      console.log(`🗑️  删除设备 ${deviceId} 的数据...`);
      
      // 删除 iot_data 中的数据
      const { error: iotError } = await supabase
        .from('iot_data')
        .delete()
        .eq('device_id', deviceId);

      if (iotError) {
        console.error(`❌ 删除 iot_data 中的 ${deviceId} 失败:`, iotError);
      } else {
        console.log(`✅ 删除 iot_data 中的 ${deviceId} 成功`);
      }

      // 删除 iot_devices 中的数据
      const { error: devicesError } = await supabase
        .from('iot_devices')
        .delete()
        .eq('device_id', deviceId);

      if (devicesError) {
        console.error(`❌ 删除 iot_devices 中的 ${deviceId} 失败:`, devicesError);
      } else {
        console.log(`✅ 删除 iot_devices 中的 ${deviceId} 成功`);
      }

      // 删除 iot_anomalies 中的数据
      const { error: anomaliesError } = await supabase
        .from('iot_anomalies')
        .delete()
        .eq('device_id', deviceId);

      if (anomaliesError) {
        console.error(`❌ 删除 iot_anomalies 中的 ${deviceId} 失败:`, anomaliesError);
      } else {
        console.log(`✅ 删除 iot_anomalies 中的 ${deviceId} 成功`);
      }

      console.log('');
    }

    console.log('✅ 测试数据清理完成');

  } catch (error) {
    console.error('❌ 清理测试数据失败:', error);
  }
}

// 运行检查
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--clean')) {
    cleanTestData().then(() => {
      console.log('🎯 清理完成，重新检查数据...\n');
      checkDatabaseData();
    });
  } else {
    checkDatabaseData();
  }
}

module.exports = { checkDatabaseData, cleanTestData };
