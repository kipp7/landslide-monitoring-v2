const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sdssoyyjhunltmcjoxtg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
);

async function checkCoordinates() {
  console.log('🗺️ 检查经纬度数据...\n');
  
  // 检查iot_data表中的经纬度
  const { data: iotData, error: iotError } = await supabase
    .from('iot_data')
    .select('device_id, latitude, longitude, event_time')
    .eq('device_id', 'device_1')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('event_time', { ascending: false })
    .limit(5);
    
  if (iotError) {
    console.error('❌ 查询iot_data经纬度失败:', iotError);
  } else {
    console.log('📊 iot_data表中的经纬度数据:');
    if (iotData.length === 0) {
      console.log('  没有找到经纬度数据');
    } else {
      iotData.forEach((d, i) => {
        console.log(`  ${i+1}. 时间: ${d.event_time}`);
        console.log(`     经度: ${d.longitude}`);
        console.log(`     纬度: ${d.latitude}`);
        console.log('');
      });
    }
  }
  
  // 检查device_mapping表
  const { data: mappingData, error: mappingError } = await supabase
    .from('device_mapping')
    .select('*')
    .eq('simple_id', 'device_1');
    
  if (mappingError) {
    console.error('❌ 查询device_mapping失败:', mappingError);
  } else {
    console.log('📍 device_mapping表中的设备信息:');
    if (mappingData.length === 0) {
      console.log('  没有找到设备映射信息');
    } else {
      mappingData.forEach((d, i) => {
        console.log(`  ${i+1}. 设备名称: ${d.device_name}`);
        console.log(`     位置名称: ${d.location_name}`);
        console.log(`     经度: ${d.longitude}`);
        console.log(`     纬度: ${d.latitude}`);
        console.log('');
      });
    }
  }
  
  // 检查最新的数据记录（包括经纬度）
  const { data: latestData, error: latestError } = await supabase
    .from('iot_data')
    .select('*')
    .eq('device_id', 'device_1')
    .order('event_time', { ascending: false })
    .limit(1);
    
  if (latestError) {
    console.error('❌ 查询最新数据失败:', latestError);
  } else {
    console.log('📈 最新的完整数据记录:');
    if (latestData.length > 0) {
      const latest = latestData[0];
      console.log(`  设备ID: ${latest.device_id}`);
      console.log(`  时间: ${latest.event_time}`);
      console.log(`  温度: ${latest.temperature}°C`);
      console.log(`  湿度: ${latest.humidity}%`);
      console.log(`  经度: ${latest.longitude || '无'}`);
      console.log(`  纬度: ${latest.latitude || '无'}`);
    }
  }
}

checkCoordinates().catch(console.error);
