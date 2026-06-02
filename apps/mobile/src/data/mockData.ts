export type RiskLevel = "normal" | "attention" | "warning" | "critical";

export type EventItem = {
  id: string;
  title: string;
  slope: string;
  station: string;
  zone: string;
  level: RiskLevel;
  status: "new" | "acknowledged" | "in_progress" | "resolved";
  summary: string;
  occurredAt: string;
  rainfall: string;
  displacement: string;
  confidence: string;
  credibility: string;
  responseWindow: string;
  recommendedAction: string;
  cause: string[];
  evidence: {
    label: string;
    value: string;
    note: string;
  }[];
  replay: {
    time: string;
    label: string;
    tone: Exclude<RiskLevel, "normal">;
  }[];
};

export type TaskItem = {
  id: string;
  title: string;
  assignee: string;
  site: string;
  dueLabel: string;
  progressLabel: string;
  type: "patrol" | "response" | "verification";
  priority: Exclude<RiskLevel, "normal">;
  arrivalLabel: string;
  modeLabel: string;
  nextAction: string;
};

export type AssetItem = {
  id: string;
  name: string;
  type: "station" | "gateway" | "sensor";
  health: string;
  lastSignal: string;
  location: string;
  linkedEventId?: string;
};

export const summaryChips = [
  { label: "高风险区域", value: "2", tone: "critical" },
  { label: "新告警", value: "6", tone: "warning" },
  { label: "在线站点", value: "18/21", tone: "normal" },
  { label: "雨量跃升", value: "+34%", tone: "attention" }
] as const;

export const spaceHotspots = [
  {
    id: "hs-1",
    top: "22%",
    left: "58%",
    label: "K2 崩塌带",
    level: "critical" as RiskLevel,
    pulse: "12 mm/h",
    eventId: "EVT-2401"
  },
  {
    id: "hs-2",
    top: "41%",
    left: "38%",
    label: "北坡监测点 A",
    level: "warning" as RiskLevel,
    pulse: "位移 +3.2 mm",
    eventId: "EVT-2398"
  },
  {
    id: "hs-3",
    top: "57%",
    left: "69%",
    label: "排水沟段",
    level: "attention" as RiskLevel,
    pulse: "雨量 48 mm",
    eventId: "EVT-2391"
  }
];

export const spatialSignals = [
  {
    label: "处置窗",
    value: "18 min",
    note: "红色事件需双确认",
    tone: "critical"
  },
  {
    label: "雨带移动",
    value: "东移 6 km/h",
    note: "未来 30 分钟继续压向南麓",
    tone: "warning"
  },
  {
    label: "链路可信",
    value: "96%",
    note: "边缘 + 中心双链路一致",
    tone: "attention"
  }
] as const;

export const eventOverview = [
  {
    label: "升级中",
    value: "1",
    note: "19:42 最近一次升档",
    tone: "critical"
  },
  {
    label: "待 ACK",
    value: "2",
    note: "需要值守确认",
    tone: "warning"
  },
  {
    label: "处理中",
    value: "3",
    note: "现场回传进行中",
    tone: "attention"
  }
] as const;

export const decisionPanels = [
  {
    title: "雨量判读",
    value: "82 mm / 3h",
    note: "已突破南麓红线阈值"
  },
  {
    title: "位移趋势",
    value: "+6.4 mm / 40m",
    note: "18 分钟持续上扬"
  },
  {
    title: "建议动作",
    value: "转任务 + 现场双确认",
    note: "优先保护 K2 进场通道"
  }
] as const;

export const taskOverview = [
  {
    label: "立即响应",
    value: "1",
    note: "红色事件转派"
  },
  {
    label: "执行中",
    value: "1",
    note: "现场已开始复核"
  },
  {
    label: "待出发",
    value: "1",
    note: "离线节点巡检"
  }
] as const;

export const events: EventItem[] = [
  {
    id: "EVT-2401",
    title: "K2 崩塌带进入红色预警",
    slope: "南麓一号坡体",
    station: "K2 空间监测站",
    zone: "南麓主场景 / K2 崩塌带",
    level: "critical",
    status: "new",
    summary: "雨量峰值与位移加速度同时跃升，系统已进入人工确认窗口。",
    occurredAt: "19:42",
    rainfall: "82 mm / 3h",
    displacement: "+6.4 mm / 40m",
    confidence: "置信度 92%",
    credibility: "边缘链路稳定，数据可信",
    responseWindow: "18 分钟处置窗",
    recommendedAction: "由现场值守与总控双人确认后转入封控任务",
    cause: ["雨量峰值超过 3h 阈值", "位移速度 18 分钟内持续上扬", "边缘链路稳定，数据可信"],
    evidence: [
      {
        label: "多源一致性",
        value: "96%",
        note: "位移、雨量、链路三条信号没有冲突"
      },
      {
        label: "触发因子",
        value: "短时强降雨",
        note: "雨带东移速度仍在增加"
      },
      {
        label: "现场窗口",
        value: "T+18 min",
        note: "建议在下一轮降雨前完成封控判断"
      }
    ],
    replay: [
      { time: "18:50", label: "雨量超过橙线", tone: "attention" },
      { time: "19:18", label: "位移曲线转陡", tone: "warning" },
      { time: "19:42", label: "升级为红色预警", tone: "critical" }
    ]
  },
  {
    id: "EVT-2398",
    title: "北坡监测点 A 位移异常",
    slope: "北坡二号坡体",
    station: "北坡 A 站",
    zone: "北坡二号坡体 / A 站",
    level: "warning",
    status: "acknowledged",
    summary: "位移曲线呈持续上升但未进入红区，建议现场复核。",
    occurredAt: "18:16",
    rainfall: "43 mm / 6h",
    displacement: "+3.2 mm / 1h",
    confidence: "置信度 84%",
    credibility: "局部位移可信，待现场复核",
    responseWindow: "34 分钟复核窗",
    recommendedAction: "优先比对基线桩和近 1 小时曲线，再决定是否升档",
    cause: ["位移速度连续三次高于蓝线", "雨后土层含水率升高", "当前仍有人工巡检待完成"],
    evidence: [
      {
        label: "位移幅度",
        value: "+3.2 mm / 1h",
        note: "尚未进入红区，但持续向上"
      },
      {
        label: "土层状态",
        value: "含水偏高",
        note: "雨后浅层土体仍未回落"
      },
      {
        label: "建议动作",
        value: "人工复核",
        note: "巡检任务已在执行中"
      }
    ],
    replay: [
      { time: "17:30", label: "位移突破蓝线", tone: "attention" },
      { time: "17:54", label: "系统发出橙色提示", tone: "warning" },
      { time: "18:16", label: "值守完成 ACK", tone: "warning" }
    ]
  },
  {
    id: "EVT-2391",
    title: "东侧沟谷传感器离线",
    slope: "东侧沟谷",
    station: "谷口监测站",
    zone: "东侧沟谷 / 谷口监测站",
    level: "attention",
    status: "in_progress",
    summary: "网关未收到该节点最近两个上报周期的数据，已派发巡检。",
    occurredAt: "16:58",
    rainfall: "26 mm / 6h",
    displacement: "--",
    confidence: "置信度 73%",
    credibility: "疑似供电或现场遮挡问题",
    responseWindow: "今日 21:10 前完成巡检",
    recommendedAction: "优先排查供电和遮挡，确认是否需要替换节点",
    cause: ["节点最近 12 分钟无有效上报", "同站其他节点正常", "疑似供电或现场遮挡问题"],
    evidence: [
      {
        label: "失联时长",
        value: "12 分钟",
        note: "连续两个采样周期无上报"
      },
      {
        label: "站内对照",
        value: "其他节点正常",
        note: "主站链路没有整体异常"
      },
      {
        label: "现场建议",
        value: "巡检供电与遮挡",
        note: "先不升级为风险事件"
      }
    ],
    replay: [
      { time: "16:36", label: "最后一次正常上报", tone: "attention" },
      { time: "16:48", label: "连续两次丢包", tone: "attention" },
      { time: "16:58", label: "转入巡检处理", tone: "warning" }
    ]
  }
];

export const tasks: TaskItem[] = [
  {
    id: "TSK-17",
    title: "确认 K2 崩塌带到场状态",
    assignee: "李晨",
    site: "K2 空间监测站",
    dueLabel: "12 分钟内",
    progressLabel: "待到场",
    type: "response",
    priority: "critical",
    arrivalLabel: "预计 8 分钟到达",
    modeLabel: "指挥席转派 / 现场双确认",
    nextAction: "到达警戒线后提交现场影像与口述判断"
  },
  {
    id: "TSK-11",
    title: "北坡 A 站位移复核",
    assignee: "周扬",
    site: "北坡 A 站",
    dueLabel: "34 分钟内",
    progressLabel: "执行中",
    type: "verification",
    priority: "warning",
    arrivalLabel: "已到场 6 分钟",
    modeLabel: "巡检复核 / 曲线比对",
    nextAction: "比对基线桩与近 1h 曲线，确认是否转入红区"
  },
  {
    id: "TSK-05",
    title: "东侧沟谷节点离线巡检",
    assignee: "王拓",
    site: "谷口监测站",
    dueLabel: "今日 21:10",
    progressLabel: "待出发",
    type: "patrol",
    priority: "attention",
    arrivalLabel: "预计 24 分钟到达",
    modeLabel: "离线巡检 / 扫码进入",
    nextAction: "现场扫码节点壳体并确认供电与信号遮挡情况"
  }
];

export const assets: AssetItem[] = [
  {
    id: "AST-001",
    name: "K2 空间监测站",
    type: "station",
    health: "高风险 / 在线",
    lastSignal: "14 秒前",
    location: "南麓一号坡体",
    linkedEventId: "EVT-2401"
  },
  {
    id: "AST-014",
    name: "南麓主网关 G-03",
    type: "gateway",
    health: "链路稳定",
    lastSignal: "9 秒前",
    location: "南麓汇聚点"
  },
  {
    id: "AST-032",
    name: "东沟位移节点 S-11",
    type: "sensor",
    health: "疑似离线",
    lastSignal: "12 分钟前",
    location: "东侧沟谷",
    linkedEventId: "EVT-2391"
  }
];

export const timelineMarks = [
  "15:10",
  "16:00",
  "16:50",
  "17:40",
  "18:30",
  "19:20"
];
