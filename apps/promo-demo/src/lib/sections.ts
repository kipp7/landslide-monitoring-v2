export type PromoSectionMode = 'hero' | 'trilogy' | 'narrative' | 'proof'

export type PromoStat = {
  label: string
  value: string
}

export type PromoSection = {
  id: string
  navLabel: string
  eyebrow: string
  label: string
  headline: string
  deck: string
  description: string
  chips: string[]
  bullets: string[]
  stats: PromoStat[]
  railClass: string
  sceneStage: number
  mode: PromoSectionMode
}

export type PromoSolutionCard = {
  eyebrow: string
  title: string
  body: string
  stats: PromoStat[]
}

export const PROMO_SECTIONS: PromoSection[] = [
  {
    id: 'hero',
    navLabel: 'Home',
    eyebrow: 'Landslide Sentinel',
    label: 'WHEN TERRAIN\nBECOMES\nSIGNAL',
    headline: '把滑坡风险压缩成一个可以直接进入的在线指挥场景',
    deck: '不是软件首页，而是一个围绕感知、链路、模型与闭环展开的风险基础设施界面。',
    description:
      '这一版只保留一个主舞台：更强秩序、更少废话、更清晰的场景中心。',
    chips: ['Reference rebuild', 'Spatial shell', 'Control-stage'],
    bullets: [
      '首屏只负责建立品牌气压和系统尺度。',
      '所有视觉动作都服务“进入系统”这一个动作。',
    ],
    stats: [
      { label: 'Reference', value: 'Hut 8 shell' },
      { label: 'Stage', value: '3D live scene' },
      { label: 'Direction', value: 'tear down / rebuild' },
    ],
    railClass: 'landing',
    sceneStage: 0,
    mode: 'hero',
  },
  {
    id: 'sensing',
    navLabel: 'Sensing',
    eyebrow: 'Layer 1.0',
    label: 'SENSING',
    headline: '把弱信号先从山体噪声里拎出来',
    deck: '雨量、位移、裂缝、倾角与含水率被统一编排成一个前兆层，而不是离散读数。',
    description:
      '这里讲的不是设备数量，而是预兆窗口。真正被捕捉的是失稳前的信号组合。',
    chips: ['Rainfall', 'Displacement', 'Crack', 'Tilt'],
    bullets: [
      '先讲预兆窗口，再讲采集手段。',
      '视觉重点转向扫描环与感知塔。',
    ],
    stats: [
      { label: 'Window', value: '72h precursor' },
      { label: 'Sources', value: '12+ streams' },
      { label: 'Cadence', value: 'minute-level refresh' },
    ],
    railClass: 'energy',
    sceneStage: 1,
    mode: 'trilogy',
  },
  {
    id: 'fabric',
    navLabel: 'Fabric',
    eyebrow: 'Layer 2.0',
    label: 'FABRIC',
    headline: '把现场节点缝成一张持续在线的边缘网络',
    deck: '不是把原始数据被动拉回平台，而是在坡面、杆塔和网关上先完成缓存、桥接、诊断和续传。',
    description:
      '这一层要传达的不是“联网了”，而是“现场已经形成一个有韧性的边缘结构”。',
    chips: ['Gateway', 'Offline sync', 'Bridge', 'Health'],
    bullets: [
      '边缘站点必须看起来像现场中枢。',
      '背景舞台切到塔、梁、束线和节点脉冲。',
    ],
    stats: [
      { label: 'Cache', value: '7d offline buffer' },
      { label: 'Bridge', value: 'MQTT / Modbus / RTU' },
      { label: 'Field mode', value: 'self-check + failover' },
    ],
    railClass: 'infrastructure',
    sceneStage: 2,
    mode: 'trilogy',
  },
  {
    id: 'command',
    navLabel: 'Command',
    eyebrow: 'Layer 3.0',
    label: 'COMMAND',
    headline: '把站点级信号抬升成区域级风险总控模型',
    deck: '平台不只是看单点图表，而是把站点、坡面、流域和行政片区一起收编进同一套风险模型。',
    description:
      '这里开始把系统从监测项目抬升成区域级操作系统。需要的是总控感和统一建模能力。',
    chips: ['Region profile', 'Twin engine', 'Risk mesh', 'Replay'],
    bullets: [
      '章节视觉从现场近景抬升到总览视角。',
      '所有文案都服务从点位走向区域这一跃迁。',
    ],
    stats: [
      { label: 'Scale', value: 'station to region' },
      { label: 'Views', value: 'live / history / replay' },
      { label: 'Output', value: 'risk surfaces' },
    ],
    railClass: 'compute',
    sceneStage: 3,
    mode: 'trilogy',
  },
  {
    id: 'warning',
    navLabel: 'Warning',
    eyebrow: 'Operational Loop',
    label: 'WARNING',
    headline: '把告警、派发、处置和留痕锁进同一条闭环',
    deck: '真正拉开差距的不是会不会弹窗，而是事件如何升级、谁来确认、谁被派发、如何复盘。',
    description:
      '这一层必须让观众看见事件被管理而不是消息被提醒。画面重点转向环形轨迹、状态切换和审计时间线。',
    chips: ['Escalation', 'Workflow', 'Audit', 'Response'],
    bullets: [
      '预警不是消息，而是被追踪和收束的流程对象。',
      '色调在这一层转入更强的风险红与脉冲对比。',
    ],
    stats: [
      { label: 'Loop', value: 'detect to archive' },
      { label: 'Trace', value: 'action-level logging' },
      { label: 'Latency', value: '< 20s broadcast' },
    ],
    railClass: 'driven',
    sceneStage: 4,
    mode: 'narrative',
  },
  {
    id: 'replay',
    navLabel: 'Replay',
    eyebrow: 'Immersive Proof',
    label: 'REPLAY',
    headline: '把复杂系统压缩成一个可滚动穿越的风险剧场',
    deck: '这是整站唯一保留重场景表达的章节，用来把前面的感知、链路、模型和闭环压缩成一个证明面。',
    description:
      '这一段不再扩展新概念，而是聚焦证明。镜头、光带、主核切片和数据面板应该在这里一起收束。',
    chips: ['Pinned theater', 'Core slices', 'Camera path', 'Proof'],
    bullets: [
      '重场景集中爆发，不在整站泛滥。',
      '如果继续做 Tres 深化，优先就做这一章。',
    ],
    stats: [
      { label: 'Peak', value: 'single 3D climax' },
      { label: 'Control', value: 'scroll-led camera' },
      { label: 'Upgrade', value: 'Tres-ready' },
    ],
    railClass: 'powering',
    sceneStage: 5,
    mode: 'proof',
  },
]

export const PROMO_SOLUTIONS: PromoSolutionCard[] = [
  {
    eyebrow: 'Deployment',
    title: 'Field Rollout',
    body: '把监测节点、边缘网关、链路调试和上线校准打包成可复制的现场部署流程。',
    stats: [
      { label: 'Sites', value: 'single slope to county' },
      { label: 'Mode', value: 'survey / install / calibrate' },
    ],
  },
  {
    eyebrow: 'Operations',
    title: 'Control Surface',
    body: '统一处理设备在线率、告警派发、回放复盘和运维追踪，不把运营层留给临时表格。',
    stats: [
      { label: 'Runtime', value: 'device / platform / alert' },
      { label: 'Closure', value: 'operations + audit' },
    ],
  },
  {
    eyebrow: 'Delivery',
    title: 'Regional Expansion',
    body: '先做试点，再平滑复制到区域级项目，避免每次从站点模型重新起盘。',
    stats: [
      { label: 'Path', value: 'pilot to regional' },
      { label: 'Package', value: 'hardware + software + SOP' },
    ],
  },
]

export const PROMO_FINAL_CTA = {
  eyebrow: 'Next Move',
  title: '把这套风险舞台推向真实部署、联合验证与正式品牌入口',
  body:
    '接下来只做三件事：继续把首页压近参考站、把 replay 章节做成真正的重场景、再把真实项目证据与客户语言接进来。',
  actions: [
    { label: 'Back To Top', intent: 'top' },
    { label: 'Run Replay Pulse', intent: 'boost' },
  ],
  notes: [
    { label: 'Priority', value: 'hero / trilogy / replay' },
    { label: '3D focus', value: 'core slices / towers / beams' },
    { label: 'Business layer', value: 'cases / rollout / proof' },
    { label: 'Ship target', value: 'official promo site' },
  ] satisfies PromoStat[],
}
