'use client';

import React from 'react';
import { Table, Tag, Tooltip } from 'antd';
import useDeviceMappings from '../hooks/useDeviceMappings';

const DeviceMappingTable = () => {
  const { mappings, loading, error } = useDeviceMappings();

  if (error) {
    return <div className="text-red-500">加载设备映射失败: {error.message}</div>;
  }

  const columns = [
    {
      title: '简洁ID',
      dataIndex: 'simple_id',
      key: 'simple_id',
      width: 100,
      render: (text: string) => (
        <span className="font-mono text-blue-600 font-bold">{text}</span>
      ),
    },
    {
      title: '设备名称',
      dataIndex: 'device_name',
      key: 'device_name',
      width: 150,
      render: (text: string) => (
        <span className="text-green-600 font-medium">{text}</span>
      ),
    },
    {
      title: '实际设备ID',
      dataIndex: 'actual_device_id',
      key: 'actual_device_id',
      width: 200,
      render: (text: string) => (
        <Tooltip title={text}>
          <span className="font-mono text-gray-600 text-xs">
            {text.length > 20 ? `${text.slice(0, 20)}...` : text}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '位置',
      dataIndex: 'location_name',
      key: 'location_name',
      width: 150,
      render: (text: string) => (
        <span className="text-purple-600">{text}</span>
      ),
    },
    {
      title: '设备类型',
      dataIndex: 'device_type',
      key: 'device_type',
      width: 100,
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          'rk2206': 'blue',
          'sensor': 'green',
          'gateway': 'orange'
        };
        return (
          <Tag color={colorMap[type] || 'default'}>
            {type === 'rk2206' ? '监测站' : type === 'sensor' ? '传感器' : type}
          </Tag>
        );
      },
    },
    {
      title: '坐标',
      key: 'coordinates',
      width: 120,
      render: (record: any) => (
        <span className="text-xs text-gray-500">
          {record.latitude && record.longitude 
            ? `${record.latitude.toFixed(3)}, ${record.longitude.toFixed(3)}`
            : '未知'
          }
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'online_status',
      key: 'online_status',
      width: 80,
      render: (status: string) => {
        const statusConfig = {
          online: { color: 'green', text: '在线' },
          offline: { color: 'red', text: '离线' },
          maintenance: { color: 'orange', text: '维护' }
        };
        const config = statusConfig[status as keyof typeof statusConfig] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '最后数据时间',
      dataIndex: 'last_data_time',
      key: 'last_data_time',
      width: 150,
      render: (time: string) => (
        <span className="text-xs text-gray-500">
          {time ? new Date(time).toLocaleString('zh-CN') : '无数据'}
        </span>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-800">设备映射管理</h3>
        <p className="text-sm text-gray-600 mt-1">
          管理简洁设备ID与实际设备ID的映射关系
        </p>
      </div>
      
      <div className="p-4">
        <Table
          dataSource={mappings}
          columns={columns}
          loading={loading}
          rowKey="simple_id"
          size="small"
          scroll={{ x: 1000 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条设备`
          }}
        />
      </div>
      
      {/* 统计信息 */}
      <div className="p-4 bg-gray-50 border-t">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{mappings.length}</div>
            <div className="text-sm text-gray-600">总设备数</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {mappings.filter(d => d.online_status === 'online').length}
            </div>
            <div className="text-sm text-gray-600">在线设备</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {mappings.filter(d => d.online_status === 'offline').length}
            </div>
            <div className="text-sm text-gray-600">离线设备</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">
              {mappings.filter(d => d.online_status === 'maintenance').length}
            </div>
            <div className="text-sm text-gray-600">维护设备</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceMappingTable;
