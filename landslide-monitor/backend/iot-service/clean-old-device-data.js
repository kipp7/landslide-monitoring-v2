const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function cleanOldDeviceData() {
  console.log('🧹 清理旧的设备数据...\n');

  // 要删除的测试设备ID
  const testDevices = [
    'test',
    '1', 
    'sensor_rk2206',
    '6815a14f9314d118511807c6_rk2206'
  ];

  // 保留的真实设备ID
  const keepDevices = ['device_1'];

  console.log('🗑️  要删除的设备ID:');
  testDevices.forEach(id => console.log(`  - ${id}`));
  
  console.log('\n✅ 保留的设备ID:');
  keepDevices.forEach(id => console.log(`  - ${id}`));

  try {
    // 1. 清理 iot_data 表
    console.log('\n1️⃣ 清理 iot_data 表...');
    for (const deviceId of testDevices) {
      const { error } = await supabase
        .from('iot_data')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的数据失败:`, error.message);
      } else {
        console.log(`✅ 删除 ${deviceId} 的数据成功`);
      }
    }

    // 2. 清理 iot_devices 表
    console.log('\n2️⃣ 清理 iot_devices 表...');
    for (const deviceId of testDevices) {
      const { error } = await supabase
        .from('iot_devices')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的设备记录失败:`, error.message);
      } else {
        console.log(`✅ 删除 ${deviceId} 的设备记录成功`);
      }
    }

    // 3. 清理 iot_device_locations 表
    console.log('\n3️⃣ 清理 iot_device_locations 表...');
    for (const deviceId of testDevices) {
      const { error } = await supabase
        .from('iot_device_locations')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        console.error(`❌ 删除 ${deviceId} 的位置记录失败:`, error.message);
      } else {
        console.log(`✅ 删除 ${deviceId} 的位置记录成功`);
      }
    }

    console.log('\n🎉 清理完成！');

  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
  }
}

async function verifyCleanup() {
  console.log('\n🔍 验证清理结果...\n');

  try {
    // 检查剩余的设备ID
    const { data: iotData, error: iotDataError } = await supabase
      .from('iot_data')
      .select('device_id');

    if (iotDataError) {
      console.error('❌ 查询数据记录失败:', iotDataError);
    } else {
      const uniqueDevices = [...new Set(iotData.map(d => d.device_id))];
      console.log(`📊 剩余的设备ID (${uniqueDevices.length} 个):`);
      uniqueDevices.forEach((deviceId, index) => {
        const count = iotData.filter(d => d.device_id === deviceId).length;
        console.log(`  ${index + 1}. ${deviceId} (${count} 条记录)`);
      });
    }

    // 检查设备表
    const { data: devices, error: devicesError } = await supabase
      .from('iot_devices')
      .select('device_id, friendly_name');

    if (devicesError) {
      console.error('❌ 查询设备表失败:', devicesError);
    } else {
      console.log(`\n📱 设备表中的设备 (${devices.length} 个):`);
      devices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.device_id} (${device.friendly_name || '未命名'})`);
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
    cleanOldDeviceData().then(() => {
      verifyCleanup();
    });
  } else {
    console.log('⚠️  这将删除旧的测试设备数据！');
    console.log('如果确认要清理，请运行: node clean-old-device-data.js --confirm');
    console.log('如果只想查看当前状态，请运行: node clean-old-device-data.js --verify-only');
  }
}

module.exports = { cleanOldDeviceData, verifyCleanup };
