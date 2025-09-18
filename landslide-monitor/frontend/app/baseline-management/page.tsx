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
  Col
} from 'antd';
import { 
  SettingOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ArrowLeftOutlined,
  RobotOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import Link from 'next/link';

const { Option } = Select;
const { TextArea } = Input;

interface Baseline {
  device_id: string;
  baseline_latitude: number;
  baseline_longitude: number;
  baseline_altitude?: number;
  established_by: string;
  established_time: string;
  notes?: string;
  status: string;
  // confidence_level: number;  // 暂时注销，需要真实计算逻辑
  position_accuracy?: number;
  measurement_duration?: number;
  satellite_count?: number;
  pdop_value?: number;
}

export default function BaselineManagementPage() {
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
      // 这里可以从设备管理API获取所有设备
      const response = await fetch('/api/baselines');
      const result = await response.json();
      if (result.success) {
        const deviceIds = result.data.map((item: any) => item.device_id);
        // 添加一些可能的新设备
        const allDevices = [...new Set([...deviceIds, 'device_1', 'device_2', 'device_3'])];
        setDevices(allDevices);
      }
    } catch (error) {
      console.error('获取设备列表失败:', error);
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
    // 置信度列暂时注销，需要真实计算逻辑
    // {
    //   title: '置信度',
    //   dataIndex: 'confidence_level',
    //   key: 'confidence',
    //   render: (val: number) => (
    //     <Tag color={val > 0.9 ? 'green' : val > 0.7 ? 'orange' : 'red'}>
    //       {(val * 100).toFixed(1)}%
    //     </Tag>
    //   ),
    //   width: 100,
    // },
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
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteBaseline(record.device_id)}
          >
            删除
          </Button>
        </Space>
      ),
      width: 120,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* 页面标题和返回按钮 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <Link href="/gps-monitoring">
            <Button
              icon={<ArrowLeftOutlined />}
              className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50"
            >
              返回监测页面
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-cyan-300 flex items-center space-x-2">
              <SettingOutlined className="text-cyan-400" />
              <span>基准点管理</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">管理GPS设备基准点，支持手动设置和自动建立</p>
          </div>
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
            手动设置基准点
          </Button>
          <Button
            icon={<RobotOutlined />}
            onClick={() => {
              autoForm.resetFields();
              setAutoModalVisible(true);
            }}
            className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50"
          >
            自动建立基准点
          </Button>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">总基准点数</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-2xl font-bold text-blue-400">
                  {baselines.length}
                </span>
                <span className="text-slate-400 text-sm">个</span>
              </div>
            </div>
            <EnvironmentOutlined className="text-2xl text-slate-500" />
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">活跃基准点</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-2xl font-bold text-green-400">
                  {baselines.filter(b => b.status === 'active').length}
                </span>
                <span className="text-slate-400 text-sm">个</span>
              </div>
            </div>
            <CheckCircleOutlined className="text-2xl text-slate-500" />
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">有精度数据</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-2xl font-bold text-yellow-400">
                  {baselines.filter(b => b.position_accuracy && b.position_accuracy < 5).length}
                </span>
                <span className="text-slate-400 text-sm">个</span>
              </div>
            </div>
            <ExclamationCircleOutlined className="text-2xl text-slate-500" />
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">平均精度</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-2xl font-bold text-purple-400">
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

      {/* 基准点列表 */}
      <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg">
        <div className="flex justify-between items-center p-4 border-b border-slate-600">
          <h2 className="text-lg font-semibold text-cyan-300">基准点列表</h2>
          <Button
            icon={<SettingOutlined />}
            onClick={fetchBaselines}
            loading={loading}
            className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50"
          >
            刷新
          </Button>
        </div>
        <div className="p-4">
        <Table
          columns={columns}
          dataSource={baselines}
          rowKey="device_id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个基准点`
          }}
          scroll={{ x: 1200 }}
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
            <Select placeholder="选择设备">
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
                  placeholder="例如: 114.05743983"
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
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="establishedBy"
            label="建立人"
            rules={[{ required: true, message: '请输入建立人' }]}
          >
            <Input placeholder="例如: 张工程师" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
          >
            <TextArea
              rows={3}
              placeholder="基准点相关说明..."
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                设置基准点
              </Button>
              <Button onClick={() => setModalVisible(false)}>
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
      >
        <Alert
          message="自动建立说明"
          description="系统将基于最近的GPS数据自动计算基准点坐标，建议在设备稳定运行一段时间后使用。"
          type="info"
          style={{ marginBottom: '16px' }}
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
            <Select placeholder="选择设备">
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
            />
          </Form.Item>

          <Form.Item
            name="establishedBy"
            label="建立人"
            initialValue="系统自动"
          >
            <Input placeholder="建立人" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
            initialValue="基于GPS数据自动建立的基准点"
          >
            <TextArea
              rows={2}
              placeholder="备注信息..."
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                自动建立
              </Button>
              <Button onClick={() => setAutoModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
