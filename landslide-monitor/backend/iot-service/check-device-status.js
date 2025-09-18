const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkDeviceStatus() {
  console.log('🔍 检查设备状态...\n');

  try {
    // 1. 检查设备表中的设备状态
    const { data: devices, error: devicesError } = await supabase
      .from('iot_devices')
      .select('device_id, friendly_name, last_active');

    if (devicesError) {
      console.error('❌ 查询设备失败:', devicesError);
      return;
    }

    console.log('📱 设备状态:');
    devices.forEach(device => {
      const lastActive = new Date(device.last_active);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - lastActive.getTime()) / 60000);
      const status = diffMinutes > 5 ? '🔴 离线' : '🟢 在线';
      
      console.log(`  ${device.device_id} (${device.friendly_name}): ${status} - 最后活跃 ${diffMinutes} 分钟前`);
      console.log(`    最后活跃时间: ${lastActive.toLocaleString()}`);
    });

    // 2. 检查最新的数据记录
    const { data: latestData, error: dataError } = await supabase
      .from('iot_data')
      .select('device_id, event_time')
      .order('event_time', { ascending: false })
      .limit(10);

    if (dataError) {
      console.error('❌ 查询数据失败:', dataError);
      return;
    }

    console.log('\n📊 最新数据记录:');
    latestData.forEach((record, index) => {
      const time = new Date(record.event_time);
      const diffMinutes = Math.floor((Date.now() - time.getTime()) / 60000);
      console.log(`  ${index + 1}. ${record.device_id}: ${time.toLocaleString()} (${diffMinutes} 分钟前)`);
    });

    // 3. 检查离线异常记录
    const { data: offlineAnomalies, error: anomaliesError } = await supabase
      .from('iot_anomalies')
      .select('*')
      .eq('anomaly_type', 'device_offline')
      .order('event_time', { ascending: false })
      .limit(5);

    if (anomaliesError) {
      console.error('❌ 查询离线异常失败:', anomaliesError);
      return;
    }

    console.log('\n⚠️  最近的离线异常记录:');
    if (offlineAnomalies.length === 0) {
      console.log('  无离线异常记录');
    } else {
      offlineAnomalies.forEach((anomaly, index) => {
        const time = new Date(anomaly.event_time);
        const offlineMinutes = Math.floor(anomaly.value / 60);
        console.log(`  ${index + 1}. ${anomaly.device_id}: ${time.toLocaleString()} - 离线 ${offlineMinutes} 分钟`);
      });
    }

    // 4. 分析问题
    console.log('\n🔍 分析:');
    const now = new Date();
    const offlineThreshold = 5; // 5分钟

    devices.forEach(device => {
      const lastActive = new Date(device.last_active);
      const diffMinutes = Math.floor((now.getTime() - lastActive.getTime()) / 60000);
      
      if (diffMinutes > offlineThreshold) {
        console.log(`❌ ${device.device_id} 被判定为离线 (${diffMinutes} 分钟无活动)`);
        
        // 检查是否有最新数据但last_active没更新
        const latestForDevice = latestData.find(d => d.device_id === device.device_id);
        if (latestForDevice) {
          const dataTime = new Date(latestForDevice.event_time);
          const dataMinutes = Math.floor((now.getTime() - dataTime.getTime()) / 60000);
          console.log(`  但是有 ${dataMinutes} 分钟前的数据记录`);
          
          if (dataMinutes < offlineThreshold) {
            console.log(`  ⚠️  问题：设备有新数据但last_active字段没有更新！`);
          }
        }
      } else {
        console.log(`✅ ${device.device_id} 正常在线`);
      }
    });

  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error);
  }
}

checkDeviceStatus();
