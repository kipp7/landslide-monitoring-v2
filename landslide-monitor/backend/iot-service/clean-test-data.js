const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 清理测试设备数据
 */
async function cleanTestDeviceData() {
  console.log('🧹 开始清理测试设备数据...\n');

  // 定义要清理的测试设备ID
  const testDeviceIds = [
    'test_device',
    'device_008',
    'device_007', 
    'device_006',
    'device_005',
    'device_004',
    'device_003',
    'device_002',
    'device_001',
    '67ca84a04c58cc795ad8e87e_13377035712'
  ];

  // 保留的真实设备ID
  const realDeviceIds = [
    '6815a14f9314d118511807c6_rk2206',
    'device_1' // 这个是映射后的简洁ID
  ];

  console.log('📋 要清理的测试设备:');
  testDeviceIds.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id}`);
  });

  console.log('\n✅ 保留的真实设备:');
  realDeviceIds.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id}`);
  });

  console.log('\n🗑️  开始清理...\n');

  try {
    // 1. 清理 iot_anomalies 表
    console.log('1️⃣ 清理 iot_anomalies 表...');
    for (const deviceId of testDeviceIds) {
      const { error } = await supabase
        .from('iot_anomalies')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的异常记录失败:`, error);
      } else {
        console.log(`✅ 删除 ${deviceId} 的异常记录成功`);
      }
    }

    // 2. 清理 iot_devices 表
    console.log('\n2️⃣ 清理 iot_devices 表...');
    for (const deviceId of testDeviceIds) {
      const { error } = await supabase
        .from('iot_devices')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的设备记录失败:`, error);
      } else {
        console.log(`✅ 删除 ${deviceId} 的设备记录成功`);
      }
    }

    // 3. 清理 iot_device_locations 表
    console.log('\n3️⃣ 清理 iot_device_locations 表...');
    for (const deviceId of testDeviceIds) {
      const { error } = await supabase
        .from('iot_device_locations')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的位置记录失败:`, error);
      } else {
        console.log(`✅ 删除 ${deviceId} 的位置记录成功`);
      }
    }

    // 4. 清理 iot_anomaly_trends 表
    console.log('\n4️⃣ 清理 iot_anomaly_trends 表...');
    for (const deviceId of testDeviceIds) {
      const { error } = await supabase
        .from('iot_anomaly_trends')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的趋势记录失败:`, error);
      } else {
        console.log(`✅ 删除 ${deviceId} 的趋势记录成功`);
      }
    }

    // 5. 清理 iot_data 表中的旧测试数据（保留device_1的数据）
    console.log('\n5️⃣ 清理 iot_data 表中的测试数据...');
    const testDataDeviceIds = testDeviceIds.filter(id => id !== 'device_1'); // 保留device_1
    
    for (const deviceId of testDataDeviceIds) {
      const { error } = await supabase
        .from('iot_data')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的数据记录失败:`, error);
      } else {
        console.log(`✅ 删除 ${deviceId} 的数据记录成功`);
      }
    }

    console.log('\n🎉 测试数据清理完成！');

  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
  }
}

/**
 * 验证清理结果
 */
async function verifyCleanup() {
  console.log('\n🔍 验证清理结果...\n');

  try {
    // 检查剩余的设备
    const { data: devices, error: devicesError } = await supabase
      .from('iot_devices')
      .select('device_id, friendly_name');

    if (devicesError) {
      console.error('❌ 查询设备失败:', devicesError);
    } else {
      console.log(`📱 剩余设备数量: ${devices.length}`);
      devices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.device_id} (${device.friendly_name || '未命名'})`);
      });
    }

    // 检查剩余的异常记录
    const { data: anomalies, error: anomaliesError } = await supabase
      .from('iot_anomalies')
      .select('device_id')
      .order('event_time', { ascending: false })
      .limit(10);

    if (anomaliesError) {
      console.error('❌ 查询异常记录失败:', anomaliesError);
    } else {
      const uniqueDevices = [...new Set(anomalies.map(a => a.device_id))];
      console.log(`\n⚠️  剩余异常记录涉及的设备: ${uniqueDevices.length} 个`);
      uniqueDevices.forEach((deviceId, index) => {
        console.log(`  ${index + 1}. ${deviceId}`);
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
      console.log(`\n📊 剩余数据记录涉及的设备: ${uniqueDataDevices.length} 个`);
      uniqueDataDevices.forEach((deviceId, index) => {
        console.log(`  ${index + 1}. ${deviceId}`);
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
    cleanTestDeviceData().then(() => {
      verifyCleanup();
    });
  } else {
    console.log('⚠️  这将删除测试设备的所有数据！');
    console.log('如果确认要清理，请运行: npm run clean:confirm');
    console.log('如果只想查看当前状态，请运行: npm run clean:verify');
  }
}

module.exports = { cleanTestDeviceData, verifyCleanup };
