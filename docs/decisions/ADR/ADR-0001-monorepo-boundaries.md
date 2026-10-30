# ADR-0001：使用 pnpm/Turborepo Monorepo 并强制单向依赖

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：仓库结构、包边界、构建与测试

## 背景

DailyFlow 需要同时支持 Windows/macOS 桌面端和 Web。两端共享领域模型、用例、编辑器、UI 和查询 DTO，但存储与平台能力完全不同。若把 Tauri、Dexie、React 或具体数据库逻辑混入共享代码，会出现三类风险：

1. Web bundle 意外包含 Tauri 模块或桌面路径。
2. 同一业务规则在两端实现漂移。
3. 单元测试必须启动浏览器或桌面宿主，降低反馈速度。

## 决策

采用 pnpm workspace + Turborepo 的单仓库结构，按职责分包：

```text
apps/desktop
apps/web
packages/domain
packages/application
packages/infrastructure
packages/editor
packages/ui
packages/features
packages/shared
packages/sync-contracts
packages/ai
```

依赖方向：

```text
apps/*
  -> features
  -> application
  -> domain
  -> shared

features
  -> application
  -> domain
  -> editor
  -> ui
  -> shared

apps/*
  -> infrastructure
  -> application/domain/shared

editor -> domain/shared
ui -> shared
sync-contracts -> shared
ai -> application ports/shared
```

具体规则：

- `domain` 只包含纯 TypeScript 实体、值对象、规则和领域错误。
- `application` 定义用例与端口，只通过依赖注入使用基础设施。
- `infrastructure` 实现端口，按 `desktop`、`web`、`shared`、`memory` 子入口导出。
- `editor` 只处理 Tiptap Schema 和内容转换，不读写 Repository。
- `ui` 只包含设计令牌、shadcn 基础组件和无业务状态组件。
- `features` 承载跨端共享页面、功能组件和 Zustand 功能状态，只通过 `AppServices` 调用 Application；不得导入 SQLite、Dexie、Tauri 或具体 adapter。
- `apps/*` 是唯一组合根，可同时导入 Application 和具体 adapter。
- 跨包只使用 `@dailyflow/*` 公共导出，不通过相对路径穿透源码。
- 依赖巡航和 CI 禁止循环依赖、反向依赖和平台专用模块进入错误 bundle。

## 被否决的方案

### 单应用目录

优点是初始文件少；缺点是 Web 与桌面组合根、共享领域和基础设施容易混在一起，不适合未来同步与 AI 包。否决。

### 按功能拆成多个独立应用仓库

优点是完全隔离；缺点是共享 DTO、编辑器和 UI 的版本协调成本高，早期团队无法承担发布管理成本。否决。

### 让 Application 直接依赖 Dexie/Tauri，使用条件分支统一实现

表面减少 adapter 数量，实际让核心逻辑绑定平台，并迫使测试使用真实宿主。否决。

## 后果

- Task 1 必须先建立包清单、引用关系和最小构建。
- 每个公共导出是契约，新增 API 需要检查跨端使用。
- 低层包不能为了“方便”导入页面或应用容器。
- 同一功能可能增加 adapter 代码，但 Domain/Application 测试更快，跨端契约更清晰。
- Turborepo 缓存必须包含 lockfile、环境变量和生成输入，不能缓存迁移测试结果来跳过验证。

## 验证

- `pnpm typecheck` 能从根目录构建所有包的依赖图。
- `dependency-cruiser` 检查 Domain/Application 禁用依赖。
- Web 构建产物的 source map 或 bundle 分析中不存在 Tauri 桌面 adapter。
- 跨端 fixture 使用同一 `SearchDocument`、DTO 和错误码。
- 生产代码中不存在绕过 `AppServices` 的页面级数据库实例化。

## 关联文档

- [系统架构](../../architecture/SYSTEM-ARCHITECTURE.md)
- [编码规范](../../development/CODING-STANDARDS.md)
- [开发计划](../../development/DEVELOPMENT-PLAN.md)
