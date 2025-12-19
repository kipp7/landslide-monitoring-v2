'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Tag,
  Space,
  Alert,
  Row,
  Col,
  Typography
} from 'antd';
import { 
  SettingOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

interface Baseline {
  device_id: string;
  baseline_latitude: number;
  baseline_longitude: number;
  baseline_altitude?: number;
  established_by: string;
  established_time: string;
  notes?: string;
  status: string;
  position_accuracy?: number;
  measurement_duration?: number;
  satellite_count?: number;
  pdop_value?: number;
}

interface BaselineManagementProps {
  className?: string;
}

export default function BaselineManagement({ className = '' }: BaselineManagementProps) {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [autoModalVisible, setAutoModalVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [form] = Form.useForm();
  const [autoForm] = Form.useForm();

  useEffect(() => {
    fetchBaselines();
    fetchDevices();
  }, []);

  const fetchBaselines = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/baselines');
      const result = await response.json();
      if (result.success) {
        setBaselines(result.data || []);
      }
    } catch (error) {
      message.error('获取基准点列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      // 从监测站API获取所有设备
      const response = await fetch('/api/monitoring-stations');
      const result = await response.json();
      if (result.success) {
        const deviceIds = result.data.map((station: any) => station.device_id);
        setDevices(deviceIds);
      } else {
        // 备用：直接从设备映射API获取
        const fallbackResponse = await fetch('/api/iot/devices/mappings');
        const fallbackResult = await fallbackResponse.json();
        if (fallbackResult.success) {
          const deviceIds = fallbackResult.data.map((device: any) => device.deviceId);
          setDevices(deviceIds);
        }
      }
    } catch (error) {
      console.error('获取设备列表失败:', error);
      // 最后的备用方案：使用硬编码设备列表
      setDevices(['GNSS-001', 'GNSS-002', 'GNSS-003']);
    }
  };

  const handleSetBaseline = async (values: any) => {
    try {
      const response = await fetch(`/api/baselines/${values.device_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: values.latitude,
          longitude: values.longitude,
          altitude: values.altitude,
          positionAccuracy: values.positionAccuracy,
          satelliteCount: values.satelliteCount,
          pdopValue: values.pdopValue,
          measurementDuration: values.measurementDuration,
          establishedBy: values.establishedBy || '管理员',
          notes: values.notes
        })
      });

      const result = await response.json();
      if (result.success) {
        message.success('基准点设置成功');
        setModalVisible(false);
        form.resetFields();
        fetchBaselines();
      } else {
        message.error(result.error || '基准点设置失败');
      }
    } catch (error) {
      message.error('基准点设置失败');
    }
  };

  const handleAutoBaseline = async (values: any) => {
    try {
      const response = await fetch(`/api/baselines/${values.device_id}/auto-establish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataPoints: values.dataPoints || 20,
          establishedBy: values.establishedBy || '系统自动',
          notes: values.notes || '自动建立的基准点'
        })
      });

      const result = await response.json();
      if (result.success) {
        message.success('自动建立基准点成功');
        setAutoModalVisible(false);
        autoForm.resetFields();
        fetchBaselines();
      } else {
        message.error(result.error || '自动建立基准点失败');
      }
    } catch (error) {
      message.error('自动建立基准点失败');
    }
  };

  const handleDeleteBaseline = (deviceId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除设备 ${deviceId} 的基准点吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await fetch(`/api/baselines/${deviceId}`, {
            method: 'DELETE'
          });
          const result = await response.json();
          if (result.success) {
            message.success('基准点删除成功');
            fetchBaselines();
          } else {
            message.error('基准点删除失败');
          }
        } catch (error) {
          message.error('基准点删除失败');
        }
      }
    });
  };

  const columns = [
    {
      title: '设备ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 120,
    },
    {
      title: '纬度',
      dataIndex: 'baseline_latitude',
      key: 'latitude',
      render: (val: number) => val?.toFixed(8),
      width: 120,
    },
    {
      title: '经度',
      dataIndex: 'baseline_longitude',
      key: 'longitude',
      render: (val: number) => val?.toFixed(8),
      width: 120,
    },
    {
      title: '海拔 (m)',
      dataIndex: 'baseline_altitude',
      key: 'altitude',
      render: (val: number) => val ? val.toFixed(2) : '-',
      width: 100,
    },
    {
      title: '精度 (m)',
      dataIndex: 'position_accuracy',
      key: 'accuracy',
      render: (val: number) => val ? val.toFixed(3) : '-',
      width: 100,
    },
    {
      title: '卫星数',
      dataIndex: 'satellite_count',
      key: 'satellite_count',
      render: (val: number) => val || '-',
      width: 80,
    },
    {
      title: 'PDOP',
      dataIndex: 'pdop_value',
      key: 'pdop_value',
      render: (val: number) => val ? val.toFixed(2) : '-',
      width: 80,
    },
    {
      title: '建立人',
      dataIndex: 'established_by',
      key: 'established_by',
      width: 100,
    },
    {
      title: '建立时间',
      dataIndex: 'established_time',
      key: 'established_time',
      render: (val: string) => new Date(val).toLocaleString(),
      width: 160,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '活跃' : '停用'}
        </Tag>
      ),
      width: 80,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Baseline) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedDevice(record.device_id);
              form.setFieldsValue({
                device_id: record.device_id,
                latitude: record.baseline_latitude,
                longitude: record.baseline_longitude,
                altitude: record.baseline_altitude,
                positionAccuracy: record.position_accuracy,
                satelliteCount: record.satellite_count,
                pdopValue: record.pdop_value,
                measurementDuration: record.measurement_duration,
                establishedBy: record.established_by,
                notes: record.notes
              });
              setModalVisible(true);
            }}
            className="text-cyan-400 hover:text-cyan-300"
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteBaseline(record.device_id)}
            className="text-red-400 hover:text-red-300"
          >
            删除
          </Button>
        </Space>
      ),
      width: 120,
    },
  ];

  return (
    <div className={`${className}`}>
      <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
        {/* 页面头部和操作按钮 */}
        <div className="px-6 py-4 border-b border-slate-600">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-lg font-bold text-cyan-300 flex items-center space-x-2 mb-2">
                <EnvironmentOutlined className="text-cyan-400" />
                <span>GPS基准点管理</span>
              </h4>
              <p className="text-slate-400 text-sm">
                管理GPS设备基准点，支持手动设置和自动建立
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setSelectedDevice('');
                  form.resetFields();
                  setModalVisible(true);
                }}
                className="bg-cyan-500 border-cyan-400 text-white hover:bg-cyan-600"
              >
                手动设置
              </Button>
              <Button
                icon={<RobotOutlined />}
                onClick={() => {
                  autoForm.resetFields();
                  setAutoModalVisible(true);
                }}
                className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50"
              >
                自动建立
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={fetchBaselines}
                loading={loading}
                className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50"
              >
                刷新
              </Button>
            </div>
          </div>
        </div>

        {/* 统计信息 */}
        <div className="px-6 py-4 border-b border-slate-600">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">总基准点数</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xl font-bold text-blue-400">
                      {baselines.length}
                    </span>
                    <span className="text-slate-400 text-sm">个</span>
                  </div>
                </div>
                <EnvironmentOutlined className="text-xl text-slate-500" />
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">活跃基准点</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xl font-bold text-green-400">
                      {baselines.filter(b => b.status === 'active').length}
                    </span>
                    <span className="text-slate-400 text-sm">个</span>
                  </div>
                </div>
                <CheckCircleOutlined className="text-xl text-slate-500" />
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">高精度</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xl font-bold text-yellow-400">
                      {baselines.filter(b => b.position_accuracy && b.position_accuracy < 2).length}
                    </span>
                    <span className="text-slate-400 text-sm">个</span>
                  </div>
                </div>
                <ExclamationCircleOutlined className="text-xl text-slate-500" />
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">平均精度</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xl font-bold text-purple-400">
                      {baselines.length > 0 ?
                        (baselines.filter(b => b.position_accuracy).reduce((sum, b) => sum + (b.position_accuracy || 0), 0) /
                         Math.max(baselines.filter(b => b.position_accuracy).length, 1)).toFixed(2) : '0.00'
                      }
                    </span>
                    <span className="text-slate-400 text-sm">m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 基准点列表 */}
        <div className="p-6">
          <Table
            columns={columns}
            dataSource={baselines}
            rowKey="device_id"
            loading={loading}
            pagination={{
              pageSize: 8,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 个基准点`,
              className: 'dark-pagination'
            }}
            scroll={{ x: 1200 }}
            className="dark-table"
          />
        </div>
      </div>

      {/* 手动设置基准点模态框 */}
      <Modal
        title="设置基准点"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
        className="dark-modal"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSetBaseline}
        >
          <Form.Item
            name="device_id"
            label="设备ID"
            rules={[{ required: true, message: '请选择设备' }]}
          >
            <Select placeholder="选择设备" className="dark-select">
              {devices.map(device => (
                <Option key={device} value={device}>{device}</Option>
              ))}
            </Select>
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="latitude"
                label="纬度"
                rules={[
                  { required: true, message: '请输入纬度' },
                  { type: 'number', min: -90, max: 90, message: '纬度范围: -90 到 90' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={8}
                  placeholder="例如: 22.62736667"
                  className="dark-input"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="longitude"
                label="经度"
                rules={[
                  { required: true, message: '请输入经度' },
                  { type: 'number', min: -180, max: 180, message: '经度范围: -180 到 180' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={8}
                  placeholder="例如: 110.18930000"
                  className="dark-input"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="altitude"
            label="海拔 (米)"
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              placeholder="例如: 156.78"
              className="dark-input"
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="positionAccuracy"
                label="位置精度 (米)"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={3}
                  min={0}
                  placeholder="例如: 2.500"
                  className="dark-input"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="satelliteCount"
                label="卫星数量"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={50}
                  placeholder="例如: 12"
                  className="dark-input"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="pdopValue"
                label="PDOP值"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="例如: 1.50"
                  className="dark-input"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="measurementDuration"
                label="测量时长 (秒)"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  placeholder="例如: 300"
                  className="dark-input"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="establishedBy"
            label="建立人"
            rules={[{ required: true, message: '请输入建立人' }]}
          >
            <Input placeholder="例如: 张工程师" className="dark-input" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
          >
            <TextArea
              rows={3}
              placeholder="基准点相关说明..."
              className="dark-input"
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" className="bg-cyan-500 hover:bg-cyan-600">
                设置基准点
              </Button>
              <Button onClick={() => setModalVisible(false)} className="dark-button">
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 自动建立基准点模态框 */}
      <Modal
        title="自动建立基准点"
        open={autoModalVisible}
        onCancel={() => setAutoModalVisible(false)}
        footer={null}
        width={500}
        className="dark-modal"
      >
        <Alert
          message="自动建立说明"
          description="系统将基于最近的GPS数据自动计算基准点坐标，建议在设备稳定运行一段时间后使用。"
          type="info"
          style={{ marginBottom: '16px' }}
          className="dark-alert"
        />
        
        <Form
          form={autoForm}
          layout="vertical"
          onFinish={handleAutoBaseline}
        >
          <Form.Item
            name="device_id"
            label="设备ID"
            rules={[{ required: true, message: '请选择设备' }]}
          >
            <Select placeholder="选择设备" className="dark-select">
              {devices.map(device => (
                <Option key={device} value={device}>{device}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="dataPoints"
            label="使用数据点数"
            initialValue={20}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={10}
              max={100}
              placeholder="建议20-50个数据点"
              className="dark-input"
            />
          </Form.Item>

          <Form.Item
            name="establishedBy"
            label="建立人"
            initialValue="系统自动"
          >
            <Input placeholder="建立人" className="dark-input" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
            initialValue="基于GPS数据自动建立的基准点"
          >
            <TextArea
              rows={2}
              placeholder="备注信息..."
              className="dark-input"
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" className="bg-cyan-500 hover:bg-cyan-600">
                自动建立
              </Button>
              <Button onClick={() => setAutoModalVisible(false)} className="dark-button">
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <style jsx global>{`
        .dark-table .ant-table {
          background: transparent;
          color: #f1f5f9;
        }
        
        .dark-table .ant-table-thead > tr > th {
          background: rgba(51, 65, 85, 0.8) !important;
          border-bottom: 1px solid #475569 !important;
          color: #e2e8f0 !important;
        }
        
        .dark-table .ant-table-tbody > tr > td {
          background: transparent !important;
          border-bottom: 1px solid #475569 !important;
          color: #cbd5e1 !important;
        }
        
        .dark-table .ant-table-tbody > tr:hover > td {
          background: rgba(51, 65, 85, 0.3) !important;
        }
        
        .dark-pagination .ant-pagination-item {
          background: rgba(51, 65, 85, 0.5) !important;
          border: 1px solid #475569 !important;
        }
        
        .dark-pagination .ant-pagination-item a {
          color: #cbd5e1 !important;
        }
        
        .dark-modal .ant-modal-content {
          background: #1e293b !important;
          border: 1px solid #475569 !important;
        }
        
        .dark-modal .ant-modal-header {
          background: #1e293b !important;
          border-bottom: 1px solid #475569 !important;
        }
        
        .dark-modal .ant-modal-title {
          color: #f1f5f9 !important;
        }
        
        .dark-input.ant-input,
        .dark-input.ant-input-number,
        .dark-select .ant-select-selector {
          background: #334155 !important;
          border: 1px solid #475569 !important;
          color: #f1f5f9 !important;
        }
        
        .dark-button.ant-btn {
          background: #475569 !important;
          border: 1px solid #64748b !important;
          color: #f1f5f9 !important;
        }
        
        .dark-alert.ant-alert {
          background: rgba(59, 130, 246, 0.1) !important;
          border: 1px solid rgba(59, 130, 246, 0.3) !important;
        }
      `}</style>
    </div>
  );
}
