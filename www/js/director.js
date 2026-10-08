import { createNode, createEdge, createEmptyProject, touch } from './model.js';
import { chatCompletion } from './providers.js';
import {
  SYSTEM_OUTLINE,
  SYSTEM_SCENE,
  SYSTEM_CHARACTER,
  SYSTEM_CHART,
  SYSTEM_EFFECT,
  buildDirectorUserMessage,
  buildDirectorShotUserMessage,
  buildSceneUserMessage,
  buildCharacterUserMessage,
  buildChartUserMessage,
  buildEffectUserMessage,
} from './quality-prompt.js';
import { synthesizeCharacterCode } from './character-code.js';
import { synthesizeChartCode } from './chart-code.js';
import { synthesizeEffectCode } from './effect-code.js';
import { sanitizeJsSource, validateSceneJs } from './runtime.js';

/**
 * Core contract:
 * 大纲 → 按镜逐个请求 HTML/CSS/JS（避免一次吐出整片超长代码）。
 * JS/JSON 校验失败 → 打回模型重试；失败直接抛错，【无】本地离线兜底。
 */

const MAX_MODEL_ATTEMPTS = 3;

/**
 * Generate character HTML/CSS/JS with optional scene-neighbor costume continuity.
 */
export async function runCharacterDirector({
  project,
  characterId,
  prompt,
  settings,
  provider,
  onStream,
}) {
  const ch = project.nodes.find((n) => n.id === characterId && n.type === 'character');
  if (!ch) throw new Error('人物节点不存在');

  const continuity = buildCharacterContinuity(project, characterId);
  const intent = prompt || ch.props.prompt || ch.props.appearance || ch.props.title || '写实行人';
  const motion = ch.props.motion || 'walk';

  const got = await requestModelJson({
    system: SYSTEM_CHARACTER,
    user: buildCharacterUserMessage({ prompt: intent, motion, continuity }),
    settings,
    provider,
    onStream,
    validate: (raw) => validateSingleShotPayload(raw, '人物'),
  });
  const shot = got.value;
  applyCharacterShot(ch, shot, intent);
  ch._charSetupDone = false;
  touch(project);
  return { project, character: ch, meta: { fallback: null, continuity, repairs: got.repairs } };
}

function buildCharacterContinuity(project, characterId) {
  const sceneId =
    findAttachedSceneId(project, characterId) ||
    project.nodes.find((n) => n.type === 'scene')?.id;
  if (!sceneId) {
    const ai = project.nodes.find((n) => n.type === 'ai');
    return {
      filmPrompt: ai?.props?.prompt || project.name || '',
      paletteHint: '与成片风格一致',
      prevCharacter: '',
      nextCharacter: '',
    };
  }
  const continuity = buildContinuityContext(project, sceneId);
  return {
    filmPrompt: continuity.filmPrompt,
    paletteHint: continuity.paletteHint,
    prevCharacter: continuity.prev?.character || '',
    nextCharacter: continuity.next?.character || '',
  };
}

function findAttachedSceneId(project, nodeId) {
  const e = project.edges.find(
    (ed) =>
      ed.kind === 'attach' &&
      (ed.from === nodeId || ed.to === nodeId),
  );
  if (!e) return null;
  const other = e.from === nodeId ? e.to : e.from;
  const n = project.nodes.find((x) => x.id === other);
  return n?.type === 'scene' ? n.id : null;
}

function applyCharacterShot(ch, shot, intent) {
  const p = ch.props;
  p.title = shot.title || p.title || '人物';
  p.appearance = shot.appearance || intent || '';
  p.prompt = intent;
  p.motion = shot.motion || p.motion || 'walk';
  p.look = shot.look || p.look || 'default';
  p.coatColor = shot.coatColor || p.coatColor;
  p.skinColor = shot.skinColor || p.skinColor;
  p.hairColor = shot.hairColor || p.hairColor;
  p.umbrella = !!shot.umbrella || p.look === 'umbrella';
  p.html = shot.html || p.html;
  p.css = shot.css != null ? shot.css : p.css;
  p.js = shot.js || p.js;
  if (shot.layout) p.layout = shot.layout;
}

/**
 * Generate chart HTML/CSS/JS.
 */
export async function runChartDirector({ project, chartId, prompt, settings, provider, onStream }) {
  return runOverlayCodeDirector({
    project,
    nodeId: chartId,
    type: 'chart',
    prompt,
    settings,
    provider,
    onStream,
    system: SYSTEM_CHART,
    buildUser: buildChartUserMessage,
    synthesize: synthesizeChartCode,
    defaultMotion: 'grow',
    apply: applyChartShot,
  });
}

/**
 * Generate effect HTML/CSS/JS.
 */
export async function runEffectDirector({ project, effectId, prompt, settings, provider, onStream }) {
  return runOverlayCodeDirector({
    project,
    nodeId: effectId,
    type: 'effect',
    prompt,
    settings,
    provider,
    onStream,
    system: SYSTEM_EFFECT,
    buildUser: buildEffectUserMessage,
    synthesize: synthesizeEffectCode,
    defaultMotion: 'particles',
    apply: applyEffectShot,
  });
}

async function runOverlayCodeDirector({
  project,
  nodeId,
  type,
  prompt,
  settings,
  provider,
  onStream,
  system,
  buildUser,
  synthesize,
  defaultMotion,
  apply,
}) {
  const node = project.nodes.find((n) => n.id === nodeId && n.type === type);
  if (!node) throw new Error(type + ' 节点不存在');

  const continuity = buildCharacterContinuity(project, nodeId);
  const intent = prompt || node.props.prompt || node.props.appearance || node.props.title || type;
  const motion = node.props.motion || node.props.effect || defaultMotion;

  const got = await requestModelJson({
    system,
    user: buildUser({ prompt: intent, motion, continuity }),
    settings,
    provider,
    onStream,
    validate: (raw) => validateSingleShotPayload(raw, type),
  });
  apply(node, got.value, intent);
  node._codeSetupDone = false;
  touch(project);
  return { project, node, meta: { fallback: null, continuity, repairs: got.repairs } };
}

function applyChartShot(node, shot, intent) {
  const p = node.props;
  p.title = shot.title || p.title || '图表';
  p.appearance = shot.appearance || intent || '';
  p.prompt = intent;
  p.motion = shot.motion || p.motion || 'grow';
  p.barColor = shot.barColor || p.barColor || '#c45c26';
  if (Array.isArray(shot.values) && shot.values.length) p.values = shot.values;
  p.html = shot.html || p.html;
  p.css = shot.css != null ? shot.css : p.css;
  p.js = shot.js || p.js;
  if (shot.layout) p.layout = shot.layout;
}

function applyEffectShot(node, shot, intent) {
  const p = node.props;
  p.title = shot.title || p.title || '特效';
  p.appearance = shot.appearance || intent || '';
  p.prompt = intent;
  p.motion = shot.motion || shot.effect || p.motion || 'particles';
  p.effect = p.motion;
  p.html = shot.html || p.html;
  p.css = shot.css != null ? shot.css : p.css;
  p.js = shot.js || p.js;
  if (shot.layout) p.layout = shot.layout;
}

/**
 * Generate / regenerate a single scene with sequence-neighbor continuity context.
 */
export async function runSceneDirector({
  project,
  sceneId,
  prompt,
  settings,
  provider,
  onStream,
}) {
  const scene = project.nodes.find((n) => n.id === sceneId && n.type === 'scene');
  if (!scene) throw new Error('分镜不存在');

  const continuity = buildContinuityContext(project, sceneId);
  const duration = Number(scene.props.duration) || 4;
  const intent =
    prompt ||
    scene.props.prompt ||
    scene.props.text ||
    scene.props.title ||
    continuity.filmPrompt ||
    '连贯写实分镜';

  const got = await requestModelJson({
    system: SYSTEM_SCENE,
    user: buildSceneUserMessage({ prompt: intent, duration, continuity }),
    settings,
    provider,
    onStream,
    validate: (raw) => validateSingleShotPayload(raw, '分镜'),
  });
  const shot = got.value;
  const repairs = got.repairs;

  applyShotToScene(scene, shot, intent);
  // Replace prior attaches for this scene, then wire AI / heuristic attachments
  stripSceneAttachments(project, scene.id);
  const attachCount = wireSceneAttachments(
    project,
    scene,
    shot.attachments,
    scene.x,
    scene.y,
    { fillIfEmpty: true },
  );
  project.settings.renderMode = 'model-code';
  touch(project);
  return {
    project,
    scene,
    meta: {
      fallback: null,
      repairs,
      attachCount,
      continuity: {
        index: continuity.index,
        total: continuity.total,
        hasPrev: !!continuity.prev,
        hasNext: !!continuity.next,
      },
    },
  };
}

/** Ordered scenes + prev/next briefs for continuity injection. */
export function buildContinuityContext(project, sceneId) {
  const order = orderedScenes(project);
  const index = order.findIndex((s) => s.id === sceneId);
  const current = index >= 0 ? order[index] : project.nodes.find((n) => n.id === sceneId);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  const ai = project.nodes.find((n) => n.type === 'ai');
  const filmPrompt = ai?.props?.prompt || project.name || '';

  const paletteBits = [prev, current, next]
    .filter(Boolean)
    .flatMap((s) => [s.props.style, s.props.lighting, s.props.post, s.props.environment])
    .filter(Boolean);
  const paletteHint = paletteBits.length
    ? paletteBits.slice(0, 6).join(' · ')
    : '与相邻镜保持同一色温、材质与天气语言';

  return {
    projectName: project.name || '',
    filmPrompt,
    paletteHint,
    index: index >= 0 ? index + 1 : 1,
    total: Math.max(order.length, 1),
    prev: shotBrief(prev),
    current: shotBrief(current),
    next: shotBrief(next),
  };
}

function orderedScenes(project) {
  const scenes = project.nodes.filter((n) => n.type === 'scene');
  const seq = project.edges.filter((e) => e.kind === 'sequence');
  const ids = new Set(scenes.map((s) => s.id));
  const incoming = new Map([...ids].map((id) => [id, 0]));
  const outs = new Map([...ids].map((id) => [id, []]));
  for (const e of seq) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    outs.get(e.from).push(e.to);
  }
  const q = [...ids].filter((id) => (incoming.get(id) || 0) === 0);
  const ordered = [];
  while (q.length) {
    const id = q.shift();
    ordered.push(id);
    for (const nxt of outs.get(id) || []) {
      incoming.set(nxt, incoming.get(nxt) - 1);
      if (incoming.get(nxt) === 0) q.push(nxt);
    }
  }
  for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
  return ordered.map((id) => scenes.find((s) => s.id === id)).filter(Boolean);
}

function shotBrief(scene) {
  if (!scene) return null;
  const p = scene.props || {};
  return {
    title: p.title || '',
    duration: Number(p.duration) || 3,
    text: p.text || '',
    style: p.style || '',
    sceneBrief: p.sceneBrief || '',
    character: p.character || '',
    environment: p.environment || '',
    camera: p.camera || '',
    lighting: p.lighting || '',
    effects: p.effects || '',
    post: p.post || '',
    hasCode: !!(p.js && validateSceneJs(p.js).ok),
  };
}

function applyShotToScene(scene, shot, intent) {
  scene.props.title = shot.title || scene.props.title || 'Scene';
  scene.props.duration = Number(shot.duration) || scene.props.duration || 4;
  scene.props.text = shot.text ?? scene.props.text ?? '';
  scene.props.html = shot.html || '<div class="layer"></div>';
  scene.props.css = shot.css != null ? shot.css : '.layer{position:absolute;inset:0}';
  scene.props.js = shot.js || '';
  scene.props.style = shot.style || '';
  scene.props.sceneBrief = shot.scene || shot.sceneBrief || '';
  scene.props.character = shot.character || '';
  scene.props.environment = shot.environment || '';
  scene.props.camera = shot.camera || '';
  scene.props.lighting = shot.lighting || '';
  scene.props.effects = shot.effects || '';
  scene.props.post = shot.post || '';
  scene.props.prompt = intent || scene.props.prompt || '';
}

export async function runDirector({
  prompt,
  duration,
  settings,
  provider,
  replace,
  currentProject,
  onStream,
}) {
  // —— Phase 1: outline only (no code) ——
  onStream?.({ type: 'status', message: '第 1 步：生成分镜大纲（无代码）…' });
  const outlineGot = await requestModelJson({
    system: SYSTEM_OUTLINE,
    user: buildDirectorUserMessage(prompt, duration),
    settings,
    provider,
    onStream,
    validate: (raw) => validateOutlinePayload(raw, prompt, duration),
  });
  const outline = outlineGot.value;
  let repairs = outlineGot.repairs;

  const project = replace ? createEmptyProject(outline.name || currentProject.name) : structuredClone(currentProject);
  if (replace) {
    project.nodes = [];
    project.edges = [];
  }
  project.settings.duration = Number(outline.duration) || duration;
  project.name = outline.name || project.name;
  project.settings.renderMode = 'model-code';
  project.settings.palette = outline.palette || '';

  const briefs = outline.scenes;
  const total = briefs.length;
  let x = 80;
  let y = 120;
  let prevScene = null;
  let attachCount = 0;
  const sceneNodes = [];

  // Create empty scene shells from outline first (for continuity graph)
  for (let i = 0; i < total; i++) {
    const s = briefs[i];
    const scene = createNode('scene', x, y);
    scene.props.title = s.title || `镜头 ${i + 1}`;
    scene.props.duration = Number(s.duration) || 3;
    scene.props.text = s.text || '';
    scene.props.style = s.style || '';
    scene.props.sceneBrief = s.scene || '';
    scene.props.character = s.character || '';
    scene.props.environment = s.environment || '';
    scene.props.camera = s.camera || '';
    scene.props.lighting = s.lighting || '';
    scene.props.effects = s.effects || '';
    scene.props.post = s.post || '';
    scene.props.prompt = prompt;
    scene.props.html = '<div class="layer"></div>';
    scene.props.css = '.layer{position:absolute;inset:0}';
    scene.props.js = '';
    project.nodes.push(scene);
    if (prevScene) project.edges.push(createEdge(prevScene.id, scene.id, 'sequence'));
    prevScene = scene;
    sceneNodes.push(scene);
    x += 280;
    if (x > 1200) {
      x = 80;
      y += 420;
    }
  }

  // —— Phase 2: generate code one shot at a time ——
  for (let i = 0; i < total; i++) {
    const scene = sceneNodes[i];
    const brief = briefs[i];
    const dur = Number(brief.duration) || Number(scene.props.duration) || 4;
    onStream?.({
      type: 'status',
      message: `第 2 步：生成第 ${i + 1}/${total} 镜代码「${brief.title || scene.props.title}」…`,
    });
    onStream?.({ type: 'delta', text: `\n\n—— 第 ${i + 1}/${total} 镜 ——\n` });

    const shotGot = await requestModelJson({
      system: SYSTEM_SCENE,
      user: buildDirectorShotUserMessage({
        prompt,
        duration: dur,
        outline,
        shotBrief: briefToContinuityBrief(brief, dur),
        index: i + 1,
        total,
        prevBrief: i > 0 ? briefToContinuityBrief(briefs[i - 1], briefs[i - 1].duration) : null,
        nextBrief: i < total - 1 ? briefToContinuityBrief(briefs[i + 1], briefs[i + 1].duration) : null,
      }),
      settings,
      provider,
      onStream,
      validate: (raw) => validateSingleShotPayload(raw, `第${i + 1}镜`),
    });
    repairs += shotGot.repairs;
    const shot = shotGot.value;
    applyShotToScene(scene, shot, prompt);
    // Prefer outline attachments if shot omitted them
    const atts = shot.attachments?.length ? shot.attachments : brief.attachments;
    stripSceneAttachments(project, scene.id);
    attachCount += wireSceneAttachments(project, scene, atts, scene.x, scene.y, {
      fillIfEmpty: true,
    });
  }

  if (!project.nodes.some((n) => n.type === 'ai')) {
    const ai = createNode('ai', 80, 40);
    ai.props.prompt = prompt;
    ai.props.provider = provider || 'auto';
    ai.props.title = '代码导演';
    project.nodes.push(ai);
  }

  onStream?.({ type: 'status', message: `全部 ${total} 镜代码已生成` });
  touch(project);
  return {
    project,
    meta: {
      fallback: null,
      repairs,
      sceneCount: total,
      attachCount,
      renderMode: 'model-code',
      mode: 'outline-then-shots',
    },
  };
}

function briefToContinuityBrief(s, duration) {
  if (!s) return null;
  return {
    title: s.title || '',
    duration: Number(duration ?? s.duration) || 3,
    text: s.text || '',
    style: s.style || '',
    sceneBrief: s.scene || s.sceneBrief || '',
    character: s.character || '',
    environment: s.environment || '',
    camera: s.camera || '',
    lighting: s.lighting || '',
    effects: s.effects || '',
    post: s.post || '',
    hasCode: false,
  };
}

/**
 * Multi-turn: on JSON/js compile failure, bounce reason to model and re-receive.
 * Exhausted attempts → throw (no silent synthesizer).
 * onStream?: ({ type:'delta'|'status'|'attempt', text?, message?, attempt?, max?, repair? }) => void
 */
async function requestModelJson({ system, user, settings, provider, validate, onStream }) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let lastError = 'unknown';

  for (let attempt = 0; attempt < MAX_MODEL_ATTEMPTS; attempt++) {
    onStream?.({
      type: 'attempt',
      attempt: attempt + 1,
      max: MAX_MODEL_ATTEMPTS,
      repair: attempt > 0,
    });
    onStream?.({
      type: 'status',
      message: attempt === 0 ? '流式接收模型输出…' : `打回修正中（第 ${attempt + 1} 次）…`,
    });

    const content = await chatCompletion({
      provider,
      settings,
      messages,
      onDelta: (piece) => onStream?.({ type: 'delta', text: piece }),
    });
    messages.push({ role: 'assistant', content });

    let raw;
    try {
      onStream?.({ type: 'status', message: '校验 JSON / JS…' });
      raw = JSON.parse(stripFence(content));
    } catch (e) {
      lastError = `JSON 解析失败: ${e.message}`;
      onStream?.({ type: 'status', message: lastError });
      messages.push({
        role: 'user',
        content: buildJsonRepairMessage(lastError),
      });
      continue;
    }

    const checked = validate(raw);
    if (checked.ok) {
      onStream?.({ type: 'status', message: '校验通过' });
      return { value: checked.value, attempts: attempt + 1, repairs: attempt };
    }

    lastError = checked.error || 'js 无法编译';
    onStream?.({ type: 'status', message: `校验失败，打回: ${lastError}` });
    messages.push({
      role: 'user',
      content: checked.repairMessage || buildCompileRepairMessage(lastError),
    });
  }

  const err = new Error(`模型输出无法通过校验（已打回 ${MAX_MODEL_ATTEMPTS - 1} 次）: ${lastError}`);
  err.code = 'JS_COMPILE';
  throw err;
}

function buildJsonRepairMessage(error) {
  return `【打回重发】${error}
请只输出一个合法 JSON 对象（可无 markdown 围栏），不要解释文字。
注意：js 字段内的双引号必须转义为 \\"，不要用弯引号。`;
}

function buildCompileRepairMessage(error, details = '') {
  return `【编译打回 — 请重发完整 JSON】
宿主用 Function("return (" + js + ")")() 编译。上次 js 未通过校验。

失败原因：
${error}
${details ? '\n' + details + '\n' : ''}
修正要求：
1. js 必须是单个表达式 IIFE：(function(){ return { setup:function(api){}, draw:function(api){} }; })()
2. 禁止顶层 const/let/var/import/export、禁止 \`\`\` 代码围栏
3. 返回对象必须含可调用的 draw 函数
4. JSON 内双引号转义为 \\"
请输出修正后的【完整】JSON，不要只贴 js 片段。`;
}

/** @returns {{ ok:true, value } | { ok:false, error, repairMessage }} */
function validateSingleShotPayload(raw, label) {
  let shot = raw;
  if (raw?.scenes && Array.isArray(raw.scenes) && raw.scenes[0]) shot = raw.scenes[0];
  if (!shot || typeof shot !== 'object') {
    return {
      ok: false,
      error: `${label} JSON 缺少镜头对象`,
      repairMessage: buildCompileRepairMessage(`${label} JSON 缺少镜头对象`),
    };
  }

  const filled = withDefaultShell(shot);
  const jsCheck = inspectShotJs(filled.js);
  if (!jsCheck.ok) {
    const preview = String(filled.js || '').slice(0, 180);
    return {
      ok: false,
      error: `${label} JS: ${jsCheck.error}`,
      repairMessage: buildCompileRepairMessage(`${label} JS: ${jsCheck.error}`, `问题 js 片段预览：\n${preview}`),
    };
  }

  const attachments = normalizeAttachments(filled.attachments);
  return { ok: true, value: { ...filled, js: jsCheck.js, attachments } };
}

/** Outline phase: briefs + attachments only — reject any code fields. */
function validateOutlinePayload(raw, prompt, duration) {
  if (!raw || !Array.isArray(raw.scenes) || !raw.scenes.length) {
    return {
      ok: false,
      error: '缺少 scenes 数组',
      repairMessage: `【打回】缺少非空 scenes。请只输出大纲 JSON（name/duration/palette/scenes），【禁止】html/css/js。`,
    };
  }
  if (raw.scenes.length < 3 || raw.scenes.length > 6) {
    return {
      ok: false,
      error: `镜头数 ${raw.scenes.length} 不在 3~6`,
      repairMessage: `【打回】请输出 3~6 个分镜大纲，不要代码。当前 ${raw.scenes.length} 镜。`,
    };
  }

  const codeLeak = [];
  const scenes = raw.scenes.map((s, i) => {
    if (!s || typeof s !== 'object') {
      codeLeak.push(`第${i + 1}镜不是对象`);
      return s;
    }
    if (s.js || s.html || s.css) {
      codeLeak.push(`第${i + 1}镜含 html/css/js（大纲阶段禁止）`);
    }
    const { js, html, css, ...rest } = s;
    return {
      ...rest,
      title: rest.title || `镜头 ${i + 1}`,
      duration: Number(rest.duration) || 3,
      attachments: normalizeAttachments(rest.attachments),
    };
  });

  if (codeLeak.length) {
    return {
      ok: false,
      error: codeLeak[0],
      repairMessage: `【打回】大纲阶段禁止代码：\n${codeLeak.join('\n')}\n请重发纯大纲 JSON（可保留 attachments 描述，但不要 html/css/js）。`,
    };
  }

  return {
    ok: true,
    value: {
      name: raw.name || prompt?.slice(0, 24) || 'MotionCraft',
      duration: Number(raw.duration) || duration,
      palette: raw.palette || '',
      scenes,
    },
  };
}

const ATTACH_TYPES = new Set([
  'camera',
  'effect',
  'narration',
  'character',
  'text',
  'chart',
  'audio',
]);

function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const type = String(a.type || '').toLowerCase();
    if (!ATTACH_TYPES.has(type)) continue;
    out.push({ ...a, type });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Attach helper nodes for cinematic quality. If model omitted attachments and
 * fillIfEmpty, invent a sensible minimal set (camera + optional FX/VO/character).
 */
function wireSceneAttachments(project, scene, attachments, originX, originY, opts = {}) {
  let list = normalizeAttachments(attachments);
  if (!list.length && opts.fillIfEmpty) {
    list = suggestDefaultAttachments(scene);
  }
  if (!list.length) return 0;

  let count = 0;
  list.forEach((att, i) => {
    const node = createNode(att.type, originX + (i % 4) * 170, originY + 210 + Math.floor(i / 4) * 110);
    applyAttachmentProps(node, att, scene);
    enrichCodeAttachment(node, att);
    project.nodes.push(node);
    project.edges.push(createEdge(node.id, scene.id, 'attach'));
    count += 1;
  });
  return count;
}

function stripSceneAttachments(project, sceneId) {
  const attachEdges = project.edges.filter(
    (e) => e.kind === 'attach' && (e.to === sceneId || e.from === sceneId),
  );
  const childIds = new Set();
  for (const e of attachEdges) {
    childIds.add(e.from === sceneId ? e.to : e.from);
  }
  // Keep the scene itself; drop children that are only attached here
  project.edges = project.edges.filter((e) => !attachEdges.includes(e));
  project.nodes = project.nodes.filter((n) => {
    if (!childIds.has(n.id)) return true;
    if (n.type === 'scene' || n.type === 'ai') return true;
    return false;
  });
}

function suggestDefaultAttachments(scene) {
  const p = scene?.props || scene || {};
  const brief = [p.camera, p.effects, p.environment, p.character, p.sceneBrief, p.scene, p.style, p.text]
    .filter(Boolean)
    .join(' ');
  const atts = [];

  atts.push({
    type: 'camera',
    title: '运镜',
    move: inferCameraMove(p.camera || brief),
    intensity: 1.05,
    letterbox: true,
  });

  const fxMotion = inferEffectMotion(p.effects || brief);
  if (fxMotion) {
    atts.push({
      type: 'effect',
      title: fxMotion === 'rain' ? '雨效' : fxMotion === 'glow' ? '光晕' : '气氛粒子',
      motion: fxMotion,
      effect: fxMotion,
      appearance: p.effects || brief.slice(0, 40),
      prompt: p.effects || fxMotion,
    });
  }

  const charBrief = String(p.character || '').trim();
  if (charBrief && charBrief !== '无') {
    const preferLeft = /左|left/i.test(charBrief + brief);
    atts.push({
      type: 'character',
      title: '人物',
      motion: /跑|run/i.test(charBrief) ? 'run' : /挥|wave/i.test(charBrief) ? 'wave' : 'walk',
      look: /伞|umbrella/i.test(charBrief) ? 'umbrella' : 'default',
      appearance: charBrief,
      prompt: charBrief,
      umbrella: /伞|umbrella/i.test(charBrief),
      // Feet near street bottom, rule-of-thirds staging
      layout: preferLeft
        ? { x: 0.14, y: 0.36, w: 0.26, h: 0.54 }
        : { x: 0.54, y: 0.36, w: 0.26, h: 0.54 },
    });
  }

  const caption = String(p.text || '').trim();
  if (caption) {
    atts.push({
      type: 'narration',
      speaker: 'VO',
      title: '旁白',
      text: poeticNarrationFromCaption(caption),
      animation: 'type',
    });
  }

  return normalizeAttachments(atts);
}

function inferCameraMove(hint) {
  const s = String(hint || '');
  if (/手持|handheld/i.test(s)) return 'handheld';
  if (/推|zoom\s*in|靠近/i.test(s)) return 'zoom';
  if (/拉|zoom\s*out|远离/i.test(s)) return 'zoomOut';
  if (/摇|tilt/i.test(s)) return 'tilt';
  if (/定|static|静止/i.test(s)) return 'static';
  if (/移|跟|pan|横移/i.test(s)) return 'pan';
  return 'handheld';
}

function inferEffectMotion(hint) {
  const s = String(hint || '');
  if (!s || s === '无') return null;
  if (/雨|rain/i.test(s)) return 'rain';
  if (/火花|spark|电/i.test(s)) return 'spark';
  if (/光晕|bloom|glow|霓虹/i.test(s)) return 'glow';
  if (/尘|雾|粒子|蒸汽|雪|flake|particle/i.test(s)) return 'particles';
  if (/淡|fade/i.test(s)) return 'fade';
  // atmospheric language → light particles
  if (/夜|街|空气|氛围|体积光/i.test(s)) return 'particles';
  return 'particles';
}

function poeticNarrationFromCaption(caption) {
  const c = caption.replace(/\s+/g, ' ').trim();
  if (c.length < 4) return '光影在这一刻慢慢成形。';
  // Keep different from caption to avoid skip / double-read
  if (c.length <= 18) return `旁白：${c}——画面之外，还有未说完的句子。`;
  return `${c.slice(0, Math.min(22, c.length))}……`;
}

function applyAttachmentProps(node, att, scene) {
  const p = node.props;
  const dur = Number(scene.props?.duration) || Number(att.duration) || p.duration || 3;
  p.duration = dur;
  if (att.title) p.title = att.title;
  if (att.prompt) p.prompt = att.prompt;
  if (att.appearance) p.appearance = att.appearance;
  if (att.layout && typeof att.layout === 'object') p.layout = { ...p.layout, ...att.layout };

  switch (node.type) {
    case 'camera':
      p.move = att.move || inferCameraMove(scene.props?.camera) || p.move || 'pan';
      p.intensity = Number(att.intensity) || p.intensity || 1;
      p.letterbox = att.letterbox != null ? !!att.letterbox : true;
      break;
    case 'effect':
      p.motion = att.motion || att.effect || p.motion || 'particles';
      p.effect = att.effect || att.motion || p.effect || p.motion;
      p.appearance = att.appearance || p.appearance || '';
      p.prompt = att.prompt || att.appearance || p.prompt || '';
      if (!p.layout) p.layout = { x: 0, y: 0, w: 1, h: 1 };
      break;
    case 'narration':
      p.speaker = att.speaker || p.speaker || 'VO';
      p.text = att.text || att.narration || p.text;
      p.animation = att.animation || p.animation || 'type';
      p.title = att.title || p.speaker || '旁白';
      break;
    case 'text':
      p.text = att.text || p.text;
      p.animation = att.animation || p.animation || 'fade';
      break;
    case 'character':
      p.motion = att.motion || p.motion || 'walk';
      p.look = att.look || p.look || 'default';
      p.umbrella = !!att.umbrella || p.look === 'umbrella';
      if (att.coatColor) p.coatColor = att.coatColor;
      if (att.skinColor) p.skinColor = att.skinColor;
      if (att.hairColor) p.hairColor = att.hairColor;
      p.appearance = att.appearance || p.appearance || '';
      p.prompt = att.prompt || att.appearance || p.prompt || '';
      if (!att.layout) {
        p.layout = { x: 0.54, y: 0.36, w: 0.26, h: 0.54 };
      }
      break;
    case 'chart':
      p.motion = att.motion || p.motion || 'grow';
      if (Array.isArray(att.values) && att.values.length) p.values = att.values;
      if (att.barColor) p.barColor = att.barColor;
      p.appearance = att.appearance || p.appearance || '';
      p.prompt = att.prompt || p.prompt || '';
      break;
    case 'audio':
      p.title = att.title || p.title || '氛围';
      p.volume = Number(att.volume) || p.volume || 0.6;
      p.fadeIn = Number(att.fadeIn) || p.fadeIn || 0.4;
      p.fadeOut = Number(att.fadeOut) || p.fadeOut || 0.4;
      break;
    default:
      break;
  }
}

/** Prefer model js when valid; else synthesizer tuned by prompt/motion. */
function enrichCodeAttachment(node, att) {
  if (!['character', 'effect', 'chart'].includes(node.type)) {
    if (att.js && validateSceneJs(att.js).ok) {
      node.props.js = sanitizeJsSource(att.js);
      if (att.html) node.props.html = att.html;
      if (att.css != null) node.props.css = att.css;
    }
    return;
  }

  const cleaned = sanitizeJsSource(att.js);
  if (cleaned && validateSceneJs(cleaned).ok) {
    node.props.js = cleaned;
    if (att.html) node.props.html = att.html;
    if (att.css != null) node.props.css = att.css;
    return;
  }

  const intent = att.prompt || att.appearance || node.props.title || node.type;
  if (node.type === 'character') {
    const syn = synthesizeCharacterCode(intent, node.props.motion || 'walk');
    node.props.html = syn.html || node.props.html;
    node.props.css = syn.css != null ? syn.css : node.props.css;
    node.props.js = syn.js || node.props.js;
    if (syn.look) node.props.look = syn.look;
  } else if (node.type === 'effect') {
    const syn = synthesizeEffectCode(intent, node.props.motion || node.props.effect || 'particles');
    node.props.html = syn.html || node.props.html;
    node.props.css = syn.css != null ? syn.css : node.props.css;
    node.props.js = syn.js || node.props.js;
  } else if (node.type === 'chart') {
    const syn = synthesizeChartCode(intent, node.props.motion || 'grow');
    node.props.html = syn.html || node.props.html;
    node.props.css = syn.css != null ? syn.css : node.props.css;
    node.props.js = syn.js || node.props.js;
  }
}

function withDefaultShell(shot) {
  const s = shot && typeof shot === 'object' ? { ...shot } : {};
  if (s.html == null || s.html === '') s.html = '<div class="layer"></div>';
  if (s.css == null) s.css = '.layer{position:absolute;inset:0}';
  return s;
}

/** Dry-check js only — never swaps in synthesizer. */
function inspectShotJs(js) {
  const cleaned = sanitizeJsSource(js);
  const check = validateSceneJs(cleaned);
  if (!check.ok) return { ok: false, error: check.error || 'invalid js', js: cleaned };
  return { ok: true, js: cleaned };
}

function stripFence(s) {
  return String(s)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}
