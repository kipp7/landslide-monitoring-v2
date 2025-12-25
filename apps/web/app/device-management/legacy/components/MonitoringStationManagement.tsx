// 监测站管理组件 - 集成到设备管理页面中
'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  message,
  Tooltip,
  Badge,
  Switch,
  InputNumber,
  Typography,
  Popconfirm,
  Row,
  Col
} from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  EnvironmentOutlined,
  RadarChartOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  EyeOutlined,
  CaretDownOutlined,
  CaretRightOutlined
} from '@ant-design/icons';
import { useMonitoringStations, MonitoringStation } from '../hooks/useMonitoringStations';

const { Text, Title } = Typography;
const { Option } = Select;

interface MonitoringStationManagementProps {
  className?: string;
}

export default function MonitoringStationManagement({ className = '' }: MonitoringStationManagementProps) {
  const {
    stations,
    loading,
    error,
    updateStation,
    updateChartLegends,
    refresh,
    onlineCount,
    offlineCount,
    totalCount
  } = useMonitoringStations({ 
    autoRefresh: true, 
    refreshInterval: 30000,
    enableCache: true 
  });

  const [viewMode, setViewMode] = useState<'list' | 'hierarchy'>('list');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [legendModalVisible, setLegendModalVisible] = useState(false);
  const [editingStation, setEditingStation] = useState<MonitoringStation | null>(null);
  const [form] = Form.useForm();
  const [legendForm] = Form.useForm();

  // 分层视图展开/收缩状态
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set(['GBS'])); // 默认展开第一个区域
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set(['GBS-N001'])); // 默认展开第一个网络

  // 展开/收缩控制函数
  const toggleRegionExpanded = (regionCode: string) => {
    const newExpanded = new Set(expandedRegions);
    if (newExpanded.has(regionCode)) {
      newExpanded.delete(regionCode);
      // 当区域收缩时，也收缩其下的所有网络
      setExpandedNetworks(prev => {
        const newNetworks = new Set(prev);
        newNetworks.delete('GBS-N001'); // 这里简化处理，实际应该根据regionCode查找相关网络
        return newNetworks;
      });
    } else {
      newExpanded.add(regionCode);
    }
    setExpandedRegions(newExpanded);
  };

  const toggleNetworkExpanded = (networkCode: string) => {
    const newExpanded = new Set(expandedNetworks);
    if (newExpanded.has(networkCode)) {
      newExpanded.delete(networkCode);
    } else {
      newExpanded.add(networkCode);
    }
    setExpandedNetworks(newExpanded);
  };

  // 全部展开/收缩功能
  const toggleAllExpanded = () => {
    const { allRegions } = generateHierarchyData();
    const allRegionCodes = allRegions.map(r => r.region_code);
    const allNetworks = ['GBS-N001']; // 主网络，其他区域暂时没有具体网络
    
    const isAllExpanded = allRegionCodes.every(region => expandedRegions.has(region)) && 
                         allNetworks.every(network => expandedNetworks.has(network));
    
    if (isAllExpanded) {
      // 全部收缩
      setExpandedRegions(new Set());
      setExpandedNetworks(new Set());
    } else {
      // 全部展开
      setExpandedRegions(new Set(allRegionCodes));
      setExpandedNetworks(new Set(allNetworks));
    }
  };

  // 分层管理数据（简化版，基于现有stations数据）
  const generateHierarchyData = () => {
    // 主要区域
    const mockRegion = {
      region_name: '挂傍山监测区域',
      region_code: 'GBS',
      network_count: 1,
      station_count: stations.length,
      online_stations: stations.filter(s => s.is_online).length,
      region_coverage_area: 0.785
    };

    const mockNetwork = {
      network_name: '挂傍山立体监测网络',
      network_code: 'GBS-N001',
      network_type: '立体监测网络',
      configured_station_count: 3,
      actual_station_count: stations.length,
      online_stations: stations.filter(s => s.is_online).length
    };

    // 额外区域示例（演示折叠功能）
    const additionalRegions = [
      {
        region_name: '玉林师范学院东校区',
        region_code: 'YLNU',
        network_count: 1,
        station_count: 2,
        online_stations: 1,
        region_coverage_area: 0.45
      },
      {
        region_name: '南流江流域监测区',
        region_code: 'NLJ',
        network_count: 2,
        station_count: 6,
        online_stations: 5,
        region_coverage_area: 2.15
      }
    ];

    return { 
      mockRegion, 
      mockNetwork, 
      additionalRegions,
      allRegions: [mockRegion, ...additionalRegions]
    };
  };

  // 处理编辑监测站
  const handleEdit = (station: MonitoringStation) => {
    setEditingStation(station);
    form.setFieldsValue({
      ...station,
      sensor_types: station.sensor_types || []
    });
    setEditModalVisible(true);
  };

  // 保存监测站信息
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (!editingStation) return;

      await updateStation(editingStation.device_id, {
        station_name: values.station_name,
        location_name: values.location_name,
        description: values.description,
        risk_level: values.risk_level,
        status: values.status,
        sensor_types: values.sensor_types,
        chart_legend_name: values.chart_legend_name
      });

      message.success(`监测站 ${values.station_name} 信息更新成功`);
      setEditModalVisible(false);
      setEditingStation(null);
      form.resetFields();
    } catch (error) {
      console.error('更新监测站信息失败:', error);
      message.error('更新监测站信息失败');
    }
  };

  // 处理图例配置
  const handleLegendConfig = () => {
    const legendData = stations.reduce((acc, station) => {
      acc[station.device_id] = station.chart_legend_name;
      return acc;
    }, {} as { [key: string]: string });

    legendForm.setFieldsValue(legendData);
    setLegendModalVisible(true);
  };

  // 保存图例配置
  const handleSaveLegends = async () => {
    try {
      const values = await legendForm.validateFields();
      
      // 更新所有图表类型的图例
      const chartTypes = ['temperature', 'humidity', 'acceleration', 'gyroscope'];
      
      for (const chartType of chartTypes) {
        await updateChartLegends(chartType, values);
      }

      message.success('图例配置更新成功');
      setLegendModalVisible(false);
    } catch (error) {
      console.error('更新图例配置失败:', error);
      message.error('更新图例配置失败');
    }
  };

  // 获取状态标签
  const getStatusTag = (status: string, isOnline?: boolean) => {
    if (isOnline === false) {
      return <Tag color="red" icon={<ExclamationCircleOutlined />}>离线</Tag>;
    }
    
    switch (status) {
      case 'active':
        return <Tag color="green" icon={<CheckCircleOutlined />}>运行中</Tag>;
      case 'maintenance':
        return <Tag color="orange" icon={<ClockCircleOutlined />}>维护中</Tag>;
      case 'inactive':
        return <Tag color="red" icon={<ExclamationCircleOutlined />}>未激活</Tag>;
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  // 获取风险等级标签
  const getRiskTag = (riskLevel: string) => {
    const riskConfig = {
      'low': { color: 'green', text: '低风险' },
      'medium': { color: 'orange', text: '中风险' },
      'high': { color: 'red', text: '高风险' },
      'critical': { color: 'red', text: '极高风险' }
    };
    
    const config = riskConfig[riskLevel as keyof typeof riskConfig] || { color: 'default', text: riskLevel };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 表格列配置
  const columns = [
    {
      title: '监测站',
      dataIndex: 'station_name',
      key: 'station_name',
      width: 140,
      render: (text: string, record: MonitoringStation) => (
        <Space direction="vertical" size={2}>
          <Text strong className="text-cyan-400">{text}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }} className="text-slate-400">
            {record.device_id}
          </Text>
        </Space>
      ),
    },
    {
      title: '位置信息',
      key: 'location',
      width: 200,
      render: (record: MonitoringStation) => (
        <Space direction="vertical" size={2}>
          <Text className="text-white">{record.location_name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }} className="text-slate-400">
            <EnvironmentOutlined /> {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}
          </Text>
          {record.altitude && (
            <Text type="secondary" style={{ fontSize: '12px' }} className="text-slate-400">
              海拔: {Math.round(record.altitude)}m
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (record: MonitoringStation) => (
        <div className="flex items-center space-x-2">
          {getStatusTag(record.status, record.is_online)}
          <div className={`w-2 h-2 rounded-full ${record.is_online ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
        </div>
      ),
    },
    {
      title: '风险等级',
      dataIndex: 'risk_level',
      key: 'risk_level',
      width: 80,
      render: (riskLevel: string) => getRiskTag(riskLevel),
    },
    {
      title: '传感器',
      dataIndex: 'sensor_types',
      key: 'sensor_types',
      width: 120,
      render: (sensorTypes: string[]) => (
        <Space size={[0, 4]} wrap>
          {(sensorTypes || []).slice(0, 3).map((type) => (
            <Tag key={type} color="blue" style={{ fontSize: '11px', margin: '1px' }}>
              {type}
            </Tag>
          ))}
          {(sensorTypes || []).length > 3 && (
            <Tag color="default" style={{ fontSize: '11px' }}>
              +{(sensorTypes || []).length - 3}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '图例名称',
      dataIndex: 'chart_legend_name',
      key: 'chart_legend_name',
      width: 100,
      render: (text: string) => (
        <Tooltip title="图表中显示的名称">
          <Text style={{ fontSize: '13px' }} ellipsis className="text-white">
            {text}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (record: MonitoringStation) => (
        <Space size={4}>
          <Tooltip title="编辑监测站">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => message.info('详情页面开发中')}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className={`${className}`}>
      <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
        <div className="px-6 py-4 border-b border-slate-600">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-lg font-bold text-white flex items-center space-x-2 mb-2">
                <RadarChartOutlined className="text-cyan-400" />
                <span>挂傍山监测站管理</span>
              </h4>
              <p className="text-sm text-slate-300">
                统一管理监测站配置、图表图例和传感器设置
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* 视图切换 */}
              <div className="flex bg-slate-700/50 rounded-lg p-1 border border-slate-600">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center space-x-1.5 ${
                    viewMode === 'list'
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>列表视图</span>
                </button>
                <button
                  onClick={() => setViewMode('hierarchy')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center space-x-1.5 ${
                    viewMode === 'hierarchy'
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>分层视图</span>
                </button>
              </div>

              {/* 分层视图专用按钮 */}
              {viewMode === 'hierarchy' && (
                <button
                  onClick={toggleAllExpanded}
                  className="px-3 py-2 bg-slate-600 text-slate-200 text-xs border border-slate-500 rounded-lg hover:bg-slate-500 hover:text-white transition-colors flex items-center space-x-2"
                >
                  {expandedRegions.size > 0 ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  <span>{expandedRegions.size > 0 ? '全部收缩' : '全部展开'}</span>
                </button>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handleLegendConfig}
                  className="px-4 py-2 bg-cyan-500 text-white text-sm rounded-lg hover:bg-cyan-600 transition-colors flex items-center space-x-2"
                >
                  <SettingOutlined />
                  <span>图例配置</span>
                </button>
                <button
                  onClick={() => refresh(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-700 text-slate-200 text-sm border border-slate-600 rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors flex items-center space-x-2"
                >
                  <ReloadOutlined className={loading ? 'animate-spin' : ''} />
                  <span>{loading ? '刷新中...' : '刷新'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 主要内容区域 */}
        {viewMode === 'list' ? (
          /* 列表视图 */
          <div className="px-6 py-4">
            {/* 状态统计 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                  <div>
                    <div className="text-sm text-slate-400">总监测站</div>
                    <div className="text-xl font-bold text-white">{totalCount}</div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <div>
                    <div className="text-sm text-slate-400">在线</div>
                    <div className="text-xl font-bold text-green-400">{onlineCount}</div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <div>
                    <div className="text-sm text-slate-400">离线</div>
                    <div className="text-xl font-bold text-red-400">{offlineCount}</div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div>
                    <div className="text-sm text-slate-400">高风险</div>
                    <div className="text-xl font-bold text-yellow-400">{stations.filter(s => s.risk_level === 'high').length}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 监测站列表 */}
            <div className="overflow-hidden rounded-lg border border-slate-600">
              <Table
                columns={columns}
                dataSource={stations}
                rowKey="device_id"
                loading={loading}
                size="small"
                pagination={false}
                scroll={{ x: 800 }}
                className="dark-table"
              />
            </div>
          </div>
        ) : (
          /* 分层视图 */
          <div className="px-6 py-4">
            {loading ? (
              <div className="text-center py-8">
                <Text className="text-gray-400">加载分层数据...</Text>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const { allRegions, mockNetwork } = generateHierarchyData();
                  return allRegions.map((region, index) => (
                    <div key={region.region_code} className="space-y-8">
                      {/* 区域信息 - 可折叠头部 */}
                      <div className="pb-6 border-b border-slate-600">
                        <div 
                          className="flex justify-between items-center cursor-pointer hover:bg-slate-700/20 p-2 -m-2 rounded transition-colors"
                          onClick={() => toggleRegionExpanded(region.region_code)}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="text-cyan-400 transition-transform">
                              {expandedRegions.has(region.region_code) ? 
                                <CaretDownOutlined /> : 
                                <CaretRightOutlined />
                              }
                            </div>
                            <div>
                              <h5 className="text-cyan-400 font-medium text-lg mb-1">
                                {region.region_name}
                              </h5>
                              <Text className="text-slate-400 text-sm">
                                {region.region_code} • 覆盖面积 {region.region_coverage_area} km²
                              </Text>
                            </div>
                          </div>
                          <div className="flex space-x-6 text-sm">
                            <div className="text-center">
                              <div className="text-cyan-400 font-bold text-lg">{region.network_count}</div>
                              <div className="text-slate-400 text-xs">网络</div>
                            </div>
                            <div className="text-center">
                              <div className="text-cyan-400 font-bold text-lg">{region.station_count}</div>
                              <div className="text-slate-400 text-xs">站点</div>
                            </div>
                            <div className="text-center">
                              <div className="text-green-400 font-bold text-lg">{region.online_stations}</div>
                              <div className="text-slate-400 text-xs">在线</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 区域展开内容 */}
                      {expandedRegions.has(region.region_code) && (
                        <div className="space-y-5 animate-in slide-in-from-top-2 duration-300">
                          {/* 只有主区域显示实际网络和站点，其他区域显示占位符 */}
                          {index === 0 ? (
                            /* 主区域 - 显示真实数据 */
                            <div key={mockNetwork.network_code} className="bg-slate-800/30 rounded-lg overflow-hidden">
                              <div 
                                className="flex justify-between items-center p-4 cursor-pointer hover:bg-slate-700/20 transition-colors"
                                onClick={() => toggleNetworkExpanded(mockNetwork.network_code)}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="text-slate-300 transition-transform">
                                    {expandedNetworks.has(mockNetwork.network_code) ? 
                                      <CaretDownOutlined /> : 
                                      <CaretRightOutlined />
                                    }
                                  </div>
                                  <div>
                                    <h6 className="text-white font-medium mb-1">
                                      {mockNetwork.network_name}
                                    </h6>
                                    <Text className="text-slate-400 text-sm">
                                      {mockNetwork.network_code} • {mockNetwork.network_type}
                                    </Text>
                                  </div>
                                </div>
                                <div className="flex space-x-4 text-sm">
                                  <span className="text-slate-300">
                                    配置 <span className="text-blue-400 font-medium">{mockNetwork.configured_station_count}</span>
                                  </span>
                                  <span className="text-slate-300">
                                    实际 <span className="text-green-400 font-medium">{mockNetwork.actual_station_count}</span>
                                  </span>
                                  <span className="text-slate-300">
                                    在线 <span className="text-cyan-400 font-medium">{mockNetwork.online_stations}</span>
                                  </span>
                                </div>
                              </div>

                              {/* 网络展开内容 - 站点网格 */}
                              {expandedNetworks.has(mockNetwork.network_code) && (
                                <div className="px-4 pt-4 pb-6 animate-in slide-in-from-top-2 duration-300">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    {stations.map(station => (
                                      <div key={station.device_id} className="bg-slate-700/40 hover:bg-slate-700/60 rounded-lg p-4 transition-colors group">
                                        <div className="flex justify-between items-start mb-3">
                                          <div className="flex-1">
                                            <Text className="text-white font-medium text-sm mb-1">
                                              {station.station_name}
                                            </Text>
                                            <Text className="text-slate-400 text-xs">
                                              {station.device_id}
                                            </Text>
                                          </div>
                                          <div className="ml-2">
                                            {getStatusTag(station.status, station.is_online)}
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <Text className="text-slate-500 text-xs">
                                            监测站
                                          </Text>
                                          <Button 
                                            type="text" 
                                            size="small"
                                            icon={<EditOutlined />}
                                            onClick={() => handleEdit(station)}
                                            className="text-slate-400 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-all"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* 其他区域 - 显示占位符 */
                            <div className="bg-slate-800/30 rounded-lg p-4 text-center">
                              <Text className="text-slate-400 text-sm">
                                {region.region_name} 详细数据开发中...
                              </Text>
                              <Text className="text-slate-500 text-xs mt-1">
                                此区域包含 {region.network_count} 个网络, {region.station_count} 个站点
                              </Text>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-6 py-4 text-center border-t border-slate-600">
            <div className="text-red-400 mb-2">
              <ExclamationCircleOutlined className="mr-2" />
              加载失败: {error}
            </div>
            <button 
              onClick={() => refresh(false)}
              className="text-cyan-400 hover:text-cyan-300 underline text-sm"
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* 编辑监测站模态框 */}
      <Modal
        title={`编辑监测站 - ${editingStation?.station_name}`}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingStation(null);
          form.resetFields();
        }}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="监测站名称"
                name="station_name"
                rules={[{ required: true, message: '请输入监测站名称' }]}
              >
                <Input placeholder="例如：挂傍山中心监测站" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="图例显示名称"
                name="chart_legend_name"
                rules={[{ required: true, message: '请输入图例名称' }]}
              >
                <Input placeholder="例如：中心监测站" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="位置描述"
            name="location_name"
            rules={[{ required: true, message: '请输入位置描述' }]}
          >
            <Input placeholder="例如：玉林师范学院东校区挂傍山中心点" />
          </Form.Item>

          <Form.Item
            label="详细描述"
            name="description"
          >
            <Input.TextArea 
              placeholder="监测站的详细描述信息"
              rows={3}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="风险等级"
                name="risk_level"
                rules={[{ required: true, message: '请选择风险等级' }]}
              >
                <Select placeholder="选择风险等级">
                  <Option value="low">低风险</Option>
                  <Option value="medium">中风险</Option>
                  <Option value="high">高风险</Option>
                  <Option value="critical">极高风险</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="运行状态"
                name="status"
                rules={[{ required: true, message: '请选择运行状态' }]}
              >
                <Select placeholder="选择运行状态">
                  <Option value="active">运行中</Option>
                  <Option value="maintenance">维护中</Option>
                  <Option value="inactive">未激活</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="支持的传感器类型"
            name="sensor_types"
          >
            <Select
              mode="multiple"
              placeholder="选择传感器类型"
              options={[
                { value: 'temperature', label: '温度传感器' },
                { value: 'humidity', label: '湿度传感器' },
                { value: 'acceleration', label: '加速度传感器' },
                { value: 'gyroscope', label: '陀螺仪' },
                { value: 'illumination', label: '光照传感器' },
                { value: 'vibration', label: '振动传感器' },
                { value: 'gps', label: 'GPS定位' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 图表图例配置模态框 */}
      <Modal
        title="图表图例配置"
        open={legendModalVisible}
        onOk={handleSaveLegends}
        onCancel={() => setLegendModalVisible(false)}
        width={520}
        okText="保存配置"
        cancelText="取消"
        className="legend-config-modal"
        centered
      >
        <Form
          form={legendForm}
          layout="vertical"
        >
          <div className="mb-4 p-3 rounded-lg bg-blue-50/10 border border-blue-500/20">
            <Text className="text-blue-300 text-sm block leading-relaxed">
              设置各监测站在图表中的显示名称，建议使用简短易识别的名称
            </Text>
          </div>
          
          {stations.map((station, index) => (
            <Form.Item
              key={station.device_id}
              label={
                <span className="text-gray-200 font-medium text-sm flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    index === 0 ? 'bg-cyan-400' : 
                    index === 1 ? 'bg-green-400' : 'bg-yellow-400'
                  }`}></span>
                  {station.station_name}
                  <span className="text-gray-400 text-xs font-normal">({station.device_id})</span>
                </span>
              }
              name={station.device_id}
              rules={[{ required: true, message: '请输入图例名称' }]}
              className="legend-form-item"
            >
              <Input 
                placeholder="输入简短的图例名称"
                maxLength={12}
                showCount
                className="legend-input"
                prefix={
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    index === 0 ? 'bg-cyan-400' : 
                    index === 1 ? 'bg-green-400' : 'bg-yellow-400'
                  }`}></span>
                }
              />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      {/* 深色主题样式 */}
      <style jsx global>{`
        /* 深色表格样式 */
        .dark-table .ant-table {
          background: transparent !important;
          color: white !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
        }

        .dark-table .ant-table-thead > tr > th {
          background: #374151 !important;
          color: #e2e8f0 !important;
          border-bottom: 1px solid #475569 !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
        }

        .dark-table .ant-table-thead > tr > th * {
          color: #e2e8f0 !important;
          font-size: 13px !important;
        }

        .dark-table .ant-table-tbody > tr > td {
          background: #1e293b !important;
          color: white !important;
          border-bottom: 1px solid #475569 !important;
          font-size: 13px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
        }

        .dark-table .ant-table-tbody > tr:hover > td {
          background: #374151 !important;
        }

        .dark-table .ant-table-placeholder .ant-table-cell {
          background: #1e293b !important;
          color: #94a3b8 !important;
          border-bottom: 1px solid #475569 !important;
        }

        .dark-table .ant-spin-container {
          background: transparent !important;
        }

        .dark-table .ant-table-container {
          border-top: 1px solid #475569 !important;
        }

        /* 深色模态框样式 */
        .ant-modal-mask {
          background: rgba(0, 0, 0, 0.8) !important;
        }

        .ant-modal-content {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;
          border: 1px solid #475569 !important;
          border-radius: 12px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8) !important;
        }

        .ant-modal-header {
          background: rgba(30, 41, 59, 0.9) !important;
          border-bottom: 1px solid #475569 !important;
          border-radius: 12px 12px 0 0 !important;
        }

        .ant-modal-title {
          color: #06b6d4 !important;
        }

        .ant-modal-close {
          color: rgba(148, 163, 184, 0.8) !important;
        }

        .ant-modal-close:hover {
          color: #06b6d4 !important;
          background: rgba(6, 182, 212, 0.1) !important;
        }

        .ant-modal-footer {
          background: rgba(30, 41, 59, 0.9) !important;
          border-top: 1px solid #475569 !important;
          border-radius: 0 0 12px 12px !important;
        }

        .ant-modal-body {
          background: transparent !important;
          color: white !important;
        }

        /* 深色表单样式 */
        .ant-form-item-label > label {
          color: #e2e8f0 !important;
          font-weight: 500 !important;
        }

        .ant-form-item-label > label.ant-form-item-required:not(.ant-form-item-required-mark-optional)::before {
          color: #ef4444 !important;
        }

        .ant-input {
          background: #374151 !important;
          border-color: #475569 !important;
          color: white !important;
        }

        .ant-input:focus,
        .ant-input:hover {
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2) !important;
        }

        .ant-input::placeholder {
          color: #64748b !important;
        }

        .ant-select:not(.ant-select-customize-input) .ant-select-selector {
          background: #374151 !important;
          border-color: #475569 !important;
          color: white !important;
        }

        .ant-select-focused:not(.ant-select-disabled).ant-select:not(.ant-select-customize-input) .ant-select-selector {
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2) !important;
        }

        .ant-select-dropdown {
          background: #374151 !important;
          border: 1px solid #475569 !important;
        }

        .ant-select-item {
          color: white !important;
        }

        .ant-select-item:hover {
          background: #475569 !important;
        }

        .ant-select-item-option-selected {
          background: #06b6d4 !important;
        }

        /* 深色按钮样式 */
        .ant-btn-primary {
          background: #06b6d4 !important;
          border-color: #06b6d4 !important;
        }

        .ant-btn-primary:hover {
          background: #0891b2 !important;
          border-color: #0891b2 !important;
        }

        .ant-btn-default {
          background: #374151 !important;
          border-color: #475569 !important;
          color: #94a3b8 !important;
        }

        .ant-btn-default:hover {
          background: #475569 !important;
          border-color: #64748b !important;
          color: #06b6d4 !important;
        }

        /* 深色标签样式 */
        .ant-tag {
          border-radius: 6px;
          font-weight: 500;
          color: white !important;
        }

        .ant-tag-green {
          background: rgba(34, 197, 94, 0.2) !important;
          border-color: #22c55e !important;
          color: #22c55e !important;
        }

        .ant-tag-red {
          background: rgba(239, 68, 68, 0.2) !important;
          border-color: #ef4444 !important;
          color: #ef4444 !important;
        }

        .ant-tag-orange {
          background: rgba(249, 115, 22, 0.2) !important;
          border-color: #f97316 !important;
          color: #f97316 !important;
        }

        .ant-tag-blue {
          background: rgba(59, 130, 246, 0.2) !important;
          border-color: #3b82f6 !important;
          color: #3b82f6 !important;
        }

        .ant-tag-default {
          background: rgba(148, 163, 184, 0.2) !important;
          border-color: #94a3b8 !important;
          color: #94a3b8 !important;
        }

        /* 深色文本样式 */
        .ant-typography {
          color: white !important;
        }

        .ant-typography-caption {
          color: #94a3b8 !important;
        }

        /* Badge 和其他小组件样式 */
        .ant-badge-status-text {
          color: #94a3b8 !important;
        }

        .ant-badge {
          color: #94a3b8 !important;
        }

        /* Tooltip 深色样式 */
        .ant-tooltip-inner {
          background: #374151 !important;
          color: white !important;
        }

        .ant-tooltip-arrow-content {
          --antd-arrow-background-color: #374151 !important;
        }

        /* 表格中的所有文本 */
        .dark-table .ant-table-tbody > tr > td * {
          color: inherit !important;
        }

        .dark-table .ant-table-tbody > tr > td .ant-typography {
          color: white !important;
        }

        .dark-table .ant-table-tbody > tr > td .ant-typography-caption {
          color: #94a3b8 !important;
        }

        /* 按钮在深色表格中的样式 */
        .dark-table .ant-btn {
          color: #94a3b8 !important;
          border-color: #475569 !important;
        }

        .dark-table .ant-btn:hover {
          color: #06b6d4 !important;
          border-color: #06b6d4 !important;
        }

        .dark-table .ant-btn-text {
          color: #94a3b8 !important;
        }

        .dark-table .ant-btn-text:hover {
          color: #06b6d4 !important;
          background: rgba(6, 182, 212, 0.1) !important;
        }

        /* 全局文本对比度增强 */
        .ant-typography.ant-typography-secondary {
          color: #94a3b8 !important;
        }

        /* Space 组件内的文本 */
        .ant-space-item {
          color: inherit;
        }

        /* 确保深色主题下的所有小文本都可见 */
        .dark-table small,
        .dark-table .ant-typography-caption,
        .dark-table [style*="fontSize: '10px'"],
        .dark-table [style*="fontSize: '11px'"],
        .dark-table [style*="fontSize: '12px'"],
        .dark-table [style*="fontSize: '13px'"] {
          color: #cbd5e1 !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
        }

        /* 标签字体优化 */
        .dark-table .ant-tag {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-weight: 500 !important;
        }

        /* 全局字体反锯齿 */
        .dark-table * {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
        }

        /* 图例配置模态框深色主题样式 */
        .legend-config-modal .ant-modal-content {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
          border: 1px solid #334155 !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
        }

        .legend-config-modal .ant-modal-header {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
          border-bottom: 1px solid #334155 !important;
          padding: 20px 24px 16px !important;
        }

        .legend-config-modal .ant-modal-title {
          color: #f1f5f9 !important;
          font-size: 18px !important;
          font-weight: 600 !important;
          margin: 0 !important;
        }

        .legend-config-modal .ant-modal-close {
          color: #94a3b8 !important;
        }

        .legend-config-modal .ant-modal-close:hover {
          color: #f1f5f9 !important;
        }

        .legend-config-modal .ant-modal-body {
          background: transparent !important;
          padding: 20px 24px !important;
        }

        .legend-config-modal .ant-modal-footer {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
          border-top: 1px solid #334155 !important;
          padding: 16px 24px 20px !important;
        }

        /* 表单项样式 */
        .legend-form-item .ant-form-item-label > label {
          color: #e2e8f0 !important;
          font-weight: 500 !important;
          margin-bottom: 8px !important;
        }

        .legend-form-item .ant-form-item-explain-error {
          color: #fca5a5 !important;
          font-size: 12px !important;
        }

        /* 输入框样式优化 - 强制覆盖所有状态 */
        .legend-config-modal .legend-input.ant-input,
        .legend-config-modal .legend-input.ant-input-outlined,
        .legend-config-modal .ant-input.legend-input {
          background: #334155 !important;
          background-color: #334155 !important;
          border: 1px solid #475569 !important;
          color: #f1f5f9 !important;
          font-size: 14px !important;
          padding: 10px 12px !important;
          border-radius: 8px !important;
          transition: all 0.3s ease !important;
        }

        .legend-config-modal .legend-input.ant-input:hover,
        .legend-config-modal .legend-input.ant-input-outlined:hover {
          background: #334155 !important;
          background-color: #334155 !important;
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.1) !important;
        }

        .legend-config-modal .legend-input.ant-input:focus,
        .legend-config-modal .legend-input.ant-input:focus-within,
        .legend-config-modal .legend-input.ant-input-focused,
        .legend-config-modal .legend-input.ant-input-outlined:focus,
        .legend-config-modal .legend-input.ant-input-outlined:focus-within {
          background: #3f4b5f !important;
          background-color: #3f4b5f !important;
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15) !important;
          outline: none !important;
        }

        .legend-config-modal .legend-input.ant-input::placeholder,
        .legend-config-modal .legend-input.ant-input-outlined::placeholder {
          color: #94a3b8 !important;
        }

        /* 强制覆盖输入框内部元素 */
        .legend-config-modal .legend-input input,
        .legend-config-modal .legend-input .ant-input-element,
        .legend-config-modal .legend-input .ant-input-element input {
          background: transparent !important;
          background-color: transparent !important;
          color: #f1f5f9 !important;
        }

        /* 输入框前缀图标 */
        .legend-input .ant-input-prefix {
          margin-right: 8px !important;
        }

        /* 字符计数样式 */
        .legend-config-modal .ant-input-show-count-suffix,
        .legend-config-modal .legend-input + .ant-input-show-count-suffix,
        .legend-config-modal .ant-input-data-count {
          color: #64748b !important;
          font-size: 12px !important;
          background: rgba(51, 65, 85, 0.8) !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          margin-top: 4px !important;
        }

        /* 字符计数器容器样式 */
        .legend-config-modal .ant-input-show-count,
        .legend-config-modal .ant-input-affix-wrapper.ant-input-show-count {
          background: #334155 !important;
          background-color: #334155 !important;
          border: 1px solid #475569 !important;
          border-radius: 8px !important;
        }

        .legend-config-modal .ant-input-show-count:hover,
        .legend-config-modal .ant-input-affix-wrapper.ant-input-show-count:hover {
          background: #334155 !important;
          background-color: #334155 !important;
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.1) !important;
        }

        .legend-config-modal .ant-input-show-count:focus-within,
        .legend-config-modal .ant-input-affix-wrapper.ant-input-show-count:focus-within {
          background: #3f4b5f !important;
          background-color: #3f4b5f !important;
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15) !important;
        }

        /* 输入框内的input元素 */
        .legend-config-modal .ant-input-show-count input,
        .legend-config-modal .ant-input-affix-wrapper.ant-input-show-count input {
          background: transparent !important;
          color: #f1f5f9 !important;
          border: none !important;
        }

        /* 按钮样式优化 */
        .legend-config-modal .ant-btn-default {
          background: #475569 !important;
          border-color: #64748b !important;
          color: #e2e8f0 !important;
          border-radius: 6px !important;
          font-weight: 500 !important;
          height: 36px !important;
          padding: 0 20px !important;
          transition: all 0.3s ease !important;
        }

        .legend-config-modal .ant-btn-default:hover {
          background: #64748b !important;
          border-color: #94a3b8 !important;
          color: #f1f5f9 !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }

        .legend-config-modal .ant-btn-primary {
          background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%) !important;
          border-color: #06b6d4 !important;
          color: white !important;
          border-radius: 6px !important;
          font-weight: 600 !important;
          height: 36px !important;
          padding: 0 24px !important;
          transition: all 0.3s ease !important;
          box-shadow: 0 2px 8px rgba(6, 182, 212, 0.3) !important;
        }

        .legend-config-modal .ant-btn-primary:hover {
          background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%) !important;
          border-color: #0891b2 !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 6px 16px rgba(6, 182, 212, 0.4) !important;
        }

        .legend-config-modal .ant-btn-primary:active {
          transform: translateY(0) !important;
          box-shadow: 0 2px 8px rgba(6, 182, 212, 0.3) !important;
        }

        /* 提示框样式 */
        .legend-config-modal .bg-blue-50\/10 {
          background: rgba(59, 130, 246, 0.08) !important;
          backdrop-filter: blur(8px) !important;
        }

        .legend-config-modal .border-blue-500\/20 {
          border-color: rgba(59, 130, 246, 0.2) !important;
        }

        .legend-config-modal .text-blue-300 {
          color: #93c5fd !important;
        }

        /* 响应式调整 */
        @media (max-width: 768px) {
          .legend-config-modal .ant-modal {
            width: 90% !important;
            margin: 0 auto !important;
          }
          
          .legend-config-modal .ant-modal-body {
            padding: 16px 20px !important;
          }
        }

        /* 动画效果 */
        .legend-config-modal .ant-modal-mask {
          backdrop-filter: blur(4px) !important;
          background: rgba(0, 0, 0, 0.6) !important;
        }

        .legend-config-modal .legend-form-item {
          margin-bottom: 20px !important;
        }

        /* 标签点动画 */
        .legend-config-modal .w-2.h-2.rounded-full,
        .legend-config-modal .w-1\.5.h-1\.5.rounded-full {
          animation: pulse-soft 2s ease-in-out infinite !important;
        }

        @keyframes pulse-soft {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}
