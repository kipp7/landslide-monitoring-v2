export const HERMES_SAFE_ACTIONS = ["recheck", "collect_logs", "generate_report"] as const;

export type SafeHermesAction = (typeof HERMES_SAFE_ACTIONS)[number];

export const HERMES_ACTION_LABELS: Record<SafeHermesAction, string> = {
  recheck: "重新研判",
  collect_logs: "诊断链路",
  generate_report: "生成报告",
};

export type HermesTaskPlan = {
  blocked: boolean;
  reason: string;
  actions: SafeHermesAction[];
  suggestions: SafeHermesAction[];
};

export type HermesExecutedTask = {
  action: SafeHermesAction;
  label: string;
  status: "succeeded" | "failed";
  summary: string;
  result: Record<string, unknown>;
  error: string | null;
};

const PROTECTED_INTENT_TERMS = [
  "重启",
  "关闭服务",
  "停止服务",
  "切换网络",
  "切换wifi",
  "修改阈值",
  "调整阈值",
  "触发告警",
  "解除告警",
  "控制设备",
  "写串口",
  "关机",
  "删除数据",
] as const;

const INTENT_TERMS: Record<SafeHermesAction, readonly string[]> = {
  recheck: [
    "重新研判",
    "重新检查",
    "复检",
    "检查风险",
    "为什么危险",
    "为什么预警",
    "风险原因",
    "节点状态",
    "风险状态",
    "倾角",
    "gps",
    "湿度",
    "电导率",
  ],
  collect_logs: [
    "收集日志",
    "导出日志",
    "日志诊断",
    "诊断链路",
    "检查链路",
    "通信故障",
    "上传异常",
    "没反应",
    "不报警",
    "mqtt",
    "串口日志",
    "故障证据",
  ],
  generate_report: [
    "生成报告",
    "生成简报",
    "态势报告",
    "态势简报",
    "处置报告",
    "汇报材料",
    "总结当前",
    "当前情况",
    "现在怎么样",
    "运行情况",
  ],
};

function normalizedIntent(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "");
}

function orderedMatches(normalized: string): SafeHermesAction[] {
  return HERMES_SAFE_ACTIONS.map((action, order) => ({
    action,
    order,
    firstIndex: Math.min(
      ...INTENT_TERMS[action].map((term) => normalized.indexOf(term)).filter((index) => index >= 0)
    ),
  }))
    .filter((entry) => Number.isFinite(entry.firstIndex))
    .sort((left, right) => left.firstIndex - right.firstIndex || left.order - right.order)
    .map((entry) => entry.action);
}

export function planHermesMessage(
  message: string,
  previousActions: readonly SafeHermesAction[] = []
): HermesTaskPlan {
  const normalized = normalizedIntent(message);
  if (PROTECTED_INTENT_TERMS.some((term) => normalized.includes(term))) {
    return {
      blocked: true,
      reason:
        "这项请求会改变设备、网络、告警或数据状态，Hermes 没有自动执行权限。请在对应的专用页面人工确认。",
      actions: [],
      suggestions: ["recheck", "generate_report"],
    };
  }

  const actions = orderedMatches(normalized);
  const firstAction = actions[0];
  if (firstAction !== undefined) {
    return {
      blocked: false,
      reason:
        actions.length === 1
          ? `已识别为“${HERMES_ACTION_LABELS[firstAction]}”，将自动执行并回传结果。`
          : `已拆分为 ${String(actions.length)} 项只读任务，将按顺序自动执行。`,
      actions,
      suggestions: [],
    };
  }

  const asksToContinue = ["继续", "再来一次", "再执行一次", "按刚才的", "重新执行"].some((term) =>
    normalized.includes(term)
  );
  if (asksToContinue && previousActions.length > 0) {
    return {
      blocked: false,
      reason: `将按上一轮计划重新执行 ${String(previousActions.length)} 项只读任务。`,
      actions: [...previousActions],
      suggestions: [],
    };
  }

  if (
    previousActions.length > 0 &&
    (normalized === "为什么" ||
      normalized.includes("为什么这么判断") ||
      normalized.includes("解释一下"))
  ) {
    return {
      blocked: false,
      reason: "将重新研判最新证据并解释当前风险结论。",
      actions: ["recheck"],
      suggestions: [],
    };
  }

  if (/^(你好|您好|在吗|嗨|hello|hi)[！!。.]?$/u.test(normalized)) {
    return {
      blocked: false,
      reason: "我在。你可以让我检查节点风险、诊断 RK3568 链路，或生成当前态势报告。",
      actions: [],
      suggestions: ["recheck", "collect_logs", "generate_report"],
    };
  }

  return {
    blocked: false,
    reason:
      "我还不能安全确定要执行哪项任务。请明确说“重新研判”“诊断链路”或“生成报告”，也可以一次安排多项。",
    actions: [],
    suggestions: ["recheck", "collect_logs", "generate_report"],
  };
}

function resultNumber(result: Record<string, unknown>, key: string): number | null {
  const value = result[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resultText(result: Record<string, unknown>, key: string): string | null {
  const value = result[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function groundedTaskLine(task: HermesExecutedTask): string {
  if (task.status === "failed") {
    return `${task.label}未完成：${task.error ?? "边缘侧暂不可达"}`;
  }
  if (task.action === "recheck") {
    const diagnosis = resultText(task.result, "diagnosisType");
    const confidence = resultNumber(task.result, "confidence");
    const risk = resultText(task.result, "edgeRiskLevel");
    const details = [
      diagnosis ? `诊断为${diagnosisLabel(diagnosis)}` : null,
      confidence === null ? null : `置信度 ${String(Math.round(confidence * 100))}%`,
      risk ? `风险等级${riskLabel(risk)}` : null,
    ].filter((value): value is string => Boolean(value));
    return details.length > 0 ? `${task.label}完成：${details.join("，")}。` : task.summary;
  }
  if (task.action === "collect_logs") {
    const collected = resultNumber(task.result, "collectedCommandCount");
    const artifact = resultText(task.result, "artifactName");
    if (collected !== null || artifact) {
      return `${task.label}完成：采集 ${String(collected ?? 0)} 项只读证据${artifact ? `，记录为 ${artifact}` : ""}。`;
    }
  }
  if (task.action === "generate_report") {
    const level = resultText(task.result, "overallLevel");
    const artifact = resultText(task.result, "artifactName");
    if (level || artifact) {
      return `${task.label}完成${level ? `：当前总体状态 ${level}` : ""}${artifact ? `，报告 ${artifact} 已保存` : ""}。`;
    }
  }
  return task.summary;
}

function diagnosisLabel(value: string): string {
  const labels: Record<string, string> = {
    healthy_watch: "链路运行平稳",
    center_mqtt_route_unreachable: "中心消息通路不可达",
    center_mqtt_service_unavailable: "中心消息服务不可用",
    southbound_serial_or_gateway_gap: "南向采集链路异常",
    field_nodes_not_reporting: "现场节点未形成有效上报",
    shared_port_noise: "共享串口存在数据干扰",
    ap_fallback_backhaul_degraded: "回传网络质量下降",
    publish_backlog_pressure: "上报队列存在积压压力",
    edge_resource_pressure: "边缘主机资源压力偏高",
  };
  return labels[value] ?? "需要人工复核";
}

function riskLabel(value: string): string {
  const labels: Record<string, string> = {
    normal: "平稳",
    attention: "关注",
    warning: "预警",
    danger: "危险",
    unavailable: "待连接",
  };
  return labels[value] ?? value;
}

export function buildHermesAssistantReply(
  plan: HermesTaskPlan,
  tasks: HermesExecutedTask[]
): string {
  if (plan.blocked) return plan.reason;
  if (tasks.length === 0) return plan.reason;

  const succeeded = tasks.filter((task) => task.status === "succeeded").length;
  const prefix =
    tasks.length === 1
      ? succeeded === 1
        ? "任务已完成。"
        : "任务执行失败。"
      : `已完成 ${String(succeeded)}/${String(tasks.length)} 项任务。`;
  return `${prefix}\n${tasks.map((task, index) => `${String(index + 1)}. ${groundedTaskLine(task)}`).join("\n")}\n所有动作均已留痕，未接管告警、串口或 MQTT 主链路。`;
}
