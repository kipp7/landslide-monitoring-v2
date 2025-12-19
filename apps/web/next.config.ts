import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // 关闭严格模式，防止重复渲染问题
  transpilePackages: ["cesium"], // 让 Next.js 处理 Cesium 依赖

  // 性能优化配置
  experimental: {
    optimizeCss: true, // 优化CSS
    optimizePackageImports: ['antd', 'echarts', '@ant-design/pro-components'], // 优化包导入
  },

  // 图片优化
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  // 压缩配置
  compress: true,

  // Webpack优化
  webpack: (config, { dev, isServer }) => {
    config.resolve.fallback = { fs: false }; // 修复 Cesium 依赖的 Node.js 模块问题

    // 生产环境优化
    if (!dev && !isServer) {
      // 代码分割优化
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          cesium: {
            test: /[\\/]node_modules[\\/]cesium[\\/]/,
            name: 'cesium',
            chunks: 'all',
            priority: 10,
          },
          echarts: {
            test: /[\\/]node_modules[\\/]echarts[\\/]/,
            name: 'echarts',
            chunks: 'all',
            priority: 10,
          },
          antd: {
            test: /[\\/]node_modules[\\/]antd[\\/]/,
            name: 'antd',
            chunks: 'all',
            priority: 10,
          },
        },
      };
    }

    return config;
  },

  // 输出配置
  output: 'standalone', // 优化部署
};

export default nextConfig;
