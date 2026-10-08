# AI Motion Studio 设计规格

**日期:** 2026-10-08  
**项目:** MotionCraft  
**状态:** 已批准（用户要求直接全面落地）

## 1. 目标

交付可在 Visual Studio 2022 编译的 Windows `.exe`（WinForms + WebView2），内嵌完整「节点式分镜编排」工作台。

**成片原则：** 大模型根据提示词输出每镜的 **HTML + CSS + JS 代码**；Composer 注入并执行其中的 `draw(t)` 绘制每一帧像素。宿主不负责用写死模板画场景。无 Key 时由本地「代码生成器」产出同等形态的代码再执行。可选 `captureStream` 录成视频文件。

## 2. 架构

```
WinForms.exe + WebView2
  └─ www/ 工作台
       ├─ 节点库 | 分镜画布 | 属性面板 | 时间轴
       ├─ Composer：节点图 → HTML 镜头树 → 预览
       ├─ Export：captureStream + MediaRecorder（优先 MP4，否则 WebM）
       └─ Director Service：规则伪 AI + 多厂商 LLM Router
Local HTTP Bridge（宿主侧）← MCP Server（stdio）← Cursor / 豆包
```

### 2.1 宿主（C# WinForms + WebView2）

- 全屏承载 `www/index.html`
- 菜单：文件（新建/打开/保存）、设置（API Key）、MCP 状态
- 本地 HTTP 桥（`127.0.0.1` 随机/固定端口）暴露项目读写与导演命令，供 MCP 调用
- 配置存 `%AppData%/MotionCraft/settings.json`；API Key 以 Windows DPAPI（CurrentUser）加密字段 `apiKeyProtected` 落盘，明文不进磁盘、不进项目文件；HTTP/MCP `/settings` 仅返回 hasKey/keyMask

### 2.2 前端工作台

对照线框：

- 顶栏：品牌、文件/项目/模板/素材、▶预览、✨AI导演、导出
- 左：节点库（分镜/文本/图片/视频/人物/图表/特效/音频/旁白/镜头/AI）
- 中：节点画布（拖拽、连线、选中）
- 右：节点属性
- 底：时间轴（Scene / Camera / Audio 等轨）

### 2.3 Composer（代码执行成片）

- 输入：各 `scene` 节点上的 `html` / `css` / `js`（由大模型或代码生成器写入）
- `js` 编译为 `{ setup, draw }`，按时间轴每帧调用 `draw({ ctx, canvas, t, duration, root })`
- **像素只来自模型代码的 draw**；宿主提供 canvas、时钟与录制
- 时长：各节点 `duration` + 边拓扑烘焙；支持 1–600 秒

### 2.4 AI 导演（代码导演）

- 提示词 → LLM 输出分镜 JSON，**每镜必须含 html/css/js 代码**
- Provider Router：OpenAI 兼容、Anthropic、豆包、DeepSeek、自定义 Base URL
- 无 Key / 失败 → `codegen-fallback` 生成同等形态的代码字符串再执行
- `ai` 节点记录提示词与厂商

### 2.5 MCP 桥接

- 独立 `mcp/` 进程（stdio MCP）
- 工具：`get_project`、`set_project`、`list_nodes`、`add_node`、`connect`、`update_props`、`run_director`、`preview`、`export_video`
- 通过 HTTP 调用宿主桥；Cursor / 豆包配置 MCP 后可操作同一项目

## 3. 数据模型

见实现中的 `www/js/model.js` 与项目文件 `*.motioncraft.json`：

- `Project { version, name, settings, assets, nodes, edges, timeline }`
- 节点类型：`scene | text | image | video | character | chart | effect | audio | narration | camera | ai`
- 边：`sequence | attach`

## 4. 导出

- 预览舞台 `captureStream(fps)`
- `MediaRecorder`：优先 `video/mp4`，否则 `video/webm`
- UI 标明实际容器格式
- 本期无独立音轨混音要求时可导出纯画面；音频节点影响时间轴与（若浏览器支持）可选音轨合成

## 5. 非目标（本期不做）

- 云端协作
- 专业调色/多机位 NLE
- 真实 TTS 发音（旁白以字幕 + 占位为主，留钩子）
- 强制所有浏览器原生 MP4（做能力探测与回退）

## 6. 成功标准

1. VS2022 打开解决方案可编译运行 `.exe`
2. 可拖节点、连线、改属性、时间轴可见
3. AI 导演（规则或 API）能生成可预览短片
4. 导出得到可播放的视频文件
5. MCP 工具可读写项目并触发导演
