'use client'

import React, { useRef, useEffect } from 'react'
import * as echarts from 'echarts'
import useDeviceErrorData from '../hooks/useDeviceErrorData'
import useDeviceNames from '../hooks/useDeviceNames'

const DeviceErrorChart = () => {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const chartInstance = useRef<echarts.EChartsType | null>(null)
  const { data, loading } = useDeviceErrorData()
  const { getFriendlyName } = useDeviceNames()

  useEffect(() => {
    if (!chartRef.current || loading || data.length === 0) return

    // 初始化图表实例（只初始化一次）
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }

    // ✅ 设备排序：按异常数量降序
    const sortedData = [...data].sort((a, b) => b.count - a.count)
    const devices = sortedData.map(item => item.device_id === 'device_1' ? '龙门滑坡监测站' : item.device_id)
    const values = sortedData.map(item => item.count)

    const maxValue = Math.max(...values)
    const baseColor = '#5CC4EB'
    const hoverColor = '#FF4C4C'

    const option = {
      grid: {
        left: '0%',
        right: '0%',
        top: '15%',
        bottom: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: devices,
        axisLine: { lineStyle: { color: '#88aacc' } },
        axisTick: { show: false },
        axisLabel: { color: '#9eaaba', fontSize: 15 },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.1)' },
        },
        axisLine: { show: false },
        axisLabel: { color: '#9eaaba' },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          barWidth: '40%',
          data: values.map((v) => ({
            value: v,
            itemStyle: {
              color: v === maxValue ? hoverColor : baseColor, // ✅ 所有最大值都标红
            },
            label: {
              show: true,
              position: 'top',
              formatter: `${v}`, // ✅ 只显示数字
              color: v === maxValue ? hoverColor : baseColor,
              fontSize: 12,
              fontWeight: 'bold',
            },
          })),
        },
      ],
      dataZoom: [
        {
          type: 'slider',
          show: true,
          start: 0,
          end: 100,
          xAxisIndex: 0,
          height: 10,
          bottom: 5,
          handleStyle: {
            color: '#5CC4EB',
          },
          textStyle: {
            color: '#9eaaba',
          },
          backgroundColor: 'rgba(255,255,255,0.05)',
          dataBackground: {
            lineStyle: { color: '#aaa' },
            areaStyle: { color: '#ddd' },
          },
        },
      ],
    }

    chartInstance.current.setOption(option)

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize()
    })
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [data, loading, getFriendlyName])

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}

export default DeviceErrorChart
