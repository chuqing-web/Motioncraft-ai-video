# MotionCraft 导演质量宪法

注入位置：`www/js/quality-prompt.js` → `director.js` 的 system / user 消息。

> **契约差异（相对「单文件 HTML + 自启 rAF」方案）**  
> MotionCraft 要求模型输出 **分镜 JSON**；每镜 `js` 为 IIFE，返回 `{ setup, draw }`。  
> **Composer** 按时间轴传入 `t`（秒），场景代码 **禁止** 自己 `requestAnimationFrame`。  
> 当前执行环境为 **Canvas 2D**（无 CDN Three.js）；用多层合成 + 噪声 + 后处理逼近电影感。WebGL 为后续可选升级。

## 模块结构（方案 B）

| 导出 | 作用 |
|------|------|
| `DEEP_THINKING` | **深度思考**：静默五步推演；禁止敷衍/套模板/空话；思考不写入 JSON |
| `PROMPT_FIDELITY` | **提示词逐词兑现**：名词/形/动/程度/情绪/否定词均须入画；全片覆盖、单镜深度 |
| `NEGATIVE` | 负向禁令（火柴人、廉价雨、无后处理、空洞镜、漏词/模板顶替等） |
| `QUALITY_FIRST` | 每一镜同等高标准；真实短片级密度；质量优先于凑镜数 |
| `CINEMATIC_VIDEO` | **真实视频感**：多系统同时运动、事件节拍、复杂场景/行为、厚代码；禁玩具小动画 |
| `MAXIMAL_CODE_OUTPUT` | **硬性**：每镜 html+css+js **三者**都尽量吃满上限（与 brief 难易无关）；禁只厚 js / 简镜少写 |
| `CHARACTER_DESIGN` | 人物设计感 + 表情/复合动作表演（非示意小人/立牌）+ layout 人–景站位 |
| `ATTACHMENTS_RULE` | 每镜可附加 camera/effect/narration/character 等；AI 判断并建议添加 |
| `JS_CONTRACT` | 单表达式 IIFE；严禁 Math.random（改用 **function** seed）；禁止 appendChild(非 Node)；ease/lerp 须自建；鼓励厚代码 |
| `FIELD_FILL_RULE` | JSON 视觉字段强制写满（含动感/节拍） |
| `VISUAL_CINEMA` | 分层/光/材质/人物/环境/特效/相机/后处理；层内也要「活」 |
| `SELF_CHECK` | 输出前自检（提示词覆盖 + 视频感 + 代码厚度） |
| `SYSTEM_OUTLINE`（`SYSTEM` 别名） | 仅大纲，禁止 html/css/js |
| `SYSTEM_SCENE` / `SYSTEM_CHARACTER` / `SYSTEM_EFFECT` | 单镜/节点代码 |
| `buildDirectorUserMessage` | 大纲 user（强制先读提示词再拆镜） |
| `buildDirectorShotUserMessage` | 逐镜代码 user（本镜关键词 ≥2 决策） |

## 编译闸门（运行时）

`director.js` 通过 `requestModelJson` 多轮接收：

1. `sanitizeJsSource` 去掉 markdown 围栏  
2. 试编译 `return (${js})`，要求返回对象且含 `draw` 函数  
3. **试跑** `setup` + 若干时刻的 `draw`（离屏 canvas），捕获运行时错误（`is not defined` / `clearRect is not a function` / 渐变 non-finite / `undefined.x` / `appendChild` 等）  
4. **本地自动修**：缺 `function seed`、错误 `seed=数字`、`appendChild(字符串)` 等会先尝试注入/软化，再试编译  
5. **JSON/JS/试跑失败** → 按真实错误类型打回（勿误标成「语法/括号」），要求整段重写完整 JSON  
6. 打回耗尽仍失败 → 抛错给 UI（不静默换成假代码）  
7. **仅**无 API Key / 网络 / API 调用失败时，才用本地 synthesizer「代码兜底」  

播放侧 `compileSceneRuntime` 仍保留红底错误占位，作为最后防线；本地修通过后应写入 `props.js`（含自动修复后的源码）。

## 流式展示

- `providers.js`：`chatCompletion({ onDelta })` 走 SSE（失败则整段假流式回放）
- `stream-ui.js`：右下角 AI 面板 + 导演对话框日志同步；`window.__mcAiStream` 供宿主轮询
- 宿主 `GET /ai-progress`：MCP 在 `run_*_director` 期间轮询并发 progress / 附带流式节选
- 应用内生成与 MCP 桥接触发的生成都会打开同一流式面板

## 增强节点 attachments

每镜 JSON 可带 `attachments[]`（camera / effect / narration / character / text / chart / audio）。  
`director.js` 会 `attach` 到对应分镜；若模型未给，则按分镜 brief **启发式补** camera +（特效/旁白/人物）。  
character/effect/chart 无合法 js 时用本地 synthesizer 填可运行代码。  
气氛特效强制全屏 layout；镜头 intensity 宜 0.7~1.0，避免硬边方块与露黑边。

## 质量原则

只写「逼真自然」无效。必须拆成可执行约束：

0. **先** `DEEP_THINKING`（意图→拆解→构图→时间→挑剔）再 `PROMPT_FIDELITY`：逐词入画（每词 ≥2 画面决策）；禁止敷衍
1. System：`DEEP_THINKING` + `PROMPT_FIDELITY` + 契约 + `FIELD_FILL_RULE` + `VISUAL_CINEMA` + `NEGATIVE` + `SELF_CHECK`
2. 每镜 JSON：`style` / `scene` / `character` / `environment` / `camera` / `lighting` / `effects` / `post` 写满短句并点名本镜关键词
3. 再写 `html` / `css` / `js`：`draw({ t })` 时间驱动、固定种子、分层、后处理——**像素兑现提示词**，字幕不能代替画面
4. User 消息强制执行顺序：读词 → 字段 → 代码 → 自检 → 仅 JSON  
   AI 对话框与 MCP `run_*_director` 共用同一套注入词

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
