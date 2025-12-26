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

/**
 * GPS数据分析报告导出（全面优化的逻辑和排版）
 */
export const exportGPSDataToExcelPro = async (
  data: GPSExportData[], 
  deviceId: string = 'unknown'
): Promise<{ success: boolean; message: string }> => {
  try {
    if (!data || data.length === 0) {
      return { success: false, message: '没有可导出的GPS数据' };
    }

    // 创建工作簿
    const workbook = XLSX.utils.book_new();

    // === 1. 创建数据概览工作表 ===
    const overviewWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    let currentRow = createReportHeader(overviewWorksheet, 'GPS数据概览', deviceId);
    
    // 计算统计信息
    const displacements = data.map(item => parseFloat(item.deformation_distance_3d?.toString() || '0'));
    const confidences = data.map(item => parseFloat(item.deformation_confidence?.toString() || '0'));
    const velocities = data.map(item => parseFloat(item.deformation_velocity?.toString() || '0'));
    
    const summaryData = [
      ['数据概览'],
      [''],
      ['数据点总数', data.length],
      ['监测时间范围', `${new Date(data[data.length - 1]?.event_time || '').toLocaleString('zh-CN')} 至 ${new Date(data[0]?.event_time || '').toLocaleString('zh-CN')}`],
      [''],
      ['位移统计'],
      [''],
      ['平均3D位移(mm)', formatNumber(displacements.reduce((a, b) => a + b, 0) / displacements.length)],
      ['最大3D位移(mm)', formatNumber(Math.max(...displacements))],
      ['最小3D位移(mm)', formatNumber(Math.min(...displacements))],
      ['位移标准差(mm)', formatNumber(calculateStandardDeviation(displacements))],
      [''],
      ['质量指标'],
      [''],
      ['平均置信度(%)', formatNumber(confidences.reduce((a, b) => a + b, 0) / confidences.length * 100, 1)],
      ['最高置信度(%)', formatNumber(Math.max(...confidences) * 100, 1)],
      ['最低置信度(%)', formatNumber(Math.min(...confidences) * 100, 1)],
      [''],
      ['速度统计'],
      [''],
      ['平均形变速度(mm/s)', formatNumber(velocities.reduce((a, b) => a + b, 0) / velocities.length, 4)],
      ['最大形变速度(mm/s)', formatNumber(Math.max(...velocities), 4)],
      ['最小形变速度(mm/s)', formatNumber(Math.min(...velocities), 4)]
    ];
    
    XLSX.utils.sheet_add_aoa(overviewWorksheet, summaryData, { origin: `A${currentRow + 1}` });
    
    // 设置列宽
    overviewWorksheet['!cols'] = [
      { wch: 25 }, // 项目名称
      { wch: 20 }  // 数值
    ];
    
    XLSX.utils.book_append_sheet(workbook, overviewWorksheet, '数据概览');

    // === 2. 创建详细GPS数据工作表 ===
    const gpsWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    currentRow = createReportHeader(gpsWorksheet, 'GPS详细数据', deviceId);
    
    // GPS数据表头
    const gpsHeaders = [
      '序号', '设备ID', '采集时间', '纬度', '经度', 
      '3D位移(mm)', '水平位移(mm)', '垂直位移(mm)', 
      '形变速度(mm/s)', '置信度(%)', '温度(°C)', '湿度(%)', 
      '风险等级', '风险描述'
    ];
    
    // 风险等级映射
    const riskLevelMap: Record<number, string> = {
      0: '正常',
      1: 'I级红色',
      2: 'II级橙色', 
      3: 'III级黄色',
      4: 'IV级蓝色',
      5: '未知'
    };
    
    // 添加表头
    XLSX.utils.sheet_add_aoa(gpsWorksheet, [gpsHeaders], { origin: `A${currentRow + 1}` });
    
    // 准备GPS数据
    const gpsDataForExport = data.map((item, index) => [
      index + 1,
      item.device_id,
      new Date(item.event_time).toLocaleString('zh-CN'),
      parseFloat(item.latitude?.toString() || '0').toFixed(6),
      parseFloat(item.longitude?.toString() || '0').toFixed(6),
      parseFloat(item.deformation_distance_3d?.toString() || '0').toFixed(2),
      parseFloat(item.deformation_horizontal?.toString() || '0').toFixed(2),
      parseFloat(item.deformation_vertical?.toString() || '0').toFixed(2),
      parseFloat(item.deformation_velocity?.toString() || '0').toFixed(4),
      (parseFloat(item.deformation_confidence?.toString() || '0') * 100).toFixed(1),
      item.temperature ? parseFloat(item.temperature.toString()).toFixed(1) : '',
      item.humidity ? parseFloat(item.humidity.toString()).toFixed(1) : '',
      item.risk_level || 5,
      riskLevelMap[item.risk_level || 5] || '未知'
    ]);
    
    // 添加数据
    XLSX.utils.sheet_add_aoa(gpsWorksheet, gpsDataForExport, { origin: `A${currentRow + 2}` });
    
    // 设置列宽
    gpsWorksheet['!cols'] = [
      { wch: 8 },  // 序号
      { wch: 12 }, // 设备ID
      { wch: 18 }, // 采集时间
      { wch: 12 }, // 纬度
      { wch: 12 }, // 经度
      { wch: 12 }, // 3D位移
      { wch: 12 }, // 水平位移
      { wch: 12 }, // 垂直位移
      { wch: 15 }, // 形变速度
      { wch: 10 }, // 置信度
      { wch: 10 }, // 温度
      { wch: 10 }, // 湿度
      { wch: 10 }, // 风险等级
      { wch: 12 }  // 风险描述
    ];
    
    XLSX.utils.book_append_sheet(workbook, gpsWorksheet, 'GPS详细数据');

    // === 3. 创建时段分析工作表 ===
    const pivotWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    currentRow = createReportHeader(pivotWorksheet, '时段分析', deviceId);
    
    const pivotData = createDataPivotTable(data);
    const pivotHeaders = Object.keys(pivotData[0] || {});
    
    // 添加时段分析表头和数据
    XLSX.utils.sheet_add_aoa(pivotWorksheet, [pivotHeaders], { origin: `A${currentRow + 1}` });
    XLSX.utils.sheet_add_aoa(pivotWorksheet, pivotData.map(row => pivotHeaders.map(key => row[key])), 
      { origin: `A${currentRow + 2}` });
    
    // 设置列宽
    pivotWorksheet['!cols'] = pivotHeaders.map(() => ({ wch: 15 }));
    
    XLSX.utils.book_append_sheet(workbook, pivotWorksheet, '时段分析');

    // === 4. 创建异常数据工作表 ===
    const anomalyWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    currentRow = createReportHeader(anomalyWorksheet, '异常数据分析', deviceId);
    
    // 计算异常阈值（使用3σ原则）
    const meanDisplacement = displacements.reduce((a, b) => a + b, 0) / displacements.length;
    const stdDisplacement = calculateStandardDeviation(displacements);
    const threshold = meanDisplacement + 2 * stdDisplacement;
    
    const anomalyData = data.filter(item => 
      parseFloat(item.deformation_distance_3d?.toString() || '0') > threshold ||
      item.risk_level === 1 || item.risk_level === 2
    ).map((item, index) => ({
      '序号': index + 1,
      '时间': new Date(item.event_time).toLocaleString('zh-CN'),
      '3D位移(mm)': parseFloat(item.deformation_distance_3d?.toString() || '0').toFixed(2),
      '超出阈值': ((parseFloat(item.deformation_distance_3d?.toString() || '0') - threshold) / threshold * 100).toFixed(1) + '%',
      '风险等级': riskLevelMap[item.risk_level || 5] || '未知',
      '置信度(%)': (parseFloat(item.deformation_confidence?.toString() || '0') * 100).toFixed(1),
      '备注': parseFloat(item.deformation_distance_3d?.toString() || '0') > threshold ? '位移异常' : '风险预警'
    }));
    
    if (anomalyData.length > 0) {
      const anomalyHeaders = Object.keys(anomalyData[0]);
      XLSX.utils.sheet_add_aoa(anomalyWorksheet, [anomalyHeaders], { origin: `A${currentRow + 1}` });
      XLSX.utils.sheet_add_aoa(anomalyWorksheet, anomalyData.map(row => anomalyHeaders.map(key => row[key as keyof typeof row])), 
        { origin: `A${currentRow + 2}` });
      
      // 设置列宽
      anomalyWorksheet['!cols'] = anomalyHeaders.map(() => ({ wch: 15 }));
    } else {
      XLSX.utils.sheet_add_aoa(anomalyWorksheet, [['未发现异常数据']], { origin: `A${currentRow + 1}` });
    }
    
    XLSX.utils.book_append_sheet(workbook, anomalyWorksheet, '异常数据');

    // 生成文件并下载
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `GPS数据分析报告_${deviceId}_${timestamp}.xlsx`;
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);

    return { success: true, message: `GPS数据分析报告已成功导出为 ${filename}` };
  } catch (error) {
    console.error('GPS数据导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

/**
 * 分析结果报告导出
 */
export const exportAnalysisToExcelPro = async (
  analysisData: AnalysisExportData
): Promise<{ success: boolean; message: string }> => {
  try {
    const workbook = XLSX.utils.book_new();

    // 创建实时位移报告
    const displacementWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    let currentRow = createReportHeader(displacementWorksheet, '实时位移分析', analysisData.deviceId);
    
    const displacementData = [
      ['当前位移状态'],
      [''],
      ['3D位移(mm)', analysisData.realTimeDisplacement?.displacement.toFixed(2) || '0.00'],
      ['水平位移(mm)', analysisData.realTimeDisplacement?.horizontal.toFixed(2) || '0.00'],
      ['垂直位移(mm)', analysisData.realTimeDisplacement?.vertical.toFixed(2) || '0.00'],
      ['更新时间', analysisData.realTimeDisplacement?.latestTime || new Date().toISOString()],
      [''],
      ['风险评估'],
      [''],
      ['风险等级', analysisData.riskAssessment?.level || '未知'],
      ['风险描述', analysisData.riskAssessment?.description || '无'],
      ['评估置信度(%)', (analysisData.riskAssessment?.confidence || 0 * 100).toFixed(1)]
    ];
    
    XLSX.utils.sheet_add_aoa(displacementWorksheet, displacementData, { origin: `A${currentRow + 1}` });
    displacementWorksheet['!cols'] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, displacementWorksheet, '实时位移');

    // 创建预测分析报告
    const predictionWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    currentRow = createReportHeader(predictionWorksheet, '预测分析', analysisData.deviceId);
    
    const predictionData = [
      ['预测分析结果'],
      [''],
      ['短期预测置信度(%)', (analysisData.predictions?.shortTerm?.confidence || 0 * 100).toFixed(1)],
      ['长期预测置信度(%)', (analysisData.predictions?.longTerm?.confidence || 0 * 100).toFixed(1)],
      [''],
      ['预测数据点数'],
      [''],
      ['短期预测点数', analysisData.predictions?.shortTerm?.data.length || 0],
      ['长期预测点数', analysisData.predictions?.longTerm?.data.length || 0]
    ];
    
    XLSX.utils.sheet_add_aoa(predictionWorksheet, predictionData, { origin: `A${currentRow + 1}` });
    predictionWorksheet['!cols'] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, predictionWorksheet, '预测分析');

    // 生成文件并下载
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `分析结果报告_${analysisData.deviceId}_${timestamp}.xlsx`;
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);

    return { success: true, message: `分析结果报告已成功导出为 ${filename}` };
  } catch (error) {
    console.error('分析结果导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};

/**
 * 综合监测报告导出
 */
export const exportComprehensiveReportPro = async (
  gpsData: GPSExportData[],
  analysisData: AnalysisExportData
): Promise<{ success: boolean; message: string }> => {
  try {
    const workbook = XLSX.utils.book_new();

    // === 1. 执行摘要 ===
    const summaryWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    let currentRow = createReportHeader(summaryWorksheet, '执行摘要', analysisData.deviceId);
    
    const displacements = gpsData.map(item => parseFloat(item.deformation_distance_3d?.toString() || '0'));
    const maxDisplacement = Math.max(...displacements);
    const avgDisplacement = displacements.reduce((a, b) => a + b, 0) / displacements.length;
    
    const summaryData = [
      ['监测概况'],
      [''],
      ['监测设备', analysisData.deviceId],
      ['报告生成时间', new Date().toLocaleString('zh-CN')],
      ['数据点总数', gpsData.length],
      ['监测时间跨度', `${new Date(gpsData[gpsData.length - 1]?.event_time || '').toLocaleDateString('zh-CN')} 至 ${new Date(gpsData[0]?.event_time || '').toLocaleDateString('zh-CN')}`],
      [''],
      ['关键指标'],
      [''],
      ['当前风险等级', analysisData.riskAssessment?.description || '未知'],
      ['最新3D位移(mm)', analysisData.realTimeDisplacement?.displacement.toFixed(2) || '0.00'],
      ['历史最大位移(mm)', maxDisplacement.toFixed(2)],
      ['平均位移(mm)', avgDisplacement.toFixed(2)],
      [''],
      ['预测置信度'],
      [''],
      ['短期预测置信度(%)', (analysisData.predictions?.shortTerm?.confidence || 0 * 100).toFixed(1)],
      ['长期预测置信度(%)', (analysisData.predictions?.longTerm?.confidence || 0 * 100).toFixed(1)],
      [''],
      ['报告结论'],
      [''],
      ['监测状态', maxDisplacement > 10 ? '需要关注' : '正常'],
      ['数据质量', gpsData.length > 100 ? '良好' : '数据量偏少'],
      ['预测可靠性', (analysisData.predictions?.shortTerm?.confidence || 0) > 0.7 ? '高' : '中等']
    ];
    
    XLSX.utils.sheet_add_aoa(summaryWorksheet, summaryData, { origin: `A${currentRow + 1}` });
    summaryWorksheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, '执行摘要');

    // === 2. 技术细节（简化的GPS数据） ===
    const techWorksheet = XLSX.utils.aoa_to_sheet([[]]);
    currentRow = createReportHeader(techWorksheet, '技术数据', analysisData.deviceId);
    
    // 按时间排序，取最新的50个数据点进行展示
    const recentData = gpsData.slice(0, 50);
    const techHeaders = ['时间', '3D位移(mm)', '风险等级', '置信度(%)'];
    
    XLSX.utils.sheet_add_aoa(techWorksheet, [techHeaders], { origin: `A${currentRow + 1}` });
    
    const techDataForExport = recentData.map(item => [
      new Date(item.event_time).toLocaleString('zh-CN'),
      parseFloat(item.deformation_distance_3d?.toString() || '0').toFixed(2),
      item.risk_level || 5,
      (parseFloat(item.deformation_confidence?.toString() || '0') * 100).toFixed(1)
    ]);
    
    XLSX.utils.sheet_add_aoa(techWorksheet, techDataForExport, { origin: `A${currentRow + 2}` });
    
    techWorksheet['!cols'] = [
      { wch: 18 }, // 时间
      { wch: 15 }, // 3D位移
      { wch: 12 }, // 风险等级
      { wch: 12 }  // 置信度
    ];
    
    XLSX.utils.book_append_sheet(workbook, techWorksheet, '技术数据');

    // 生成文件并下载
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `综合监测报告_${analysisData.deviceId}_${timestamp}.xlsx`;
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);

    return { success: true, message: `综合监测报告已成功导出为 ${filename}` };
  } catch (error) {
    console.error('综合报告导出失败:', error);
    return { success: false, message: '导出失败: ' + (error as Error).message };
  }
};
