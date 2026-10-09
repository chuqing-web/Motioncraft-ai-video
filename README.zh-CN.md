# MotionCraft — AI Motion Studio

[English](README.md) | [简体中文](README.zh-CN.md)

**提示词 → 可编辑的 Canvas 代码 → 真正的短片成片。**  
Windows 桌面端工作台：用自然语言生成电影感短片——不是调用黑盒「文生视频」API，而是让大模型为每一镜写出 **可运行代码**，再在本地预览、精细修订并导出 MP4/WebM。

> 模型是 **程序化导演**；MotionCraft 是工作室、时间轴与录像机。画面透明、可改、可控。

---

## 界面预览

![AI 生成过程](picture/AI%20generation%20process.png)

*AI 导演流式生成大纲与逐镜代码*

![成片效果](picture/video%20effect.png)

*预览舞台：运镜、气氛特效与时间轴*

---

## 为什么选 MotionCraft（产品优势）

### 1. 透明可控，不是吐一段看不懂的视频

| 传统 AI 视频 | **MotionCraft** |
|--------------|-----------------|
| 云端黑盒片段 | 每镜都是可读、可改的 `html` / `css` / `js` |
| 难改时间轴中间一秒 | 时间 `t` 驱动每一帧，可 scrub、可单镜重做 |
| 锁死在厂商网页 | 本地 `.exe` + 节点图 + MCP 远程操控 |
| 一次性碰运气 | 大纲 → 逐镜代码 → 校验打回 → 挂载镜头/特效/人物 |
| 厂商指定模型 | **自备任意 API**，随时换模型与账单 |

故事、代码、节奏、用哪家模型——都由你掌控。

### 2. 硬件要求低，普通电脑就能跑

MotionCraft **不在本机跑**文生视频大模型，也 **不需要** 为了生成去扛数据中心级显卡。

| 你需要的 | 你不需要的 |
|----------|------------|
| 普通 Windows 10/11 电脑 | 高端 NVIDIA 本地 T2V |
| WebView2（Win11 多半已有） | 十几 GB 视频权重 |
| 任意大模型 API（或本地 Ollama 兼容） | 必须订阅某家视频 SaaS |
| 能跑 Canvas 2D + 界面的 CPU/内存 | 24 GB+ 显存「AI 工作站」 |

- **生成**：打你配置的大模型（云端或本地 OpenAI 兼容）  
- **播放 / 导出**：本机 Canvas 2D + `MediaRecorder`  

宿舍本、办公本都能用；成本主要在你自己选的 API Token，而不是买一张「视频卡」。

### 3. 随意 API：豆包、DeepSeek、自定义网关都能接

在 **工具 → API / 模型设置** 里配置。凡是 OpenAI 兼容的 `/v1/chat/completions` 基本都能用：

| 槽位 | 常见用途 |
|------|----------|
| **OpenAI** | 官方 `api.openai.com` |
| **Anthropic** | Claude（部分环境注意浏览器 CORS） |
| **豆包** | 火山方舟 OpenAI 兼容端点 |
| **DeepSeek** | OpenAI 兼容 |
| **自定义** | Ollama、vLLM、OneAPI、OpenRouter、公司网关、自建/Hermes 兼容代理等 |

密钥存在 `%AppData%\MotionCraft\settings.json` 的 **DPAPI 加密**字段 `apiKeyProtected`——不进 `.vd` 工程，MCP 也不返回明文。

可随时切换默认厂商；导演支持 **自动回退到任一已填 Key 的厂商**，避免「Key 填在豆包槽、单节点却报 NO_KEY」。

### 4. 用 Agent 遥控生成：Cursor / 豆包 / 小龙虾 / Hermes Agent…

MotionCraft 运行后，任何 **MCP 客户端** 都能跑大纲、生成分镜/人物/特效、改图、预览、导出——与界面同一套质量流水线：

- **Cursor**  
- **豆包** 智能体 / 插件 MCP  
- **Hermes Agent**（或其他会 MCP / 本机桥的 Agent）  
- **小龙虾** 等可挂载 MCP 的桌面 Agent  
- 自写脚本直连本机桥（`127.0.0.1`）

你可以点界面生成，也可以让 Agent 调 `run_director` / `run_effect_director` / `export_video`，人在节点图上审片、改代码。

### 5. 冲着「真实短片感」的质量流水线

注入质量宪法（`www/js/quality-prompt.js`）：深度思考、提示词逐词兑现、电影分层、人物表演、确定性 `seed()`（禁 `Math.random`）、代码尽量吃满输出上限、编译/试跑失败打回重写。  
详见 [`docs/prompts/motioncraft-system-prompt.md`](docs/prompts/motioncraft-system-prompt.md)。

---

## 优势速览

- **中间产物可编辑** — 代码即资产；只重做一镜，不必整片重抽  
- **时间轴确定性** — 预览 scrub 与导出一致  
- **节点图工作流** — 镜序 + 挂载运镜 / 特效 / 人物 / 旁白  
- **流式导演面板** — 大纲与逐镜进度一目了然（Agent 可读 `/ai-progress`）  
- **本地隐私** — 加密 `.vd` + DPAPI 密钥  
- **导出落在工程旁** — 优先 MP4，否则 WebM，尽量写到打开的 `.vd` 同目录  
- **有代码即可离线播导出** — 不必每播一次都调模型  
- **模型账单你说了算** — 草稿用便宜/本地模型，成片换强模型  

---

## 你得到什么

### 节点式分镜工作室

| 区域 | 作用 |
|------|------|
| 左 | 节点库：分镜 / 文本 / 图片 / 视频 / 人物 / 图表 / 特效 / 音频 / 旁白 / 镜头 / AI |
| 中 | 画布 — 拖拽，`sequence`（顺序）/ `attach`（挂载） |
| 右 | 属性 — 提示词、layout、生成的 `html` / `css` / `js` |
| 底 | 时间轴 — 跳转、scrub、播放头 |

### AI 导演流水线

1. **大纲** — 镜数与每镜时长服从**用户提示词**（界面总时长仅作未写明时的参考）；写满电影字段（风格、光、运镜、特效…）  
2. **逐镜代码** — IIFE → `{ setup, draw }`  
3. **提示词逐词兑现** — 有含义的词都要进画面  
4. **校验与打回** — 编译 + 试跑；seed / DOM / 未定义变量等失败会重写  
5. **增强挂载** — 运镜、全屏特效、人物表演、旁白  

单节点 AI（分镜 / 人物 / 特效 / 图表）同一契约，并注入 **连接上下文**（宿主分镜与前后镜）。

### Composer 与导出

- 宿主驱动时间 `t`（秒）；场景 **禁止** 自启 `requestAnimationFrame`  
- 运镜 + 遮幅/暗角；气氛特效全屏软绘制（避免硬边「特效框」）  
- 与预览同一绘制循环录制成片  

---

## 架构一览

```
WinForms.exe + WebView2
  └─ www/ 工作台
       ├─ 节点图 · 属性 · 时间轴 · 流式面板
       ├─ 导演（多厂商路由 + 质量提示词）
       ├─ Composer（编译 IIFE → 绘制帧）
       └─ 导出（captureStream + MediaRecorder）
本机 HTTP 桥（127.0.0.1）
  └─ MCP Server（stdio）
       ← Cursor / 豆包 / Hermes Agent / 小龙虾 / 自研 Agent
```

**像素契约：** 只有模型（或本地 synthesizer）的 `draw()` 负责画面。宿主提供画布、时钟、叠层与录制。

```
提示词 → 你的大模型 API（豆包 / DeepSeek / OpenAI / Ollama / …）
           ↓
     每镜 HTML + CSS + JS（IIFE → { setup, draw }）
           ↓
     Composer：校验 → 试跑 → 按时间轴 paint draw({ t })
           ↓
     叠层：运镜 · 人物 · 特效 · 旁白 · …
           ↓
     captureStream + MediaRecorder → 视频写到 .vd 旁
```

---

## 快速开始

1. 编译并运行 Host（见下）  
2. **新建** 或 **打开** `.vd` 工程  
3. **工具 → API / 模型设置** — 填任意 OpenAI 兼容的 Base URL + Key + 模型名  
4. 打开 **AI 导演**，写电影感提示词，生成  
5. 点开各镜看 `js`，拖时间轴，改属性或只重做某一节点  
6. **导出** — 有工程路径时，视频落在 `.vd` 旁  

### 快捷键

| 键 | 作用 |
|----|------|
| Ctrl+N / O / S | 新建 / 打开 / 保存 `.vd` |
| Delete | 删除选中节点或连线 |
| Esc | 关闭预览 |
| 空格 | 预览 / 暂停 |
| Space + 拖拽 | 平移画布 |

时长：顶栏 **1–600 秒**。

---

## 环境要求（刻意压低门槛）

**日常够用**

- Windows 10/11  
- [.NET 8](https://dotnet.microsoft.com/) + [Visual Studio 2022](https://visualstudio.microsoft.com/)（「.NET 桌面开发」）或 `dotnet` CLI  
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 一般已带）  
- 能访问 **你自己的** 大模型端点（或本机 Ollama）  

**可选**

- Node.js 18+ — 仅在使用 **MCP**（Cursor / Agent）时需要  

**核心功能不需要**

- 专用 AI 显卡 / 本地 Stable Video 级硬件  
- 厂商锁定的视频订阅（除非你自己选那家 API）  

---

## 编译与运行

**Visual Studio 2022**

1. 打开 `MotionCraft.sln`  
2. 启动项目：`MotionCraft.Host`  
3. **F5**  
4. 输出：`src/MotionCraft.Host/bin/Debug/net8.0-windows/MotionCraft.exe`  

**命令行**

```powershell
dotnet build MotionCraft.sln -c Release
dotnet run --project src/MotionCraft.Host -c Release
```

也可浏览器打开 `www/index.html` 做前端调试（无宿主菜单 / MCP；无宿主注入 Key 时 AI 走规则 synthesizer 兜底）。

---

## API 怎么配（豆包、DeepSeek、自定义…）

1. **工具 → API / 模型设置**  
2. 填写该厂商的 **Base URL**、**模型 ID**、**API Key**  
3. 设好 **默认厂商**，或让导演用 **自动**（有 Key 的槽位均可）  

常见 Base URL：

| 目标 | baseUrl（示例） |
|------|-----------------|
| 豆包 / 方舟 | `https://ark.cn-beijing.volces.com/api/v3` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| 本地 Ollama | `http://127.0.0.1:11434/v1` |
| 公司网关 | 你们自己的 OpenAI 兼容代理 |

Anthropic 走原生 Messages；其余走 OpenAI 兼容 Chat Completions（已提高 `max_tokens`，方便吐出更厚的分镜代码）。

---

## MCP 与 Agent 遥控

1. 保持 **MotionCraft.exe** 运行（桥在 `127.0.0.1`，端口写入 settings）  
2. `cd mcp && npm install`  
3. **工具 → 复制 MCP 配置** → 粘贴到 Cursor / 豆包 / Hermes / 小龙虾 / 其他 MCP 宿主  

```json
{
  "mcpServers": {
    "motioncraft": {
      "command": "node",
      "args": ["C:/Projects/MotionCraft/mcp/server.js"],
      "env": {
        "MOTIONCRAFT_BRIDGE": "http://127.0.0.1:17865"
      }
    }
  }
}
```

端口以启动后写入 settings 的为准（示例 `17865` 可能不同）。

### 工具列表

`health` · `get_project` · `set_project` · `list_nodes` · `add_node` · `connect` · `update_props` · `run_director` · `run_scene_director` · `run_character_director` · `run_chart_director` · `run_effect_director` · `preview` · `export_video`

Agent 可只重做特效节点、只改一镜，或跑完整导演——节点图始终是真相源。

---

## 节点类型

| 类型 | 作用 |
|------|------|
| `scene` | 主分镜——模型 `html/css/js` 绘制世界 |
| `camera` | 推拉摇移手持等；遮幅 + 柔和暗角 |
| `effect` | 全屏雨 / 光晕 / 粒子 / 火花 / 淡入淡出 |
| `character` | 挂载表演者——脚落地面、表情与动作 |
| `narration` / `text` | 旁白下三分或字幕 |
| `chart` / `image` / `video` / `audio` | 数据与媒体 |
| `ai` | 导演提示词 / 厂商元数据 |

边：`sequence`（镜序）、`attach`（叠在某分镜上）。

---

## 文档

- 设计规格：[`docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md`](docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md)  
- 实现计划：[`docs/superpowers/plans/2026-10-08-ai-motion-studio.md`](docs/superpowers/plans/2026-10-08-ai-motion-studio.md)  
- 导演质量宪法：[`docs/prompts/motioncraft-system-prompt.md`](docs/prompts/motioncraft-system-prompt.md)  
- 镜头 JSON Schema：[`docs/prompts/shot.schema.json`](docs/prompts/shot.schema.json)  

---

## 许可

私有项目，按需使用。
