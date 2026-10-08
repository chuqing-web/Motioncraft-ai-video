# MotionCraft 导演质量宪法

注入位置：`www/js/quality-prompt.js` → `director.js` 的 system / user 消息。

> **契约差异（相对「单文件 HTML + 自启 rAF」方案）**  
> MotionCraft 要求模型输出 **分镜 JSON**；每镜 `js` 为 IIFE，返回 `{ setup, draw }`。  
> **Composer** 按时间轴传入 `t`（秒），场景代码 **禁止** 自己 `requestAnimationFrame`。  
> 当前执行环境为 **Canvas 2D**（无 CDN Three.js）；用多层合成 + 噪声 + 后处理逼近电影感。WebGL 为后续可选升级。

## 模块结构（方案 B）

| 导出 | 作用 |
|------|------|
| `NEGATIVE` | 负向禁令（火柴人、廉价雨、无后处理、空洞镜等） |
| `QUALITY_FIRST` | 每一镜同等高标准；质量优先于凑镜数 |
| `CHARACTER_DESIGN` | 人物设计感（非示意小人）+ layout 人–景站位 |
| `ATTACHMENTS_RULE` | 每镜可附加 camera/effect/narration/character 等；AI 判断并建议添加 |
| `JS_CONTRACT` | js 必须是单表达式 IIFE，避免 `return (js)` 编译失败 |
| `FIELD_FILL_RULE` | JSON 视觉字段强制写满 |
| `VISUAL_CINEMA` | 分层/光/材质/人物/环境/特效/相机/后处理/性能 |
| `SELF_CHECK` | 输出前自检（含逐镜质量） |
| `SYSTEM_OUTLINE`（`SYSTEM` 别名） | 仅大纲，禁止 html/css/js |
| `SYSTEM_SCENE` / `SYSTEM_CHARACTER` / `SYSTEM_EFFECT` | 单镜/节点代码 |
| `buildDirectorUserMessage` | 大纲 user |
| `buildDirectorShotUserMessage` | 逐镜代码 user |

## 编译闸门（运行时）

`director.js` 通过 `requestModelJson` 多轮接收：

1. `sanitizeJsSource` 去掉 markdown 围栏  
2. 试编译 `return (${js})`，要求返回对象且含 `draw` 函数  
3. **JSON/JS 失败** → 把失败原因打回模型（最多再试 2 次），要求重发完整 JSON  
4. 打回耗尽仍失败 → 抛错给 UI（不静默换成假代码）  
5. **仅**无 API Key / 网络 / API 调用失败时，才用本地 synthesizer「代码兜底」  

播放侧 `compileSceneRuntime` 仍保留红底错误占位，作为最后防线。

## 流式展示

- `providers.js`：`chatCompletion({ onDelta })` 走 SSE（失败则整段假流式回放）
- `stream-ui.js`：右下角 AI 面板 + 导演对话框日志同步；`window.__mcAiStream` 供宿主轮询
- 宿主 `GET /ai-progress`：MCP 在 `run_*_director` 期间轮询并发 progress / 附带流式节选
- 应用内生成与 MCP 桥接触发的生成都会打开同一流式面板

## 增强节点 attachments

每镜 JSON 可带 `attachments[]`（camera / effect / narration / character / text / chart / audio）。  
`director.js` 会 `attach` 到对应分镜；若模型未给，则按分镜 brief **启发式补** camera +（特效/旁白/人物）。  
character/effect/chart 无合法 js 时用本地 synthesizer 填可运行代码。

## 质量原则

只写「逼真自然」无效。必须拆成可执行约束：

1. System：契约 + `FIELD_FILL_RULE` + `VISUAL_CINEMA` + `NEGATIVE` + `SELF_CHECK`
2. 每镜 JSON：`style` / `scene` / `character` / `environment` / `camera` / `lighting` / `effects` / `post` 写满短句
3. 再写 `html` / `css` / `js`：`draw({ t })` 时间驱动、固定种子、分层、后处理
4. User 消息强制执行顺序：字段 → 代码 → 自检 → 仅 JSON

## 镜头 Schema

见同目录 [`shot.schema.json`](./shot.schema.json)。

## 推荐调用结构

```text
1) [SYSTEM_OUTLINE] + buildDirectorUserMessage → 大纲 JSON（无代码）
2) 对每一镜循环：
   [SYSTEM_SCENE] + buildDirectorShotUserMessage → 单镜 JSON（含 html/css/js）
```

失败直接报错，**不使用**本地 codegen 离线兜底。单镜/人物/特效同理。

## 视觉评分闭环（可选，尚未自动化）

```text
截图/录屏 → 视觉模型按：真实感、光照、人物、环境、特效、相机、物理、后处理、性能打分
→ 列出最不像真的 5 点 → 追加修正提示词 → 再跑 runDirector
```

## 质量飞跃路线（产品）

1. Canvas 2D 多层 + 本宪法（当前）
2. 贴图/精灵由模型生成，代码只做合成与动画
3. Three.js / WebGL + 后处理栈（Bloom / DOF / Motion Blur）
4. Puppeteer + 视觉评分自动迭代
