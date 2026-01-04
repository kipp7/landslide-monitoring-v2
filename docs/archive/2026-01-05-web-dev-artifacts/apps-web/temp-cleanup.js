#!/usr/bin/env node

/**
 * 清理GPS监测页面文件的多余代码
 */

const fs = require('fs');

const filePath = 'app/gps-monitoring/page.tsx';

try {
  // 读取文件内容
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 按行分割
  const lines = content.split('\n');
  
  // 找到正确的结束位置 (第860行的 "}")
  let endIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i === 859 && lines[i].trim() === '}') { // 第860行 (索引859)
      endIndex = i;
      break;
    }
  }
  
  if (endIndex !== -1) {
    // 只保留到正确结束位置的内容
    const cleanContent = lines.slice(0, endIndex + 1).join('\n');
    
    // 写回文件
    fs.writeFileSync(filePath, cleanContent);
    console.log(`✅ 文件已清理，从 ${lines.length} 行缩减到 ${endIndex + 1} 行`);
  } else {
    console.log('❌ 未找到正确的结束位置');
  }
  
} catch (error) {
  console.error('清理文件时出错:', error.message);
}