# MotionCraft 质量注入词全面加强（方案 B）

日期：2026-10-08  
状态：已落地（2026-10-08）  
范围：仅提示词与同步文档，不改 Composer 运行时

## 问题

当前 `quality-prompt.js` 已有电影感条文，但模型仍常输出简陋 Canvas：人物无关节、环境扁平、特效廉价、缺少后处理，成片不像短视频。

## 目标

全链路加强人物 / 环境 / 特效 / 相机 / 光照 / 后处理注入词，使模型在写 `html/css/js` 前先填满可执行视觉约束。

## 非目标

- 不升级 WebGL / Three.js
- 不在 system 中塞入大段伪代码模板（避免千篇一律与上下文膨胀）
- 不改 Composer 执行契约（仍为 IIFE `{setup,draw}` + 宿主驱动 `t`）

## 方案：模块化 + 强制清单

### 1. 导出可复用模块常量

在 `www/js/quality-prompt.js` 拆出并导出（或文件内复用）：

| 模块 | 用途 |
|------|------|
| `NEGATIVE` | 扩展负向：无关节、无地面接触、无大气分层、特效无物理、缺后处理等 |
| `VISUAL_CINEMA` | 分层渲染、光照、材质、人物、环境、特效、相机、后处理、性能的强制条文 |
| `SELF_CHECK` | 输出前自检清单（可拼进 SYSTEM / SYSTEM_SCENE） |
| `FIELD_FILL_RULE` | JSON 字段强制写满规则（禁止空话） |

`SYSTEM`、`SYSTEM_SCENE`、`SYSTEM_CHARACTER`、`SYSTEM_EFFECT`（及图表若需轻量引用）通过模板拼接上述模块，避免四处复制漂移。

### 2. JSON 字段强制写满

每镜（及人物/特效节点对应字段）必须用**可执行短句**填写，禁止「逼真」「自然」等空词：

- `style`：胶片/焦段感/景深/手持程度  
- `scene`：地点、时段、天气、主视觉锚点  
- `character`：服装色、发型、动作状态、脚底阴影（无人则写「无」）  
- `environment`：天空/地面/雾/反射/前景遮挡  
- `camera`：运镜类型 + 缓动 + 轻手持噪声  
- `lighting`：主光方向/色温 + 轮廓光 + 接触阴影  
- `effects`：粒子类型 + 生命周期/重力/风（无则写「无」）  
- `post`：至少 vignette + grain；按需 bloom / 轻色差 / 调色

### 3. User 消息：「先约束再写码」

更新：

- `buildDirectorUserMessage`
- `buildSceneUserMessage`
- `buildCharacterUserMessage`
- `buildEffectUserMessage`

要求：先在 JSON 视觉字段写满约束 → 再写能落地这些约束的 `html/css/js`；自检不通过不得输出。

### 4. 分域加强要点（写入 `VISUAL_CINEMA`）

**人物**

- 头身比与关节链（头/颈/躯干/上臂/前臂/手/大腿/小腿/脚）
- 重心与脚底接触阴影；禁止漂浮与圆头火柴人
- idle 呼吸 / walk·run 相位 / 布料·头发次级阻尼

**环境**

- 远→中→近分层；天空非纯色（渐变 + 噪声云）
- 地面材质或湿反射；大气透视（远景降对比/略雾）
- 可选前景剪影遮挡增强景深

**特效**

- 雨：半透明斜线 + 溅射/涟漪，禁廉价白竖线
- 尘/雾：体积感、近大远小、生命周期
- 光晕：与光源绑定，有衰减

**相机 / 光 / 后处理**

- 推拉摇移跟之一；ease + 极轻手持
- 环境光 + 方向/霓虹 + 轮廓；软阴影与接触阴影
- 必做 vignette + film grain；按需 bloom / chromatic / 电影调色

### 5. 文档同步

更新 `docs/prompts/motioncraft-system-prompt.md`：简述模块化结构与强制字段清单，指向 `quality-prompt.js`。

## 验收标准

1. 导演 / 单镜 / 人物 / 特效四条 system 均复用同一套视觉模块（无互相矛盾）。
2. User 消息明确「先填字段约束再写码」。
3. NEGATIVE 覆盖人物简陋、环境扁平、特效廉价、缺后处理。
4. 契约不变：JSON + IIFE + 无自启 rAF + 无 `Math.random()` + 不依赖外网。
5. 提示词变长可接受；不引入完整伪代码骨架。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Token 增加导致截断 | 模块写「可执行短句」，避免散文；伪代码不塞 |
| 模型仍忽略条文 | 强制字段 + 加长自检；user 双重强调 |
| 各 SYSTEM 文案漂移 | 单源模块拼接 |

## 实现文件

1. `www/js/quality-prompt.js`（主改）
2. `docs/prompts/motioncraft-system-prompt.md`（摘要同步）
