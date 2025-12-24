'use client'

import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

const AutoCarouselBarChart = () => {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const myChart = echarts.init(chartRef.current)

    const xAxisData = ['0:00', '2:00', '4:00', '6:00', '8:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
    const seriesData = [210, 230, 260, 220, 204, 350, 504, 620, 740, 650, 600, 1000]
    const visibleCount = 6
    let startIndex = 0

    const getVisibleYMax = (data: number[], start: number, count: number) => {
      return Math.ceil(Math.max(...data.slice(start, start + count)) / 200) * 200
    }

    const updateOption = () => {
      const yMax = getVisibleYMax(seriesData, startIndex, visibleCount)

      const option = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
        },
        grid: {
          top: '30%',
          left: 0,
          right: 0,
          bottom: 0,
          containLabel: true,
        },
        dataZoom: [
          {
            type: 'slider',
            show: false,
            startValue: startIndex,
            endValue: startIndex + visibleCount - 1,
          },
        ],
        xAxis: {
          type: 'category',
          data: xAxisData,
          axisLine: { lineStyle: { color: 'white' } },
          axisLabel: { color: '#9eaaba' },
        },
        yAxis: {
          type: 'value',
          nameTextStyle: {
            padding: [0, 40, 0, 0],
            align: 'center',
          },
          max: yMax,
          interval: 200,
          axisLine: { show: false },
          axisLabel: { color: '#9eaaba' },
          splitLine: {
            show: true,
            lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.1)' },
          },
        },
        series: [
          {
            barWidth: 35,
            name: '雨量',
            type: 'bar',
            data: seriesData,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#5cc4eb' },
                { offset: 1, color: '#21658c' },
              ]),
            },
            label: {
              show: true,
              position: 'top',
              color: '#43C4F1',
            },
          },
        ],
      }

      myChart.setOption(option)
    }

    updateOption()

    const timer = setInterval(() => {
      startIndex = (startIndex + 1) % (xAxisData.length - visibleCount + 1)
      updateOption()
    }, 2000)

    return () => {
      clearInterval(timer)
      myChart.dispose()
    }
  }, [])

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}

export default AutoCarouselBarChart
