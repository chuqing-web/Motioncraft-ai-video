# MotionCraft — AI Motion Studio

[English](README.md) | [简体中文](README.zh-CN.md)

**官网：** [https://chuqing-web.github.io/Motioncraft-ai-video-Announcement-Page/](https://chuqing-web.github.io/Motioncraft-ai-video-Announcement-Page/)

**提示词 → 可编辑的 Canvas 代码 → 短片成片，或可印刷的动漫页漫。**

MotionCraft 是一款 **Windows 桌面端 AI 创作工作台**：用自然语言讲故事，由大模型为每一镜 / 每一格写出可运行的 `html` / `css` / `js`，再在本地预览、修订并导出。  
它不是黑盒「文生视频 / 文生图」网站，而是把 LLM 当成 **程序化导演**，把 MotionCraft 当成 **工作室、时间轴 / 页合成器与导出器**——画面透明、可改、可控。

---

## 产品是什么

| 维度 | 说明 |
|------|------|
| **一句话** | 用「代码绘制」代替密封像素，同时做出 **AI 短片** 与 **AI 动漫页漫** |
| **形态** | WinForms + WebView2 桌面应用（`.exe`），工程为加密 `.vd` 文件 |
| **生成方式** | 调用你自备的大模型 API（豆包 / DeepSeek / OpenAI / Ollama…），本机 Canvas 2D 渲染 |
| **两条产线** | ① 时间轴视频（MP4/WebM）② 静态页漫（PNG/PDF） |
| **核心资产** | 每镜/每格的可读代码，而非一次性云端成片 |

### 解决什么问题

| 痛点 | MotionCraft 的做法 |
|------|-------------------|
| 文生视频改不动中间一秒 | 节点 + 代码 + 单镜/单格重做，带前后文连贯 |
| 成片是黑盒，无法二次创作 | `html/css/js` 即资产，可手改、可重生、可进 Git 思维管理 |
| 硬件门槛高、订阅绑定厂商 | 普通 Windows 本即可；模型与账单你自己选 |
| 想做漫画却只能出图、难控分格 | AI 决定格数/大小/位置，流式出码，整页导出 |
| 想让 Cursor / Agent 代劳 | 本机 MCP 桥，与界面同一套导演流水线 |

### 适合谁

- 需要 **可控分镜短片** 的创作者、课件/演示制作者  
- 需要 **页漫分镜与导出** 的故事/动漫向作者  
- 希望用 **Agent（Cursor、豆包、小龙虾等）遥控生成** 的开发者与工作室  
- 在意 **本地隐私与工程文件**（`.vd` 加密库）的团队  

---

## 界面预览

![AI 生成过程](picture/AI%20generation%20process.png)

*AI 导演流式生成大纲与逐镜 / 逐格代码*

![成片效果](picture/video%20effect.png)

*视频预览：运镜、气氛特效与时间轴*

![AI 生成动漫示例](picture/AI-generated%20anime%20examples.png)

*动漫页漫：代码绘制的静态格与页面节奏，可导出 PNG / PDF*

---

## 产品理念

1. **代码即画面** — 大模型不吐密封视频文件，而是写绘制逻辑；你能读懂、能改、能只重做坏掉的一格。  
2. **导演与工作室分离** — LLM 负责叙事与绘制决策；MotionCraft 负责节点图、时钟/拼页、校验打回、导出。  
3. **自备模型** — 草稿用便宜或本地模型，成片换强模型；密钥 DPAPI 加密，不进工程文件。  
4. **人机同图** — 界面点击与 MCP Agent 共用同一工程真相源（`.vd` 节点图）。  
5. **双介质、同哲学** — 视频要「短片感」，漫画要「印刷级漫画感」；提示词宪法分流，互不糊成一套。  

---

## 两条创作管线（全面对照）

| | **视频短片** | **动漫 / 页漫** |
|--|--------------|-----------------|
| **最终产物** | MP4（优先）/ WebM | PNG 序列 / 多页 PDF |
| **叙事单位** | 分镜 `scene` + 时长 | 页 `comic_page` → 格 `comic_panel` → 格内 `comic_shot` |
| **时间语义** | 时钟 `t`（秒）驱动连续运动 | **静帧**；姿态 / 速度线 / 网点表达动感（忽略 `t` 做动画） |
| **版式谁定** | 镜序与时长服从用户提示词 | **AI 决定**每页格数、每格大小与 `layout{x,y,w,h}`（宿主无默认网格） |
| **质量重心** | 真实短片感、多系统运动、事件节拍 | 一格一事、景别节奏、墨线网点、分格设计感、代码一次正确 |
| **导演入口** | AI 导演 / `run_director` | 漫画导演 / `run_comic_director` |
| **单点重做** | 单镜 / 人物 / 特效导演 | `run_comic_shot_director`（带上下格、页上下文） |
| **预览** | 时间轴 scrub + 播放 | 按页翻看合成结果 |
| **导出** | 与预览同一绘制循环录制，尽量写到 `.vd` 旁 | 整页合成后导出 PNG 或 PDF |
| **同工程关系** | 可与漫画节点共存，时间轴互不混写 | 不进视频 `bakeTimeline` |

---

## 核心能力详解

### 1. 节点式工作室

| 区域 | 作用 |
|------|------|
| **左** | 节点库：视频类 + 漫画类节点 |
| **中** | 画布：拖拽、连线、总览故事结构 |
| **右** | 属性：提示词、layout、生成的 `html` / `css` / `js`、单格/单镜重生 |
| **底** | 视频时间轴；漫画翻页预览控件 |

视频边：`sequence`（镜序）、`attach`（叠层）。  
漫画边：`sequence`（翻页）、`contain`（页含格）、`compose`（格配格内画）。

### 2. 视频 AI 导演

1. **大纲** — 镜数、每镜时长优先服从用户提示词；写满风格 / 光 / 运镜 / 特效等字段  
2. **逐镜出码** — IIFE 返回 `{ setup, draw }`，由宿主传入 `t`  
3. **提示词逐词兑现** — 有含义的词都要进画面，禁止用字幕代替画面  
4. **校验与打回** — 编译 + 离屏试跑；禁 `Math.random`（改用 `seed`）；失败多轮重写  
5. **增强挂载** — 运镜、全屏气氛特效、人物表演、旁白等  

模板示例：霓虹城市、日光产品片、数据演示等（菜单模板）。

### 3. 动漫 / 页漫 AI 导演

1. **四级叙事大纲（无代码）** — 整体 → 场景 → 页任务卡 → 格设计卡  
2. **版式由 AI 全权决定** — `panelCount`、每格 `size` + 精确 `layout`；主格明显更大；禁止等分懒网格  
3. **按页按格流式出码** — 一格画完再下一格；注入上下格与页任务  
4. **漫画感质感** — 外粗内细、网点/排线、剪影、先留气泡、一格一事  
5. **正确性优先** — html/css/js 须一次完整可编译可试跑（打回成本高）  
6. **拼页导出** — ComicComposer 合成整页 → PNG 序列或 PDF  

v1 定位为 **页漫**（单页多格），不是条漫。

### 4. 模型与密钥

- 槽位：OpenAI / Anthropic / 豆包 / DeepSeek / **自定义**（Ollama、vLLM、OpenRouter、公司网关等）  
- 密钥：`%AppData%\MotionCraft\settings.json` 中 **DPAPI** 字段，MCP 不返回明文  
- 导演支持默认厂商或 **自动回退到任一已填 Key 的槽位**  

### 5. Agent / MCP 遥控

保持 `MotionCraft.exe` 运行后，Cursor、豆包、Hermes Agent、小龙虾或自写脚本可：

- 读写工程、增删节点、改属性  
- 跑完整视频导演或漫画导演  
- 只重做一镜 / 一格  
- 预览与导出视频 / 漫画  

与界面 **同一质量流水线**，节点图始终是真相源。

### 6. 工程与隐私

- 工程文件：加密 **`.vd` 保险库**（本地）  
- 有代码后可离线预览/导出，不必每次预览都调模型  
- 导出默认尽量落在打开的 `.vd` 同目录  

---

## 典型工作流

### A. 做一条 AI 短片

1. 新建 / 打开 `.vd`，配置 API  
2. 打开 **AI 导演**，写清镜数、时长、场景与情绪  
3. 生成大纲 → 逐镜代码 → 在时间轴 scrub  
4. 不满意则只重生某一 `scene` 或特效/人物节点  
5. **导出** MP4/WebM  

### B. 做一套动漫页漫

1. 配置同一 API，打开 **漫画导演**（或漫画模板）  
2. 写故事提示词 → AI 规划页与格（含版式坐标）  
3. 流式逐格出码，翻页预览整页效果  
4. 单格失败或画风不对 → 只重生该 `comic_shot`  
5. **漫画导出** PNG 或 PDF  

### C. 让 Agent 代劳

1. 桌面应用保持运行，复制 MCP 配置到 Cursor 等  
2. Agent 调用 `run_director` 或 `run_comic_director`  
3. 人在节点图上审片、改代码或下第二条指令  

---

## 架构一览

```
WinForms.exe + WebView2
  └─ www/ 工作台
       ├─ 节点图 · 属性 · 时间轴 / 漫画翻页 · 流式 AI 面板
       ├─ 视频导演 + 漫画导演（分流质量提示词）
       ├─ Composer（视频帧）· ComicComposer（静态页）
       └─ 导出视频 · 导出漫画 PNG/PDF
本机 HTTP 桥（127.0.0.1）
  └─ MCP Server（stdio）
       ← Cursor / 豆包 / Hermes / 小龙虾 / 自研脚本
```

```
提示词 → 你的大模型 API
              ↓
        ┌─────┴─────┐
        ▼           ▼
   视频分镜代码    漫画格代码
   draw({ t })    静帧 draw
        ↓           ↓
   时间轴合成      按页拼格
        ↓           ↓
   MP4 / WebM     PNG / PDF
```

**像素契约：** 只有模型（或本地 synthesizer）的 `draw()` 负责像素；宿主提供画布、时钟或页框、叠层与录制/导出。

---

## 节点类型一览

### 视频

| 类型 | 作用 |
|------|------|
| `scene` | 主分镜，模型绘制世界 |
| `camera` | 推拉摇移手持等；遮幅 + 暗角 |
| `effect` | 全屏雨 / 光晕 / 粒子 / 火花等 |
| `character` | 挂载表演者（脚落地面、表情动作） |
| `narration` / `text` | 旁白下三分 / 字幕 |
| `chart` / `image` / `video` / `audio` | 数据与媒体 |
| `ai` | 导演提示词与厂商元数据 |

### 动漫 / 页漫

| 类型 | 作用 |
|------|------|
| `comic_page` | 页面：开本、阅读路径、翻页钩子、`panelCount` |
| `comic_panel` | 分格：阅读序号、框形、AI `layout` |
| `comic_shot` | 格内画：`html` / `css` / `js` 静帧完稿 |

---

## 快速开始

### 环境要求

- Windows 10/11  
- [.NET 8](https://dotnet.microsoft.com/) + Visual Studio 2022（「.NET 桌面开发」）或 `dotnet` CLI  
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 通常已有）  
- 能访问你的大模型端点（或本机 Ollama）  
- Node.js 18+ — **仅**使用 MCP 时需要  

**不需要：** 专用 AI 显卡、本地文生视频大模型、厂商锁定视频订阅。

### 编译运行

**Visual Studio：** 打开 `MotionCraft.sln` → 启动项目 `MotionCraft.Host` → **F5**。

```powershell
dotnet build MotionCraft.sln -c Release
dotnet run --project src/MotionCraft.Host -c Release
```

也可打开 `www/index.html` 做前端调试（无宿主菜单 / 无 MCP / 无宿主注入 Key 时走规则兜底）。

### 配置 API

**工具 → API / 模型设置** — 填写 Base URL、模型 ID、API Key。

| 目标 | baseUrl（示例） |
|------|-----------------|
| 豆包 / 方舟 | `https://ark.cn-beijing.volces.com/api/v3` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| 本地 Ollama | `http://127.0.0.1:11434/v1` |

### 快捷键

| 键 | 作用 |
|----|------|
| Ctrl+N / O / S | 新建 / 打开 / 保存 `.vd` |
| Delete | 删除选中节点或连线 |
| Esc | 关闭预览 |
| 空格 | 视频预览 / 暂停 |
| Space + 拖拽 | 平移画布 |

视频时长顶栏：**1–600 秒**。

---

## MCP 配置示例

1. 保持 **MotionCraft.exe** 运行（桥监听 `127.0.0.1`，端口写入 settings）  
2. `cd mcp && npm install`  
3. **工具 → 复制 MCP 配置** → 粘贴到 Cursor / 豆包 / 其他 MCP 宿主  

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

端口以启动后实际写入为准。

### 工具列表

**工程：** `health` · `get_project` · `set_project` · `list_nodes` · `add_node` · `connect` · `update_props` · `preview`  

**视频：** `run_director` · `run_scene_director` · `run_character_director` · `run_chart_director` · `run_effect_director` · `export_video`  

**动漫：** `run_comic_director` · `run_comic_shot_director` · `export_comic`

---

## 与常见方案的区别

| | 文生视频 SaaS | 文生图 + 手工拼漫 | **MotionCraft** |
|--|---------------|-------------------|-----------------|
| 中间产物 | 密封文件 | 位图 | **可运行代码** |
| 改一拍/一格 | 难 | 重画 | 单节点重生 + 连贯上下文 |
| 分格版式 | 不适用 | 手工 | **AI 设计格数与坐标** |
| 硬件 | 常绑定云端算力 | 看工具 | 普通 PC + 你的 API |
| Agent | 少 | 少 | **MCP 一等公民** |
| 视频+漫画同工程 | 通常分开 | 分开 | **同工作室双管线** |

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [`docs/prompts/motioncraft-system-prompt.md`](docs/prompts/motioncraft-system-prompt.md) | 导演质量宪法（视频 + 漫画分流） |
| [`docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md`](docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md) | 视频工作室设计规格 |
| [`docs/superpowers/specs/2026-10-09-comic-nodes-design.md`](docs/superpowers/specs/2026-10-09-comic-nodes-design.md) | 漫画节点与流式生成规格 |
| [`docs/prompts/shot.schema.json`](docs/prompts/shot.schema.json) | 镜头 JSON Schema |
| [`mcp/README.md`](mcp/README.md) | MCP 服务说明 |

---

## 许可

私有项目，按需使用。
