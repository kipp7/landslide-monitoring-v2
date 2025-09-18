/**
 * 设备管理页面专用的GPS形变分析服务
 * 将单片机rk2206的形变分析算法移植到后端
 * 
 * 作者: 派派
 * 维护人员: 派派
 * 开发团队: 派派
 * 创建时间: 2025-01-08
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

class DeviceManagementDeformationService {
    constructor(options = {}) {
        this.supabase = createClient(
            config.SUPABASE_URL,
            config.SUPABASE_ANON_KEY
        );
        
        // 专业GPS形变分析配置 - 基于地质灾害监测标准
        this.config = {
            // 形变类型判断阈值 - 采用专业地质监测标准
            deformationType: {
                minDisplacement: 0.002,      // 最小有效位移 2mm (GPS-RTK精度范围)
                noiseThreshold: 0.001,       // GPS噪声阈值 1mm
                horizontalRatio: 0.8,        // 水平形变比例阈值 (保持专业标准)
                verticalRatio: 0.8,          // 垂直形变比例阈值
                verticalThreshold: 0.3,      // 垂直阈值
                combinedRatio: 0.4           // 复合形变比例阈值
            },

            // 国标GB/T 38509-2020《地质灾害气象风险预警业务规范》四级预警体系
            riskLevels: {
                noise: 0.002,     // 2mm - GPS噪声范围 (正常)
                level1: 0.005,    // 5mm - IV级蓝色 (低风险)
                level2: 0.020,    // 20mm - III级黄色 (中风险)
                level3: 0.050,    // 50mm - II级橙色 (高风险)
                level4: 0.100     // 100mm - I级红色 (危险)
            },
            
            // 专业数据质量评估标准
            quality: {
                minConfidence: 0.8,          // 最小置信度要求
                minDataPoints: 20,           // 最少数据点数 (统计显著性)
                maxTimeGap: 1800000,         // 最大时间间隔 30分钟 (保证连续性)
                maxPositionError: 0.005,     // 最大位置误差 5mm (GPS-RTK精度)
                minSatelliteCount: 6,        // 最少卫星数量
                maxPDOP: 3.0,               // 最大位置精度因子
                temporalConsistency: 0.9     // 时间一致性要求
            },

            // GPS误差模型参数
            errorModel: {
                baselineError: 0.001,        // 基准点误差 1mm
                measurementError: 0.002,     // 测量误差 2mm
                atmosphericError: 0.001,     // 大气延迟误差 1mm
                multiPathError: 0.002,       // 多路径误差 2mm
                clockError: 0.0005          // 时钟误差 0.5mm
            }
        };
        
        console.log('设备管理形变分析服务初始化完成');
    }
    
    /**
     * 获取设备的形变分析数据
     * @param {string} deviceId - 设备ID
     * @param {Object} options - 选项
     * @returns {Object} 形变分析结果
     */
    async getDeviceDeformationAnalysis(deviceId, options = {}) {
        try {
            console.log(`开始设备管理形变分析 - 设备: ${deviceId}`);
            
            // 1. 获取基准点信息
            const baseline = await this.getDeviceBaseline(deviceId);
            if (!baseline) {
                return {
                    success: false,
                    error: '设备未设置基准点',
                    hasBaseline: false
                };
            }
            
            // 2. 获取最新GPS数据 - 增加数据量以获得更好的分析结果
            const gpsData = await this.getLatestGPSData(deviceId, options.limit || 200);
            console.log(`获取到 ${gpsData?.length || 0} 条GPS数据`);

            // 显示数据时间范围
            if (gpsData && gpsData.length > 0) {
                console.log(`数据时间范围: ${gpsData[gpsData.length-1].event_time} 到 ${gpsData[0].event_time}`);
                console.log(`最新GPS坐标: (${gpsData[0].latitude}, ${gpsData[0].longitude})`);
                console.log(`最旧GPS坐标: (${gpsData[gpsData.length-1].latitude}, ${gpsData[gpsData.length-1].longitude})`);
            }
            if (!gpsData || gpsData.length === 0) {
                return {
                    success: false,
                    error: '无GPS数据',
                    hasData: false
                };
            }

            // 检查GPS数据的多样性
            const uniqueCoords = new Set(gpsData.map(d => `${d.latitude},${d.longitude}`));
            console.log(`GPS数据中有 ${uniqueCoords.size} 个不同的坐标点`);
            if (uniqueCoords.size === 1) {
                console.warn('所有GPS数据点坐标完全相同，可能无法检测到形变');
            }
            
            // 3. 计算位移数据
            const displacementData = this.calculateDisplacements(gpsData, baseline);
        console.log(`计算得到 ${displacementData.length} 个位移数据点`);
            
            // 4. 分析形变类型
            const deformationType = this.analyzeDeformationType(displacementData);
            
            // 5. 计算统计特征
            const statistics = this.calculateStatistics(displacementData);
            
            // 6. 评估风险等级
            const riskAssessment = this.assessRiskLevel(statistics, deformationType);
            
            // 7. 生成分析结果
            const result = {
                success: true,
                deviceId: deviceId,
                timestamp: new Date().toISOString(),
                hasBaseline: true,
                hasData: true,
                
                // 基准点信息
                baseline: {
                    latitude: baseline.latitude,
                    longitude: baseline.longitude,
                    established_time: baseline.established_time,
                    established_by: baseline.established_by
                },
                
                // 形变分析结果
                deformation: {
                    type: deformationType.type,
                    type_code: deformationType.code,
                    type_description: deformationType.description,
                    
                    // 位移统计
                    max_displacement: statistics.maxDisplacement,
                    avg_displacement: statistics.avgDisplacement,
                    horizontal_displacement: statistics.maxHorizontal,
                    vertical_displacement: statistics.maxVertical,
                    
                    // 趋势分析
                    trend: statistics.trend,
                    velocity: statistics.velocity,
                    
                    // 风险评估
                    risk_level: riskAssessment.level,
                    risk_description: riskAssessment.description,
                    risk_factors: riskAssessment.factors,
                    
                    // 数据质量
                    data_quality: statistics.quality,
                    confidence: statistics.confidence,
                    data_count: displacementData.length
                },
                
                // 最新数据点
                latest_data: gpsData[0] ? {
                    timestamp: gpsData[0].event_time,
                    latitude: gpsData[0].latitude,
                    longitude: gpsData[0].longitude,
                    displacement_3d: displacementData[0]?.distance3D || 0,
                    horizontal: displacementData[0]?.horizontal || 0,
                    vertical: displacementData[0]?.vertical || 0
                } : null
            };
            
            console.log(`设备管理形变分析完成 - 类型: ${deformationType.description}, 风险: ${riskAssessment.description}`);
            console.log(`位移数据: 3D=${(statistics.maxDisplacement*1000).toFixed(2)}mm, 水平=${(statistics.maxHorizontal*1000).toFixed(2)}mm, 垂直=${(statistics.maxVertical*1000).toFixed(2)}mm`);
            console.log(`速度: ${(statistics.velocity*1000).toFixed(4)}mm/h, 置信度: ${(statistics.confidence*100).toFixed(1)}%`);
            return result;
            
        } catch (error) {
            console.error('设备管理形变分析失败:', error);
            return {
                success: false,
                error: error.message,
                deviceId: deviceId,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * 获取设备基准点 - 与基准点管理API保持一致
     */
    async getDeviceBaseline(deviceId) {
        try {
            console.log(`🔍 获取设备 ${deviceId} 的基准点...`);

            const { data, error } = await this.supabase
                .from('gps_baselines')
                .select('*')
                .eq('device_id', deviceId)
                .eq('status', 'active')  // 只获取活跃的基准点
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.log(`   ⚠️  设备 ${deviceId} 未设置基准点`);
                    return null;
                }
                console.error(`获取基准点数据库错误:`, error);
                throw error;
            }

            // 返回标准化的基准点数据
            const baseline = {
                latitude: data.baseline_latitude,
                longitude: data.baseline_longitude,
                altitude: data.baseline_altitude,
                established_time: data.established_time,
                established_by: data.established_by,
                confidence_level: data.confidence_level,
                data_points_used: data.data_points_used,
                position_accuracy: data.position_accuracy,
                notes: data.notes,
                status: data.status
            };

            console.log(`   ✅ 找到基准点: (${baseline.latitude}, ${baseline.longitude})`);
            return baseline;

        } catch (error) {
            console.error('获取基准点失败:', error);
            return null;
        }
    }
    
    /**
     * 获取最新GPS数据
     */
    async getLatestGPSData(deviceId, limit = 50) {
        try {
            const { data, error } = await this.supabase
                .from('iot_data')
                .select(`
                    id,
                    event_time,
                    device_id,
                    latitude,
                    longitude,
                    deformation_distance_3d,
                    deformation_horizontal,
                    deformation_vertical,
                    deformation_confidence
                `)
                .eq('device_id', deviceId)
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('event_time', { ascending: false })
                .limit(limit);
                
            if (error) {
                throw error;
            }
            
            return data || [];
        } catch (error) {
            console.error('获取GPS数据失败:', error);
            return [];
        }
    }

    /**
     * 计算位移数据 - 基于基准点
     */
    calculateDisplacements(gpsData, baseline) {
        const displacements = [];

        // 检查基准点数据有效性
        if (!baseline || !baseline.latitude || !baseline.longitude) {
            console.error('基准点数据无效:', baseline);
            return [];
        }

        console.log(`基准点坐标: (${baseline.latitude}, ${baseline.longitude})`);

        for (const point of gpsData) {
            const lat = parseFloat(point.latitude);
            const lon = parseFloat(point.longitude);

            if (isNaN(lat) || isNaN(lon)) {
                continue;
            }

            // 使用专业GPS距离计算算法
            // 1. 水平位移 = 精确距离计算 (考虑地球椭球体)
            const horizontal = this.calculatePreciseDistance(
                baseline.latitude, baseline.longitude,
                lat, lon
            );

            // 2. 垂直位移 = 高度差 (如果有高度数据)
            const vertical = 0; // GPS数据中通常没有可靠的高度信息，设为0

            // 3. 3D位移 = sqrt(水平² + 垂直²)
            const distance3D = Math.sqrt(horizontal * horizontal + vertical * vertical);

            // 4. 计算方位角
            const bearing = this.calculateBearing(
                baseline.latitude, baseline.longitude,
                lat, lon
            );

            // 5. 专业误差分析
            const errorAnalysis = this.calculateMeasurementError(horizontal, vertical, distance3D);

            // 添加专业调试信息（只显示前几个点）
            if (displacements.length < 3) {
                console.log(`点${displacements.length + 1}: (${lat}, ${lon})`);
                console.log(`  -> 水平位移: ${(horizontal*1000).toFixed(2)}mm ±${(errorAnalysis.horizontalError*1000).toFixed(2)}mm`);
                console.log(`  -> 垂直位移: ${(vertical*1000).toFixed(2)}mm ±${(errorAnalysis.verticalError*1000).toFixed(2)}mm`);
                console.log(`  -> 3D位移: ${(distance3D*1000).toFixed(2)}mm ±${(errorAnalysis.totalError*1000).toFixed(2)}mm`);
                console.log(`  -> 方位角: ${bearing.toFixed(1)}°`);
                console.log(`  -> 测量置信度: ${(errorAnalysis.confidence*100).toFixed(1)}%`);
            }

            displacements.push({
                timestamp: new Date(point.event_time),
                latitude: lat,
                longitude: lon,
                distance3D: distance3D,
                horizontal: horizontal,
                vertical: vertical,
                bearing: bearing,
                confidence: errorAnalysis.confidence,
                measurementError: errorAnalysis.totalError,
                originalId: point.id
            });
        }

        return displacements;
    }

    /**
     * 分析形变类型 - 基于单片机ClassifyDeformationType算法
     */
    analyzeDeformationType(displacementData) {
        if (!displacementData || displacementData.length === 0) {
            return {
                type: 'none',
                code: 0,
                description: '无形变'
            };
        }

        // 找到最大位移点进行分析
        const maxDisplacement = displacementData.reduce((max, current) =>
            current.distance3D > max.distance3D ? current : max
        );

        const distance3D = maxDisplacement.distance3D;
        const horizontal = Math.abs(maxDisplacement.horizontal);
        const vertical = Math.abs(maxDisplacement.vertical);

        // 专业GPS形变分析：考虑GPS噪声和精度
        if (distance3D < this.config.deformationType.noiseThreshold) {
            return {
                type: 'noise',
                code: -1,
                description: 'GPS噪声'
            };
        }

        if (distance3D < this.config.deformationType.minDisplacement) {
            return {
                type: 'none',
                code: 0,
                description: '无明显形变'
            };
        }

        // 专业形变分析：计算比例 (添加小值防止除零)
        const hRatio = horizontal / (distance3D + 0.0001);
        const vRatio = vertical / (distance3D + 0.0001);

        console.log(`专业形变类型分析: 3D=${(distance3D*1000).toFixed(2)}mm, 水平比例=${hRatio.toFixed(3)}, 垂直比例=${vRatio.toFixed(3)}`);

        // 完全按照单片机ClassifyDeformationType算法
        if (hRatio > this.config.deformationType.horizontalRatio &&
            vRatio < this.config.deformationType.verticalThreshold) {
            return {
                type: 'horizontal',
                code: 1,
                description: '水平形变'
            };
        } else if (vRatio > this.config.deformationType.verticalRatio &&
                   hRatio < this.config.deformationType.verticalThreshold) {
            return {
                type: 'vertical',
                code: 2,
                description: '垂直形变'
            };
        } else if (hRatio > this.config.deformationType.combinedRatio &&
                   vRatio > this.config.deformationType.combinedRatio) {
            return {
                type: 'combined',
                code: 3,
                description: '复合形变'
            };
        } else {
            return {
                type: 'rotation',
                code: 4,
                description: '旋转形变'
            };
        }
    }

    /**
     * 计算统计特征
     */
    calculateStatistics(displacementData) {
        if (!displacementData || displacementData.length === 0) {
            return {
                maxDisplacement: 0,
                avgDisplacement: 0,
                maxHorizontal: 0,
                maxVertical: 0,
                trend: 'stable',
                velocity: 0,
                quality: 0,
                confidence: 0
            };
        }

        const displacements = displacementData.map(d => d.distance3D);
        const horizontals = displacementData.map(d => Math.abs(d.horizontal));
        const verticals = displacementData.map(d => Math.abs(d.vertical));
        const confidences = displacementData.map(d => d.confidence);

        // 基本统计 - 过滤NaN值
        const validDisplacements = displacements.filter(d => !isNaN(d) && isFinite(d));
        const validHorizontals = horizontals.filter(h => !isNaN(h) && isFinite(h));
        const validVerticals = verticals.filter(v => !isNaN(v) && isFinite(v));

        const maxDisplacement = validDisplacements.length > 0 ? Math.max(...validDisplacements) : 0;
        const avgDisplacement = validDisplacements.length > 0 ?
            validDisplacements.reduce((sum, val) => sum + val, 0) / validDisplacements.length : 0;
        const maxHorizontal = validHorizontals.length > 0 ? Math.max(...validHorizontals) : 0;
        const maxVertical = validVerticals.length > 0 ? Math.max(...validVerticals) : 0;

        // 趋势分析 - 简化版本
        const trend = this.analyzeTrend(displacements);

        // 速度计算 - 基于时间序列
        const velocity = this.calculateVelocity(displacementData);

        // 数据质量评估
        const quality = this.assessDataQuality(displacementData);
        const avgConfidence = confidences.reduce((sum, val) => sum + val, 0) / confidences.length;

        return {
            maxDisplacement: maxDisplacement,
            avgDisplacement: avgDisplacement,
            maxHorizontal: maxHorizontal,
            maxVertical: maxVertical,
            trend: trend,
            velocity: velocity,
            quality: quality,
            confidence: avgConfidence
        };
    }

    /**
     * 评估风险等级 - 与GPS形变分析页面保持一致
     */
    assessRiskLevel(statistics, deformationType) {
        const maxDisplacement = isNaN(statistics.maxDisplacement) ? 0 : statistics.maxDisplacement;
        const velocity = isNaN(statistics.velocity) ? 0 : Math.abs(statistics.velocity);

        let level = 0;
        let description = '正常';
        let factors = [];

        // 如果数据无效，标记为数据异常
        if (isNaN(statistics.maxDisplacement) || isNaN(statistics.velocity)) {
            factors.push('数据计算异常');
        }

        // 国标GB/T 38509-2020四级预警体系风险评估 (数字越小风险越高)
        if (maxDisplacement >= this.config.riskLevels.level4) {
            level = 1; // I级红色 (最高风险)
            description = 'I级红色';
            factors.push(`位移${(maxDisplacement*1000).toFixed(1)}mm达到I级红色预警(≥100mm)，风险很高，可能性很大`);
        } else if (maxDisplacement >= this.config.riskLevels.level3) {
            level = 2; // II级橙色
            description = 'II级橙色';
            factors.push(`位移${(maxDisplacement*1000).toFixed(1)}mm达到II级橙色预警(≥50mm)，风险高，可能性较大`);
        } else if (maxDisplacement >= this.config.riskLevels.level2) {
            level = 3; // III级黄色
            description = 'III级黄色';
            factors.push(`位移${(maxDisplacement*1000).toFixed(1)}mm达到III级黄色预警(≥20mm)，风险较高，有一定可能性`);
        } else if (maxDisplacement >= this.config.riskLevels.level1) {
            level = 4; // IV级蓝色
            description = 'IV级蓝色';
            factors.push(`位移${(maxDisplacement*1000).toFixed(1)}mm达到IV级蓝色预警(≥5mm)，风险一般，可能性较小`);
        } else {
            level = 0; // 未达到预警标准 (不是预警级别)
            description = '正常';
            factors.push(`位移${(maxDisplacement*1000).toFixed(1)}mm未达到预警标准(<5mm)`);
        }

        // 基于速度的风险调整
        if (velocity > 0.001) { // 1mm/小时
            level = Math.max(level, 1);
            factors.push('形变速度较快');
        }

        // 基于形变类型的风险调整 - 任何形变都应该至少是低风险
        if (deformationType.code > 0) { // 有形变检测到
            level = Math.max(level, 1);
            factors.push(`检测到${deformationType.description}`);

            // 复合形变和旋转形变风险更高
            if (deformationType.code === 3 || deformationType.code === 4) {
                level = Math.max(level, 2);
                factors.push('复杂形变模式');
            }
        }

        // 基于数据质量的风险调整
        if (statistics.quality < 0.7) {
            factors.push('数据质量较低');
        }

        return {
            level: level,
            description: description,
            factors: factors,
            confidence: statistics.confidence
        };
    }

    /**
     * 专业GPS距离计算 - 使用改进的Haversine公式
     * 考虑地球椭球体形状和GPS精度特性
     */
    calculatePreciseDistance(lat1, lon1, lat2, lon2) {
        // 使用WGS84椭球体参数 (更精确than简单球体)
        const a = 6378137.0;          // 长半轴 (米)
        const f = 1/298.257223563;    // 扁率
        const b = a * (1 - f);        // 短半轴

        // 转换为弧度
        const lat1Rad = lat1 * Math.PI / 180.0;
        const lat2Rad = lat2 * Math.PI / 180.0;
        const deltaLat = (lat2 - lat1) * Math.PI / 180.0;
        const deltaLon = (lon2 - lon1) * Math.PI / 180.0;

        // 改进的Haversine公式，考虑椭球体
        const sinDeltaLat = Math.sin(deltaLat / 2);
        const sinDeltaLon = Math.sin(deltaLon / 2);
        const a_calc = sinDeltaLat * sinDeltaLat +
                       Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                       sinDeltaLon * sinDeltaLon;
        const c = 2 * Math.atan2(Math.sqrt(a_calc), Math.sqrt(1 - a_calc));

        // 使用平均地球半径，考虑纬度影响
        const avgLat = (lat1Rad + lat2Rad) / 2;
        const radius = Math.sqrt(((a * a * Math.cos(avgLat)) ** 2 + (b * b * Math.sin(avgLat)) ** 2) /
                                ((a * Math.cos(avgLat)) ** 2 + (b * Math.sin(avgLat)) ** 2));

        return radius * c; // 返回米
    }

    /**
     * 计算方位角 - 按照单片机CalculateBearing实现
     */
    calculateBearing(lat1, lon1, lat2, lon2) {
        const dlon = (lon2 - lon1) * Math.PI / 180.0;
        const y = Math.sin(dlon) * Math.cos(lat2 * Math.PI / 180.0);
        const x = Math.cos(lat1 * Math.PI / 180.0) * Math.sin(lat2 * Math.PI / 180.0) -
                  Math.sin(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) * Math.cos(dlon);
        const bearing = Math.atan2(y, x) * 180.0 / Math.PI;
        return (bearing + 360.0) % 360.0;
    }

    /**
     * 角度转弧度
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * 分析趋势
     */
    analyzeTrend(displacements) {
        if (displacements.length < 3) {
            return 'stable';
        }

        // 简单的趋势分析：比较前半部分和后半部分的平均值
        const mid = Math.floor(displacements.length / 2);
        const firstHalf = displacements.slice(0, mid);
        const secondHalf = displacements.slice(mid);

        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

        const diff = secondAvg - firstAvg;

        if (Math.abs(diff) < 0.001) { // 1mm阈值
            return 'stable';
        } else if (diff > 0) {
            return 'increasing';
        } else {
            return 'decreasing';
        }
    }

    /**
     * 计算形变速度
     */
    calculateVelocity(displacementData) {
        if (displacementData.length < 2) {
            return 0;
        }

        // 计算最近两个点的速度
        const latest = displacementData[0];
        const previous = displacementData[1];

        const timeDiff = (latest.timestamp.getTime() - previous.timestamp.getTime()) / 1000 / 3600; // 小时
        const displacementDiff = latest.distance3D - previous.distance3D;

        if (timeDiff === 0) {
            return 0;
        }

        return displacementDiff / timeDiff; // 米/小时
    }

    /**
     * 评估数据质量
     */
    assessDataQuality(displacementData) {
        if (!displacementData || displacementData.length === 0) {
            return 0;
        }

        let qualityScore = 1.0;

        // 数据点数量评估
        if (displacementData.length < this.config.quality.minDataPoints) {
            qualityScore *= 0.7;
        }

        // 置信度评估
        const avgConfidence = displacementData.reduce((sum, d) => sum + d.confidence, 0) / displacementData.length;
        if (avgConfidence < this.config.quality.minConfidence) {
            qualityScore *= 0.8;
        }

        // 时间间隔评估
        let hasLargeGap = false;
        for (let i = 1; i < displacementData.length; i++) {
            const timeDiff = displacementData[i-1].timestamp.getTime() - displacementData[i].timestamp.getTime();
            if (timeDiff > this.config.quality.maxTimeGap) {
                hasLargeGap = true;
                break;
            }
        }

        if (hasLargeGap) {
            qualityScore *= 0.9;
        }

        return Math.max(0, Math.min(1, qualityScore));
    }

    /**
     * 专业GPS测量误差分析
     * 基于误差传播理论计算位移测量的不确定度
     */
    calculateMeasurementError(horizontal, vertical, distance3D) {
        const config = this.config.errorModel;

        // 1. 基准点误差 (系统误差)
        const baselineError = config.baselineError;

        // 2. 测量误差 (随机误差)
        const measurementError = config.measurementError;

        // 3. 大气延迟误差 (与距离相关)
        const atmosphericError = config.atmosphericError * (1 + distance3D / 1000);

        // 4. 多路径误差 (环境相关)
        const multiPathError = config.multiPathError;

        // 5. 时钟误差
        const clockError = config.clockError;

        // 误差传播计算 (RSS - Root Sum of Squares)
        const horizontalError = Math.sqrt(
            baselineError ** 2 +
            measurementError ** 2 +
            atmosphericError ** 2 +
            multiPathError ** 2 +
            clockError ** 2
        );

        const verticalError = horizontalError * 1.5; // 垂直精度通常比水平精度低

        const totalError = Math.sqrt(horizontalError ** 2 + verticalError ** 2);

        // 计算置信度 (基于信噪比)
        const signalToNoise = distance3D / totalError;
        const confidence = Math.min(0.99, Math.max(0.1, 1 - Math.exp(-signalToNoise)));

        return {
            horizontalError,
            verticalError,
            totalError,
            confidence,
            signalToNoise
        };
    }
}

module.exports = DeviceManagementDeformationService;
