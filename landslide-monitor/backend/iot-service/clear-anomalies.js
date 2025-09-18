const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function clearAllAnomalies() {
  console.log('🧹 清空所有异常记录...');
  
  try {
    // 获取所有记录的ID
    const { data: allRecords, error: selectError } = await supabase
      .from('iot_anomalies')
      .select('id');
    
    if (selectError) {
      console.error('查询失败:', selectError);
      return;
    }
    
    console.log(`找到 ${allRecords.length} 条记录`);
    
    if (allRecords.length === 0) {
      console.log('✅ 异常表已经是空的');
      return;
    }
    
    // 分批删除
    const batchSize = 100;
    let deletedCount = 0;
    
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      const ids = batch.map(r => r.id);
      
      const { error: deleteError } = await supabase
        .from('iot_anomalies')
        .delete()
        .in('id', ids);
      
      if (deleteError) {
        console.error(`删除批次 ${i}-${i + batch.length} 失败:`, deleteError);
      } else {
        deletedCount += batch.length;
        console.log(`✅ 删除了 ${batch.length} 条记录 (总计: ${deletedCount}/${allRecords.length})`);
      }
    }
    
    // 验证结果
    const { data: remainingRecords, error: verifyError } = await supabase
      .from('iot_anomalies')
      .select('id');
    
    if (verifyError) {
      console.error('验证失败:', verifyError);
    } else {
      console.log(`🎉 清理完成！剩余记录: ${remainingRecords.length}`);
    }
    
  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
  }
}

clearAllAnomalies();
