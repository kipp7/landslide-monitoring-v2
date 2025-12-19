// 更新版本的温度图表组件 - 使用统一的监测站配置
'use client';

import React, { useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import useTemperature from '../hooks/useTemperature';
import { getChartConfig, getStationLegendName } from '../config/monitoring-stations';

const deviceColors = ['#0783FA', '#FF2E2E', '#07D1FA', '#FFD15C', '#20E6A4'];
const areaColors = [
  { from: 'rgba(7, 131, 250, 0.3)', to: 'rgba(7, 131, 250, 0)' },
  { from: 'rgba(255, 46, 46, 0.3)', to: 'rgba(255, 46, 46, 0)' },
  { from: 'rgba(7, 209, 250, 0.3)', to: 'rgba(7, 209, 250, 0)' },
  { from: 'rgba(255, 209, 92, 0.3)', to: 'rgba(255, 209, 92, 0)' },
  { from: 'rgba(32, 230, 164, 0.3)', to: 'rgba(32, 230, 164, 0)' },
];

export default function TemperatureChartUpdated() {
  const chartRef = useRef<ReactECharts | null>(null);
  const { data, loading, error } = useTemperature();

  // 获取图表配置
  const chartConfig = getChartConfig('temperature');
  
  const isEmpty = !data || Object.keys(data).length === 0;

  if (loading) return <div className="text-white text-sm">加载中...</div>;
  if (error) return <div className="text-red-500 text-sm">加载失败: {error.message}</div>;
  if (isEmpty) return <div className="text-white text-sm">暂无数据</div>;

  const deviceKeys = Object.keys(data);

  const xLabels = data[deviceKeys[0]].map((d: { time: string; value: number }) =>
    new Date(d.time).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );

  // 使用统一配置的图例名称
  const series = deviceKeys.map((key, index) => ({
    name: getStationLegendName('temperature', key), // 使用统一配置的图例名称
    type: 'line' as const,
    smooth: true,
    showSymbol: false,
    data: data[key].map((d: { time: string; value: number }) => d.value),
    lineStyle: {
      width: 1.5,
      shadowColor: deviceColors[index % deviceColors.length],
      shadowBlur: 8,
    },
    areaStyle: {
      opacity: 0.4,
      color: {
        type: 'linear' as const,
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: areaColors[index % areaColors.length].from },
          { offset: 1, color: areaColors[index % areaColors.length].to },
        ],
      },
    },
  }));

  const option = {
    backgroundColor: 'transparent',
    color: deviceColors,
    animationDuration: 1000,
    animationEasing: 'cubicOut' as const,
    title: {
      text: `${chartConfig?.title || '温度趋势图'} (${chartConfig?.unit || '°C'})`,
      left: 'center',
      top: '0%',
      textStyle: {
        color: '#94A7BD',
        fontSize: 12,
        fontWeight: 'normal' as const
      }
    },
    legend: {
      icon: 'circle',
      itemWidth: 15,
      itemHeight: 20,
      left: 30,
      type: 'scroll',
      orient: 'horizontal' as const,
      top: '10%',
      textStyle: { color: '#94A7BD', fontSize: 10 },
      pageIconColor: '#0891b2',
      pageTextStyle: { color: '#ffffff', fontWeight: 'bold' as const },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#1b263b',
      borderColor: '#20E6A4',
      textStyle: { color: '#fff' },
      formatter: function(params: any) {
        let result = `<div style="font-size: 12px;">时间: ${params[0].axisValue}</div>`;
        params.forEach((param: any) => {
          result += `<div style="font-size: 11px;">
            <span style="display:inline-block;margin-right:5px;border-radius:50%;width:8px;height:8px;background-color:${param.color};"></span>
            ${param.seriesName}: ${param.value}${chartConfig?.unit || '°C'}
          </div>`;
        });
        return result;
      },
      position: function (point: number[], params: unknown, dom: any, rect: unknown, size: { contentSize: number[]; viewSize: number[] }) {
        if (!dom) return [point[0] + 10, point[1] - 10];
        const tooltipWidth = size.contentSize[0];
        const tooltipHeight = size.contentSize[1];
        const chartWidth = size.viewSize[0];
        let x = point[0] + 10;
        let y = point[1] - tooltipHeight - 10;

        if (x + tooltipWidth > chartWidth) x = point[0] - tooltipWidth - 10;
        if (y < 0) y = point[1] + 10;
        return [x, y];
      },
    },
    grid: {
      left: '0%',
      right: '0%',
      bottom: '12%',
      top: '25%',
      containLabel: true,
    },
    dataZoom: [
      {
        type: 'inside',
        start: 90,
        end: 100,
      },
      {
        type: 'slider',
        show: true,
        start: 90,
        end: 100,
        height: 6,
        bottom: 4,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        fillerColor: 'rgba(32,230,164,0.2)',
        handleStyle: {
          color: '#20E6A4',
          shadowColor: '#20E6A4',
          shadowBlur: 6,
        },
        textStyle: {
          color: '#94A7BD',
          fontSize: 9,
        },
      },
    ],
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLine: { lineStyle: { color: '#94A7BD' } },
      axisLabel: { 
        color: '#94A7BD',
        fontSize: 9,
        interval: 'auto'
      },
    },
    yAxis: {
      type: 'value' as const,
      name: chartConfig?.yAxisName || '温度',
      nameTextStyle: { 
        color: '#94A7BD', 
        padding: [0, 0, 0, -20],
        fontSize: 10
      },
      axisLine: { lineStyle: { color: '#94A7BD' } },
      splitLine: {
        lineStyle: {
          color: '#182D46',
          type: 'dashed' as const,
        },
      },
      axisLabel: { 
        color: '#94A7BD',
        fontSize: 9
      },
    },
    series,
  };

  return <ReactECharts ref={chartRef} option={option} style={{ height: '100%', width: '100%' }} />;
}
