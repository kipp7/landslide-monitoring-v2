const fs = require('fs');
const path = require('path');

// 要处理的文件列表
const files = [
  'data-processor.js',
  'device-mapper.js'
];

// emoji替换映射
const emojiReplacements = {
  '🔄': '',
  '📱': '',
  '❌': '',
  '✅': '',
  '📍': '',
  '⚠️': '',
  '🔧': ''
};

function removeEmojisFromFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 替换所有emoji
    for (const [emoji, replacement] of Object.entries(emojiReplacements)) {
      if (content.includes(emoji)) {
        content = content.replace(new RegExp(emoji, 'g'), replacement);
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`已处理文件: ${filePath}`);
    } else {
      console.log(`文件无需处理: ${filePath}`);
    }
  } catch (error) {
    console.error(`处理文件 ${filePath} 时出错:`, error.message);
  }
}

// 处理所有文件
files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    removeEmojisFromFile(filePath);
  } else {
    console.log(`文件不存在: ${filePath}`);
  }
});

console.log('emoji清理完成！');
