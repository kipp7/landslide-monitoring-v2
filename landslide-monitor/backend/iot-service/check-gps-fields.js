const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 检查GPS形变分析字段
 */
async function checkGpsFields() {
  console.log('🔍 检查GPS形变分析字段...\n');

  try {
    // 检查GPS和形变分析字段
    const testFields = [
      'latitude',
      'longitude',
      'deformation_distance_3d',
      'deformation_horizontal', 
      'deformation_vertical',
      'deformation_velocity',
      'deformation_risk_level',
      'deformation_type',
      'deformation_confidence',
      'baseline_established'
    ];

    console.log('📋 检查GPS形变分析字段:');
    let existingFields = [];
    let missingFields = [];

    for (const field of testFields) {
      try {
        const { data, error: fieldError } = await supabase
          .from('iot_data')
          .select(field)
          .limit(1);

        if (fieldError) {
          console.log(`   ❌ ${field}: 字段不存在或无法访问`);
          missingFields.push(field);
        } else {
          console.log(`   ✅ ${field}: 字段可用`);
          existingFields.push(field);
        }
      } catch (e) {
        console.log(`   ❌ ${field}: 检查失败 - ${e.message}`);
        missingFields.push(field);
      }
    }

    console.log('\n📊 字段检查结果:');
    console.log(`   ✅ 已存在字段: ${existingFields.length} 个`);
    console.log(`   ❌ 缺失字段: ${missingFields.length} 个`);

    if (missingFields.length > 0) {
      console.log('\n⚠️  需要添加的字段:');
      missingFields.forEach(field => {
        console.log(`   - ${field}`);
      });
      
      console.log('\n📝 建议操作:');
      console.log('   1. 在Supabase控制台中手动添加缺失的字段');
      console.log('   2. 或者使用SQL编辑器执行gps-deformation-migration.sql文件');
    } else {
      console.log('\n🎉 所有GPS形变分析字段都已存在！');
    }

    // 检查现有数据中是否有GPS坐标
    console.log('\n🌍 检查现有GPS数据:');
    const { data: gpsData, error: gpsError } = await supabase
      .from('iot_data')
      .select('latitude, longitude, event_time')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('event_time', { ascending: false })
      .limit(5);

    if (gpsError) {
      console.log('   ❌ 无法查询GPS数据');
    } else if (gpsData && gpsData.length > 0) {
      console.log(`   ✅ 找到 ${gpsData.length} 条包含GPS坐标的记录:`);
      gpsData.forEach((record, index) => {
        console.log(`   ${index + 1}. 纬度: ${record.latitude}, 经度: ${record.longitude} (${new Date(record.event_time).toLocaleString()})`);
      });
    } else {
      console.log('   ⚠️  暂无GPS坐标数据');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error);
  }
}

// 执行检查
if (require.main === module) {
  checkGpsFields()
    .then(() => {
      console.log('\n✨ 字段检查完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 字段检查失败:', error);
      process.exit(1);
    });
}

module.exports = { checkGpsFields };
