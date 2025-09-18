'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Select,
  Button,
  Tabs,
  Table,
  Tag,
  Progress,
  Space,
  message
} from 'antd';
import {
  SettingOutlined,
  ExportOutlined,
  ReloadOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EnhancedPredictionCharts from './enhanced-prediction-charts';
import { ChartDataPoint } from '../utils/predictionChartUtils';
import HoverSidebar from '../components/HoverSidebar';

// 全局抑制ResizeObserver错误
if (typeof window !== 'undefined') {
  const originalResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends originalResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        try {
          callback(entries, observer);
        } catch (error) {
          // 忽略ResizeObserver错误
        }
      });
    }
  };
}

const { Option } = Select;
const { TabPane } = Tabs;

interface GPSData {
  id: string;
  device_id: string;
  event_time: string;
  latitude: number;
  longitude: number;
  deformation_distance_3d: number;
  deformation_horizontal: number;
  deformation_vertical: number;
  deformation_velocity: number;
  deformation_confidence: number;
  risk_level: number;
  temperature: number;
  humidity: number;
}

interface AnalysisResult {
  deviceId: string;
  realTimeDisplacement?: {
    hasBaseline: boolean;
    hasLatestData: boolean;
    displacement: number;
    horizontal: number;
    vertical: number;
    latestTime?: string;
    error?: string;
    baseline?: {
      latitude: number;
      longitude: number;
      established_time: string;
    };
    latestGPS?: {
      latitude: number;
      longitude: number;
      time: string;
    };
  };
  dataQuality: {
    qualityScore: number;
    completeness: number;
    consistency: number;
    accuracy: number;
  };
  results: {
    ceemdDecomposition?: {
      imfs?: number[][];
      residue?: number[];
      imfAnalysis?: {
        dominantFrequencies?: number[];
        energyDistribution?: number[];
        decompositionQuality?: {
          qualityScore?: number;
          reconstructionError?: number;
          orthogonality?: number;
          completeness?: number;
        };
      };
    };
    ceemdAnalysis?: {
      imfs?: number[][];
      qualityMetrics?: {
        reconstructionError?: number;
      };
      dominantFrequencies?: number[];
      energyDistribution?: number[];
      decompositionQuality?: {
        qualityScore?: number;
        reconstructionError?: number;
        orthogonality?: number;
        energyConservation?: number;
        signalToNoiseRatio?: number;
        correlation?: number;
        completeness?: number;
      };
    };
    dtwAnalysis: {
      totalPatterns: number;
      topMatches: Array<{
        patternId: string;
        similarity: number;
        riskLevel: number;
      }>;
      accuracy: number;
    };
    statisticalAnalysis: {
      basic: {
        mean: number;
        median: number;
        standardDeviation: number;
        skewness: number;
        kurtosis: number;
        coefficientOfVariation: number;
      };
      summary: {
        maxDisplacement: number;
        minDisplacement: number;
        riskIndicators: string[];
      };
      time: {
        volatility: number;
        autocorrelation: number;
      };
    };
    trendAnalysis: {
      trend: string;
      magnitude: number;
      confidence: number;
    };
    riskAssessment: {
      level: number;
      description: string;
      confidence: number;
      factors: {
        maxDisplacement: number;
        trendMagnitude: number;
        patternSimilarity: number;
      };
    };
    prediction: {
      shortTerm: number[];
      longTerm: number[];
      confidence: number;
    };
  };
  timestamp: string;
  processingTime: number;
}

export default function GPSMonitoringPage() {
  // 全局错误处理 - 抑制ResizeObserver错误
  React.useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (
        args[0] &&
        typeof args[0] === 'string' &&
        (args[0].includes('ResizeObserver') ||
         args[0].includes('sensor is undefined') ||
         args[0].includes("can't access property \"disconnect\""))
      ) {
        // 忽略ResizeObserver相关错误
        return;
      }
      originalError.apply(console, args);
    };

    // 全局错误事件监听
    const handleError = (event: ErrorEvent) => {
      if (
        event.message &&
        (event.message.includes('ResizeObserver') ||
         event.message.includes('sensor is undefined') ||
         event.message.includes("can't access property \"disconnect\""))
      ) {
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleError);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError);
    };
  }, []);

  // 添加自定义样式
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .custom-tabs .ant-tabs-nav {
        background: rgba(51, 65, 85, 0.8) !important;
        border-bottom: 1px solid rgba(100, 116, 139, 0.5) !important;
        margin-bottom: 0 !important;
        border-radius: 8px 8px 0 0 !important;
        backdrop-filter: blur(8px) !important;
      }
      .custom-tabs .ant-tabs-tab {
        color: #94a3b8 !important;
        border: none !important;
        margin: 0 4px !important;
        padding: 12px 20px !important;
        border-radius: 6px 6px 0 0 !important;
        transition: all 0.3s ease !important;
        position: relative !important;
        background: transparent !important;
      }
      .custom-tabs .ant-tabs-tab:hover {
        color: #e2e8f0 !important;
        background: rgba(100, 116, 139, 0.2) !important;
        transform: translateY(-2px) !important;
      }
      .custom-tabs .ant-tabs-tab-active {
        color: #22d3ee !important;
        background: rgba(34, 211, 238, 0.15) !important;
        border: 1px solid rgba(34, 211, 238, 0.3) !important;
        border-bottom: none !important;
        transform: translateY(-3px) !important;
        box-shadow: 0 -4px 12px rgba(34, 211, 238, 0.2) !important;
      }
      .custom-tabs .ant-tabs-tab-active::before {
        content: '' !important;
        position: absolute !important;
        bottom: -1px !important;
        left: 0 !important;
        right: 0 !important;
        height: 2px !important;
        background: rgba(51, 65, 85, 0.8) !important;
        z-index: 1 !important;
      }
      .custom-tabs .ant-tabs-ink-bar {
        display: none !important;
      }
      .custom-tabs .ant-tabs-content-holder {
        background: rgba(51, 65, 85, 0.3) !important;
        padding: 24px !important;
        border-radius: 0 0 8px 8px !important;
        border: 1px solid rgba(100, 116, 139, 0.5) !important;
        border-top: none !important;
        backdrop-filter: blur(4px) !important;
      }
      .ant-card {
        background: rgba(51, 65, 85, 0.8) !important;
        border: 1px solid rgba(100, 116, 139, 0.5) !important;
        border-radius: 8px !important;
        backdrop-filter: blur(4px) !important;
      }
      .ant-card-head {
        background: rgba(51, 65, 85, 0.6) !important;
        border-bottom: 1px solid rgba(100, 116, 139, 0.5) !important;
      }
      .ant-card-head-title {
        color: #06b6d4 !important;
        font-weight: 500 !important;
      }
      .ant-card-body {
        background: rgba(51, 65, 85, 0.3) !important;
        color: #cbd5e1 !important;
      }
      .ant-statistic-title {
        color: #94a3b8 !important;
      }
      .ant-statistic-content {
        color: #e2e8f0 !important;
      }
      .ant-table {
        background: transparent !important;
      }
      .ant-table-thead > tr > th {
        background: rgba(51, 65, 85, 0.8) !important;
        color: #cbd5e1 !important;
        border-bottom: 1px solid rgba(100, 116, 139, 0.5) !important;
      }
      .ant-table-tbody > tr > td {
        background: rgba(51, 65, 85, 0.4) !important;
        color: #cbd5e1 !important;
        border-bottom: 1px solid rgba(100, 116, 139, 0.3) !important;
      }
      .ant-table-tbody > tr:hover > td {
        background: rgba(51, 65, 85, 0.6) !important;
      }
      .ant-select-dropdown {
        background: rgba(51, 65, 85, 0.95) !important;
        border: 1px solid rgba(100, 116, 139, 0.5) !important;
      }
      .ant-select-item {
        color: #cbd5e1 !important;
      }
      .ant-select-item:hover {
        background: rgba(100, 116, 139, 0.3) !important;
      }
      .ant-select-item-option-selected {
        background: rgba(6, 182, 212, 0.2) !important;
        color: #06b6d4 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);
  // 状态管理
  const router = useRouter();
  const [devices, setDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('device_1');
  const [gpsData, setGpsData] = useState<GPSData[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timeRange, setTimeRange] = useState('30d');

  // 获取设备列表
  useEffect(() => {
    fetchDevices();
  }, []);

  // 获取数据
  useEffect(() => {
    if (selectedDevice) {
      fetchData();
    }
  }, [selectedDevice, timeRange]);

  // 自动刷新
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchData, 30000); // 30秒刷新
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedDevice]);

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/baselines');
      const result = await response.json();
      if (result.success) {
        const deviceIds = result.data.map((item: any) => item.device_id);
        setDevices(deviceIds);
        if (deviceIds.length > 0 && !selectedDevice) {
          setSelectedDevice(deviceIds[0]);
        }
      }
    } catch (error) {
      message.error('获取设备列表失败');
    }
  };

  const fetchData = async () => {
    if (!selectedDevice) return;
    
    setLoading(true);
    try {
      // 并行获取GPS数据和分析结果 - 添加缓存清除
      const timestamp = Date.now();
      const [gpsResponse, analysisResponse] = await Promise.all([
        fetch(`/api/device-management?device_id=${selectedDevice}&limit=200&data_only=true&timeRange=${timeRange}&_t=${timestamp}`, {
          cache: 'no-cache'
        }),
        fetch(`/api/gps-deformation/${selectedDevice}?_t=${timestamp}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeRange }),
          cache: 'no-cache'
        })
      ]);

      const gpsResult = await gpsResponse.json();
      const analysisResult = await analysisResponse.json();

      if (gpsResult.success) {
        setGpsData(gpsResult.data || []);
      }

      if (analysisResult.success) {
        console.log('🔍 前端接收到的分析数据:', analysisResult.data);
        console.log('🔍 完整的results结构:', analysisResult.data?.results);
        console.log('🔍 results的所有键:', Object.keys(analysisResult.data?.results || {}));

        // 检查风险评估数据
        console.log('⚠️ 风险评估数据检查:');
        console.log('  - riskAssessment:', analysisResult.data?.results?.riskAssessment);
        console.log('  - riskAssessment.level:', analysisResult.data?.results?.riskAssessment?.level);
        console.log('  - riskAssessment.description:', analysisResult.data?.results?.riskAssessment?.description);
        console.log('  - riskAssessment.confidence:', analysisResult.data?.results?.riskAssessment?.confidence);
        console.log('  - riskAssessment.factors:', analysisResult.data?.results?.riskAssessment?.factors);

        // 检查实时位移数据
        console.log('📍 实时位移数据检查:');
        console.log('  - realTimeDisplacement:', analysisResult.data?.realTimeDisplacement);
        console.log('  - hasBaseline:', analysisResult.data?.realTimeDisplacement?.hasBaseline);
        console.log('  - hasLatestData:', analysisResult.data?.realTimeDisplacement?.hasLatestData);
        console.log('  - displacement:', analysisResult.data?.realTimeDisplacement?.displacement);
        console.log('  - error:', analysisResult.data?.realTimeDisplacement?.error);

        console.log('🔍 CEEMD数据结构:', analysisResult.data?.results?.ceemdAnalysis);
        console.log('🔍 检查其他可能的CEEMD路径:');
        console.log('  - ceemdDecomposition:', analysisResult.data?.results?.ceemdDecomposition);
        console.log('  - ceemd:', analysisResult.data?.results?.ceemd);
        console.log('  - decomposition:', analysisResult.data?.results?.decomposition);

        // 使用递归搜索找到IMF数据
        const foundIMFData = findIMFData(analysisResult.data?.results);
        console.log('🎯 递归搜索找到的IMF数据:', foundIMFData);

        setAnalysis(analysisResult.data);
      }

    } catch (error) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取风险等级颜色 - 国标四级预警体系
  const getRiskColor = (level: number) => {
    const colors = {
      0: '#10b981', // 正常 - 绿色
      4: '#3b82f6', // IV级蓝色 - 蓝色
      3: '#f59e0b', // III级黄色 - 黄色
      2: '#f97316', // II级橙色 - 橙色
      1: '#ef4444'  // I级红色 - 红色
    };
    return colors[level as keyof typeof colors] || '#6b7280';
  };

  // 获取风险等级描述 - 国标四级预警体系
  const getRiskDescription = (level: number) => {
    const descriptions = {
      0: '正常',
      4: 'IV级蓝色',
      3: 'III级黄色',
      2: 'II级橙色',
      1: 'I级红色'
    };
    return descriptions[level as keyof typeof descriptions] || '未知';
  };



  // 递归搜索IMF数据的函数
  const findIMFData = (obj: any, path: string = ''): any => {
    if (!obj || typeof obj !== 'object') return null;

    // 检查当前对象是否包含IMF数据
    if (obj.imfs && Array.isArray(obj.imfs)) {
      console.log(`🎯 在路径 ${path} 找到IMF数据:`, obj);
      return obj;
    }

    // 递归搜索子对象
    for (const [key, value] of Object.entries(obj)) {
      const result = findIMFData(value, path ? `${path}.${key}` : key);
      if (result) return result;
    }

    return null;
  };

  // 通用图表主题配置
  const getChartTheme = () => ({
    backgroundColor: 'transparent',
    textStyle: { color: '#94a3b8' },
    tooltip: {
      backgroundColor: 'rgba(51, 65, 85, 0.9)',
      borderColor: 'rgba(100, 116, 139, 0.5)',
      textStyle: { color: '#e2e8f0' }
    },
    legend: {
      textStyle: { color: '#94a3b8' }
    },
    grid: {
      borderColor: 'rgba(100, 116, 139, 0.3)'
    },
    xAxis: {
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
      splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }
    },
    yAxis: {
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
      splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }
    }
  });

  // 准备图表数据
  const chartData = React.useMemo(() => {
    if (!gpsData || !Array.isArray(gpsData)) {
      return [];
    }
    
    return gpsData
      .filter(item => {
        return item && 
               item.event_time && 
               typeof item.deformation_distance_3d === 'number' &&
               !isNaN(item.deformation_distance_3d);
      })
      .map((item, index) => ({
        index: index + 1,
        time: new Date(item.event_time).toLocaleTimeString(),
        timestamp: new Date(item.event_time).getTime(),
        displacement: (item.deformation_distance_3d || 0) * 1000, // 转换为毫米
        horizontal: (item.deformation_horizontal || 0) * 1000,
        vertical: (item.deformation_vertical || 0) * 1000,
        velocity: item.deformation_velocity || 0,
        confidence: item.deformation_confidence || 0,
        riskLevel: item.risk_level || 0,
        temperature: item.temperature || 0,
        humidity: item.humidity || 0
      }));
  }, [gpsData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* 大屏侧边菜单 */}
      <HoverSidebar />
      
      {/* 页面标题和控制栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          {/* 返回主页面按钮 */}
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push('/analysis')}
            className="text-cyan-300 hover:text-cyan-400 hover:bg-slate-700/50 border-0 h-10 px-3"
            title="返回数据分析页面"
          >
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-cyan-300 flex items-center space-x-2">
              <span>GPS形变实时监测</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">实时监测GPS形变数据，提供专业分析和预测</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-2">
            <Select
              value={selectedDevice}
              onChange={setSelectedDevice}
              className="min-w-[130px]"
              placeholder="选择设备"
              size="middle"
              style={{
                backgroundColor: 'rgba(51, 65, 85, 0.8)',
                borderColor: 'rgba(100, 116, 139, 0.5)',
                color: '#cbd5e1'
              }}
              dropdownStyle={{
                backgroundColor: 'rgba(51, 65, 85, 0.95)',
                border: '1px solid rgba(100, 116, 139, 0.5)'
              }}
            >
              {devices.map(device => (
                <Option key={device} value={device}>{device}</Option>
              ))}
            </Select>
          </div>

          <div className="px-2">
            <Select
              value={timeRange}
              onChange={setTimeRange}
              className="min-w-[110px]"
              size="middle"
              style={{
                backgroundColor: 'rgba(51, 65, 85, 0.8)',
                borderColor: 'rgba(100, 116, 139, 0.5)',
                color: '#cbd5e1'
              }}
              dropdownStyle={{
                backgroundColor: 'rgba(51, 65, 85, 0.95)',
                border: '1px solid rgba(100, 116, 139, 0.5)'
              }}
            >
              <Option value="1h">1小时</Option>
              <Option value="6h">6小时</Option>
              <Option value="24h">24小时</Option>
              <Option value="7d">7天</Option>
              <Option value="15d">15天</Option>
              <Option value="30d">30天</Option>
            </Select>
          </div>

          <div className="px-2">
            <Button
              type={autoRefresh ? 'primary' : 'default'}
              icon={<ReloadOutlined spin={autoRefresh} />}
              onClick={() => setAutoRefresh(!autoRefresh)}
              size="middle"
              className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50 hover:text-white min-w-[80px]"
            >
              {autoRefresh ? '停止' : '刷新'}
            </Button>
          </div>

          <div className="px-2">
            <Button
              icon={<ExportOutlined />}
              onClick={() => message.info('导出功能开发中')}
              size="middle"
              className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50 hover:text-white min-w-[80px]"
            >
              导出
            </Button>
          </div>

          <div className="px-2">
            <Link href="/baseline-management">
              <Button
                icon={<SettingOutlined />}
                size="middle"
                className="bg-cyan-500/20 border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 hover:text-cyan-200 min-w-[90px]"
              >
                基准点
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 实时状态面板 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* 当前风险等级卡片 - 国标四级预警体系 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">预警等级 (国标)</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-lg font-bold" style={{ color: getRiskColor(analysis?.results?.riskAssessment?.level || 0) }}>
                  {getRiskDescription(analysis?.results?.riskAssessment?.level || 0)}
                </span>
                <Tag
                  color={getRiskColor(analysis?.results?.riskAssessment?.level || 0)}
                  className="text-xs"
                >
                  级别 {analysis?.results?.riskAssessment?.level || 0}
                </Tag>
              </div>
              <p className="text-xs text-slate-500 mt-1">GB/T 38509-2020</p>
            </div>
          </div>
        </div>

        {/* 最新位移卡片 - 基于基准点的实时计算 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">最新位移 (基准点)</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`text-2xl font-bold ${
                  analysis?.realTimeDisplacement?.hasBaseline && analysis?.realTimeDisplacement?.hasLatestData
                    ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {analysis?.realTimeDisplacement?.hasBaseline && analysis?.realTimeDisplacement?.hasLatestData
                    ? ((analysis.realTimeDisplacement.displacement || 0) * 1000).toFixed(2)
                    : '0.00'}
                </span>
                <span className="text-slate-400 text-sm">mm</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {analysis?.realTimeDisplacement?.hasBaseline
                  ? (analysis?.realTimeDisplacement?.hasLatestData
                      ? `更新: ${analysis.realTimeDisplacement.latestTime ? new Date(analysis.realTimeDisplacement.latestTime).toLocaleTimeString() : '未知'}`
                      : '无最新GPS数据')
                  : '未设置基准点'}
              </div>
            </div>
          </div>
        </div>

        {/* 数据质量卡片 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">数据质量</p>
              <div className="flex items-center space-x-2 mt-1">
                <span
                  className="text-2xl font-bold"
                  style={{
                    color: (analysis?.dataQuality?.qualityScore || 0) > 0.8 ? '#10b981' :
                           (analysis?.dataQuality?.qualityScore || 0) > 0.6 ? '#f59e0b' : '#ef4444'
                  }}
                >
                  {((analysis?.dataQuality?.qualityScore || 0) * 100).toFixed(1)}
                </span>
                <span className="text-slate-400 text-sm">%</span>
              </div>
              <Progress
                percent={(analysis?.dataQuality?.qualityScore || 0) * 100}
                size="small"
                showInfo={false}
                strokeColor={(analysis?.dataQuality?.qualityScore || 0) > 0.8 ? '#10b981' :
                            (analysis?.dataQuality?.qualityScore || 0) > 0.6 ? '#f59e0b' : '#ef4444'}
                className="mt-2"
              />
            </div>
          </div>
        </div>

        {/* 数据点数卡片 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">数据点数</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-2xl font-bold text-blue-400">
                  {chartData.length}
                </span>
                <span className="text-slate-400 text-sm">条</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
        <Tabs
          defaultActiveKey="realtime"
          size="large"
          className="custom-tabs"
          style={{
            '--tabs-bg': 'rgba(51, 65, 85, 0.8)',
            '--tabs-border': 'rgba(100, 116, 139, 0.5)',
            '--tabs-text': '#cbd5e1',
            '--tabs-active': '#06b6d4'
          } as any}
        >
          <TabPane tab="实时监测" key="realtime">
            <Row gutter={[16, 16]}>
              {/* 位移趋势图 */}
              <Col xs={24} lg={12}>
                <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
                  <div className="p-4 border-b border-slate-600">
                    <h3 className="text-lg font-medium text-cyan-300">位移趋势图</h3>
                  </div>
                  <div className="p-4">
                  <ReactECharts
                    option={{
                      backgroundColor: 'transparent',
                      title: {
                        text: '3D位移变化',
                        left: 'center',
                        textStyle: { fontSize: 14, color: '#94a3b8' }
                      },
                      tooltip: {
                        trigger: 'axis' as const,
                        backgroundColor: 'rgba(51, 65, 85, 0.9)',
                        borderColor: 'rgba(100, 116, 139, 0.5)',
                        textStyle: { color: '#e2e8f0' }
                      },
                      legend: {
                        data: ['总位移', '水平位移', '垂直位移'],
                        top: 30,
                        textStyle: { color: '#cbd5e1', fontSize: 12 },
                        itemWidth: 20,
                        itemHeight: 12,
                        itemGap: 20,
                        icon: 'roundRect'
                      },
                      grid: {
                        left: '12%',
                        right: '8%',
                        bottom: '20%',
                        top: '25%',
                        borderColor: 'rgba(100, 116, 139, 0.3)'
                      },
                      xAxis: {
                        type: 'category' as const,
                        data: chartData.map(item => item.time),
                        name: '时间',
                        nameTextStyle: { color: '#94a3b8' },
                        axisLabel: { color: '#94a3b8' },
                        axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
                        splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }
                      },
                      yAxis: {
                        type: 'value' as const,
                        name: '位移 (mm)',
                        nameTextStyle: { color: '#94a3b8' },
                        axisLabel: { color: '#94a3b8' },
                        axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
                        splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } },
                        scale: true,
                        min: function(value: any) {
                          return Math.floor(value.min * 0.9);
                        },
                        max: function(value: any) {
                          return Math.ceil(value.max * 1.1);
                        }
                      },
                      series: [
                        {
                          name: '总位移',
                          type: 'line' as const,
                          data: chartData.map(item => item.displacement),
                          smooth: true,
                          lineStyle: {
                            color: '#22d3ee',
                            width: 3,
                            shadowColor: 'rgba(34, 211, 238, 0.3)',
                            shadowBlur: 8,
                            shadowOffsetY: 2
                          },
                          itemStyle: {
                            color: '#22d3ee',
                            borderColor: '#0891b2',
                            borderWidth: 2
                          },
                          areaStyle: {
                            color: {
                              type: 'linear',
                              x: 0, y: 0, x2: 0, y2: 1,
                              colorStops: [
                                { offset: 0, color: 'rgba(34, 211, 238, 0.3)' },
                                { offset: 1, color: 'rgba(34, 211, 238, 0.05)' }
                              ]
                            }
                          },
                          emphasis: {
                            lineStyle: { width: 4 }
                          }
                        },
                        {
                          name: '水平位移',
                          type: 'line' as const,
                          data: chartData.map(item => item.horizontal),
                          smooth: true,
                          lineStyle: {
                            color: '#34d399',
                            width: 2.5,
                            shadowColor: 'rgba(52, 211, 153, 0.2)',
                            shadowBlur: 6
                          },
                          itemStyle: {
                            color: '#34d399',
                            borderColor: '#059669',
                            borderWidth: 1
                          },
                          emphasis: {
                            lineStyle: { width: 3.5 }
                          }
                        },
                        {
                          name: '垂直位移',
                          type: 'line' as const,
                          data: chartData.map(item => item.vertical),
                          smooth: true,
                          lineStyle: {
                            color: '#fbbf24',
                            width: 2.5,
                            shadowColor: 'rgba(251, 191, 36, 0.2)',
                            shadowBlur: 6
                          },
                          itemStyle: {
                            color: '#fbbf24',
                            borderColor: '#d97706',
                            borderWidth: 1
                          },
                          emphasis: {
                            lineStyle: { width: 3.5 }
                          }
                        }
                      ]
                    }}
                    style={{ height: '300px' }}
                  />
                  </div>
                </div>
              </Col>

              {/* 速度变化图 */}
              <Col xs={24} lg={12}>
                <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
                  <div className="p-4 border-b border-slate-600">
                    <h3 className="text-lg font-medium text-cyan-300">形变速度</h3>
                  </div>
                  <div className="p-4">
                  <ReactECharts
                    option={{
                      ...getChartTheme(),
                      title: { text: '形变速度变化', left: 'center', top: 10, textStyle: { fontSize: 14, color: '#94a3b8' } },
                      tooltip: { trigger: 'axis' as const, ...getChartTheme().tooltip },
                      legend: {
                        data: ['形变速度'],
                        top: 30,
                        textStyle: { color: '#cbd5e1', fontSize: 12 },
                        itemWidth: 20,
                        itemHeight: 12,
                        itemGap: 20,
                        icon: 'roundRect'
                      },
                      grid: { left: '12%', right: '8%', bottom: '20%', top: '25%', ...getChartTheme().grid },
                      xAxis: {
                        type: 'category' as const,
                        data: chartData.map(item => item.time),
                        name: '时间',
                        ...getChartTheme().xAxis
                      },
                      yAxis: {
                        type: 'value' as const,
                        name: '速度 (mm/h)',
                        ...getChartTheme().yAxis,
                        scale: true,
                        min: function(value: any) {
                          return Math.max(0, value.min - (value.max - value.min) * 0.1);
                        },
                        max: function(value: any) {
                          return value.max + (value.max - value.min) * 0.1;
                        }
                      },
                      series: [{
                        name: '形变速度',
                        type: 'line' as const,
                        data: chartData.map(item => item.velocity * 1000), // 转换为mm/h
                        smooth: true,
                        lineStyle: {
                          color: '#f87171',
                          width: 3,
                          shadowColor: 'rgba(248, 113, 113, 0.4)',
                          shadowBlur: 10,
                          shadowOffsetY: 3
                        },
                        areaStyle: {
                          color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                              { offset: 0, color: 'rgba(248, 113, 113, 0.4)' },
                              { offset: 0.5, color: 'rgba(248, 113, 113, 0.2)' },
                              { offset: 1, color: 'rgba(248, 113, 113, 0.05)' }
                            ]
                          }
                        },
                        itemStyle: {
                          color: '#f87171',
                          borderColor: '#dc2626',
                          borderWidth: 2,
                          shadowColor: 'rgba(248, 113, 113, 0.5)',
                          shadowBlur: 8
                        },
                        emphasis: {
                          lineStyle: { width: 4 },
                          itemStyle: {
                            color: '#fca5a5',
                            borderWidth: 3
                          }
                        }
                      }]
                    }}
                    style={{ height: '300px' }}
                  />
                  </div>
                </div>
              </Col>

              {/* 环境因素关联 */}
              <Col xs={24} lg={12}>
                <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
                  <div className="p-4 border-b border-slate-600">
                    <h3 className="text-lg font-medium text-cyan-300">环境因素</h3>
                  </div>
                  <div className="p-4">
                  <ReactECharts
                    option={{
                      ...getChartTheme(),
                      title: { text: '温度与湿度关联', left: 'center', textStyle: { fontSize: 14, color: '#94a3b8' } },
                      tooltip: {
                        trigger: 'axis' as const,
                        ...getChartTheme().tooltip,
                        formatter: function(params: any) {
                          let result = `<div style="color: #e2e8f0;">${params[0].axisValue}</div>`;
                          params.forEach((param: any) => {
                            const unit = param.seriesName === '温度' ? '°C' : '%';
                            result += `<div style="color: ${param.color};">
                              <span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${param.color};"></span>
                              ${param.seriesName}: ${param.value}${unit}
                            </div>`;
                          });
                          return result;
                        }
                      },
                      legend: {
                        data: ['温度', '湿度'],
                        top: 30,
                        textStyle: { color: '#cbd5e1', fontSize: 11 },
                        itemWidth: 12,
                        itemHeight: 8,
                        itemGap: 15,
                        icon: 'circle'
                      },
                      grid: { left: '15%', right: '15%', bottom: '20%', top: '25%', ...getChartTheme().grid },
                      xAxis: {
                        type: 'category' as const,
                        data: chartData.map(item => item.time),
                        name: '时间',
                        nameLocation: 'end',
                        nameGap: 15,
                        nameTextStyle: {
                          color: '#94a3b8',
                          padding: [0, 0, 0, 20]
                        },
                        axisLabel: { color: '#94a3b8' },
                        axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
                        splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }
                      },
                      yAxis: [
                        {
                          type: 'value' as const,
                          name: '温度 (°C)',
                          position: 'left',
                          ...getChartTheme().yAxis,
                          nameLocation: 'middle',
                          nameGap: 50,
                          axisLabel: {
                            color: '#fb923c',
                            formatter: '{value}°C',
                            margin: 8
                          }
                        },
                        {
                          type: 'value' as const,
                          name: '湿度 (%)',
                          position: 'right',
                          ...getChartTheme().yAxis,
                          nameLocation: 'middle',
                          nameGap: 50,
                          axisLabel: {
                            color: '#38bdf8',
                            formatter: '{value}%',
                            margin: 8
                          }
                        }
                      ],
                      series: [
                        {
                          name: '温度',
                          type: 'line' as const,
                          data: chartData.map(item => item.temperature),
                          smooth: true,
                          lineStyle: {
                            color: '#fb923c',
                            width: 2.5,
                            shadowColor: 'rgba(251, 146, 60, 0.3)',
                            shadowBlur: 8
                          },
                          itemStyle: {
                            color: '#fb923c',
                            borderColor: '#ea580c',
                            borderWidth: 2
                          },
                          yAxisIndex: 0,
                          symbol: 'circle',
                          symbolSize: 6,
                          emphasis: {
                            lineStyle: { width: 3.5 }
                          }
                        },
                        {
                          name: '湿度',
                          type: 'line' as const,
                          data: chartData.map(item => item.humidity),
                          smooth: true,
                          lineStyle: {
                            color: '#38bdf8',
                            width: 2.5,
                            shadowColor: 'rgba(56, 189, 248, 0.3)',
                            shadowBlur: 8
                          },
                          itemStyle: {
                            color: '#38bdf8',
                            borderColor: '#0284c7',
                            borderWidth: 2
                          },
                          yAxisIndex: 1,
                          symbol: 'diamond',
                          symbolSize: 6,
                          emphasis: {
                            lineStyle: { width: 3.5 }
                          }
                        }
                      ]
                    }}
                    style={{ height: '300px' }}
                  />
                  </div>
                </div>
              </Col>

              {/* 数据质量监控 */}
              <Col xs={24} lg={12}>
                <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
                  <div className="p-4 border-b border-slate-600">
                    <h3 className="text-lg font-medium text-cyan-300">数据质量监控</h3>
                  </div>
                  <div className="p-4">
                    <ReactECharts
                      option={{
                        ...getChartTheme(),
                        title: { text: '置信度散点分布', left: 'center', top: 10, textStyle: { fontSize: 14, color: '#94a3b8' } },
                        tooltip: {
                          trigger: 'item' as const,
                          ...getChartTheme().tooltip,
                          formatter: function(params: any) {
                            const confidence = (params.data[1] * 100).toFixed(1);
                            return `<div style="color: #e2e8f0;">
                              数据点: ${params.data[0]}<br/>
                              置信度: ${confidence}%
                            </div>`;
                          }
                        },
                        legend: {
                          data: ['高置信度 (>80%)', '中置信度 (60-80%)', '低置信度 (<60%)'],
                          top: 30,
                          textStyle: { color: '#cbd5e1', fontSize: 11 },
                          itemWidth: 12,
                          itemHeight: 8,
                          itemGap: 15,
                          icon: 'circle'
                        },
                        grid: { left: '12%', right: '10%', bottom: '20%', top: '25%', ...getChartTheme().grid },
                        xAxis: {
                          type: 'value' as const,
                          name: '数据点序号',
                          ...getChartTheme().xAxis
                        },
                        yAxis: {
                          type: 'value' as const,
                          name: '置信度',
                          min: 0,
                          max: 1,
                          ...getChartTheme().yAxis,
                          axisLabel: {
                            color: '#94a3b8',
                            formatter: function(value: number) {
                              return (value * 100).toFixed(0) + '%';
                            }
                          }
                        },
                        series: [
                          {
                            name: '高置信度 (>80%)',
                            type: 'scatter' as const,
                            data: chartData
                              .map((item, index) => item.confidence > 0.8 ? [index + 1, item.confidence] : null)
                              .filter(item => item !== null),
                            symbolSize: 8,
                            itemStyle: {
                              color: '#10b981',
                              borderColor: '#059669',
                              borderWidth: 1,
                              shadowColor: 'rgba(16, 185, 129, 0.3)',
                              shadowBlur: 4
                            },
                            emphasis: {
                              itemStyle: {
                                shadowBlur: 8,
                                shadowColor: 'rgba(16, 185, 129, 0.5)'
                              }
                            }
                          },
                          {
                            name: '中置信度 (60-80%)',
                            type: 'scatter' as const,
                            data: chartData
                              .map((item, index) => (item.confidence > 0.6 && item.confidence <= 0.8) ? [index + 1, item.confidence] : null)
                              .filter(item => item !== null),
                            symbolSize: 6,
                            itemStyle: {
                              color: '#f59e0b',
                              borderColor: '#d97706',
                              borderWidth: 1,
                              shadowColor: 'rgba(245, 158, 11, 0.3)',
                              shadowBlur: 4
                            },
                            emphasis: {
                              itemStyle: {
                                shadowBlur: 8,
                                shadowColor: 'rgba(245, 158, 11, 0.5)'
                              }
                            }
                          },
                          {
                            name: '低置信度 (<60%)',
                            type: 'scatter' as const,
                            data: chartData
                              .map((item, index) => item.confidence <= 0.6 ? [index + 1, item.confidence] : null)
                              .filter(item => item !== null),
                            symbolSize: 4,
                            itemStyle: {
                              color: '#ef4444',
                              borderColor: '#dc2626',
                              borderWidth: 1,
                              shadowColor: 'rgba(239, 68, 68, 0.3)',
                              shadowBlur: 4
                            },
                            emphasis: {
                              itemStyle: {
                                shadowBlur: 8,
                                shadowColor: 'rgba(239, 68, 68, 0.5)'
                              }
                            }
                          }
                        ]
                      }}
                      style={{ height: '300px' }}
                    />
                  </div>
                </div>
              </Col>
            </Row>
          </TabPane>
          
          <TabPane tab="CEEMD分解" key="ceemd">
            <Row gutter={[16, 16]}>
              {/* CEEMD分解结果概览 */}
              <Col xs={24}>
                <Card title="CEEMD分解概览" size="small">
                  <Row gutter={16}>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title="IMF分量数"
                        value={
                          analysis?.results?.ceemdDecomposition?.imfs?.length ||
                          analysis?.results?.ceemdAnalysis?.imfs?.length ||
                          0
                        }

                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title="信号长度"
                        value={chartData.length}
                        suffix="点"
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title="分解质量"
                        value={(() => {
                          // 优先使用补充的分解质量数据
                          if (analysis?.results?.ceemdAnalysis?.decompositionQuality?.qualityScore) {
                            return analysis.results.ceemdAnalysis.decompositionQuality.qualityScore * 100;
                          }
                          // 其次使用原始的分解质量数据
                          if (analysis?.results?.ceemdDecomposition?.imfAnalysis?.decompositionQuality?.qualityScore) {
                            return analysis.results.ceemdDecomposition.imfAnalysis.decompositionQuality.qualityScore * 100;
                          }
                          // 最后基于重构误差计算
                          if (analysis?.results?.ceemdAnalysis?.qualityMetrics?.reconstructionError !== undefined) {
                            return (1 - analysis.results.ceemdAnalysis.qualityMetrics.reconstructionError) * 100;
                          }
                          return 0;
                        })()}
                        precision={1}
                        suffix="%"
                        valueStyle={{ color: '#faad14' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* IMF分量展示 */}
              <Col xs={24} lg={12}>
                <Card title="IMF分量时域图" size="small">
                  <ReactECharts
                    option={{
                      backgroundColor: 'transparent',
                      title: {
                        text: 'IMF分量分解',
                        left: 'center',
                        textStyle: { fontSize: 14, color: '#94a3b8' }
                      },
                      tooltip: {
                        trigger: 'axis' as const,
                        backgroundColor: 'rgba(51, 65, 85, 0.9)',
                        borderColor: 'rgba(100, 116, 139, 0.5)',
                        textStyle: { color: '#e2e8f0' }
                      },
                      legend: {
                        data: (analysis?.results?.ceemdDecomposition?.imfs || analysis?.results?.ceemdAnalysis?.imfs || [])?.map((_, index) => `IMF${index + 1}`) || [],
                        top: 30,
                        textStyle: { color: '#cbd5e1', fontSize: 12 },
                        itemWidth: 20,
                        itemHeight: 12,
                        itemGap: 20,
                        icon: 'roundRect'
                      },
                      grid: {
                        left: '12%',
                        right: '8%',
                        bottom: '15%',
                        top: '20%'
                      },
                      xAxis: {
                        type: 'category' as const,
                        data: chartData.map((_, index) => index + 1),
                        name: '数据点',
                        nameTextStyle: { color: '#94a3b8' },
                        axisLabel: { color: '#94a3b8' },
                        axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
                        splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }
                      },
                      yAxis: {
                        type: 'value' as const,
                        name: '幅值 (mm)',
                        nameTextStyle: { color: '#94a3b8' },
                        axisLabel: { color: '#94a3b8' },
                        axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.5)' } },
                        splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } },
                        scale: true
                      },
                      series: (analysis?.results?.ceemdDecomposition?.imfs || analysis?.results?.ceemdAnalysis?.imfs || [])?.map((imf, index) => {
                        const colors = ['#22d3ee', '#34d399', '#fbbf24', '#ef4444', '#8b5cf6', '#06b6d4'];
                        const color = colors[index % colors.length];
                        return {
                          name: `IMF${index + 1}`,
                          type: 'line' as const,
                          data: imf.map((val: number) => val * 1000), // 转换为毫米
                          smooth: true,
                          lineStyle: {
                            color: color,
                            width: 2.5,
                            shadowColor: `${color}40`,
                            shadowBlur: 6
                          },
                          itemStyle: {
                            color: color,
                            borderColor: color,
                            borderWidth: 1
                          },
                          emphasis: {
                            lineStyle: { width: 3.5 }
                          },
                          sampling: 'average'
                        };
                      }) || []
                    }}
                    style={{ height: '350px' }}
                  />
                </Card>
              </Col>

              {/* 频谱分析 */}
              <Col xs={24} lg={12}>
                <Card title="IMF频谱分析" size="small">
                  <ReactECharts
                    option={{
                      ...getChartTheme(),
                      title: { text: 'IMF频谱特征', left: 'center', top: 10, textStyle: { fontSize: 14, color: '#94a3b8' } },
                      tooltip: {
                        trigger: 'axis' as const,
                        ...getChartTheme().tooltip,
                        formatter: function(params: any) {
                          const value = params[0].value.toFixed(3);
                          return `<div style="color: #e2e8f0;">
                            ${params[0].axisValue}<br/>
                            主频率: ${value} Hz
                          </div>`;
                        }
                      },
                      legend: {
                        data: ['主频率'],
                        top: 35,
                        textStyle: { color: '#cbd5e1', fontSize: 12 },
                        itemWidth: 20,
                        itemHeight: 12,
                        itemGap: 20,
                        icon: 'roundRect'
                      },
                      grid: { left: '12%', right: '8%', bottom: '20%', top: '30%', ...getChartTheme().grid },
                      xAxis: {
                        type: 'category' as const,
                        data: (analysis?.results?.ceemdDecomposition?.imfs || analysis?.results?.ceemdAnalysis?.imfs || [])?.map((_, index) => `IMF${index + 1}`) || [],
                        name: 'IMF分量',
                        ...getChartTheme().xAxis
                      },
                      yAxis: {
                        type: 'value' as const,
                        name: '主频率 (Hz)',
                        ...getChartTheme().yAxis
                      },
                      series: [{
                        name: '主频率',
                        type: 'bar' as const,
                        data: analysis?.results?.ceemdDecomposition?.imfAnalysis?.dominantFrequencies ||
                              analysis?.results?.ceemdAnalysis?.dominantFrequencies || [],
                        itemStyle: {
                          color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                              { offset: 0, color: '#06b6d4' },
                              { offset: 1, color: '#0891b2' }
                            ]
                          },
                          borderColor: '#0891b2',
                          borderWidth: 1,
                          shadowColor: 'rgba(6, 182, 212, 0.3)',
                          shadowBlur: 8
                        },
                        emphasis: {
                          itemStyle: {
                            color: '#22d3ee',
                            shadowBlur: 12
                          }
                        }
                      }]
                    }}
                    style={{ height: '350px' }}
                  />
                </Card>
              </Col>

              {/* 残差分量 */}
              <Col xs={24} lg={12}>
                <Card title="残差分量（趋势）" size="small">
                  <ReactECharts
                    option={{
                      ...getChartTheme(),
                      title: { text: '长期趋势分量', left: 'center', top: 10, textStyle: { fontSize: 14, color: '#94a3b8' } },
                      tooltip: {
                        trigger: 'axis' as const,
                        ...getChartTheme().tooltip
                      },
                      legend: {
                        data: ['趋势分量'],
                        top: 35,
                        textStyle: { color: '#cbd5e1', fontSize: 12 },
                        itemWidth: 20,
                        itemHeight: 12,
                        itemGap: 20,
                        icon: 'roundRect'
                      },
                      grid: { left: '12%', right: '8%', bottom: '20%', top: '30%', ...getChartTheme().grid },
                      xAxis: {
                        type: 'category' as const,
                        data: chartData.map(item => item.time),
                        name: '时间',
                        ...getChartTheme().xAxis
                      },
                      yAxis: {
                        type: 'value' as const,
                        name: '位移 (mm)',
                        ...getChartTheme().yAxis
                      },
                      series: [{
                        name: '趋势分量',
                        type: 'line' as const,
                        data: analysis?.results?.ceemdDecomposition?.residue?.map((val: number) => val * 1000) || [],
                        smooth: true,
                        lineStyle: {
                          color: '#a855f7',
                          width: 3,
                          shadowColor: 'rgba(168, 85, 247, 0.4)',
                          shadowBlur: 10
                        },
                        areaStyle: {
                          color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                              { offset: 0, color: 'rgba(168, 85, 247, 0.4)' },
                              { offset: 1, color: 'rgba(168, 85, 247, 0.05)' }
                            ]
                          }
                        },
                        itemStyle: {
                          color: '#a855f7',
                          borderColor: '#7c3aed',
                          borderWidth: 2
                        },
                        emphasis: {
                          lineStyle: { width: 4 }
                        }
                      }]
                    }}
                    style={{ height: '350px' }}
                  />
                </Card>
              </Col>

              {/* 能量分布 */}
              <Col xs={24} lg={12}>
                <Card title="IMF能量分布" size="small">
                  <ReactECharts
                    option={{
                      backgroundColor: 'transparent',
                      title: {
                        text: '各分量能量占比',
                        left: 'center',
                        top: 10,
                        textStyle: { fontSize: 14, color: '#94a3b8' }
                      },
                      tooltip: {
                        trigger: 'item' as const,
                        backgroundColor: 'rgba(51, 65, 85, 0.9)',
                        borderColor: 'rgba(100, 116, 139, 0.5)',
                        textStyle: { color: '#e2e8f0' },
                        formatter: function(params: any) {
                          return `<div style="color: #e2e8f0;">
                            <strong>${params.name}</strong><br/>
                            能量占比: <span style="color: #22d3ee;">${(params.percent).toFixed(1)}%</span><br/>
                            能量值: ${params.value.toFixed(4)}
                          </div>`;
                        }
                      },
                      legend: {
                        orient: 'horizontal',
                        left: 'center',
                        top: 35,
                        textStyle: { color: '#cbd5e1', fontSize: 12 },
                        itemWidth: 16,
                        itemHeight: 12,
                        itemGap: 20,
                        icon: 'circle'
                      },
                      series: [{
                        name: '能量分布',
                        type: 'pie' as const,
                        radius: ['35%', '65%'],
                        center: ['50%', '60%'],
                        avoidLabelOverlap: true,
                        data: (analysis?.results?.ceemdDecomposition?.imfAnalysis?.energyDistribution ||
                               analysis?.results?.ceemdAnalysis?.energyDistribution || [])?.map((energy: number, index: number) => {
                          const colors = ['#22d3ee', '#34d399', '#fbbf24', '#ef4444', '#8b5cf6', '#06b6d4'];
                          const color = colors[index % colors.length];
                          return {
                            value: energy,
                            name: `IMF${index + 1}`,
                            itemStyle: {
                              color: color,
                              borderColor: '#1e293b',
                              borderWidth: 2,
                              shadowColor: `${color}30`,
                              shadowBlur: 8,
                              shadowOffsetX: 2,
                              shadowOffsetY: 2
                            }
                          };
                        }) || [],
                        emphasis: {
                          itemStyle: {
                            shadowBlur: 15,
                            shadowOffsetX: 0,
                            shadowOffsetY: 0,
                            shadowColor: 'rgba(255, 255, 255, 0.4)'
                          },
                          label: {
                            show: true,
                            fontSize: 14,
                            fontWeight: 'bold',
                            color: '#ffffff'
                          }
                        },
                        labelLine: {
                          show: true,
                          length: 15,
                          length2: 8,
                          lineStyle: {
                            color: '#64748b',
                            width: 1
                          }
                        },
                        label: {
                          show: true,
                          position: 'outside',
                          fontSize: 11,
                          color: '#cbd5e1',
                          formatter: '{d}%',
                          distanceToLabelLine: 3
                        }
                      }]
                    }}
                    style={{ height: '350px' }}
                  />
                </Card>
              </Col>
            </Row>
          </TabPane>
          
          <TabPane tab="预测分析" key="prediction">
            {/* 数据转换为增强组件需要的格式 */}
            {React.useMemo(() => {
              const convertedChartData: ChartDataPoint[] = chartData.map(item => ({
                timestamp: new Date(item.timestamp).toISOString(),
                value: item.displacement,
                displacement: item.displacement,
                time: item.time
              }));
              
              return (
                <Row gutter={[16, 16]}>
                  <EnhancedPredictionCharts
                    chartData={convertedChartData}
                    analysis={analysis}
                    getChartTheme={getChartTheme}
                  />
                </Row>
              );
            }, [chartData, analysis])}
          </TabPane>
          
          <TabPane tab="数据详情" key="data">
            <Row gutter={[16, 16]}>
              {/* 数据统计概览 */}
              <Col xs={24}>
                <Card title="数据统计概览" size="small">
                  <Row gutter={16}>
                    <Col xs={24} sm={6}>
                      <Statistic
                        title="数据总量"
                        value={chartData.length}
                        suffix="条"
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                    <Col xs={24} sm={6}>
                      <Statistic
                        title="最大位移"
                        value={chartData.length > 0 ? Math.max(...chartData.map(d => d.displacement)) : 0}
                        precision={2}
                        suffix="mm"
                        valueStyle={{ color: '#f5222d' }}
                      />
                    </Col>
                    <Col xs={24} sm={6}>
                      <Statistic
                        title="平均位移"
                        value={chartData.length > 0 ?
                          chartData.reduce((sum, d) => sum + d.displacement, 0) / chartData.length : 0
                        }
                        precision={2}
                        suffix="mm"
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                    <Col xs={24} sm={6}>
                      <Statistic
                        title="数据时间跨度"
                        value={chartData.length > 1 ?
                          Math.round((chartData[chartData.length - 1].timestamp - chartData[0].timestamp) / (1000 * 60 * 60)) : 0
                        }
                        suffix="小时"
                        valueStyle={{ color: '#722ed1' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* 详细数据表格 */}
              <Col xs={24}>
                <Card
                  title="GPS形变数据详情"
                  size="small"
                  extra={
                    <Space>
                      <Button
                        icon={<ExportOutlined />}
                        onClick={() => message.info('导出功能开发中')}
                      >
                        导出Excel
                      </Button>
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => {
                          console.log('🔄 强制刷新数据...');
                          // 清除可能的缓存
                          setAnalysis(null);
                          setGpsData([]);
                          fetchData();
                        }}
                        loading={loading}
                      >
                        强制刷新
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    dataSource={chartData}
                    rowKey="index"
                    size="small"
                    scroll={{ x: 1200, y: 400 }}
                    pagination={{
                      pageSize: 20,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total) => `共 ${total} 条数据`
                    }}
                    columns={[
                      {
                        title: '序号',
                        dataIndex: 'index',
                        key: 'index',
                        width: 80,
                        fixed: 'left'
                      },
                      {
                        title: '时间',
                        dataIndex: 'time',
                        key: 'time',
                        width: 120,
                        fixed: 'left'
                      },
                      {
                        title: '总位移(mm)',
                        dataIndex: 'displacement',
                        key: 'displacement',
                        render: (val: number) => val.toFixed(2),
                        width: 100,
                        sorter: (a, b) => a.displacement - b.displacement
                      },
                      {
                        title: '水平位移(mm)',
                        dataIndex: 'horizontal',
                        key: 'horizontal',
                        render: (val: number) => val.toFixed(2),
                        width: 110,
                        sorter: (a, b) => a.horizontal - b.horizontal
                      },
                      {
                        title: '垂直位移(mm)',
                        dataIndex: 'vertical',
                        key: 'vertical',
                        render: (val: number) => val.toFixed(2),
                        width: 110,
                        sorter: (a, b) => a.vertical - b.vertical
                      },
                      {
                        title: '形变速度',
                        dataIndex: 'velocity',
                        key: 'velocity',
                        render: (val: number) => (val * 1000).toFixed(3),
                        width: 100,
                        sorter: (a, b) => a.velocity - b.velocity
                      },
                      {
                        title: '置信度',
                        dataIndex: 'confidence',
                        key: 'confidence',
                        render: (val: number) => (
                          <Tag color={val > 0.8 ? 'green' : val > 0.6 ? 'orange' : 'red'}>
                            {(val * 100).toFixed(1)}%
                          </Tag>
                        ),
                        width: 100,
                        sorter: (a, b) => a.confidence - b.confidence
                      },
                      {
                        title: '风险等级',
                        dataIndex: 'riskLevel',
                        key: 'riskLevel',
                        render: (level: number) => (
                          <Tag color={getRiskColor(level)}>
                            {getRiskDescription(level)}
                          </Tag>
                        ),
                        width: 100,
                        sorter: (a, b) => a.riskLevel - b.riskLevel
                      },
                      {
                        title: '温度(°C)',
                        dataIndex: 'temperature',
                        key: 'temperature',
                        render: (val: number) => val.toFixed(1),
                        width: 100,
                        sorter: (a, b) => a.temperature - b.temperature
                      },
                      {
                        title: '湿度(%)',
                        dataIndex: 'humidity',
                        key: 'humidity',
                        render: (val: number) => val.toFixed(1),
                        width: 100,
                        sorter: (a, b) => a.humidity - b.humidity
                      }
                    ]}
                  />
                </Card>
              </Col>

              {/* 数据质量分析 */}
              <Col xs={24} lg={12}>
                <Card 
                  title="数据质量分析" 
                  size="small"
                  style={{ height: '400px' }}
                  bodyStyle={{ 
                    height: 'calc(100% - 57px)', 
                    display: 'flex', 
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{ padding: '20px 0' }}>
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Statistic
                          title="完整性"
                          value={(analysis?.dataQuality?.completeness || 0) * 100}
                          precision={1}
                          suffix="%"
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="一致性"
                          value={(analysis?.dataQuality?.consistency || 0) * 100}
                          precision={1}
                          suffix="%"
                          valueStyle={{ color: '#1890ff' }}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="精度"
                          value={(analysis?.dataQuality?.accuracy || 0) * 100}
                          precision={1}
                          suffix="%"
                          valueStyle={{ color: '#faad14' }}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="总体评分"
                          value={(analysis?.dataQuality?.qualityScore || 0) * 100}
                          precision={1}
                          suffix="%"
                          valueStyle={{
                            color: (analysis?.dataQuality?.qualityScore || 0) > 0.8 ? '#52c41a' :
                                   (analysis?.dataQuality?.qualityScore || 0) > 0.6 ? '#faad14' : '#f5222d'
                          }}
                        />
                      </Col>
                    </Row>
                    <Progress
                      percent={(analysis?.dataQuality?.qualityScore || 0) * 100}
                      strokeColor={(analysis?.dataQuality?.qualityScore || 0) > 0.8 ? '#52c41a' :
                                  (analysis?.dataQuality?.qualityScore || 0) > 0.6 ? '#faad14' : '#f5222d'}
                      style={{ marginTop: '16px' }}
                    />
                  </div>
                </Card>
              </Col>

              {/* 统计分析 */}
              <Col xs={24} lg={12}>
                <Card 
                  title="统计分析" 
                  size="small"
                  style={{ height: '400px' }}
                  bodyStyle={{ 
                    height: 'calc(100% - 57px)', 
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {chartData.length > 0 ? (
                    <ReactECharts
                      option={{
                        title: { 
                          text: '位移分布直方图', 
                          left: 'center', 
                          textStyle: { fontSize: 14, color: '#cbd5e1' } 
                        },
                        tooltip: { 
                          trigger: 'axis' as const,
                          backgroundColor: 'rgba(51, 65, 85, 0.9)',
                          textStyle: { color: '#cbd5e1' }
                        },
                        grid: { left: '12%', right: '10%', bottom: '15%', top: '20%' },
                        xAxis: {
                          type: 'category' as const,
                          data: (() => {
                            // 动态计算位移区间，基于实际数据范围
                            const displacements = chartData.map(d => Math.abs(d.displacement));
                            const maxDisplacement = Math.max(...displacements);
                            const minDisplacement = Math.min(...displacements);
                            const range = maxDisplacement - minDisplacement;
                            const intervalSize = Math.max(0.1, range / 10); // 至少0.1mm间隔
                            
                            return Array.from({length: 10}, (_, i) => {
                              const min = minDisplacement + i * intervalSize;
                              const max = minDisplacement + (i + 1) * intervalSize;
                              return `${min.toFixed(2)}-${max.toFixed(2)}mm`;
                            });
                          })(),
                          name: '位移区间',
                          nameTextStyle: { color: '#94a3b8' },
                          axisLabel: { color: '#94a3b8' }
                        },
                        yAxis: { 
                          type: 'value' as const, 
                          name: '数据点数',
                          nameTextStyle: { color: '#94a3b8' },
                          axisLabel: { color: '#94a3b8' }
                        },
                        series: [{
                          name: '分布',
                          type: 'bar' as const,
                          data: (() => {
                            // 基于实际数据范围动态分组
                            const displacements = chartData.map(d => Math.abs(d.displacement));
                            const maxDisplacement = Math.max(...displacements);
                            const minDisplacement = Math.min(...displacements);
                            const range = maxDisplacement - minDisplacement;
                            const intervalSize = Math.max(0.1, range / 10);
                            
                            return Array.from({length: 10}, (_, i) => {
                              const min = minDisplacement + i * intervalSize;
                              const max = minDisplacement + (i + 1) * intervalSize;
                              return chartData.filter(d => {
                                const absDisplacement = Math.abs(d.displacement);
                                return absDisplacement >= min && absDisplacement < max;
                              }).length;
                            });
                          })(),
                          itemStyle: { 
                            color: '#22d3ee',
                            borderRadius: [4, 4, 0, 0]
                          },
                          emphasis: {
                            itemStyle: {
                              color: '#0891b2'
                            }
                          }
                        }]
                      }}
                      style={{ height: '100%', width: '100%' }}
                    />
                  ) : (
                    <div style={{ 
                      height: '100%', 
                      width: '100%',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: '#94a3b8',
                      fontSize: '16px'
                    }}>
                      暂无数据，请先加载GPS数据
                    </div>
                  )}
                </Card>
              </Col>
            </Row>
          </TabPane>
        </Tabs>
      </div>
    </div>
  );
}
