'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Table } from 'antd';

interface DeviceData {
  key: string;
  device: string;
  sensorError: number;
  commError: number;
  powerError: number;
}

const ExceptionStatsTable = () => {
  const [scrollIndex, setScrollIndex] = useState(0);
  const [visibleData, setVisibleData] = useState<DeviceData[]>([]);
  const containerRef = useRef(null);

  const fullData = [
    { key: '1', device: '龙门滑坡监测站', sensorError: 2, commError: 1, powerError: 2 },
    { key: '2', device: '设备二', sensorError: 5, commError: 3, powerError: 1 },
    { key: '3', device: '设备三', sensorError: 10, commError: 8, powerError: 5 },
    { key: '4', device: '设备四', sensorError: 1, commError: 1, powerError: 0 },
    { key: '5', device: '设备五', sensorError: 3, commError: 2, powerError: 4 },
    { key: '6', device: '设备六', sensorError: 4, commError: 1, powerError: 2 },
    { key: '7', device: '设备七', sensorError: 6, commError: 2, powerError: 1 },
    { key: '8', device: '设备八', sensorError: 0, commError: 2, powerError: 1 },
    { key: '9', device: '设备九', sensorError: 8, commError: 5, powerError: 3 },
    { key: '10', device: '设备十', sensorError: 2, commError: 0, powerError: 1 },
  ];

  const pageSize = 6;

  useEffect(() => {
    const interval = setInterval(() => {
      setScrollIndex((prev) => (prev + 1) % (fullData.length - pageSize + 1));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setVisibleData(fullData.slice(scrollIndex, scrollIndex + pageSize));
  }, [scrollIndex]);

  const columns = [
    {
      title: '设备名称',
      dataIndex: 'device',
      key: 'device',
      align: 'center' as const,
      render: (text: string) => <span className="text-white">{text}</span>,
    },
    {
      title: '传感器异常',
      dataIndex: 'sensorError',
      key: 'sensorError',
      align: 'center' as const,
      render: (val: number) => <span className={val > 5 ? 'text-red-500' : 'text-cyan-300'}>{val}</span>,
    },
    {
      title: '通信异常',
      dataIndex: 'commError',
      key: 'commError',
      align: 'center' as const,
      render: (val: number) => <span className={val > 5 ? 'text-red-500' : 'text-cyan-300'}>{val}</span>,
    },
    {
      title: '供电异常',
      dataIndex: 'powerError',
      key: 'powerError',
      align: 'center' as const,
      render: (val: number) => <span className={val > 5 ? 'text-red-500' : 'text-cyan-300'}>{val}</span>,
    },
  ];

  return (
    <div className="h-full bg-[#0d1b2a] p-2 overflow-hidden rounded-xl" ref={containerRef}>
<style>
{`
  .ant-table-thead > tr > th {
    background-color: #0d1b2a !important;
    color: #00ffff !important;
    border-color: rgba(13, 114, 127, 0.6) !important;/* 表头的横线颜色 */
    font-weight: bold;
    text-align: center;
  }

    /* 悬浮行背景 */
    .ant-table-tbody > tr:hover > td {
      background: #112c42 !important; /* 修改为你想要的深色 */
      transition: background 0.3s;
    }

  .ant-table-thead > tr > th,
  .ant-table-tbody > tr > td {
    border-right: 1px solid #173b57 !important;
    border-left: none !important;
  }
  .ant-table-thead > tr > th:last-child,
  .ant-table-tbody > tr > td:last-child {
    border-right: none !important;
  }

    /* 横竖线颜色 */
    .ant-table td, .ant-table th {
      border-color:rgba(13, 114, 127, 0.6) !important;
    }

    
  /* ✅ 去掉所有白色圆角边 */
  .ant-table-wrapper,
  .ant-table,
  .ant-table-container {
    border-radius: 0 !important;
    overflow: hidden !important;
    background-color: transparent !important;
  }
`}
</style>

      <Table
        dataSource={visibleData}
        columns={columns}
        pagination={false}
        size="small"
        className="border-3 border-cyan-950 rounded-sm"
        rowClassName={() => 'border-b-2 border border-cyan-300 bg-[#0d1b2a] hover:bg-[#112c42] text-white border-b border-[#0cf]'}
      />
    </div>
  );
};

export default ExceptionStatsTable;
