/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workaround (Windows): avoid `.next/trace` permission/lock issues that can hang `next build`.
  distDir: '.next_web',
  // 抑制 React 版本兼容性警告
  onDemandEntries: {
    // 开发模式下的配置
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  
  // 抑制控制台警告
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // 在开发模式下抑制特定警告
      const originalEntry = config.entry;
      config.entry = async () => {
        const entries = await originalEntry();
        
        // 添加警告抑制
        if (entries['main.js'] && !entries['main.js'].includes('./suppress-warnings.js')) {
          entries['main.js'].unshift('./suppress-warnings.js');
        }
        
        return entries;
      };
    }
    
    return config;
  },
  
  // 实验性功能
  experimental: {
    // Next.js 15 支持的实验性功能
  },
};

module.exports = nextConfig;
