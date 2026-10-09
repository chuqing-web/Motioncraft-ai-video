# Comic Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MotionCraft 落地页漫三层节点（页面→分格→格内）、流式 AI 出码、页预览与 PNG/PDF 导出，与视频管线并行。

**Architecture:** 新增 `comic_page` / `comic_panel` / `comic_shot` 与 `contain`/`compose` 边；`comic-director.js` 大纲后按页按格调用与分镜相同的 `requestModelJson` 校验/本地修/打回；`comic-composer.js` 静态拼页；`comic-export.js` 导出图与 PDF。

**Tech Stack:** 现有 www ES modules、providers、runtime compile、无新 npm 依赖（PDF 手写最小实现）

**Spec:** `docs/superpowers/specs/2026-10-09-comic-nodes-design.md`

---

### Task 1: 模型与布局

**Files:**
- Modify: `www/js/model.js`
- Modify: `www/js/layout.js`

- [x] 注册三种节点与 defaultProps
- [x] `comic_panel` 加入 PLACEABLE（格在页上的 layout）

### Task 2: 画布边与样式

**Files:**
- Modify: `www/js/canvas.js`
- Modify: `www/css/app.css`

- [x] finishLink 识别 comic sequence/contain/compose
- [x] 边样式区分

### Task 3: 提示词

**Files:**
- Modify: `www/js/quality-prompt.js`

- [x] MAXIMAL_COMIC_CODE_OUTPUT、SYSTEM_COMIC_OUTLINE、SYSTEM_COMIC_SHOT、user message builders

### Task 4: Comic Director

**Files:**
- Create: `www/js/comic-director.js`
- Modify: `www/js/director.js`（导出 requestModelJson 等）

- [x] runComicDirector / runComicShotDirector / 上下文组装 / 厚度校验

### Task 5: Composer + Export

**Files:**
- Create: `www/js/comic-composer.js`
- Create: `www/js/comic-export.js`

- [x] 按页绘制；PNG；简易多页 PDF

### Task 6: UI / Props / MCP

**Files:**
- Modify: `www/js/props.js`, `www/js/app.js`, `www/index.html`, `mcp/server.js`

- [x] 漫画生成对话框、单格重生成、预览/导出、MCP 工具

---

执行方式：用户要求直接落地，本会话 inline 实现全部任务。
