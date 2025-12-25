'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Table } from 'antd'
import useDeviceMappings from '../hooks/useDeviceMappings'
import useRealtimeAnomalies, { type LegacyRealtimeAnomalyRow } from '../hooks/useRealtimeAnomalies'

export default function RealtimeAnomalyTable() {
  const { data } = useRealtimeAnomalies(30)
  const { getDeviceName } = useDeviceMappings()

  const [scrollIndex, setScrollIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isHoveredRef = useRef(false)

  const pageSize = 5
  const scrollStep = 1
  const windowSize = Math.max(1, data.length - pageSize + 1)

  const visibleData = useMemo(() => data.slice(scrollIndex, scrollIndex + pageSize), [data, pageSize, scrollIndex])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    intervalRef.current = setInterval(() => {
      if (!isHoveredRef.current) {
        setScrollIndex((prev) => (prev + 1) % windowSize)
      }
    }, 2000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [windowSize])

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
      setScrollIndex((prev) => (prev + scrollStep) % windowSize)
    } else {
      setScrollIndex((prev) => (prev - scrollStep + windowSize) % windowSize)
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
      render: (text: string) => <span className="text-cyan-300">{getDeviceName(text) ?? text}</span>,
    },
    {
      title: '异常类型',
      dataIndex: 'anomaly_type',
      key: 'anomaly_type',
      align: 'center' as const,
      render: (text: string) => <span className="text-cyan-300">{text}</span>,
    },
    {
      title: '异常值',
      dataIndex: 'value',
      key: 'value',
      align: 'center' as const,
      render: (val: number) => <span className="font-bold text-red-500">{Number.isFinite(val) ? val : '-'}</span>,
    },
  ]

  const dataSource = useMemo(() => visibleData.map((item: LegacyRealtimeAnomalyRow) => ({ key: item.id, ...item })), [visibleData])

  return (
    <div
      className="h-full w-full overflow-hidden rounded-xl bg-[#0d1b2a] p-2"
      ref={containerRef}
      onWheel={handleWheel}
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

        .ant-table-body {
          overflow: hidden !important;
        }
        `}
      </style>

      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        className="rounded-sm border-2 border-cyan-950"
        rowClassName={() => 'border border-cyan-300 bg-[#0d1b2a] text-white hover:bg-[#112c42]'}
      />
    </div>
  )
}

