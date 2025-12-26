import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// Excel样式配置
const EXCEL_STYLES = {
  // 标题样式
  title: {
    font: { bold: true, size: 16, color: { rgb: '1F4E79' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'E7F3FF' } },
    border: {
      top: { style: 'medium', color: { rgb: '1F4E79' } },
      bottom: { style: 'medium', color: { rgb: '1F4E79' } },
      left: { style: 'medium', color: { rgb: '1F4E79' } },
      right: { style: 'medium', color: { rgb: '1F4E79' } }
    }
  },
  // 表头样式
  header: {
    font: { bold: true, size: 12, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: '4472C4' } },
    border: {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    }
  },
  // 数据样式
  data: {
    font: { size: 10 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } }
    }
  },
  // 警告数据样式
  warning: {
    font: { size: 10, bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'FF4444' } },
    border: {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } }
    }
  },
  // 统计数据样式
  summary: {
    font: { bold: true, size: 11, color: { rgb: '1F4E79' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    fill: { fgColor: { rgb: 'F2F8FF' } },
    border: {
      top: { style: 'thin', color: { rgb: '1F4E79' } },
      bottom: { style: 'thin', color: { rgb: '1F4E79' } },
      left: { style: 'thin', color: { rgb: '1F4E79' } },
      right: { style: 'thin', color: { rgb: '1F4E79' } }
    }
  }
};

// GPS数据接口定义
interface GPSExportData {
  id: string;
  device_id: string;
  event_time: string;
  latitude: number;
  longitude: number;
  deformation_distance_3d: number;
  deformation_horizontal: number;
  deformation_vertical: number;
  deformation_velocity: number;
  deformation_confidence: number;
  temperature?: number;
  humidity?: number;
  risk_level?: number;
}

// 分析结果数据接口
interface AnalysisExportData {
  deviceId: string;
  timestamp: string;
  realTimeDisplacement?: {
    displacement: number;
    horizontal: number;
    vertical: number;
    latestTime: string;
  };
  riskAssessment?: {
    level: number;
    description: string;
    confidence: number;
  };
  predictions?: {
    shortTerm?: {
      confidence: number;
      data: Array<{ time: string; value: number; }>;
    };
    longTerm?: {
      confidence: number;
      data: Array<{ time: string; value: number; }>;
    };
  };
}

/**
 * 导出GPS数据为Excel格式
 */
export const exportGPSDataToExcel = (
  data: GPSExportData[], 
  deviceId: string, 
  filename?: string
) => {
  try {
    // 准备Excel数据
    const worksheetData = data.map((item, index) => ({
      '序号': index + 1,
      '设备ID': item.device_id,
      '时间戳': item.event_time,
      '纬度': item.latitude.toFixed(6),
      '经度': item.longitude.toFixed(6),
      '3D位移(mm)': item.deformation_distance_3d.toFixed(2),
      '水平位移(mm)': item.deformation_horizontal.toFixed(2),
      '垂直位移(mm)': item.deformation_vertical.toFixed(2),
      '形变速度(mm/s)': item.deformation_velocity.toFixed(4),
      '置信度(%)': (item.deformation_confidence * 100).toFixed(1),
      '温度(°C)': item.temperature?.toFixed(1) || '',
      '湿度(%)': item.humidity?.toFixed(1) || '',
      '风险等级': item.risk_level || ''
    }));

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);

    // 设置列宽
    const columnWidths = [
      { wch: 8 },   // 序号
      { wch: 12 },  // 设备ID
      { wch: 20 },  // 时间戳
      { wch: 12 },  // 纬度
      { wch: 12 },  // 经度
      { wch: 15 },  // 3D位移
      { wch: 15 },  // 水平位移
      { wch: 15 },  // 垂直位移
      { wch: 15 },  // 形变速度
      { wch: 12 },  // 置信度
      { wch: 10 },  // 温度
      { wch: 10 },  // 湿度
      { wch: 10 }   // 风险等级
    ];
    worksheet['!cols'] = columnWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, 'GPS数据');

    // 添加统计信息工作表
    const statsData = [
      { '统计项目': '数据点总数', '数值': data.length },
      { '统计项目': '平均3D位移(mm)', '数值': (data.reduce((sum, item) => sum + item.deformation_distance_3d, 0) / data.length).toFixed(2) },
      { '统计项目': '最大3D位移(mm)', '数值': Math.max(...data.map(item => item.deformation_distance_3d)).toFixed(2) },
      { '统计项目': '最小3D位移(mm)', '数值': Math.min(...data.map(item => item.deformation_distance_3d)).toFixed(2) },
      { '统计项目': '平均置信度(%)', '数值': (data.reduce((sum, item) => sum + item.deformation_confidence, 0) / data.length * 100).toFixed(1) },
      { '统计项目': '数据时间范围', '数值': `${data[data.length - 1]?.event_time} 至 ${data[0]?.event_time}` }
    ];
    const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
    XLSX.utils.book_append_sheet(workbook, statsWorksheet, '统计信息');

    // 生成文件并下载
    const defaultFilename = `GPS数据_${deviceId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename || defaultFilename);

    return { success: true, message: 'GPS数据导出成功' };
  } catch (error) {
    console.error('GPS数据导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

/**
 * 导出分析结果为Excel格式
 */
export const exportAnalysisToExcel = (
  analysisData: AnalysisExportData,
  filename?: string
) => {
  try {
    const workbook = XLSX.utils.book_new();

    // 实时位移数据工作表
    if (analysisData.realTimeDisplacement) {
      const realTimeData = [
        { '项目': '3D位移', '数值': `${analysisData.realTimeDisplacement.displacement.toFixed(2)} mm` },
        { '项目': '水平位移', '数值': `${analysisData.realTimeDisplacement.horizontal.toFixed(2)} mm` },
        { '项目': '垂直位移', '数值': `${analysisData.realTimeDisplacement.vertical.toFixed(2)} mm` },
        { '项目': '更新时间', '数值': analysisData.realTimeDisplacement.latestTime }
      ];
      const realTimeWorksheet = XLSX.utils.json_to_sheet(realTimeData);
      XLSX.utils.book_append_sheet(workbook, realTimeWorksheet, '实时位移');
    }

    // 风险评估数据工作表
    if (analysisData.riskAssessment) {
      const riskData = [
        { '项目': '风险等级', '数值': analysisData.riskAssessment.level },
        { '项目': '风险描述', '数值': analysisData.riskAssessment.description },
        { '项目': '评估置信度', '数值': `${(analysisData.riskAssessment.confidence * 100).toFixed(1)}%` }
      ];
      const riskWorksheet = XLSX.utils.json_to_sheet(riskData);
      XLSX.utils.book_append_sheet(workbook, riskWorksheet, '风险评估');
    }

    // 预测数据工作表
    if (analysisData.predictions) {
      // 短期预测
      if (analysisData.predictions.shortTerm) {
        const shortTermData = analysisData.predictions.shortTerm.data.map((item, index) => ({
          '序号': index + 1,
          '时间': item.time,
          '预测值(mm)': item.value.toFixed(2)
        }));
        const shortTermWorksheet = XLSX.utils.json_to_sheet(shortTermData);
        XLSX.utils.book_append_sheet(workbook, shortTermWorksheet, '短期预测');
      }

      // 长期预测
      if (analysisData.predictions.longTerm) {
        const longTermData = analysisData.predictions.longTerm.data.map((item, index) => ({
          '序号': index + 1,
          '时间': item.time,
          '预测值(mm)': item.value.toFixed(2)
        }));
        const longTermWorksheet = XLSX.utils.json_to_sheet(longTermData);
        XLSX.utils.book_append_sheet(workbook, longTermWorksheet, '长期预测');
      }
    }

    // 生成文件并下载
    const defaultFilename = `分析结果_${analysisData.deviceId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename || defaultFilename);

    return { success: true, message: '分析结果导出成功' };
  } catch (error) {
    console.error('分析结果导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

/**
 * 导出数据为CSV格式
 */
export const exportDataToCSV = (
  data: any[],
  headers: string[],
  filename: string
) => {
  try {
    // 创建CSV内容
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // 处理包含逗号的值
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value;
        }).join(',')
      )
    ].join('\n');

    // 添加UTF-8 BOM以支持中文
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    saveAs(blob, filename);
    return { success: true, message: 'CSV导出成功' };
  } catch (error) {
    console.error('CSV导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

/**
 * 导出综合报告
 */
export const exportComprehensiveReport = (
  gpsData: GPSExportData[],
  analysisData: AnalysisExportData,
  deviceId: string
) => {
  try {
    const workbook = XLSX.utils.book_new();

    // 1. 报告摘要
    const summaryData = [
      { '项目': '设备ID', '内容': deviceId },
      { '项目': '报告生成时间', '内容': new Date().toLocaleString('zh-CN') },
      { '项目': 'GPS数据点数', '内容': gpsData.length },
      { '项目': '数据时间范围', '内容': gpsData.length > 0 ? `${gpsData[gpsData.length - 1]?.event_time} 至 ${gpsData[0]?.event_time}` : '无数据' },
      { '项目': '当前风险等级', '内容': analysisData.riskAssessment?.description || '未知' },
      { '项目': '最新位移', '内容': analysisData.realTimeDisplacement ? `${analysisData.realTimeDisplacement.displacement.toFixed(2)} mm` : '未知' }
    ];
    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, '报告摘要');

    // 2. GPS数据（简化版）
    if (gpsData.length > 0) {
      const gpsDataSimplified = gpsData.slice(0, 1000).map((item, index) => ({
        '序号': index + 1,
        '时间': item.event_time,
        '纬度': item.latitude.toFixed(6),
        '经度': item.longitude.toFixed(6),
        '3D位移(mm)': item.deformation_distance_3d.toFixed(2),
        '风险等级': item.risk_level || ''
      }));
      const gpsWorksheet = XLSX.utils.json_to_sheet(gpsDataSimplified);
      XLSX.utils.book_append_sheet(workbook, gpsWorksheet, 'GPS数据');
    }

    // 3. 统计分析
    if (gpsData.length > 0) {
      const statsData = [
        { '统计项目': '平均3D位移(mm)', '数值': (gpsData.reduce((sum, item) => sum + item.deformation_distance_3d, 0) / gpsData.length).toFixed(2) },
        { '统计项目': '最大3D位移(mm)', '数值': Math.max(...gpsData.map(item => item.deformation_distance_3d)).toFixed(2) },
        { '统计项目': '最小3D位移(mm)', '数值': Math.min(...gpsData.map(item => item.deformation_distance_3d)).toFixed(2) },
        { '统计项目': '位移标准差(mm)', '数值': calculateStandardDeviation(gpsData.map(item => item.deformation_distance_3d)).toFixed(2) },
        { '统计项目': '平均置信度(%)', '数值': (gpsData.reduce((sum, item) => sum + item.deformation_confidence, 0) / gpsData.length * 100).toFixed(1) }
      ];
      const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(workbook, statsWorksheet, '统计分析');
    }

    // 4. 风险评估和预测（如果有数据）
    if (analysisData.riskAssessment || analysisData.predictions) {
      const analysisDataForSheet = [];
      
      if (analysisData.riskAssessment) {
        analysisDataForSheet.push(
          { '类型': '风险评估', '项目': '风险等级', '数值': analysisData.riskAssessment.level },
          { '类型': '风险评估', '项目': '风险描述', '数值': analysisData.riskAssessment.description },
          { '类型': '风险评估', '项目': '评估置信度(%)', '数值': (analysisData.riskAssessment.confidence * 100).toFixed(1) }
        );
      }

      if (analysisData.predictions?.shortTerm) {
        analysisDataForSheet.push(
          { '类型': '短期预测', '项目': '预测置信度(%)', '数值': (analysisData.predictions.shortTerm.confidence * 100).toFixed(1) }
        );
      }

      if (analysisData.predictions?.longTerm) {
        analysisDataForSheet.push(
          { '类型': '长期预测', '项目': '预测置信度(%)', '数值': (analysisData.predictions.longTerm.confidence * 100).toFixed(1) }
        );
      }

      if (analysisDataForSheet.length > 0) {
        const analysisWorksheet = XLSX.utils.json_to_sheet(analysisDataForSheet);
        XLSX.utils.book_append_sheet(workbook, analysisWorksheet, '分析结果');
      }
    }

    // 生成文件并下载
    const filename = `综合报告_${deviceId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);

    return { success: true, message: '综合报告导出成功' };
  } catch (error) {
    console.error('综合报告导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

/**
 * 导出ECharts图表为图片
 */
export const exportChartAsImage = (
  chartRef: any,
  filename: string,
  format: 'png' | 'jpg' | 'svg' = 'png'
) => {
  try {
    if (!chartRef || !chartRef.getEchartsInstance) {
      throw new Error('无效的图表引用');
    }

    const chartInstance = chartRef.getEchartsInstance();
    const dataURL = chartInstance.getDataURL({
      type: format,
      pixelRatio: 2,
      backgroundColor: '#fff'
    });

    // 创建下载链接
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return { success: true, message: '图表导出成功' };
  } catch (error) {
    console.error('图表导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

// 工具函数：计算标准差
const calculateStandardDeviation = (values: number[]): number => {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
  const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / values.length;
  
  return Math.sqrt(variance);
};

// 工具函数：应用Excel样式
const applyWorksheetStyle = (worksheet: XLSX.WorkSheet, range: XLSX.Range, style: any) => {
  if (!worksheet['!merges']) worksheet['!merges'] = [];
  if (!worksheet['!rows']) worksheet['!rows'] = [];
  if (!worksheet['!cols']) worksheet['!cols'] = [];
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[cellRef]) worksheet[cellRef] = { v: '', t: 's' };
      worksheet[cellRef].s = style;
    }
  }
};

// 工具函数：创建报告头部
const createReportHeader = (worksheet: XLSX.WorkSheet, title: string, deviceId: string) => {
  const currentTime = new Date().toLocaleString('zh-CN');
  
  // 设置报告头信息
  const headerData = [
    [`地质形变监测分析报告 - ${title}`],
    [`设备编号: ${deviceId}`],
    [`生成时间: ${currentTime}`],
    [`报告类型: 详细分析报告`],
    [''], // 空行
  ];
  
  XLSX.utils.sheet_add_aoa(worksheet, headerData, { origin: 'A1' });
  
  // 应用标题样式
  applyWorksheetStyle(worksheet, 
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }, 
    EXCEL_STYLES.title
  );
  
  // 合并标题行
  if (!worksheet['!merges']) worksheet['!merges'] = [];
  worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } });
  
  return headerData.length;
};

// 工具函数：获取风险等级颜色
const getRiskLevelColor = (level: number): string => {
  const colors = {
    0: '10B981', // 正常 - 绿色
    4: '3B82F6', // IV级蓝色
    3: 'F59E0B', // III级黄色
    2: 'F97316', // II级橙色
    1: 'EF4444'  // I级红色
  };
  return colors[level as keyof typeof colors] || 'CCCCCC';
};

// 工具函数：格式化数值
const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};

// 工具函数：创建数据透视表
const createDataPivotTable = (data: GPSExportData[]): any[] => {
  const hourlyData = data.reduce((acc, item) => {
    const hour = new Date(item.event_time).getHours();
    const key = `${hour}:00`;
    
    if (!acc[key]) {
      acc[key] = {
        time: key,
        count: 0,
        avgDisplacement: 0,
        maxDisplacement: 0,
        minDisplacement: Infinity,
        avgConfidence: 0
      };
    }
    
    acc[key].count++;
    acc[key].avgDisplacement += item.deformation_distance_3d;
    acc[key].maxDisplacement = Math.max(acc[key].maxDisplacement, item.deformation_distance_3d);
    acc[key].minDisplacement = Math.min(acc[key].minDisplacement, item.deformation_distance_3d);
    acc[key].avgConfidence += item.deformation_confidence;
    
    return acc;
  }, {} as any);
  
  return Object.values(hourlyData).map((item: any) => ({
    '时间段': item.time,
    '数据点数': item.count,
    '平均位移(mm)': formatNumber(item.avgDisplacement / item.count),
    '最大位移(mm)': formatNumber(item.maxDisplacement),
    '最小位移(mm)': item.minDisplacement === Infinity ? '0.00' : formatNumber(item.minDisplacement),
    '平均置信度(%)': formatNumber(item.avgConfidence / item.count * 100, 1)
  }));
};

export default {
  exportGPSDataToExcel,
  exportAnalysisToExcel,
  exportDataToCSV,
  exportComprehensiveReport,
  exportChartAsImage
};
