# 漫画节点与流式生成设计规格

**日期:** 2026-10-09  
**项目:** MotionCraft  
**状态:** 已落地（v1 + 七变量格设计卡 + 四级叙事注入：整体→场景→页→格）  
**相关:** 与视频管线并列；复用「提示词 → AI 写 HTML/CSS/JS → 代码绘制」模式

## 1. 目标

在现有「能做视频」之外，增加**页漫**能力：节点图表达「页面 → 分格 → 格内构图」三层导演；AI 流式一格一格生成绘制代码；导出 PNG / PDF。

**一句话：** 页面布局是宏观导演，分格布局是中观剪辑，格内构图是微观摄影；生成时按页、按格顺序流式出码，与视频分镜同等厚度与修复流程。

## 2. 决策摘要（已确认）

| 项 | 选择 |
|----|------|
| 产品线 | 图片/PDF 页漫（v1 不做条漫） |
| 节点结构 | 三层各成节点，连线表达宏观→微观 |
| 分格粒度 | 每格一个 `comic_panel` 节点 |
| 绘制方式 | AI 注入提示词生成 HTML/CSS/JS，代码画图 |
| 生成节奏 | 流式：一格画完再下一格；一页画完再下一页 |
| 单格重跑 | 像分镜一样可单独重新生成，必带上下格（及跨页首尾）上下文 |
| 代码厚度 | 对齐视频：html/css/js 三者尽量吃满 `max_tokens`（当前 16384） |
| 编译错误 | 对齐视频：本地修复 → 仍失败则打回模型多轮重做 |
| 与视频关系 | 同工程可共存；独立 Director / 预览 / 导出，不进 `bakeTimeline` |

## 3. 架构

```
用户提示词
    ↓
runComicDirector
    ├─ Phase 0: 大纲（无代码）→ comic_page / comic_panel / comic_shot 壳 + 边
    └─ Phase 1: for 页 in sequence:
                    for 格 in order:
                      组装上下文（页±1、格±1、同页已完成）
                      请求单格 JSON（逼近输出上限）
                      校验 → 本地修括号等 → 失败打回
                      写入 comic_shot → onProject 刷新页预览
    ↓
ComicComposer：按页拼合格内 draw（静态完成稿；runtime 签名兼容 t，提示词禁 t 动画）
    ↓
导出 PNG 序列 / PDF
```

视频链（scene + MediaRecorder）与漫画链并行，互不写入对方时间轴/导出。

## 4. 节点与边

### 4.1 节点类型

| type | 标签 | 职责 | 关键 props（示意） |
|------|------|------|-------------------|
| `comic_page` | 页面 | 开本、单页/对页、翻页钩子、整页节奏 | `format`, `spreadRole`, `pageBeat`, `pageTurnHook`, `readingDir` |
| `comic_panel` | 分格 | 本格位置/大小/形状、阅读序号、间距与转场 | `order`, `size`, `shape`, `gutter`, `transitionIn`, `layout` |
| `comic_shot` | 格内构图 | 景别/角度/焦点/对白约束；持有绘制代码 | `shotSize`, `angle`, `focus`, `dialogue`, `sfx`, `html`, `css`, `js`, `genStatus` |

- 页面节点不直接画图像素。  
- 分格管框与顺序。  
- **仅 `comic_shot` 生成并持有 html/css/js**（对齐 scene）。

### 4.2 边种类

| kind | 含义 | 连法 |
|------|------|------|
| `sequence` | 翻页/阅读顺序 | `comic_page` → `comic_page` |
| `contain` | 页包含格 | `comic_page` → `comic_panel` |
| `compose` | 格配格内 | `comic_panel` → `comic_shot`（v1 一格一构图） |

不使用视频的 `attach` 作为漫画主链，避免与 scene 叠层语义混淆。

### 4.3 结构约束

1. 每个 `comic_panel` 恰好挂在一个 `comic_page` 下。  
2. 每个 `comic_panel` 至多一个 `comic_shot`（v1）。  
3. 同页内 `comic_panel.order` 唯一；流式按升序。  
4. 页面 `sequence` 无环；拓扑序即导出与生成顺序。  
5. 生成前校验非法图结构，阻止开跑并指出节点。

### 4.4 最小合法图

```
[页面1] ─sequence─→ [页面2]
   │ contain              │ contain
   ▼                      ▼
[分格1]─compose─→[格内1]  …
[分格2]─compose─→[格内2]
```

## 5. Director 与流式数据流

### 5.1 入口

| API | 作用 | 类比 |
|-----|------|------|
| `runComicDirector` | 全本：大纲 → 按页按格流式 | `runDirector` |
| `runComicPageDirector` | 重规划/重画某一页 | 页级 |
| `runComicShotDirector` | 只重画某一格 html/css/js | `runSceneDirector` |

全量流式中「画每一格」与「重新生成这一格」**共用同一套单格生成与校验函数**。

### 5.2 三阶段

1. **大纲（无代码）** — `SYSTEM_COMIC_OUTLINE`：规划页与格（开本、页类型、翻页钩子、格大小/顺序/转场）；禁止输出代码；挂全部壳节点与边；`onProject` 刷新。  
2. **按页按格流式出码** — 对每个 `comic_shot` 调单格生成；`genStatus`: pending → generating → done / error / cancelled。  
3. **可选校对** — 检查清单只出问题列表，默认不自动重画整页。

### 5.3 流式顺序（硬性）

```
第1页：格1 → 格2 → … → 格N
第2页：格1 → …
```

进度事件示例：`phase: outline | panel-start | panel-done | page-done | complete | error`，附带 `pageIndex`, `panelIndex`, ids。

### 5.4 单格重生成

- 属性面板提供「重新生成这一格」（对齐分镜）。  
- 只更新该 `comic_shot` 的代码与预览局部。  
- **必须**带齐第 5.5 节上下文窗口。

### 5.5 上下文窗口（每格必带）

画第 P 页第 i 格时注入：

- 全局故事 prompt、风格/调色、阅读方向  
- 本页：`pageBeat`、`pageTurnHook`、开本、左右页角色  
- 上一页摘要（若有）：页拍、末格钩子  
- 下一页摘要（若有）：开场意图  
- 上一格 / 下一格 brief（动作、轴线、视线、色温）  
- 同页已完成格短摘要（站位、道具、光线）  
- 本格 brief（分格 props + 格内约束）

硬规则写入 `SYSTEM_COMIC_SHOT`：跨格角色左右/主色/光源一致（除非 brief 声明跳切）；轴线与视线/动作匹配；页末服务翻页钩子，下页首页兑现或扭转。

每层提示词引导模型回答五问：**先看什么？后看什么？停多久？感受什么？翻页后得到什么？**

### 5.6 代码厚度与静态提示词

- 单格请求 `max_tokens` 与视频相同（当前 16384），但**提示词宪法独立**，禁止嵌入视频 `MAXIMAL_CODE_OUTPUT` / `CINEMATIC_VIDEO`。  
- `STATIC_COMIC_STILL` + `MAXIMAL_COMIC_CODE_OUTPUT` + `COMIC_JS_CONTRACT`：html、css、js **三者**都尽量吃满；简格不许短码；禁止只厚 js。  
- 一格 = 可印刷静帧；动感用姿态/速度线/拟声，**禁止** t 驱动连续运动或「截 t=0」借口。  
- **页内版式（AI 全权决定）**：`COMIC_PAGE_LAYOUT_DOCTRINE` — 每页 `panelCount`、每格 `size` 与 `layout{x,y,w,h}` 均由大纲模型给出；宿主**不**套用 `defaultComicPanelLayouts`。主格面积明显最大；禁止等分网格/通栏叠罗汉；缺 layout / panelCount 不一致 → 打回。  
- **单格漫画感**：`COMIC_CRAFT_QUALIA` + 更新后的绘制流水线 — 一格一事、景别交替、先留气泡、体块剪影、外粗内细、网点/排线；禁光滑海报风。  
- 过短 → 视为不合格并 repair 打回。  
- 像素以 canvas `ctx` 为主；对话框/拟声词由 js 画进格内。

### 5.7 中断与续跑

- 停止：当前格 `cancelled`，已完成保留。  
- 「从下一格继续」：跳过 `done`，从第一个 pending 按页序接着跑。  
- 全量流式默认：单格最终失败后**暂停**并提示重试（可配置跳过，非默认）。

## 6. 编译校验与修复（对齐视频）

复用分镜链路，不另造轮子：

```
模型 JSON
  → 解析 / 结构校验
  → compile 格内 js（与 compileSceneRuntime 同类）
  → 本地自动修复（括号多删/少补、seed、appendChild 软化等，见 runtime.js）
  → 仍失败 → buildCompileRepairMessage 风格打回
  → 多轮重收，轮次上限与 requestModelJson 一致
```

- 本地能修则直接写入，不浪费一轮模型。  
- 打回时仍带完整上下文窗口；要求整段合法 JSON，厚度规则不变。  
- UI 展示 `attempt / max`、`repair: true`。

## 7. 预览与导出

### 7.1 页预览器

- 不进视频时间轴。  
- 按开本比例合成当前页；各格按 `layout` clip 后调用 `{ setup, draw }`，`t` 固定 0。  
- `panel-done` 局部刷新该格；未完成显示占位。  
- v1：单页为主；对页可并排预览；**跨页大图延后**。

### 7.2 导出

| 格式 | 行为 |
|------|------|
| PNG | 每页一张；对页可选左右两张或拼图 |
| PDF | 一页漫画 = PDF 一页；顺序 = page `sequence` 拓扑序 |
| 范围 | 全部页 / 仅当前页 |

优先在 `www` 内 canvas → PNG；PDF 用轻量库或宿主存盘。UI 分离「导出视频」与「导出漫画」。导出时若有失败格：**默认阻止**并列出页码+格序。

## 8. 布局导演知识（写入提示词，非独立 UI）

三层检查清单压缩进 outline / shot system prompt（源自产品讨论稿）：

- **页面：** 翻页钩子、阅读路径、节奏起伏、装订线避让、页边距呼吸  
- **分格：** 阅读顺序、格数与大小节奏、转场、对白与格配合  
- **格内：** 单焦点、景别/角度服务情绪、轴线与视线、对话框不挡关键信息  

v1 不单独做印刷级出血裁切工具，但 brief 与校验提示需有安全线/装订线意识。

## 9. 触点文件（实现指引）

| 区域 | 文件（预期） |
|------|----------------|
| 节点注册 / 默认 props / 边 | `www/js/model.js` |
| 画布边 kind | `www/js/canvas.js` |
| 属性面板 + 单格重生成按钮 | `www/js/props.js` |
| 布局 placeable | `www/js/layout.js` |
| 漫画 Director | `www/js/director.js`（或 `comic-director.js`） |
| 提示词 | `www/js/quality-prompt.js` |
| 页合成 / 预览 | 新 `comic-composer.js` 或扩展 composer |
| 导出 | 新 `comic-export.js` + `app.js` UI |
| MCP | `mcp/server.js`：`run_comic_director` 等 |
| 编译修复 | 复用 `runtime.js` + director 打回逻辑 |

## 10. 错误处理摘要

| 情况 | 行为 |
|------|------|
| JSON/编译失败 | 本地修 → 打回多轮；失败则该格 error，保留旧码（若有） |
| 输出过短 | repair 打回加厚 |
| 用户中断 | cancelled；可续跑 |
| 非法图结构 | 生成前阻止 |
| 导出遇失败格 | 默认阻止并列出 |

## 11. 测试要点

1. 大纲后出现 page/panel/shot 壳，sequence/contain/compose 正确。  
2. 流式顺序：页内按 order，页间按 sequence；进度事件正确。  
3. 单格重生成只改该 shot，请求含上下格及跨页首尾上下文。  
4. 厚度校验打回过短输出。  
5. 括号等编译错误：本地可修则修；否则打回后通过或达上限报错。  
6. 预览随 panel-done 刷新；PNG/PDF 页序正确。  
7. 同工程视频链与漫画链互不干扰。

## 12. v1 明确不做

- 条漫（纵向滚动）  
- 跨页单幅大图的完整装订线合成  
- 印刷级出血裁切导出  
- 自动将漫画页转为视频时间轴  
- 一格多个 `comic_shot`

## 13. 成功标准

- 用户可用提示词一键流式生成多页页漫，并看到一格一格出现。  
- 任一格可单独重跑且与邻格连贯。  
- 单格代码丰富度与修复体验对齐视频分镜。  
- 可导出完整 PNG 序列与 PDF，无需经过视频录制。
