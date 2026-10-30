# ADR-0007：AI 默认关闭并作为可选 Provider 扩展

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：AI 接口、设置、凭据、隐私和发布依赖

## 背景

用户希望保留 AI 辅助的可能，但 DailyFlow 的核心价值是本地记录、检索和知识沉淀。若 AI SDK、网络请求或密钥管理进入保存、搜索、导入或恢复路径，离线、隐私和数据一致性都会受影响。

## 决策

AI 是独立可选能力，不属于 V1 核心依赖。

```text
Application
  -> AiProviderPort
  -> AiProviderRegistry
  -> AiCancellation
  -> SecretStore

packages/ai
  -> provider implementations / disabled registry

apps/*
  -> composition root chooses providers
```

规则：

- Application 定义 `AiProviderPort`、Registry、Cancellation 和 SecretStore 契约。
- Domain 不知道 AI 存在。
- V1 默认注入 `DisabledAiRegistry`，UI 显示“未配置”，不发起网络请求。
- AI Provider 只接收显式 `AiCompletionRequest`，不接收 Repository、AppServices、数据库或附件句柄。
- 用户显式发起请求前，UI 展示 Provider、用途、将发送范围、是否含代码块、字符数和潜在费用。
- 默认不发送完整历史、附件、导入原始字节、路径或标签全集。
- 请求支持取消、超时、输出上限和稳定错误映射。
- AI 输出只是草稿，必须经用户确认并通过普通保存用例落库。

## 凭据

- 桌面使用 `SecretStore` 和系统钥匙串。
- Web Key 只放当前标签页内存或要求每次输入。
- 禁止把 API Key 写入 IndexedDB、`localStorage`、备份、诊断包或日志。
- SecretStore 失败只影响 AI，不影响本地功能。

## 被否决的方案

### AI 作为默认摘要和自动标签服务

会产生后台网络请求、隐私暴露和费用，且没有本地服务时破坏关键流程。否决。

### 在 Domain 中定义 Provider 或直接调用 SDK

让业务规则绑定厂商和网络依赖，违反分层。否决。

### 把 AI 密钥存进 settings

容易被备份、导出和诊断包带走。否决。

### V1 首发必须集成某个云厂商

增加网络、密钥、计费和供应商锁定风险，与可选扩展定位不符。V1 只要求端口和默认禁用实现。

## 后果

- Report 和统计在无 AI 时必须完整可用。
- Provider 只能使用最小上下文，不自动读取全部数据。
- 若后续新增厂商，需要补充能力元数据、网络权限和隐私测试。
- AI 输出与人工输入走同一 revision 和保存事务，不能绕过冲突控制。
- 业务代码测试不依赖真实网络或 API Key。

## 验证

- 未配置 Provider 时所有核心用例、设置和报告可用。
- Web 存储和备份中不存在测试 API Key。
- 取消、超时、Provider 错误和 SecretStore 错误不会破坏已保存正文。
- 请求预览与实际发送片段一致。
- AI 生成内容未经用户确认不会写入 Journal/Knowledge/Report。

## 关联文档

- [系统架构](../../architecture/SYSTEM-ARCHITECTURE.md)
- [编码规范](../../development/CODING-STANDARDS.md)
- [开发计划](../../development/DEVELOPMENT-PLAN.md)
