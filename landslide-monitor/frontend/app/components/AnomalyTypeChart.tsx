'use client'

import React, { useRef, useEffect, useState } from 'react'
import * as echarts from 'echarts'
import { supabase } from '../../lib/supabaseClient'

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

  // 获取异常数据
  const fetchAnomalyData = async () => {
    try {
      const { data: result, error } = await supabase
        .from('iot_anomalies')
        .select('anomaly_type, severity, event_time')
        .gte('event_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 最近24小时
        .order('event_time', { ascending: false })

      if (error) throw error

      // 统计异常类型
      const typeMap = new Map<string, {count: number, severity: string, latestTime: string}>()
      
      result.forEach(item => {
        const type = item.anomaly_type || '未知异常'
        const existing = typeMap.get(type)
        
        if (!existing) {
          typeMap.set(type, {
            count: 1,
            severity: item.severity || 'low',
            latestTime: item.event_time
          })
        } else {
          existing.count += 1
          // 保留最新时间
          if (new Date(item.event_time) > new Date(existing.latestTime)) {
            existing.latestTime = item.event_time
            existing.severity = item.severity || existing.severity
          }
        }
      })

      const anomalyData: AnomalyData[] = Array.from(typeMap.entries()).map(([type, info]) => ({
        anomaly_type: type,
        count: info.count,
        severity: info.severity,
        latest_time: info.latestTime
      })).sort((a, b) => b.count - a.count) // 按数量降序

      setData(anomalyData)
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

    // 获取严重程度颜色 - 优化配色
    const getSeverityColor = (severity: string) => {
      switch (severity) {
        case 'high': return '#ef4444'      // 红色 - 高危
        case 'medium': return '#f97316'    // 橙色 - 中危
        case 'low': return '#10b981'       // 绿色 - 低危
        default: return '#06b6d4'          // 青色 - 未知
      }
    }

    // 获取严重程度中文
    const getSeverityText = (severity: string) => {
      switch (severity) {
        case 'high': return '高'
        case 'medium': return '中'
        case 'low': return '低'
        default: return '未知'
      }
    }

    const types = data.map(item => item.anomaly_type)
    const values = data.map(item => item.count)
    const colors = data.map(item => getSeverityColor(item.severity))

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
            const shortNames: {[key: string]: string} = {
              '温度异常': '温度',
              '湿度异常': '湿度', 
              '振动异常': '振动',
              '光照异常': '光照',
              '倾斜异常': '倾斜',
              '位移异常': '位移'
            }
            return shortNames[value] || value.substring(0, 4)
          }
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
        minInterval: 1
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
                  <span>危险等级:</span>
                  <span style="color: ${getSeverityColor(item.severity)}; font-weight: bold;">${getSeverityText(item.severity)}危</span>
                </div>
                <div style="margin: 6px 0 0 0; padding-top: 6px; border-top: 1px solid rgba(148, 163, 184, 0.2); color: #94a3b8; font-size: 10px;">
                  最新发生: ${timeDiff < 60 ? timeDiff + '分钟前' : Math.round(timeDiff/60) + '小时前'}
                </div>
              </div>
            </div>
          `
        },
        backgroundColor: 'transparent',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 11 }
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
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: colors[index] + 'FF' }, // 不透明顶部
                  { offset: 0.6, color: colors[index] + 'CC' }, // 中部渐变
                  { offset: 1, color: colors[index] + '80' }  // 透明底部
                ]
              },
              borderRadius: [4, 4, 0, 0], // 顶部圆角
              shadowColor: colors[index] + '60',
              shadowBlur: 10,
              shadowOffsetY: 3
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
               padding: [4, 6]
             },
          })),
          animationDelay: (idx: number) => idx * 100, // 动画延迟
          animationDuration: 800,
          emphasis: {
            focus: 'series',
            itemStyle: {
              shadowBlur: 15,
              shadowColor: colors[0] + '60'
            }
          }
        },
      ],
      animation: true,
      animationThreshold: 2000,
      animationDuration: 800,
      animationEasing: 'cubicOut' as const
    }

    chartInstance.current.setOption(option)

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize()
    })
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [data, loading])

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
          <div className="text-cyan-400 text-base font-medium mb-2">异常分布</div>
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
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
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
          <div className="text-cyan-400 text-base font-medium mb-2">异常分布</div>
          <div className="flex justify-center items-center gap-4 mb-2">
            <div className="bg-slate-700/50 rounded px-2 py-1">
              <span className="text-gray-300 text-xs">总计</span>
              <div className="text-cyan-400 font-bold text-lg">0</div>
            </div>
          </div>
          <div className="text-gray-400 text-xs">过去24小时</div>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center bg-green-500/10 border border-green-500/30 rounded-lg p-6">
            <div className="text-3xl text-green-400 mb-3">🛡️</div>
            <div className="text-green-400 font-medium text-base mb-1">系统运行正常</div>
            <div className="text-gray-400 text-sm">24小时内无异常记录</div>
            <div className="text-gray-500 text-xs mt-2">监控状态良好</div>
          </div>
        </div>
      </div>
    )
  }

  const totalCount = data.reduce((sum, item) => sum + item.count, 0)
  const highSeverityCount = data.filter(item => item.severity === 'high').reduce((sum, item) => sum + item.count, 0)

  const mediumSeverityCount = data.filter(item => item.severity === 'medium').reduce((sum, item) => sum + item.count, 0)
  const lowSeverityCount = data.filter(item => item.severity === 'low').reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col">
      <div className="text-center mb-2 flex-shrink-0">
        <div className="text-cyan-400 text-base font-medium mb-2">异常分布</div>
        
        {/* 主要统计信息 */}
        <div className="flex justify-center items-center gap-4 mb-2">
          <div className="bg-slate-700/50 rounded px-2 py-1">
            <span className="text-gray-300 text-xs">总计</span>
            <div className="text-cyan-400 font-bold text-lg">{totalCount}</div>
          </div>
          
          {highSeverityCount > 0 && (
            <div className="bg-red-500/20 rounded px-2 py-1">
              <span className="text-red-300 text-xs">高危</span>
              <div className="text-red-400 font-bold text-lg">{highSeverityCount}</div>
            </div>
          )}
          
          {mediumSeverityCount > 0 && (
            <div className="bg-orange-500/20 rounded px-2 py-1">
              <span className="text-orange-300 text-xs">中危</span>
              <div className="text-orange-400 font-bold">{mediumSeverityCount}</div>
            </div>
          )}
          
          {lowSeverityCount > 0 && (
            <div className="bg-green-500/20 rounded px-2 py-1">
              <span className="text-green-300 text-xs">低危</span>
              <div className="text-green-400 font-bold">{lowSeverityCount}</div>
            </div>
          )}
        </div>
        
        {/* 24小时提示 */}
        <div className="text-gray-400 text-xs">过去24小时</div>
      </div>
      <div ref={chartRef} className="flex-1 min-h-0" style={{ width: '100%' }} />
    </div>
  )
}

export default AnomalyTypeChart



