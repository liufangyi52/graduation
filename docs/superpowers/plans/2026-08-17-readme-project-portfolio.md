# README 项目作品集重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将根目录 README 重构为面向招聘者的项目作品集页，同时保留可复现项目所需的运行和验证信息。

**Architecture:** 只修改根目录 `README.md`，不改动应用代码或图片资源。文档采用“价值概览 → 截图证据 → AI 工作流 → 工程亮点 → 架构 → 运行验证”的单页结构，图片全部引用仓库内现有资源。

**Tech Stack:** GitHub Flavored Markdown、Vue 3、TypeScript、NestJS、TypeORM、MySQL、DeepSeek API、Qdrant、Socket.IO。

## Global Constraints

- 不加入姓名、求职方向、联系方式、个人简历或作品集链接。
- 不虚构性能指标、模型效果或部署能力；亮点必须能由代码、截图或测试材料支撑。
- 使用仓库内相对图片路径，确保 GitHub 正常渲染。
- 保留 Windows PowerShell 和通用 shell 的运行方式。

---

### Task 1: 重写根 README 为项目作品集页

**Files:**
- Modify: `README.md`
- Reference: `docs/prototypes/*.png`, `docs/technical-architecture-diagram.png`, `docs/test-evidence-2026-08-16.png`

**Interfaces:**
- Consumes: 当前 README 中的功能、角色、AI 模式、运行、RAG、验证和技术组成信息。
- Produces: 可直接在 GitHub 渲染的中文项目作品集 README。

- [ ] **Step 1: 编写项目首屏与价值概览**

在 README 顶部加入项目标题、一句话定位和闭环流程，明确“会议纪要输入、AI 结构化分析、人工审核、任务跟踪”的产品价值。

- [ ] **Step 2: 加入真实截图和架构证据**

使用相对路径嵌入仪表盘、会议导入、AI 审核、任务看板、风险中心、我的任务和分析页面截图，并嵌入技术架构图；每张图片配功能性标题。

- [ ] **Step 3: 重组 AI 能力与工程亮点**

说明脱敏、结构化抽取、人工审核、`manual`/`llm`/`rag`/`agent` 四种模式及 RAG 状态诚实标记；补充权限隔离、审计留痕、实时通知、缓存降级和导出能力等可验证亮点。

- [ ] **Step 4: 保留并压缩开发者文档**

将角色、功能模块、环境要求、本地启动、真实 RAG 配置、测试验证和项目资料放到后半部分，去掉重复叙述但保留命令、安全提示和关键行为约束。

- [ ] **Step 5: 验证 Markdown 与资源路径**

运行以下检查：

```powershell
git diff --check -- README.md
rg -n "\]\([^)]*\.(png|jpg|jpeg|webp)" README.md
Get-Content -Raw README.md
```

预期：无空白错误；所有图片链接指向仓库内存在的文件；README 结构完整、无个人信息和未替换字段。

- [ ] **Step 6: 提交 README 变更**

```bash
git add README.md
git commit -m "docs: refresh README as project portfolio"
```
