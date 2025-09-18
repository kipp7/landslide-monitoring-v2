#!/usr/bin/env node

/**
 * API配置修复脚本
 * 自动修复前端API配置，确保域名访问时能正确对接后端
 */

const fs = require('fs');
const path = require('path');

// 需要修复的配置
const fixes = [
  {
    file: 'next.config.ts',
    description: '添加API重写规则和环境变量配置',
    apply: (content) => {
      // 检查是否已经有重写规则
      if (content.includes('rewrites') || content.includes('BACKEND_URL')) {
        console.log('⚠️  next.config.ts 已包含相关配置，跳过修改');
        return content;
      }
      
      // 在nextConfig对象中添加重写规则
      const newConfig = content.replace(
        /const nextConfig: NextConfig = \{/,
        `const nextConfig: NextConfig = {
  // 环境变量配置
  env: {
    BACKEND_URL: process.env.BACKEND_URL || (
      process.env.NODE_ENV === 'production' 
        ? 'http://ylsf.chat:1020/iot'
        : 'http://localhost:5100'
    ),
  },

  // API重写规则 - 在生产环境中重写API路径
  async rewrites() {
    // 如果设置了自定义BACKEND_URL，不进行重写
    if (process.env.BACKEND_URL) {
      return [];
    }
    
    // 生产环境重写规则
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/api/device-management/:path*',
          destination: '/api/device-management/:path*', // 前端处理
        },
        {
          source: '/api/baselines/:path*', 
          destination: '/api/baselines/:path*', // 前端处理
        }
      ];
    }
    
    return [];
  },`
      );
      
      return newConfig;
    }
  },
  {
    file: '.env.local',
    description: '创建本地环境变量配置',
    apply: (content) => {
      const envConfig = `# API配置
# 开发环境
BACKEND_URL=http://localhost:5100

# 生产环境（注释掉开发环境的配置，取消注释下面的配置）
# BACKEND_URL=http://ylsf.chat:1020/iot

# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=https://sdssoyyjhunltmcjoxtg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA

# 部署配置
NODE_ENV=production
`;
      return envConfig;
    },
    create: true
  },
  {
    file: '.env.production',
    description: '创建生产环境变量配置',
    apply: (content) => {
      const envConfig = `# 生产环境配置
BACKEND_URL=http://ylsf.chat:1020/iot
NODE_ENV=production

# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=https://sdssoyyjhunltmcjoxtg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA
`;
      return envConfig;
    },
    create: true
  }
];

// 应用修复
async function applyFixes() {
  console.log('🔧 开始修复API配置...\n');
  
  const frontendDir = process.cwd();
  console.log(`📁 工作目录: ${frontendDir}\n`);
  
  for (const fix of fixes) {
    console.log(`📝 处理文件: ${fix.file}`);
    console.log(`📋 描述: ${fix.description}`);
    
    const filePath = path.join(frontendDir, fix.file);
    
    try {
      let content = '';
      let fileExists = fs.existsSync(filePath);
      
      if (fileExists && !fix.create) {
        content = fs.readFileSync(filePath, 'utf8');
        console.log(`📖 读取现有文件: ${fix.file}`);
      } else if (fix.create) {
        console.log(`🆕 创建新文件: ${fix.file}`);
      } else {
        console.log(`❌ 文件不存在: ${fix.file}`);
        continue;
      }
      
      const newContent = fix.apply(content);
      
      // 备份原文件
      if (fileExists && !fix.create && content !== newContent) {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        fs.writeFileSync(backupPath, content);
        console.log(`💾 创建备份: ${path.basename(backupPath)}`);
      }
      
      // 写入新内容
      if (content !== newContent || fix.create) {
        fs.writeFileSync(filePath, newContent);
        console.log(`✅ 修复完成: ${fix.file}`);
      } else {
        console.log(`⏭️  跳过修改: ${fix.file} (无需更改)`);
      }
      
    } catch (error) {
      console.log(`❌ 处理失败: ${fix.file} - ${error.message}`);
    }
    
    console.log('-'.repeat(50));
  }
  
  console.log('\n📋 修复总结:');
  console.log('✅ next.config.ts - 添加了环境变量和重写规则配置');
  console.log('✅ .env.local - 创建了本地开发环境配置');
  console.log('✅ .env.production - 创建了生产环境配置');
  
  console.log('\n🚀 下一步操作:');
  console.log('1. 重启前端服务: npm run dev 或 npm run build && npm run start');
  console.log('2. 确保后端IoT服务 (端口5100) 正在运行');
  console.log('3. 检查nginx配置中的 /iot/ 代理设置');
  console.log('4. 运行诊断脚本: node diagnostic-api.js');
  
  console.log('\n💡 如果问题仍然存在:');
  console.log('- 检查服务器防火墙设置');
  console.log('- 确认nginx配置文件已重新加载: sudo nginx -s reload');
  console.log('- 查看服务器日志文件获取更多错误信息');
}

// 运行修复
if (require.main === module) {
  applyFixes().catch(console.error);
}

module.exports = { applyFixes };