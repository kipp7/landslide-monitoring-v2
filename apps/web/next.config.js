/** @type {import('next').NextConfig} */
const distDir = (process.env.NEXT_DIST_DIR || '.next_web').trim()

const nextConfig = {
  // Workaround (Windows): avoid `.next/trace` permission/lock issues that can hang `next build`.
  distDir,
  reactStrictMode: false,
  transpilePackages: ['cesium'],
  output: 'standalone',

  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['antd', 'echarts', '@ant-design/pro-components'],
  },

  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  compress: true,

  webpack: (config, { dev, isServer }) => {
    config.resolve = config.resolve || {}
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false }

    if (dev && !isServer) {
      const originalEntry = config.entry
      config.entry = async () => {
        const entries = await originalEntry()
        const main = entries['main.js']

        if (main) {
          const has = Array.isArray(main)
            ? main.includes('./suppress-warnings.js')
            : String(main).includes('./suppress-warnings.js')

          if (!has) {
            if (Array.isArray(main)) entries['main.js'] = ['./suppress-warnings.js', ...main]
            else entries['main.js'] = ['./suppress-warnings.js', main]
          }
        }

        return entries
      }
    }

    if (!dev && !isServer) {
      config.optimization = config.optimization || {}
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
      }
    }

    return config
  },
}

module.exports = nextConfig;
