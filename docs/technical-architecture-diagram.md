# 技术架构图

```mermaid
flowchart TB
  classDef input fill:#f4f7ff,stroke:#173d8f,color:#0f172a,stroke-width:1px,rx:10,ry:10;
  classDef orchestration fill:#fff3e8,stroke:#ea7a17,color:#111827,stroke-width:1px,rx:10,ry:10;
  classDef collaboration fill:#eefaf6,stroke:#198a73,color:#111827,stroke-width:1px,rx:10,ry:10;
  classDef model fill:#f5eaff,stroke:#7a3db8,color:#111827,stroke-width:1px,rx:10,ry:10;
  classDef output fill:#eef4ff,stroke:#245bce,color:#111827,stroke-width:1px,rx:10,ry:10;
  classDef practice fill:#103b63,stroke:#103b63,color:#ffffff,stroke-width:1px,rx:10,ry:10;

  subgraph L1["输入层 / Input Layer"]
    direction LR
    I1["会议纪要文本<br/>粘贴 / 上传 / 导入"]
    I2["项目与任务数据<br/>项目、成员、进度、优先级"]
    I3["用户反馈与状态更新<br/>进度填报 / 评论 / 驳回原因"]
    I4["历史审计与通知记录<br/>操作日志 / 消息 / 追踪"]
    I5["系统配置与角色信息<br/>JWT / 脱敏 / 模型参数"]
  end

  subgraph L2["Agent 编排层 / Orchestration Layer"]
    direction LR
    O1["NestJS API 网关<br/>REST 接口统一入口"]
    O2["JWT 鉴权与 RBAC<br/>角色、项目、资源权限校验"]
    O3["业务编排服务<br/>AppService / 工作流调度"]
    O4["会议纪要管理<br/>创建、分析、审核"]
    O5["任务与风险管理<br/>生成、分派、状态流转"]
    O6["审计与通知管理<br/>记录、查询、追踪"]
  end

  subgraph L3["Agent 协同层 / Collaboration Layer"]
    direction LR
    C1["纪要清洗与校验<br/>标题、内容、项目归属"]
    C2["结构化抽取<br/>摘要 / 决策 / 候选任务 / 风险"]
    C3["人工复核与确认<br/>通过 / 驳回 / 重分析"]
    C4["事务写入与联动<br/>正式任务、风险、日志"]
    C5["成员反馈闭环<br/>进度更新 / 状态推进 / 通知"]
  end

  subgraph L4["AI 模型与数据支撑层 / AI Model & Data Layer"]
    direction LR
    M1["DeepSeek Chat API<br/>会议纪要智能分析"]
    M2["JSON 结构化输出<br/>摘要、决策、任务、风险"]
    M3["MySQL<br/>用户 / 项目 / 会议 / 任务 / 风险 / 审计"]
    M4["Redis + BullMQ<br/>规划中的缓存与异步队列"]
    M5["Qdrant + BGE-M3<br/>规划中的向量检索增强"]
  end

  subgraph L5["输出层 / Output Layer"]
    direction LR
    U1["工作台 Dashboard<br/>项目概览、待审、风险、趋势"]
    U2["项目列表与详情<br/>成员、状态、进度、计划"]
    U3["任务管理 / 我的任务<br/>分派、更新、反馈"]
    U4["AI 审核与风险中心<br/>结果复核、风险处置"]
    U5["通知中心 / 审计日志<br/>消息、留痕、追踪"]
  end

  subgraph L6["最佳实践 / Best Practices"]
    direction LR
    P1["分层解耦<br/>前端、编排、数据、AI 职责分离"]
    P2["角色隔离<br/>经理 / 成员 / 管理员 / 审计员"]
    P3["结构化输出<br/>模型只返回可落库 JSON"]
    P4["事务一致性<br/>审核通过后统一写入任务与风险"]
    P5["全链路审计<br/>关键操作可回溯、可追责"]
    P6["可扩展插拔<br/>后续可接入 RAG、队列、向量库"]
  end

  I1 --> O1
  I2 --> O1
  I3 --> O1
  I4 --> O1
  I5 --> O1

  O1 --> O2 --> O3
  O3 --> O4
  O3 --> O5
  O3 --> O6

  O4 --> C1 --> C2 --> C3 --> C4
  C4 --> M3
  C2 --> M1
  M1 --> M2 --> C3
  C5 --> O6
  C5 --> U3
  M3 -.缓存/队列规划.-> M4
  M2 -.检索增强规划.-> M5

  C4 --> U1
  C4 --> U2
  C5 --> U3
  C3 --> U4
  O6 --> U5

  P1 --- P2 --- P3 --- P4 --- P5 --- P6

  class I1,I2,I3,I4,I5 input
  class O1,O2,O3,O4,O5,O6 orchestration
  class C1,C2,C3,C4,C5 collaboration
  class M1,M2,M3,M4,M5 model
  class U1,U2,U3,U4,U5 output
  class P1,P2,P3,P4,P5,P6 practice
```

## 说明

这张图按当前项目真实实现整理：

1. 前端是 Vue 3 单页应用，负责工作台、项目、任务、会议纪要、AI 审核、风险和审计页面。
2. 后端是 NestJS 风格 API，统一做鉴权、权限控制和业务编排。
3. 会议纪要经 DeepSeek 分析后输出结构化 JSON，再由项目经理人工审核。
4. 审核通过后，系统在事务中写入正式任务和风险，并同步审计日志。
5. MySQL 是当前核心存储；Redis、BullMQ、Qdrant、RAG 是规划中的扩展能力。

