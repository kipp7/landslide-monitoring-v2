'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'

interface AnomalyData {
  anomaly_type: string
  count: number
  severity: string
  latest_time: string
}

const AnomalyTypeChart = () => {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const chartInstance = useRef<echarts.EChartsType | null>(null)
  const [data, setData] = useState<AnomalyData[]>([])
  const [loading, setLoading] = useState(true)

  const totalCount = data.reduce((sum, item) => sum + item.count, 0)
  // 国标四级预警统计
  const redWarningCount = data.filter((item) => item.severity === 'red').reduce((sum, item) => sum + item.count, 0)
  const orangeWarningCount = data
    .filter((item) => item.severity === 'orange')
    .reduce((sum, item) => sum + item.count, 0)
  const yellowWarningCount = data
    .filter((item) => item.severity === 'yellow')
    .reduce((sum, item) => sum + item.count, 0)
  const blueWarningCount = data.filter((item) => item.severity === 'blue').reduce((sum, item) => sum + item.count, 0)

  // 获取异常评估数据
  const fetchAnomalyData = async () => {
    try {
      console.log('📊 从后端异常评估服务获取数据...')

      // 调用后端异常评估API
      const response = await fetch('/api/anomaly-assessment?timeWindow=24', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        console.log('✅ 后端异常评估数据获取成功:', result.stats)
        setData(result.data || [])
      } else {
        console.warn('⚠️ 后端异常评估返回错误，使用fallback数据:', result.error)
        setData(result.fallback_data?.data || [])
      }
    } catch (error) {
      console.error('获取异常数据失败:', error)
      // 模拟数据
      setData([
        { anomaly_type: '温度异常', count: 5, severity: 'medium', latest_time: new Date().toISOString() },
        { anomaly_type: '振动异常', count: 3, severity: 'high', latest_time: new Date().toISOString() },
        { anomaly_type: '湿度异常', count: 2, severity: 'low', latest_time: new Date().toISOString() },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnomalyData()
    const interval = setInterval(fetchAnomalyData, 30000) // 30秒更新一次
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!chartRef.current || loading || data.length === 0) return

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }

    // 获取国标预警等级颜色
    const getSeverityColor = (severity: string) => {
      switch (severity) {
        case 'red':
          return '#dc2626' // 红色预警(一级)：特别严重
        case 'orange':
          return '#ea580c' // 橙色预警(二级)：严重
        case 'yellow':
          return '#d97706' // 黄色预警(三级)：较重
        case 'blue':
          return '#2563eb' // 蓝色预警(四级)：一般
        default:
          return '#06b6d4' // 青色 - 未知
      }
    }

    // 获取国标预警等级中文
    const getSeverityText = (severity: string) => {
      switch (severity) {
        case 'red':
          return '红色' // 一级预警
        case 'orange':
          return '橙色' // 二级预警
        case 'yellow':
          return '黄色' // 三级预警
        case 'blue':
          return '蓝色' // 四级预警
        default:
          return '未知'
      }
    }

    const types = data.map((item) => item.anomaly_type)
    const values = data.map((item) => item.count)
    const colors = data.map((item) => getSeverityColor(item.severity))

    const option = {
      grid: {
        left: '8%',
        right: '8%',
        top: '8%',
        bottom: '20%', // 减少底部空间
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: types,
        axisLine: { show: false }, // 删除横线
        axisTick: { show: false },
        axisLabel: {
          color: '#ffffff', // 更亮的白色
          fontSize: 12, // 稍大字体
          fontWeight: 'bold',
          interval: 0,
          rotate: 0, // 不旋转，水平显示
          margin: 10, // 增加间距
          formatter: (value: string) => {
            // 简化异常类型名称
            const shortNames: { [key: string]: string } = {
              温度异常: '温度',
              湿度异常: '湿度',
              振动异常: '振动',
              光照异常: '光照',
              倾斜异常: '倾斜',
              位移异常: '位移',
            }
            return shortNames[value] || value.substring(0, 4)
          },
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { show: false }, // 删除Y轴分割线（横线）
        axisLine: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        axisTick: { show: false },
        min: 0,
        max: 'dataMax',
        minInterval: 1,
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = data[params[0].dataIndex]
          const timeDiff = Math.round((Date.now() - new Date(item.latest_time).getTime()) / 60000)
          const percentage = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0
          return `
            <div style="padding: 12px; background: rgba(15, 23, 42, 0.96); border-radius: 8px; border: 1px solid #06b6d4; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
              <div style="color: #06b6d4; font-weight: bold; margin-bottom: 8px; font-size: 13px;">${item.anomaly_type}</div>
              <div style="color: #e2e8f0; font-size: 11px; line-height: 1.4;">
                <div style="margin: 3px 0; display: flex; justify-content: space-between;">
                  <span>异常次数:</span>
                  <span style="color: ${getSeverityColor(item.severity)}; font-weight: bold;">${item.count} 次</span>
                </div>
                <div style="margin: 3px 0; display: flex; justify-content: space-between;">
                  <span>占比:</span>
                  <span style="color: #06b6d4; font-weight: bold;">${percentage}%</span>
                </div>
                <div style="margin: 3px 0; display: flex; justify-content: space-between;">
                  <span>预警等级:</span>
                  <span style="color: ${getSeverityColor(item.severity)}; font-weight: bold;">${getSeverityText(
                    item.severity,
                  )}预警</span>
                </div>
                <div style="margin: 6px 0 0 0; padding-top: 6px; border-top: 1px solid rgba(148, 163, 184, 0.2); color: #94a3b8; font-size: 10px;">
                  最新发生: ${timeDiff < 60 ? timeDiff + '分钟前' : Math.round(timeDiff / 60) + '小时前'}
                </div>
              </div>
            </div>
          `
        },
        backgroundColor: 'transparent',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          barWidth: '60%',
          data: values.map((v, index) => ({
            value: v,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: colors[index] + 'FF' }, // 不透明顶部
                  { offset: 0.6, color: colors[index] + 'CC' }, // 中部渐变
                  { offset: 1, color: colors[index] + '80' }, // 透明底部
                ],
              },
              borderRadius: [4, 4, 0, 0], // 顶部圆角
              shadowColor: colors[index] + '60',
              shadowBlur: 10,
              shadowOffsetY: 3,
            },
            label: {
              show: true,
              position: 'top',
              formatter: (params: any) => {
                const percentage = totalCount > 0 ? Math.round((params.value / totalCount) * 100) : 0
                const typeName = data[params.dataIndex]?.anomaly_type || ''
                const shortName = typeName.replace('异常', '') // 去掉"异常"两字
                return `${params.value} (${percentage}%)\n${shortName}`
              },
              color: '#ffffff',
              fontSize: 10,
              fontWeight: 'bold',
              distance: 8,
              lineHeight: 14,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 4,
              padding: [4, 6],
            },
          })),
          animationDelay: (idx: number) => idx * 100, // 动画延迟
          animationDuration: 800,
          emphasis: {
            focus: 'series',
            itemStyle: {
              shadowBlur: 15,
              shadowColor: colors[0] + '60',
            },
          },
        },
      ],
      animation: true,
      animationThreshold: 2000,
      animationDuration: 800,
      animationEasing: 'cubicOut' as const,
    }

    chartInstance.current.setOption(option)

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize()
    })
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [data, loading, totalCount])

  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose()
        chartInstance.current = null
      }
    }
  }, [])

  if (loading) {
    return (
      <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col">
        <div className="text-center mb-2 flex-shrink-0">
          <div className="text-cyan-400 text-base font-medium mb-3">异常分布</div>
          <div className="flex justify-center items-center gap-4 mb-2">
            <div className="bg-slate-700/50 rounded px-2 py-1">
              <span className="text-gray-300 text-xs">总计</span>
              <div className="text-gray-400 font-bold text-lg">--</div>
            </div>
          </div>
          <div className="text-gray-400 text-xs">过去24小时</div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-cyan-400 text-2xl mb-3 animate-pulse">📊</div>
            <div className="text-cyan-400 text-base font-medium">加载异常数据</div>
            <div className="text-gray-400 text-sm mt-1">正在分析监控数据...</div>
            <div className="flex justify-center mt-3">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                ></div>
                <div
                  className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                ></div>
                <div
                  className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col">
        <div className="text-center mb-2 flex-shrink-0">
          <div className="text-cyan-400 text-base font-medium mb-3">异常分布</div>

          {/* 放大的总计显示 */}
          <div className="flex justify-center items-center mb-3">
            <div className="bg-slate-700/50 rounded-lg px-4 py-3 border border-slate-600/30">
              <span className="text-gray-300 text-sm block mb-1">总计</span>
              <div className="text-cyan-400 font-bold text-2xl">0</div>
            </div>
          </div>

          <div className="text-gray-400 text-xs">过去24小时</div>
        </div>

        {/* 空白区域，保持卡片高度 */}
        <div className="flex-1"></div>
      </div>
    )
  }

  return (
    <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col">
      <div className="text-center mb-2 flex-shrink-0">
        <div className="text-cyan-400 text-base font-medium mb-2">异常分布</div>

        {/* 突出显示总计 */}
        <div className="flex justify-center items-center mb-3">
          <div className="bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600/30">
            <span className="text-gray-300 text-sm block mb-1">总计</span>
            <div className="text-cyan-400 font-bold text-xl">{totalCount}</div>
          </div>
        </div>

        {/* 国标四级预警统计 */}
        <div className="grid grid-cols-2 gap-1 mb-2 text-xs">
          {redWarningCount > 0 && (
            <div className="bg-red-600/20 rounded px-1 py-1 text-center">
              <span className="text-red-300">红色</span>
              <div className="text-red-400 font-bold">{redWarningCount}</div>
            </div>
          )}

          {orangeWarningCount > 0 && (
            <div className="bg-orange-600/20 rounded px-1 py-1 text-center">
              <span className="text-orange-300">橙色</span>
              <div className="text-orange-400 font-bold">{orangeWarningCount}</div>
            </div>
          )}

          {yellowWarningCount > 0 && (
            <div className="bg-yellow-600/20 rounded px-1 py-1 text-center">
              <span className="text-yellow-300">黄色</span>
              <div className="text-yellow-400 font-bold">{yellowWarningCount}</div>
            </div>
          )}

          {blueWarningCount > 0 && (
            <div className="bg-blue-600/20 rounded px-1 py-1 text-center">
              <span className="text-blue-300">蓝色</span>
              <div className="text-blue-400 font-bold">{blueWarningCount}</div>
            </div>
          )}
        </div>

        {/* 24小时提示 */}
        <div className="text-gray-400 text-xs mb-1">过去24小时</div>
      </div>
      {/* 缩小图表区域，避免超出容器 */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ width: '100%', maxHeight: '120px' }} />
    </div>
  )
}

export default AnomalyTypeChart
