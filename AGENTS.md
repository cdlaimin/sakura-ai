# AGENTS.md

此文件为 Codex (Codex.ai/code) 在此代码库中工作时提供指导。

## Agent 入口约定

- Codex 默认读取 `AGENTS.md` 作为项目级指导。
- Claude Code 默认读取 `CLAUDE.md` 作为项目级指导。
- 本项目同时维护 `AGENTS.md` 和 `CLAUDE.md`，两者的核心项目说明、命令、架构、代码约定和 AI 协作原则应保持一致。
- 修改任一入口文件中的通用规则时，必须同步检查另一个入口文件，避免不同 AI 工具执行标准不一致。

## 项目概述

Sakura AI 是一个企业级自动化测试平台，具备AI驱动的批量更新功能。基于 React 18 + TypeScript 前端和 Node.js + Express 后端构建，集成 Playwright 进行浏览器自动化和 MCP（模型上下文协议）进行AI驱动的测试执行。

## 核心命令

### 开发环境
```bash
# 一键启动（推荐）
npm start

# 开发模式（前端+后端）
npm run dev

# 仅启动前端（端口5173）
npm run dev:frontend

# 仅启动后端（端口3001）
npm run dev:server

# 可视化模式（调试时浏览器可见）
npm run dev-visible
npm run server-visible
```

### 数据库操作
```bash
# 应用迁移
npx prisma migrate dev

# 生成 Prisma 客户端
npx prisma generate

# 重置数据库
npx prisma migrate reset
```

### 测试与质量检查
```bash
npm run lint
npm test
```

### 构建与部署
```bash
npm run build
npm run preview
```

## 架构概览

### 核心组件
- **前端**: React 18 + TypeScript + Tailwind CSS (src/)
- **后端**: Express API + WebSocket (server/)
- **数据库**: MySQL + Prisma ORM (prisma/)
- **AI引擎**: MCP客户端 + AI解析器，用于自然语言测试处理
- **测试执行**: Playwright 集成，用于浏览器自动化

### 关键数据流
1. **测试管理**: test_cases → test_suites → test_runs
2. **AI批量更新**: bulk_edit_sessions → case_patch_proposals → case_versions
3. **执行流程**: testExecution.ts → mcpClient.ts → Playwright → WebSocket 更新

### 关键服务
- `server/services/testExecution.ts` - 核心测试执行编排
- `server/services/aiBulkUpdateService.ts` - AI批量修改逻辑
- `server/services/mcpClient.ts` - MCP协议与AI模型集成
- `server/services/websocket.ts` - 实时状态更新

## 项目结构

### 前端 (`src/`)
- `components/` - React UI组件，包括 AIBulkUpdateModal.tsx
- `pages/` - 主要应用页面（TestCases.tsx, TestRuns.tsx）
- `services/` - API客户端和前端服务
- `types/test.ts` - 核心 TypeScript 类型定义

### 后端 (`server/`)
- `routes/` - Express API端点（test.ts, aiBulkUpdate.ts）
- `services/` - 业务逻辑和集成
- `types/` - 后端类型定义

### 数据库
- MySQL 数据库，具备支持测试管理和AI批量更新的完整架构
- 关键表：test_cases, test_suites, bulk_edit_sessions, case_patch_proposals
- AI专用枚举：proposal_risk_level, proposal_apply_status

## 核心功能

### AI批量更新系统
- 使用AI模型处理自然语言变更描述
- 基于JSON补丁的修改，支持版本控制
- 风险评估和选择性应用
- 基于会话的工作流程，支持提案审核

### 测试执行
- MCP驱动的 Playwright 自动化
- 实时 WebSocket 状态更新
- 截图和产物收集
- 基于套件的批量执行

## 开发注意事项

### 环境变量
- `DATABASE_URL` - MySQL 连接字符串
- `AI_MODEL_PROVIDER` - anthropic/openai
- `PLAYWRIGHT_HEADLESS` - 浏览器可见性设置
- 端口配置：前端（5173），后端（3001）

### 需要修复的重要Bug
在 AIBulkUpdateModal.tsx 中，用户对AI提案的编辑存储在前端状态（`editedContents`）中，但在应用时从未传输到后端。后端应用的是数据库中的原始AI建议，而非用户修改。

### 代码约定
- 启用 TypeScript 严格模式
- 使用 Tailwind CSS 进行样式设计，配合自定义组件
- 使用 Prisma 进行数据库访问，配合生成的类型
- Express 使用 async/await 模式，具备适当的错误处理
- 使用 ws 库进行 WebSocket 实时更新

### Karpathy Guidelines / AI 协作原则
本项目默认启用 karpathy-guidelines；即使本地 skill 未自动注入，也必须按以下规则执行：

- 明确假设：需求有歧义时先说明假设；无法安全假设时，先问一个简短问题。
- 简单优先：只实现当前需求，不添加未要求的抽象、配置或功能。
- 精准修改：只改与任务直接相关的代码，不顺手重构、格式化或清理无关内容。
- 保留无关改动：不要覆盖、还原或删除用户及队友已有改动。
- 可验证成功：非平凡改动必须定义并尽量执行验证方式，例如测试、构建、lint、typecheck 或手动复现。

执行流程：

1. 先阅读相关项目说明和任务相关代码，再开始修改。
2. 对需求中的不确定点说明假设；无法安全假设时，只问必要的简短问题。
3. 优先选择符合现有代码风格的最小实现。
4. 只编辑与任务直接相关的文件和代码行。
5. 对非平凡改动执行最窄但有效的验证。
6. 最后总结修改文件、验证结果和剩余风险。

### 测试
- Jest 用于单元测试
- Playwright 用于浏览器自动化测试
- 截图对比和产物收集
