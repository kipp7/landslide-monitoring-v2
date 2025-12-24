'use client'

import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import 'echarts-liquidfill'
import useDeviceShadow from '../hooks/useDeviceShadow'

const LiquidFillChart = () => {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const { data: shadowData, loading } = useDeviceShadow()

  useEffect(() => {
    if (!chartRef.current || loading || !shadowData) return

    const myChart = echarts.init(chartRef.current)

    const riskLevel = shadowData.properties?.risk_level || 0
    const value = Math.min(1, riskLevel / 4)

    let fillColor, borderColor, shadowColor
    if (value < 0.3) {
      fillColor = ['rgba(0, 255, 255, 0.6)', 'rgba(0, 200, 255, 0.4)']
      borderColor = '#00ffff'
      shadowColor = '#00ffff'
    } else if (value < 0.6) {
      fillColor = ['rgba(255, 206, 0, 0.6)', 'rgba(255, 170, 0, 0.6)']
      borderColor = '#ffb800'
      shadowColor = '#ffb800'
    } else {
      fillColor = ['rgba(255, 80, 80, 0.6)', 'rgba(255, 20, 20, 0.6)']
      borderColor = '#ff3030'
      shadowColor = '#ff3030'
    }

    const option = {
      backgroundColor: 'transparent',
      series: [
        {
          type: 'liquidFill',
          shape: 'circle',
          radius: '85%',
          center: ['50%', '44%'],
          data: [value, value - 0.1, value - 0.2],
          outline: {
            borderDistance: 0,
            itemStyle: {
              borderWidth: 4,
              borderColor: borderColor,
              shadowBlur: 50,
              shadowColor: shadowColor,
              opacity: 1,
            },
          },
          color: fillColor,
          backgroundStyle: {
            color: 'rgba(0, 0, 0, 0)',
          },
          label: {
            show: true,
            formatter: (params: any) => {
              const riskLevelNames = ['正常', '注意', '警告', '危险', '严重']
              const riskLevelName = riskLevelNames[riskLevel] || '未知'
              return `${(params.value * 100).toFixed(0)}%\n{a|${riskLevelName}}`
            },
            fontSize: 36,
            fontWeight: 'bold',
            color: borderColor,
            rich: {
              a: {
                fontSize: 20,
                color: borderColor,
              },
            },
          },
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '90%',
          style: {
            text: `设备 ${shadowData.device_id}`,
            fill: borderColor,
            font: 'bold 16px sans-serif',
            textAlign: 'center',
            textVerticalAlign: 'middle',
            shadowColor: '#000',
            shadowBlur: 2,
          },
        },
      ],
    }

    myChart.setOption(option)

    return () => {
      myChart.dispose()
    }
  }, [shadowData, loading])

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}

export default LiquidFillChart

