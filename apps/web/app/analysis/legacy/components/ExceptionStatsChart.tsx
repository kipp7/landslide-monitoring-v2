'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Table } from 'antd'

interface DeviceData {
  key: string
  device: string
  sensorError: number
  commError: number
  powerError: number
}

const fullData: DeviceData[] = [
  { key: '1', device: '榫欓棬婊戝潯鐩戞祴绔?', sensorError: 2, commError: 1, powerError: 2 },
  { key: '2', device: '璁惧浜?', sensorError: 5, commError: 3, powerError: 1 },
  { key: '3', device: '璁惧涓?', sensorError: 10, commError: 8, powerError: 5 },
  { key: '4', device: '璁惧鍥?', sensorError: 1, commError: 1, powerError: 0 },
  { key: '5', device: '璁惧浜?', sensorError: 3, commError: 2, powerError: 4 },
  { key: '6', device: '璁惧鍏?', sensorError: 4, commError: 1, powerError: 2 },
  { key: '7', device: '璁惧涓?', sensorError: 6, commError: 2, powerError: 1 },
  { key: '8', device: '璁惧鍏?', sensorError: 0, commError: 2, powerError: 1 },
  { key: '9', device: '璁惧涔?', sensorError: 8, commError: 5, powerError: 3 },
  { key: '10', device: '璁惧鍗?', sensorError: 2, commError: 0, powerError: 1 },
]

const pageSize = 6

const ExceptionStatsTable = () => {
  const [scrollIndex, setScrollIndex] = useState(0)
  const [visibleData, setVisibleData] = useState<DeviceData[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setScrollIndex((prev) => (prev + 1) % (fullData.length - pageSize + 1))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setVisibleData(fullData.slice(scrollIndex, scrollIndex + pageSize))
  }, [scrollIndex])

  const columns = [
    {
      title: '璁惧鍚嶇О',
      dataIndex: 'device',
      key: 'device',
      align: 'center' as const,
      render: (text: string) => <span className="text-white">{text}</span>,
    },
    {
      title: '浼犳劅鍣ㄥ紓甯?',
      dataIndex: 'sensorError',
      key: 'sensorError',
      align: 'center' as const,
      render: (val: number) => <span className={val > 5 ? 'text-red-500' : 'text-cyan-300'}>{val}</span>,
    },
    {
      title: '閫氫俊寮傚父',
      dataIndex: 'commError',
      key: 'commError',
      align: 'center' as const,
      render: (val: number) => <span className={val > 5 ? 'text-red-500' : 'text-cyan-300'}>{val}</span>,
    },
    {
      title: '渚涚數寮傚父',
      dataIndex: 'powerError',
      key: 'powerError',
      align: 'center' as const,
      render: (val: number) => <span className={val > 5 ? 'text-red-500' : 'text-cyan-300'}>{val}</span>,
    },
  ]

  return (
    <div className="h-full bg-[#0d1b2a] p-2 overflow-hidden rounded-xl" ref={containerRef}>
      <style>{`
  .ant-table-thead > tr > th {
    background-color: #0d1b2a !important;
    color: #00ffff !important;
    border-color: rgba(13, 114, 127, 0.6) !important;/* 琛ㄥご鐨勬í绾块鑹?*/
    font-weight: bold;
    text-align: center;
  }

    /* 鎮诞琛岃儗鏅?*/
    .ant-table-tbody > tr:hover > td {
      background: #112c42 !important; /* 淇敼涓轰綘鎯宠鐨勬繁鑹?*/
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

    /* 妯珫绾块鑹?*/
    .ant-table td, .ant-table th {
      border-color:rgba(13, 114, 127, 0.6) !important;
    }


  /* 鉁?鍘绘帀鎵€鏈夌櫧鑹插渾瑙掅竟 */
  .ant-table-wrapper,
  .ant-table,
  .ant-table-container {
    border-radius: 0 !important;
    overflow: hidden !important;
    background-color: transparent !important;
  }
`}</style>

      <Table
        dataSource={visibleData}
        columns={columns}
        pagination={false}
        size="small"
        className="border-3 rounded-sm border-cyan-950"
        rowClassName={() =>
          'border-b-2 border border-cyan-300 bg-[#0d1b2a] hover:bg-[#112c42] text-white border-b border-[#0cf]'
        }
      />
    </div>
  )
}

export default ExceptionStatsTable
