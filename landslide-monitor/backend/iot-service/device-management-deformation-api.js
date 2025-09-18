/**
 * 设备管理页面形变分析API路由
 * 
 * 作者: 派派
 * 维护人员: 派派
 * 开发团队: 派派
 * 创建时间: 2025-01-08
 */

const express = require('express');
const DeviceManagementDeformationService = require('./device-management-deformation-service');

const router = express.Router();

// 创建服务实例
const deformationService = new DeviceManagementDeformationService();

/**
 * 获取设备形变分析数据
 * GET /api/device-management/deformation/:deviceId
 */
router.get('/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit } = req.query;
        
        console.log(`设备管理形变分析请求 - 设备: ${deviceId}, 限制: ${limit || 50}`);
        
        const options = {
            limit: limit ? parseInt(limit) : 50
        };
        
        const result = await deformationService.getDeviceDeformationAnalysis(deviceId, options);
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('设备管理形变分析API错误:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 获取设备形变历史趋势
 * GET /api/device-management/deformation/:deviceId/trend
 */
router.get('/:deviceId/trend', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { days = 7 } = req.query;
        
        console.log(`设备管理形变趋势请求 - 设备: ${deviceId}, 天数: ${days}`);
        
        // 获取更多历史数据用于趋势分析
        const options = {
            limit: Math.min(parseInt(days) * 24, 500) // 每天最多24个数据点，最多500个点
        };
        
        const result = await deformationService.getDeviceDeformationAnalysis(deviceId, options);
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        // 提取趋势相关数据
        const trendData = {
            success: true,
            deviceId: deviceId,
            timestamp: result.timestamp,
            trend: {
                direction: result.deformation.trend,
                velocity: result.deformation.velocity,
                max_displacement: result.deformation.max_displacement,
                risk_level: result.deformation.risk_level,
                risk_description: result.deformation.risk_description
            },
            data_quality: result.deformation.data_quality,
            data_count: result.deformation.data_count
        };
        
        res.json(trendData);
        
    } catch (error) {
        console.error('设备管理形变趋势API错误:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 获取设备形变统计摘要
 * GET /api/device-management/deformation/:deviceId/summary
 */
router.get('/:deviceId/summary', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log(`设备管理形变摘要请求 - 设备: ${deviceId}`);
        
        const result = await deformationService.getDeviceDeformationAnalysis(deviceId, { limit: 20 });
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        // 提取摘要数据 - 字段名与前端期望保持一致
        const summary = {
            success: true,
            deviceId: deviceId,
            timestamp: result.timestamp,
            hasBaseline: result.hasBaseline,
            hasData: result.hasData,

            // 核心指标 - 使用前端期望的字段名
            deformation_type: result.deformation.type_code,
            deformation_type_description: result.deformation.type_description,
            max_displacement: result.deformation.max_displacement,
            horizontal_displacement: result.deformation.horizontal_displacement,
            vertical_displacement: result.deformation.vertical_displacement,
            risk_level: result.deformation.risk_level,
            risk_description: result.deformation.risk_description,

            // 状态指标 - 使用前端期望的字段名
            trend: result.deformation.trend,
            velocity: result.deformation.velocity,
            confidence: result.deformation.confidence,
            data_quality: result.deformation.data_quality,

            // 添加调试信息
            debug_info: {
                raw_max_displacement: result.deformation.max_displacement,
                raw_horizontal: result.deformation.horizontal_displacement,
                raw_vertical: result.deformation.vertical_displacement,
                raw_velocity: result.deformation.velocity,
                raw_confidence: result.deformation.confidence
            }
        };
        
        res.json(summary);
        
    } catch (error) {
        console.error('设备管理形变摘要API错误:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
