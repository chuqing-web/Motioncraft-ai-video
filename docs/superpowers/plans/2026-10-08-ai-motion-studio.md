# AI Motion Studio Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** 交付 WinForms+WebView2 的 AI Motion Studio：节点分镜 → HTML 成片 → 导出；多厂商 LLM + MCP。

**Architecture:** C# 宿主加载 `www/`；JS 维护 Project 模型、画布、时间轴、Composer、Director；本地 HTTP 桥 + stdio MCP。

**Tech Stack:** .NET 8 WinForms, WebView2, 原生 HTML/CSS/JS, Node MCP SDK（或精简 JSON-RPC stdio）

---

### Task 1: 解决方案与宿主壳

**Files:**
- Create: `MotionCraft.sln`, `src/MotionCraft.Host/MotionCraft.Host.csproj`, `Program.cs`, `MainForm.cs`, `BridgeServer.cs`

- [ ] 创建 WinForms WebView2 项目并加载 `www/index.html`
- [ ] 启动本地 HTTP 桥
- [ ] 验证可编译运行

### Task 2: 工作台 UI 骨架

**Files:**
- Create: `www/index.html`, `www/css/app.css`, `www/js/app.js`

- [ ] 顶栏/左库/画布/右属性/底时间轴布局
- [ ] 节点库列出全部类型

### Task 3: 模型 + 画布 + 属性 + 时间轴

**Files:**
- Create: `www/js/model.js`, `www/js/canvas.js`, `www/js/timeline.js`, `www/js/props.js`

- [ ] CRUD 节点/边、拖拽连线、属性编辑、时间轴烘焙

### Task 4: Composer + 预览 + 导出

**Files:**
- Create: `www/js/composer.js`, `www/js/export.js`

- [ ] HTML 镜头合成与播放
- [ ] MediaRecorder 导出

### Task 5: AI 导演 + 多厂商

**Files:**
- Create: `www/js/director.js`, `www/js/providers.js`

- [ ] 规则生成 + OpenAI 兼容/Anthropic/豆包/DeepSeek 路由

### Task 6: MCP 桥

**Files:**
- Create: `mcp/package.json`, `mcp/server.js`, `mcp/README.md`

- [ ] stdio MCP 工具对接 HTTP 桥

### Task 7: README 与提交

- [ ] 使用说明（VS2022、API Key、MCP 配置）
