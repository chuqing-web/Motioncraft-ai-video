# MotionCraft MCP Server

让 Cursor、豆包等 MCP 客户端操作**正在运行**的 AI Motion Studio（HTTP 桥接）。

本目录包含：

- `server.js`：MCP stdio 服务（工具名见下表）
- 若干示例脚本：手搭漫画工程（《雾中车站》）

操作方式二选一即可：**MCP 工具**，或直接打 **HTTP 桥接**（与 MCP 同 API，见文末）。

---

## 前置条件

1. 启动 `MotionCraft.exe`，确认 `http://127.0.0.1:17865/health` 返回 `ok`。
2. 本目录 `npm install`。
3. Cursor 配置 MCP（应用内「工具 → 复制 MCP 配置」可一键生成）：

```json
{
  "mcpServers": {
    "motioncraft": {
      "command": "node",
      "args": ["C:/Projects/MotionCraft/mcp/server.js"],
      "env": { "MOTIONCRAFT_BRIDGE": "http://127.0.0.1:17865" }
    }
  }
}
```

若系统有 HTTP 代理，访问本机桥接前建议：

```powershell
$env:NO_PROXY = '127.0.0.1,localhost'
$env:HTTP_PROXY = ''
$env:HTTPS_PROXY = ''
```

---

## 工具一览

| 工具 | 作用 |
|------|------|
| `health` / `ai_progress` | 桥接探测 / AI 流式快照 |
| `get_project` / `set_project` | 读 / 整份替换工程 |
| `list_nodes` / `add_node` / `connect` / `update_props` | 画布增删改 |
| `run_director` | 视频导演（提示词 → 分镜链） |
| `run_scene_director` / `run_character_director` / `run_chart_director` / `run_effect_director` | 单节点 AI 出码 |
| `run_comic_director` / `run_comic_shot_director` | 漫画导演 / 单格重生成 |
| `preview` / `export_video` / `export_comic` | 预览与导出 |

`add_node` 的 `type` 取值（画布图标）：

| type | 图标 | 产品线 |
|------|------|--------|
| `scene` | SC 分镜 | **视频** |
| `text` / `narration` / `image` / `video` / `audio` | TX / NA / IM / VD / AU | 视频附件 |
| `character` / `chart` / `effect` / `camera` | CH / CT / FX / CM | 视频附件 |
| `ai` | AI 生成 | 共用 |
| `comic_page` / `comic_panel` / `comic_shot` | PG / PN / CS | **漫画** |

---

# 一、制作漫画：如何添加节点

## 1.1 节点角色（三层）

```text
[PG 页面 comic_page] ─sequence─→ [PG 下一页]
        │ contain
        ▼
[PN 分格 comic_panel] ─compose─→ [CS 格内 comic_shot]
```

| 层 | 管什么 | 谁画像素 |
|----|--------|----------|
| PG 页面 | 本页任务、主格是谁、翻页钩子、开本 | 不画 |
| PN 分格 | 阅读序号 `order`、框位置 `layout`、格大小角色 | 不画 |
| CS 格内 | 设计卡 + **html/css/js** | **只在这里画** |

工程设置（`set_project` 或改 `project.settings`）：

```json
{
  "renderMode": "comic-code",
  "comicReadingDir": "ltr",
  "comicWork": { "title": "雾中车站", "theme": "悬疑治愈", "artStyle": "日系电影感，灰蓝雾气" },
  "comicScenes": [
    { "id": "sc1", "title": "迷雾站", "goal": "建立悬念" },
    { "id": "sc2", "title": "末班车", "goal": "揭示与收束" }
  ]
}
```

## 1.2 推荐添加顺序（手搭，不调导演）

1. `health`
2. 清空/设定工程名与 `renderMode: "comic-code"`
3. `add_node` 每个 `comic_page`，页与页 `connect(kind: "sequence")`
4. 对每一页、每一个阅读格：
   - `add_node` `comic_panel`（带上 `order` + `layout` + `panelRole`…）
   - `add_node` `comic_shot`（带上设计卡 + 稍后或同时写入 html/css/js）
   - `connect(page → panel, "contain")`
   - `connect(panel → shot, "compose")`
5. 用 `update_props` 把设计卡与代码补全（**面板空白 = 没写 props，不会自动填**）
6. 应用内选中 PG →「预览本页」；需要则 `export_comic`

MCP / 桥接示例：

```js
const page = await command('add_node', {
  type: 'comic_page', x: 80, y: 80,
  props: {
    title: '第一页：迷雾站',
    format: 'single',
    pageBeat: 'establish',
    pageTask: '建立雾中车站的不安，引出神秘老人',
    pageInfoChange: '空荡等待 → 察觉异样 → 老人现身',
    pageEmotion: '低气压不安 → 惊疑',
    mainPanelOrder: 6,
    panelCount: 6,
    pageTurnHook: '老人问：你也是在等末班车吗？',
    readingDir: 'ltr',
    readingPath: 'Z',
    sceneId: 'sc1',
    rhythmType: '建立-反应-钩子',
    genStatus: 'done',
  },
});

const panel = await command('add_node', {
  type: 'comic_panel', x: 300, y: 200,
  props: {
    title: '停走的怀表',
    order: 5,
    size: 'm',
    layout: { x: 0.04, y: 0.576, w: 0.496, h: 0.384 },
    panelRole: '过渡格',
    pageSlot: '中段',
    // …设计卡字段与 shot 对齐，见下表
  },
});

const shot = await command('add_node', {
  type: 'comic_shot', x: 520, y: 200,
  props: { /* 完整设计卡 + html/css/js，见 1.4 */ },
});

await command('connect', { from: page.node.id, to: panel.node.id, kind: 'contain' });
await command('connect', { from: panel.node.id, to: shot.node.id, kind: 'compose' });
```

也可用导演：`run_comic_director({ prompt, replace: true })`（会按 AI 大纲重建节点，适合无定稿剧本时）。

## 1.3 PG / PN 必填字段

### PG `comic_page`（页面）

| 字段 | 含义 | 填写要求 |
|------|------|----------|
| `title` | 页标题 | 必填，如「第一页：迷雾站」 |
| `format` | `single` / `spread` | 单页用 `single` |
| `spreadRole` | `left` / `right` | 对页时区分左右 |
| `pageBeat` | establish / dialogue / action / climax / transition | 本页在故事中的节拍 |
| `pageTask` | 本页任务 | **一句话**：本页必须完成的叙事任务 |
| `pageInfoChange` | 本页信息变化 | 读者翻完本页多知道了什么 |
| `pageEmotion` | 本页情绪重点 | 起→止的情绪 |
| `mainPanelOrder` | 主格序号 | 必须等于唯一主格的 `order` |
| `panelCount` | 本页格数 | 必须等于下属 PN 数量 |
| `pageTurnHook` | 翻页钩子 | 页末把人留住/翻到下页的点（末页可空） |
| `linkPrevPage` / `linkNextPage` | 跨页衔接 | 写清承接/甩出 |
| `readingDir` / `readingPath` | ltr\|rtl；Z / 之 / 瀑布… | 与版式一致 |
| `sceneId` | 所属场景 | 对应 `settings.comicScenes[].id` |
| `rhythmType` | 节奏型 | 如「建立-反应-钩子」「起承转合」 |
| `pageWidth` / `pageHeight` | 默认 900×1273 | 导出画布尺寸 |

### PN `comic_panel`（分格框）

| 字段 | 含义 | 填写要求 |
|------|------|----------|
| `order` | 阅读序号 | 本页内 `1…N` 连续不重复 |
| `layout` | `{x,y,w,h}` 归一化 | **必填**；零重叠；gutter≥0.02；页边≈0.04 |
| `size` | xs\|s\|m\|l\|xl | 与面积一致；主格必须 `l`/`xl` |
| `panelRole` | 主格\|辅格\|过渡格\|反应格\|钩子格 | 每页**恰好一个主格** |
| `pageSlot` | 开场\|中段\|页末 | 主钩子多在页末 |
| `shape` / `gutter` / `transitionIn` | 形状/间距语义/转入 | 默认 `rect` / `normal` / `action`；闪回可用 `memory` |
| 设计卡字段 | 与 CS 同步一份 | 见下节（PN 与 CS 建议同文案） |

**layout 自检：** 主格面积 ≥ 次大格 × **1.35**；禁止等分九宫格；邻页版式要有变化。

## 1.4 CS `comic_shot`（格内）— 设计卡要填完整

属性面板里大量空白，是因为手搭时没写这些 props。  
**原则：能写的叙事/构图字段尽量写满；无台词才允许 dialogue/narration/sfx 为空。**

| 字段 | UI 名 | 如何写才算「完整」 |
|------|-------|-------------------|
| `title` | 标题 | 格名，如「停走的怀表」 |
| `duration` | 时长 | 漫画静帧一般为 `1`（不影响印刷静帧） |
| `prompt` | 本格 AI 提示词 | 给重生成用的完整画面描述（景别+主体+氛围+台词要点） |
| `functionVerb` | 叙事功能 | 建立/定位/推进/反应/强调/过渡/转折/爆发/收束/**悬念** — 每格只干一件事 |
| `timeSpan` | 时间跨度 | 一瞬间/几秒/几分钟/时间流逝/**回忆** |
| `infoChange` | 信息变化 | **读者多知道了哪一条新信息**（勿空） |
| `emotion` | 情绪 | 本格情绪，可写「从 A 到 B」 |
| `shotSize` | 景别 | extremeWide / wide / full / medium / close / extremeClose；上下格尽量交替 |
| `angle` | 角度 | eye / high / low / bird / worm / dutch / pov / ots |
| `focus` | 主焦点 | 眼睛第一眼落在哪（具体名词） |
| `staging` | 角色调度 | 谁在左/右/远/近；无人则写「无人，道具为主角」 |
| `foreground` | 前景 | 近处一层（手、栏杆、雾边…） |
| `midground` | 中景 | 主体层 |
| `background` | 背景 | 环境纵深（勿与中景重复一句） |
| `lighting` | 光影 | 光源方向 + 色温 + 雾/对比 |
| `dialogue` | 对白 | 角色台词；多句可用换行；**无对白则留空** |
| `narration` | 旁白 | 画外叙述；无则空 |
| `thought` | 内心 | 内心独白；无则空 |
| `sfx` | 拟声词 | 如「嗡 ——」「咔哒。」；无则空 |
| `panelRole` | 页内角色 | 与所属 PN 一致 |
| `howServesPage` | 为本页贡献 | **这格如何服务 `pageTask`**（勿空） |
| `linkPrev` | 与上一格 | 动作/视线/信息如何接上 |
| `linkNext` | 与下一格 | 甩给下一格什么 |
| `html` / `css` / `js` | 模型代码 | **必填可运行代码**；js 为 IIFE→`{setup,draw}`；漫画**忽略 t 做动画** |

### 完整示例：CS「停走的怀表」

```json
{
  "title": "停走的怀表",
  "duration": 1,
  "prompt": "长椅旧报纸下生锈怀表，指针停在 23:47；无台词静场特写；日系电影感，低饱和灰蓝",
  "functionVerb": "强调",
  "timeSpan": "一瞬间",
  "infoChange": "抛出关键道具：时间停在 23:47 的生锈怀表",
  "emotion": "静场压迫；不祥的停顿感",
  "shotSize": "close",
  "angle": "eye",
  "focus": "报纸下露出的生锈怀表，指针 23:47",
  "staging": "无人出镜；道具充当「在场者」",
  "foreground": "生锈怀表表盖与指针",
  "midground": "压住怀表一角的旧报纸「晚刊」",
  "background": "长椅木板与灰蓝站台地面虚化",
  "lighting": "顶侧柔光扫过金属锈斑；周围偏冷灰蓝雾气",
  "dialogue": "",
  "narration": "",
  "thought": "",
  "sfx": "",
  "panelRole": "过渡格",
  "pageSlot": "中段",
  "howServesPage": "用停走的时间道具为老人现身与终页复走埋伏笔",
  "linkPrev": "从「谁？」的紧张切到无字物证",
  "linkNext": "雾中老人现身，呼应「被停住的时间」",
  "html": "<div class=\"layer\"><div class=\"panel-art\"></div><div class=\"balloon-slot\"></div></div>",
  "css": ".layer{position:absolute;inset:0}",
  "js": "(function(){ function fin(n,d){n=Number(n);return isFinite(n)?n:(d||0);} return { setup:function(){}, draw:function(api){ var ctx=api.ctx,c=api.canvas,W=fin(c.width,900),H=fin(c.height,1273); /* 静帧绘制… */ } }; })()",
  "genStatus": "done"
}
```

自检口令（每格）：

1. 蒙住画面只看设计卡：能否说出「这格新信息 + 情绪 + 焦点」？  
2. `howServesPage` 是否指向本页 `pageTask`？  
3. `linkPrev`/`linkNext` 是否构成阅读链？  
4. 代码是否可编译、静帧一致（不用 `t` 动画、不用 `Math.random`）？

PN 与 CS：**同一阅读格的设计卡文案建议两边都写一份**（面板编辑哪边都看得到；导演/重生成更吃 CS）。

---

# 二、制作视频：如何添加节点

## 2.1 节点角色

视频以 **SC 分镜 `scene`** 为时间轴主链；人物/特效/镜头/字幕等用 **`attach`** 挂到某一镜。

```text
[SC 分镜] ─sequence─→ [SC 分镜] ─sequence─→ [SC …]
    │ attach              │ attach
    ├─ CH 人物            ├─ FX 特效
    ├─ CM 镜头            ├─ NA 旁白
    ├─ TX 文本            └─ …
    └─ AU 音频
```

| 节点 | 图标 | 职责 |
|------|------|------|
| `scene` | SC | 一镜画面主体；持有 html/css/js；`duration` 进时间轴 |
| `character` | CH | 人物层（代码绘制 + layout 占位） |
| `effect` | FX | 雨/雾/粒子等；layout 建议全屏 `{0,0,1,1}` |
| `camera` | CM | 运镜（pan/zoom/handheld…） |
| `narration` / `text` | NA / TX | 旁白 VO / 字幕 |
| `image` / `video` / `audio` | IM / VD / AU | 媒体资源 |
| `chart` | CT | 数据图表层 |
| `ai` | AI | 存整片提示词，可重新导演 |

工程默认偏视频：`settings.width/height/fps/duration`（如 1280×720 @30fps）。漫画的 `renderMode: "comic-code"` 不要用在纯视频工程上。

## 2.2 推荐添加顺序

### 方式 A — 导演一键

```text
run_director({ prompt: "……", duration: 24, replace: true, provider: "auto" })
```

会生成 SC 链并常附带 camera/effect/narration 等。再用 `run_scene_director` / `run_character_director` 等精修单节点。

### 方式 B — 手搭分镜链

1. 按时间顺序 `add_node` 多个 `scene`，相邻 `connect(kind: "sequence")`
2. 为需要的镜 `add_node` 附件，再 `connect(附件 → 分镜, kind: "attach")`（或分镜↔附件，宿主会归一成 attach）
3. `update_props` 填充分镜提示词、brief、时长、代码；附件填 layout / appearance / 代码
4. `preview` → `export_video`

```js
const s1 = await command('add_node', {
  type: 'scene', x: 80, y: 120,
  props: {
    title: '夜站远景',
    duration: 4,
    prompt: '深夜浓雾小火车站，铁轨伸进雾里，站台灯忽明忽暗，电影感灰蓝',
    text: '最后一班车晚点了',
    style: '低饱和、柔光、轻微胶片颗粒',
    sceneBrief: '空荡月台，无行人，雾气厚',
    // html/css/js：手写或稍后 run_scene_director
  },
});
const s2 = await command('add_node', {
  type: 'scene', x: 320, y: 120,
  props: { title: '女孩看表', duration: 3, prompt: '…', text: '' },
});
await command('connect', { from: s1.node.id, to: s2.node.id, kind: 'sequence' });

const cam = await command('add_node', {
  type: 'camera', x: 80, y: 280,
  props: { title: '缓推', move: 'zoom', intensity: 1.0, letterbox: true, duration: 4 },
});
await command('connect', { from: cam.node.id, to: s1.node.id, kind: 'attach' });

const fx = await command('add_node', {
  type: 'effect', x: 80, y: 400,
  props: {
    title: '浓雾',
    motion: 'fade',
    appearance: '灰蓝浓雾，近大远小，不遮死主体',
    prompt: 'station fog volumentric soft',
    layout: { x: 0, y: 0, w: 1, h: 1 },
  },
});
await command('connect', { from: fx.node.id, to: s1.node.id, kind: 'attach' });
```

单镜 AI 出码：`run_scene_director({ sceneId, prompt })`（会注入前后镜连续性）。

## 2.3 SC 分镜字段 — 尽量填完整

面板示例对应关系：

| 字段 | UI 名 | 填写要求 |
|------|-------|----------|
| `title` | 标题 | 镜名，如「夜站远景」「女孩看表」 |
| `duration` | 时长 (秒) | **必填**；本镜在成片中的长度，影响时间轴 |
| `prompt` | 本镜 AI 提示词 | **核心**：完整画面描述（主体、环境、光、镜头感、动作节拍）；生成/重生成都靠它 |
| `text` | 字幕/说明 | 叠在画面上的说明/字幕文案；无字幕可空，但不要和旁白节点重复堆砌 |
| `style` | 风格 brief | 全片或本镜画风、调色、材质（建议每镜都有，或与成片统一句） |
| `sceneBrief` | 环境 brief | 空间、天气、时段、陈设 |
| `html` / `css` / `js` | 模型代码 | 视频 **`draw` 用 `t` 做时间动画**；IIFE→`{setup,draw}`；禁止自启 rAF |

### SC 完整示例

```json
{
  "title": "夜站远景",
  "duration": 4,
  "prompt": "深夜小火车站远景，站台灯忽明忽暗，铁轨延伸进浓雾；低饱和灰蓝色，电影感；镜头缓慢前推，雾气层缓慢漂移",
  "text": "最后一班列车，晚点了三十七分钟。",
  "style": "日系电影感，柔和光影，轻微暗角与颗粒",
  "sceneBrief": "空荡月台与双轨，远景消失在雾中；无行人",
  "html": "<div class=\"layer\"><div class=\"caption\"></div></div>",
  "css": ".layer{position:absolute;inset:0}.caption{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);color:#fff}",
  "js": "(function(){ return { setup:function(){}, draw:function(api){ /* 用 api.t / api.duration 驱动 */ } }; })()"
}
```

SC 自检：

1. `prompt` 能否单独交给模型画出这一镜？  
2. `duration` 是否匹配台词长度与动作节拍？  
3. 与上一镜 / 下一镜：轴线、角色左右、色温是否连续（除非硬切）？  
4. 已 `attach` 的 CH/FX/CM 是否在 prompt 或 brief 里被考虑到（避免画面与附件打架）？

## 2.4 视频附件字段摘要

| 类型 | 建议写全的字段 |
|------|----------------|
| **CH 人物** | `appearance`, `prompt`, `motion`, `expression`, `look`, 颜色, `layout{x,y,w,h}`（脚落地）, `html/css/js` |
| **FX 特效** | `appearance`, `prompt`, `motion`（particles/glow/fade/rain/spark）, **`layout` 全屏**, 代码 |
| **CM 镜头** | `move`, `intensity`（建议 0.8–1.4）, `letterbox`, `duration`（常与所属镜一致） |
| **NA 旁白** | `speaker`, `text`, `animation`, `duration`, `layout` |
| **TX 文本** | `text`, `animation`, `layout` |
| **IM/VD/AU** | `src`（或导入本地）, 时长/音量等 |
| **CT 图表** | `appearance`, `prompt`, `values`, `motion`, `layout`, 代码 |

连线口诀：

- 镜与镜：`sequence`  
- 附件挂到镜：`attach`  
- **不要**用漫画的 `contain` / `compose` 搭视频

---

# 三、漫画 vs 视频对照

| | 漫画 | 视频 |
|--|------|------|
| 主链节点 | PG → PN → CS | SC → SC |
| 边 | sequence / contain / compose | sequence / attach |
| 画面代码所在 | **仅 CS** | **SC**（及 CH/FX/CT 等） |
| 时间 | 静帧，忽略 `t` 动画 | `draw` 用 `t` 驱动 |
| 版式 | PN.`layout` 页内分格 | 附件 `layout` 叠在 1280×720 上 |
| 导出 | `export_comic` PNG/PDF | `export_video` |
| 导演 | `run_comic_director` | `run_director` |

同一工程里可以同时存在两套节点，但预览/导出路径不同；做页漫时设 `renderMode: "comic-code"`。

---

# 四、HTTP 桥接（与 MCP 同 API）

| MCP | HTTP |
|-----|------|
| `health` | `GET /health` |
| `get_project` / `set_project` | `GET` / `POST /project` |
| 其它命令 | `POST /command`，body：`{ "action": "add_node", ... }` |
| `ai_progress` | `GET /ai-progress` |

```powershell
Invoke-RestMethod http://127.0.0.1:17865/command -Method POST `
  -ContentType 'application/json; charset=utf-8' `
  -Body '{"action":"list_nodes"}'
```

`add_node` 返回 `{ ok, node: { id, ... } }`，务必用返回的 `id` 做 `connect` / `update_props`。

---

# 五、示例脚本（《雾中车站》手搭）

| 脚本 | 作用 |
|------|------|
| `build-mist-station.mjs` | 搭 2×6 节点并写入静帧代码 |
| `optimize-mist-layouts.mjs` | 优化两页 layout（主格统治、零重叠） |
| `fill-mist-design-cards.mjs` | **补全设计卡空字段**（不碰 js） |
| `verify-mist-station.mjs` | 编译试跑全部 CS |

```powershell
$env:NO_PROXY = '127.0.0.1,localhost'
node .\build-mist-station.mjs
node .\optimize-mist-layouts.mjs
node .\fill-mist-design-cards.mjs
node .\verify-mist-station.mjs
```

---

# 六、常见问题

**属性面板很多空的**  
手搭只写了代码或标题，没写设计卡。用 `update_props` 按上文表格补全；或跑 `fill-mist-design-cards.mjs` 这类脚本。面板底部「注入整体→…吃满上限」是 AI 出码提示，**不会自动填表**。

**对白/旁白是空的算不算错**  
无台词静场格可以为空；但 `infoChange` / `emotion` / `focus` / 前中后景 / `howServesPage` / `linkPrev`·`linkNext` 仍应写满。

**调了导演节点被清掉**  
`run_comic_director` / `run_director` 在 `replace: true` 时会重建图。可控手搭只用 `add_node` / `connect` / `update_props`。

**预览绘制失败**  
js 非 IIFE、未定义标识符、漫画误用 `t` 动画 / `Math.random`。视频附件特效勿用半透明实心大方块当「雾」。
