## Context

当前仓库已经存在一条完整的数据链：

- `telemetry.raw.v1` Kafka 输入
- `services/ai-prediction-worker` 消费与生成预测事件
- `ai_predictions` 表落库
- `/api/v1/ai/predictions` 查询接口

但当前“AI 预测”仍是 heuristic 规则打分。它满足了演示级联通，却不能支撑“可训练、可比较、可按区域切换”的模型路线，也不利于后续沉淀区域模型库。

## Goals / Non-Goals

- Goals:
  - 在不推翻现有链路的前提下，落地第一版可训练模型基线
  - 支持一个运行时装载多个区域模型工件
  - 保持当前事件/落库/API 顶层契约不破坏
  - 在模型缺失或异常时仍可安全回退到 heuristic
- Non-Goals:
  - 本轮不引入新的独立 Python 在线服务
  - 本轮不直接实现 YOLO 视觉模型或边缘链路健康模型
  - 本轮不承诺最终比赛级最优精度，只交付可训练、可推理、可替换的基线

## Decisions

- Decision: 保持 `services/ai-prediction-worker` 作为在线推理入口
  - Why:
    - 现有 Kafka、落库与 API 全都已经围绕这个服务接好
    - 继续沿用该入口，改动最小、回滚最稳

- Decision: 训练结果以 versioned JSON artifact 形式落盘，由在线 worker 加载
  - Why:
    - 避免引入新的在线训练依赖与服务治理复杂度
    - 便于后续做“区域模型库 + 模型匹配”

- Decision: 模型结构采用“两段式基线”
  - Why:
    - 第一段输出位移趋势/风险相关中间量
    - 第二段基于趋势特征与观测特征输出预警分数
    - 这样既贴合你们的技术叙事，也便于后续替换成更强模型

- Decision: 保留 heuristic 作为回退路径
  - Why:
    - 保证在模型工件缺失、损坏或区域未覆盖时，系统仍可持续产出记录
    - 方便演示、测试与逐步迁移

## Risks / Trade-offs

- 风险: 当前仓库缺少标准化公开数据集接入层
  - Mitigation:
    - 先定义统一训练样本格式，让公开数据和现场数据后续都转成同一结构

- 风险: 纯基线模型的比赛叙事可能不够“重”
  - Mitigation:
    - 在方案表达上强调区域自适应、模型库、持续训练、可替换深度模型接口
    - 代码上把 artifact 与特征层设计成可替换结构

- 风险: 区域信息在实时 telemetry 中可能不完整
  - Mitigation:
    - 优先从 `device -> station -> region` 元数据解析
    - 缺失时回退到全局默认模型

## Migration Plan

1. 定义训练样本与模型工件格式
2. 增加离线训练入口并生成首个基线 artifact
3. 在 worker 中增加 artifact 加载、区域选择、推理与 fallback
4. 扩展 payload 解释信息
5. 更新文档并做构建验证

## Open Questions

- 当前区域键是否直接使用 `station_id`，还是再抽象一层 `region_key`
- 第一版训练样本是否先以合成/整理样本为主，再逐步接公开数据
