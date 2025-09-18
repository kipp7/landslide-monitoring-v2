/**
 * 滑坡监测系统 - 环境配置管理
 * 统一管理所有环境配置，支持开发、测试、生产环境
 */

// 首先尝试加载dotenv
try {
    require('dotenv').config();
    console.log('✅ 环境变量配置加载成功');
} catch (error) {
    console.log('⚠️  dotenv未安装，使用默认配置');
}

// 默认配置（开发环境）
const defaultConfig = {
    // 应用配置
    NODE_ENV: 'development',
    PORT: 5100,
    DEBUG: true,
    
    // Supabase配置（从环境变量获取）
    SUPABASE_URL: process.env.SUPABASE_URL || 'your_supabase_url_here',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'your_supabase_anon_key_here',
    
    // 华为云IoT配置 - 已禁用
    // HUAWEI_IOT_ENDPOINT: 'https://361017cfc6.st1.iotda-app.cn-north-4.myhuaweicloud.com:443',
    // HUAWEI_IOT_PROJECT_ID: '361017cfc6',
    // HUAWEI_IOT_DEVICE_ID: '6815a14f9314d118511807c6_rk2206',
    
    // WebSocket配置
    ENABLE_WEBSOCKET: true,
    WEBSOCKET_CORS_ORIGIN: '*',
    
    // CORS配置
    CORS_ORIGIN: 'http://localhost:3000,http://localhost:3001',
    
    // 日志配置
    LOG_LEVEL: 'info',
    LOG_FILE: 'server.log'
};

// 生产环境配置
const productionConfig = {
    NODE_ENV: 'production',
    DEBUG: false,
    LOG_LEVEL: 'error',
    CORS_ORIGIN: 'https://your-production-domain.com'
};

// 测试环境配置
const testConfig = {
    NODE_ENV: 'test',
    PORT: 5101,
    DEBUG: true,
    LOG_LEVEL: 'debug'
};

/**
 * 获取当前环境配置
 * 优先级：环境变量 > 环境特定配置 > 默认配置
 */
function getConfig() {
    const env = process.env.NODE_ENV || 'development';
    
    // 根据环境选择基础配置
    let baseConfig = defaultConfig;
    switch (env) {
        case 'production':
            baseConfig = { ...defaultConfig, ...productionConfig };
            break;
        case 'test':
            baseConfig = { ...defaultConfig, ...testConfig };
            break;
        default:
            baseConfig = defaultConfig;
    }
    
    // 环境变量覆盖配置文件
    const config = {};
    for (const key in baseConfig) {
        config[key] = process.env[key] || baseConfig[key];
    }
    
    return config;
}

/**
 * 验证必要配置项
 */
function validateConfig(config) {
    const requiredKeys = [
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'PORT'
    ];
    
    const missingKeys = requiredKeys.filter(key => !config[key]);
    
    if (missingKeys.length > 0) {
        console.error('❌ 缺少必要配置项:', missingKeys);
        console.error('请检查环境变量或创建 .env 文件');
        return false;
    }
    
    return true;
}

/**
 * 打印当前配置（隐藏敏感信息）
 */
function printConfig(config) {
    const safeConfig = { ...config };
    
    // 隐藏敏感信息
    const sensitiveKeys = ['SUPABASE_ANON_KEY', 'HUAWEI_IOT_PASSWORD', 'JWT_SECRET'];
    sensitiveKeys.forEach(key => {
        if (safeConfig[key]) {
            safeConfig[key] = safeConfig[key].substring(0, 8) + '...';
        }
    });
    
    console.log('📋 当前配置:');
    console.table(safeConfig);
}

// 导出配置
const config = getConfig();

// 验证配置
if (!validateConfig(config)) {
    process.exit(1);
}

// 开发环境下打印配置
if (config.DEBUG) {
    printConfig(config);
}

module.exports = config;
