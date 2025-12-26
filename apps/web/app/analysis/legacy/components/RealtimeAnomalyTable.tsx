'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Table } from 'antd'
import useDeviceNames from '../hooks/useDeviceNames'
import useRealtimeAnomalies from '../hooks/useRealtimeAnomalies'

export default function RealtimeAnomalyTable() {
  const { data } = useRealtimeAnomalies(30)
  const { getFriendlyName } = useDeviceNames()
  const [scrollIndex, setScrollIndex] = useState(0)
  const [visibleData, setVisibleData] = useState<any[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const pageSize = 5
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isHoveredRef = useRef(false)

  const scrollStep = 1

  useEffect(() => {
    const startAutoScroll = () => {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          if (!isHoveredRef.current) {
            setScrollIndex((prev) => (prev + 1) % Math.max(1, data.length - pageSize + 1))
          }
        }, 2000)
      }
    }

    startAutoScroll()

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [data.length])

  useEffect(() => {
    setVisibleData(data.slice(scrollIndex, scrollIndex + pageSize))
  }, [scrollIndex, data])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseEnter = () => {
      isHoveredRef.current = true
    }

    const handleMouseLeave = () => {
      isHoveredRef.current = false
    }

    container.addEventListener('mouseenter', handleMouseEnter)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    const isScrollDown = e.deltaY > 0
    if (isScrollDown) {
      setScrollIndex((prev) => (prev + scrollStep) % Math.max(1, data.length - pageSize + 1))
    } else {
      setScrollIndex(
        (prev) => (prev - scrollStep + Math.max(1, data.length - pageSize + 1)) % Math.max(1, data.length - pageSize + 1),
      )
    }
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'event_time',
      key: 'event_time',
      align: 'center' as const,
      render: (text: string) => <span className="text-cyan-300">{new Date(text).toLocaleString()}</span>,
    },
    {
      title: '设备名称',
      dataIndex: 'device_id',
      key: 'device_id',
      align: 'center' as const,
      render: (text: string) => <span className="text-cyan-300">{getFriendlyName(text)}</span>,
    },
    {
      title: '异常类型',
      dataIndex: 'anomaly_type',
      key: 'anomaly_type',
      align: 'center' as const,
      render: (text: string) => <span className="text-cyan-300">{text === 'device_1' ? '龙门滑坡监测站' : text}</span>,
    },
    {
      title: '异常值',
      dataIndex: 'value',
      key: 'value',
      align: 'center' as const,
      render: (val: number) => <span className="font-bold text-red-500">{val}</span>,
    },
  ]

  return (
    <div
      className="h-full overflow-auto rounded-xl bg-[#0d1b2a] p-2"
      ref={containerRef}
      onWheel={handleWheel}
      style={{ height: '500px', overflow: 'hidden', marginTop: '2     0px', width: '100%' }}
    >
      <style>
        {`
        .ant-table-thead > tr > th {
          background-color: #0d1b2a !important;
          color: #00ffff !important;
          border-color: rgba(13, 114, 127, 0.6) !important;
          font-weight: bold;
          text-align: center;
        }

        .ant-table-tbody > tr:hover > td {
          background: #112c42 !important;
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

        .ant-table td, .ant-table th {
          border-color: rgba(13, 114, 127, 0.6) !important;
        }

        .ant-table-wrapper,
        .ant-table,
        .ant-table-container {
          border-radius: 0 !important;
          overflow: hidden !important;
          background-color: transparent !important;
        }

        /* 这里控制每一行的高度 */
        .ant-table-tbody > tr > td {
          height: 0px; /* 修改此值来调整每行的高度 */
        }

        /* ✅ 禁止滚动条显示 */
        .ant-table-body {
          overflow: hidden !important;
        }

        /* 强制隐藏滚动条 */
        .ant-table-wrapper::-webkit-scrollbar {
          display: none;
        }
        `}
      </style>

      <Table
        dataSource={visibleData.map((item) => ({ key: item.id, ...item }))}
        columns={columns}
        pagination={false}
        size="small"
        className="rounded-sm border-3 border-cyan-950"
        rowClassName={() =>
          'border-b-2 border border-cyan-300 bg-[#0d1b2a] hover:bg-[#112c42] text-white border-b border-[#0cf]'
        }
      />
    </div>
  )
}
