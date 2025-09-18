/**
 * GPS基准点管理API
 * 提供基准点的创建、查询、更新、删除功能
 * 
 * @author 派派
 * @version 1.0
 * @date 2025-07-25
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const GPSDeformationService = require('./gps-deformation-service');

const router = express.Router();

// Supabase客户端
const supabase = createClient(
    process.env.SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
);

// GPS形变服务实例
const gpsService = new GPSDeformationService({ autoInit: false });

/**
 * 获取所有基准点列表
 * GET /api/baselines
 */
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('v_gps_baselines_with_device_info')
            .select('*')
            .order('established_time', { ascending: false });
        
        if (error) {
            throw new Error(error.message);
        }
        
        res.json({
            success: true,
            data: data,
            count: data.length
        });
        
    } catch (error) {
        console.error('获取基准点列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取指定设备的基准点
 * GET /api/baselines/:deviceId
 */
router.get('/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const { data, error } = await supabase
            .from('gps_baselines')
            .select('*')
            .eq('device_id', deviceId)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.json({
                    success: false,
                    error: '该设备没有设置基准点',
                    hasBaseline: false
                });
            }
            throw new Error(error.message);
        }
        
        res.json({
            success: true,
            data: data,
            hasBaseline: true
        });
        
    } catch (error) {
        console.error(`获取设备${req.params.deviceId}基准点失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 创建或更新设备基准点
 * POST /api/baselines/:deviceId
 */
router.post('/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const {
            latitude,
            longitude,
            altitude,
            establishedBy = '前端用户',
            notes,
            // 可选的质量参数
            positionAccuracy,
            measurementDuration,
            satelliteCount,
            pdopValue
        } = req.body;
        
        // 验证必需参数
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: '纬度和经度是必需的参数'
            });
        }
        
        // 验证坐标范围
        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            return res.status(400).json({
                success: false,
                error: '坐标值超出有效范围'
            });
        }
        
        // 使用GPS服务创建基准点
        const baselineData = await gpsService.createOrUpdateBaseline(deviceId, {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            altitude: altitude ? parseFloat(altitude) : null,
            establishedBy,
            notes,
            positionAccuracy: positionAccuracy ? parseFloat(positionAccuracy) : null,
            measurementDuration: measurementDuration ? parseInt(measurementDuration) : null,
            satelliteCount: satelliteCount ? parseInt(satelliteCount) : null,
            pdopValue: pdopValue ? parseFloat(pdopValue) : null
        });
        
        res.json({
            success: true,
            data: baselineData,
            message: '基准点设置成功'
        });
        
    } catch (error) {
        console.error(`设置设备${req.params.deviceId}基准点失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 基于最近数据自动建立基准点
 * POST /api/baselines/:deviceId/auto-establish
 */
router.post('/:deviceId/auto-establish', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const {
            dataPoints = 20,  // 使用的数据点数量
            establishedBy = '系统自动建立',
            notes = '基于最近数据自动建立的基准点'
        } = req.body;
        
        // 获取最近的GPS数据
        const recentData = await gpsService.fetchGPSData(deviceId, { limit: dataPoints });
        
        if (recentData.length < 10) {
            return res.status(400).json({
                success: false,
                error: `数据点不足，需要至少10个点，当前只有${recentData.length}个点`
            });
        }
        
        // 计算平均坐标
        const validData = recentData.filter(d => 
            d.latitude && d.longitude && 
            Math.abs(d.latitude) <= 90 && 
            Math.abs(d.longitude) <= 180
        );
        
        if (validData.length === 0) {
            return res.status(400).json({
                success: false,
                error: '没有有效的GPS数据'
            });
        }
        
        const avgLatitude = validData.reduce((sum, d) => sum + parseFloat(d.latitude), 0) / validData.length;
        const avgLongitude = validData.reduce((sum, d) => sum + parseFloat(d.longitude), 0) / validData.length;
        
        // 计算位置精度（标准差）
        const latStd = Math.sqrt(validData.reduce((sum, d) => sum + Math.pow(parseFloat(d.latitude) - avgLatitude, 2), 0) / validData.length);
        const lonStd = Math.sqrt(validData.reduce((sum, d) => sum + Math.pow(parseFloat(d.longitude) - avgLongitude, 2), 0) / validData.length);
        const positionAccuracy = Math.max(latStd, lonStd) * 111000; // 转换为米
        
        // 创建基准点
        const baselineData = await gpsService.createOrUpdateBaseline(deviceId, {
            latitude: avgLatitude,
            longitude: avgLongitude,
            establishedBy,
            dataPointsUsed: validData.length,
            positionAccuracy: positionAccuracy,
            notes: `${notes}，使用${validData.length}个数据点，位置精度约${positionAccuracy.toFixed(2)}米`
        });
        
        res.json({
            success: true,
            data: baselineData,
            message: `基准点自动建立成功，使用了${validData.length}个数据点`,
            statistics: {
                dataPointsUsed: validData.length,
                positionAccuracy: positionAccuracy,
                timeRange: {
                    start: validData[0].event_time,
                    end: validData[validData.length - 1].event_time
                }
            }
        });
        
    } catch (error) {
        console.error(`自动建立设备${req.params.deviceId}基准点失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 检查基准点质量
 * GET /api/baselines/:deviceId/quality-check
 */
router.get('/:deviceId/quality-check', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        // 调用数据库函数检查基准点质量
        const { data, error } = await supabase
            .rpc('check_baseline_quality', { p_device_id: deviceId });
        
        if (error) {
            throw new Error(error.message);
        }
        
        if (data.length === 0) {
            return res.json({
                success: false,
                error: '无法检查基准点质量'
            });
        }
        
        const qualityInfo = data[0];
        
        res.json({
            success: true,
            data: qualityInfo,
            recommendation: qualityInfo.recommendation
        });
        
    } catch (error) {
        console.error(`检查设备${req.params.deviceId}基准点质量失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 删除设备基准点
 * DELETE /api/baselines/:deviceId
 */
router.delete('/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const { error } = await supabase
            .from('gps_baselines')
            .delete()
            .eq('device_id', deviceId);
        
        if (error) {
            throw new Error(error.message);
        }
        
        res.json({
            success: true,
            message: '基准点删除成功'
        });
        
    } catch (error) {
        console.error(`删除设备${req.params.deviceId}基准点失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取可用设备列表（有GPS数据但没有基准点的设备）
 * GET /api/baselines/available-devices
 */
router.get('/available-devices', async (req, res) => {
    try {
        // 获取有GPS数据的设备
        const { data: gpsDevices, error: gpsError } = await supabase
            .from('iot_data')
            .select('device_id')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null);
        
        if (gpsError) {
            throw new Error(gpsError.message);
        }
        
        // 获取已有基准点的设备
        const { data: baselineDevices, error: baselineError } = await supabase
            .from('gps_baselines')
            .select('device_id')
            .eq('status', 'active');
        
        if (baselineError) {
            throw new Error(baselineError.message);
        }
        
        // 找出有GPS数据但没有基准点的设备
        const uniqueGpsDevices = [...new Set(gpsDevices.map(d => d.device_id))];
        const baselineDeviceIds = new Set(baselineDevices.map(d => d.device_id));
        
        const availableDevices = uniqueGpsDevices.filter(deviceId => 
            !baselineDeviceIds.has(deviceId)
        );
        
        res.json({
            success: true,
            data: {
                availableDevices: availableDevices,
                totalGpsDevices: uniqueGpsDevices.length,
                devicesWithBaseline: baselineDevices.length,
                devicesNeedingBaseline: availableDevices.length
            }
        });
        
    } catch (error) {
        console.error('获取可用设备列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
