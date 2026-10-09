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
import { sanitizeJsSource, validateSceneJs, diagnoseJsFailure } from './runtime.js';

/**
 * Core contract:
 * 大纲 → 按镜逐个请求 HTML/CSS/JS（避免一次吐出整片超长代码）。
 * JS/JSON 校验失败 → 打回模型重试；失败直接抛错，【无】本地离线兜底。
 */

/** Initial try + bounce retries; keep bouncing until pass or this cap (user asked for 5). */
const MAX_MODEL_ATTEMPTS = 5;

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
  onProject,
}) {
  const ch = project.nodes.find((n) => n.id === characterId && n.type === 'character');
  if (!ch) throw new Error('人物节点不存在');

  const continuity = buildCharacterContinuity(project, characterId);
  const intent = prompt || ch.props.prompt || ch.props.appearance || ch.props.title || '写实行人';
  const motion = ch.props.motion || 'walk';

  markGenerating(ch, true);
  notifyProject(onProject, project, { phase: 'start', nodeId: characterId, kind: 'character' });
  try {
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
    markGenerating(ch, false);
    touch(project);
    notifyProject(onProject, project, { phase: 'done', nodeId: characterId, kind: 'character' });
    return { project, character: ch, meta: { fallback: null, continuity, repairs: got.repairs } };
  } catch (err) {
    markGenerating(ch, false);
    notifyProject(onProject, project, { phase: 'error', nodeId: characterId, kind: 'character' });
    throw err;
  }
}

function buildCharacterContinuity(project, characterId) {
  return buildOverlayContinuity(project, characterId);
}

/**
 * Continuity for overlay nodes (character / effect / chart):
 * attached scene brief + siblings on that scene + sequence neighbors + film theme.
 */
export function buildOverlayContinuity(project, nodeId) {
  const node = project.nodes.find((n) => n.id === nodeId);
  const ai = project.nodes.find((n) => n.type === 'ai');
  const filmPrompt = ai?.props?.prompt || project.name || '';

  const sceneId =
    findAttachedSceneId(project, nodeId) ||
    project.nodes.find((n) => n.type === 'scene')?.id;

  if (!sceneId) {
    return {
      filmPrompt,
      projectName: project.name || '',
      paletteHint: '与成片风格一致',
      sceneBrief: '',
      attachedScene: null,
      siblings: '',
      prevCharacter: '',
      nextCharacter: '',
      prev: null,
      next: null,
      selfType: node?.type || '',
      selfTitle: node?.props?.title || '',
    };
  }

  const continuity = buildContinuityContext(project, sceneId);
  const scene = project.nodes.find((n) => n.id === sceneId);
  const siblings = listAttachedNodes(project, sceneId).filter((n) => n.id !== nodeId);

  return {
    filmPrompt: continuity.filmPrompt,
    projectName: continuity.projectName,
    paletteHint: continuity.paletteHint,
    index: continuity.index,
    total: continuity.total,
    prev: continuity.prev,
    next: continuity.next,
    attachedScene: continuity.current,
    sceneBrief: formatAttachedSceneBlock(continuity.current),
    siblings: formatSiblingNodes(siblings),
    prevCharacter: continuity.prev?.character || '',
    nextCharacter: continuity.next?.character || '',
    selfType: node?.type || '',
    selfTitle: node?.props?.title || node?.props?.appearance || '',
    hostSceneTitle: scene?.props?.title || '',
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

function listAttachedNodes(project, sceneId) {
  const ids = new Set();
  for (const e of project.edges) {
    if (e.kind !== 'attach') continue;
    if (e.from === sceneId) ids.add(e.to);
    if (e.to === sceneId) ids.add(e.from);
  }
  return [...ids]
    .map((id) => project.nodes.find((n) => n.id === id))
    .filter((n) => n && n.type !== 'scene');
}

function formatAttachedSceneBlock(shot) {
  if (!shot) return '（未连接分镜）';
  return [
    `标题:${shot.title || ''}`,
    `场景:${shot.sceneBrief || ''}`,
    `人物:${shot.character || ''}`,
    `环境:${shot.environment || ''}`,
    `运镜:${shot.camera || ''}`,
    `光:${shot.lighting || ''}`,
    `特效:${shot.effects || ''}`,
    `调色:${shot.post || shot.style || ''}`,
  ].join(' · ');
}

function formatSiblingNodes(nodes) {
  if (!nodes?.length) return '（同镜无其它挂载节点）';
  return nodes
    .map((n) => {
      const p = n.props || {};
      const bits = [
        n.type,
        p.title || '',
        p.motion || p.move || p.effect || '',
        p.appearance || p.text || p.prompt || '',
      ].filter(Boolean);
      return `- ${bits.join(' | ')}`;
    })
    .join('\n');
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
export async function runChartDirector({
  project,
  chartId,
  prompt,
  settings,
  provider,
  onStream,
  onProject,
}) {
  return runOverlayCodeDirector({
    project,
    nodeId: chartId,
    type: 'chart',
    prompt,
    settings,
    provider,
    onStream,
    onProject,
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
export async function runEffectDirector({
  project,
  effectId,
  prompt,
  settings,
  provider,
  onStream,
  onProject,
}) {
  return runOverlayCodeDirector({
    project,
    nodeId: effectId,
    type: 'effect',
    prompt,
    settings,
    provider,
    onStream,
    onProject,
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
  onProject,
  system,
  buildUser,
  synthesize,
  defaultMotion,
  apply,
}) {
  const node = project.nodes.find((n) => n.id === nodeId && n.type === type);
  if (!node) throw new Error(type + ' 节点不存在');

  const continuity = buildOverlayContinuity(project, nodeId);
  const intent =
    prompt ||
    node.props.prompt ||
    node.props.appearance ||
    node.props.title ||
    continuity.attachedScene?.effects ||
    continuity.filmPrompt ||
    type;
  const motion = node.props.motion || node.props.effect || defaultMotion;

  markGenerating(node, true);
  notifyProject(onProject, project, { phase: 'start', nodeId, kind: type });
  try {
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
    markGenerating(node, false);
    touch(project);
    notifyProject(onProject, project, { phase: 'done', nodeId, kind: type });
    return { project, node, meta: { fallback: null, continuity, repairs: got.repairs } };
  } catch (err) {
    markGenerating(node, false);
    notifyProject(onProject, project, { phase: 'error', nodeId, kind: type });
    throw err;
  }
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
  onProject,
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

  markGenerating(scene, true);
  notifyProject(onProject, project, { phase: 'start', nodeId: sceneId, kind: 'scene' });
  try {
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
    markGenerating(scene, false);
    project.settings.renderMode = 'model-code';
    touch(project);
    notifyProject(onProject, project, {
      phase: 'done',
      nodeId: sceneId,
      kind: 'scene',
      attachCount,
    });
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
          hasAttached: !!continuity.hasAttached,
        },
      },
    };
  } catch (err) {
    markGenerating(scene, false);
    notifyProject(onProject, project, { phase: 'error', nodeId: sceneId, kind: 'scene' });
    throw err;
  }
}

/** Ordered scenes + prev/next briefs + attached overlay briefs for continuity injection. */
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

  const attached = listAttachedNodes(project, sceneId);
  const attachedBrief = formatSiblingNodes(attached);

  return {
    projectName: project.name || '',
    filmPrompt,
    paletteHint,
    index: index >= 0 ? index + 1 : 1,
    total: Math.max(order.length, 1),
    prev: shotBrief(prev),
    current: shotBrief(current),
    next: shotBrief(next),
    attachedBrief,
    hasAttached: attached.length > 0,
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
  onProject,
}) {
  // —— Phase 1: outline only (no code) ——
  onStream?.({ type: 'status', message: '第 1 步：生成分镜大纲（无代码）…' });
  const outlineGot = await requestModelJson({
    system: SYSTEM_OUTLINE,
    user: buildDirectorUserMessage(prompt, duration, inferShotPlanHints(prompt, duration)),
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
    scene.props.genStatus = 'pending';
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

  if (!project.nodes.some((n) => n.type === 'ai')) {
    const ai = createNode('ai', 80, 40);
    ai.props.prompt = prompt;
    ai.props.provider = provider || 'auto';
    ai.props.title = '代码导演';
    ai.props.genStatus = 'generating';
    project.nodes.push(ai);
  }

  onStream?.({ type: 'status', message: `大纲就绪 · 画布已挂 ${total} 个分镜壳` });
  notifyProject(onProject, project, { phase: 'outline', sceneCount: total });

  // —— Phase 2: generate code one shot at a time ——
  try {
    for (let i = 0; i < total; i++) {
      const scene = sceneNodes[i];
      const brief = briefs[i];
      const dur = Number(brief.duration) || Number(scene.props.duration) || 4;
      markGenerating(scene, true);
      notifyProject(onProject, project, {
        phase: 'shot-start',
        index: i + 1,
        total,
        sceneId: scene.id,
      });
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
      markGenerating(scene, false);
      delete scene.props.genStatus;
      notifyProject(onProject, project, {
        phase: 'shot',
        index: i + 1,
        total,
        sceneId: scene.id,
        attachCount,
      });
    }
  } catch (err) {
    for (const s of sceneNodes) markGenerating(s, false);
    const aiFail = project.nodes.find((n) => n.type === 'ai');
    if (aiFail) markGenerating(aiFail, false);
    notifyProject(onProject, project, { phase: 'error', sceneCount: total });
    throw err;
  }

  const aiNode = project.nodes.find((n) => n.type === 'ai');
  if (aiNode) markGenerating(aiNode, false);

  onStream?.({ type: 'status', message: `全部 ${total} 镜代码已生成` });
  touch(project);
  notifyProject(onProject, project, { phase: 'done', sceneCount: total, attachCount });
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

function markGenerating(node, on) {
  if (!node?.props) return;
  if (on) node.props.genStatus = 'generating';
  else if (node.props.genStatus === 'generating' || node.props.genStatus === 'pending') {
    delete node.props.genStatus;
  }
}

function notifyProject(onProject, project, info) {
  if (!onProject) return;
  try {
    onProject(project, info || {});
  } catch (err) {
    console.warn('onProject failed', err);
  }
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
  let pendingRepairBrief = '';

  for (let attempt = 0; attempt < MAX_MODEL_ATTEMPTS; attempt++) {
    onStream?.({
      type: 'attempt',
      attempt: attempt + 1,
      max: MAX_MODEL_ATTEMPTS,
      repair: attempt > 0,
      repairBrief: attempt > 0 ? pendingRepairBrief : '',
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
      const diag = diagnoseJsonFailure(content, e);
      lastError = diag.summary;
      pendingRepairBrief = `错误类型：${diag.type}\n错在哪里：${diag.where}`;
      onStream?.({ type: 'status', message: lastError });
      const round = attempt + 1;
      messages.push({
        role: 'user',
        content:
          `【第 ${round}/${MAX_MODEL_ATTEMPTS} 次校验失败 — 必须重发】\n` +
          buildJsonRepairMessage(diag),
      });
      continue;
    }

    const checked = validate(raw);
    if (checked.ok) {
      onStream?.({ type: 'status', message: '校验通过' });
      return { value: checked.value, attempts: attempt + 1, repairs: attempt };
    }

    lastError = checked.error || 'js 无法编译';
    pendingRepairBrief = checked.repairBrief || lastError;
    onStream?.({ type: 'status', message: `校验失败，打回: ${lastError}` });
    const round = attempt + 1;
    const body = checked.repairMessage || buildCompileRepairMessage({ error: lastError });
    messages.push({
      role: 'user',
      content:
        `【第 ${round}/${MAX_MODEL_ATTEMPTS} 次校验失败 — 要求不对就整段重做，勿局部补丁】\n` + body,
    });
  }

  const err = new Error(
    `模型输出无法通过校验（已尝试 ${MAX_MODEL_ATTEMPTS} 次 / 打回 ${MAX_MODEL_ATTEMPTS - 1} 次）: ${lastError}`,
  );
  err.code = 'JS_COMPILE';
  throw err;
}

function diagnoseJsonFailure(content, err) {
  const text = String(content || '');
  const msg = err?.message || String(err);
  const posMatch = msg.match(/position\s+(\d+)/i) || msg.match(/at position\s+(\d+)/i);
  const pos = posMatch ? Number(posMatch[1]) : -1;
  let type = 'JSON 语法错误';
  let where = pos >= 0 ? `约字符位置 ${pos}` : '整段输出';
  let hint = '请只输出一个合法 JSON 对象；js 内双引号写成 \\"。';

  if (/Unexpected end|end of (JSON|data)/i.test(msg)) {
    type = 'JSON 被截断';
    where = '输出末尾（字符串或对象未闭合）';
    hint = '完整闭合所有 {} [] ""，js 字段勿半截结束。';
  } else if (/Unexpected token/i.test(msg) && /```/.test(text)) {
    type = '含 markdown 围栏或杂讯';
    where = '输出前后的 ``` 或解释文字';
    hint = '不要用 ```json 包裹；不要在 JSON 外写说明。';
  } else if (/Bad control character|Unexpected string|Expected/i.test(msg)) {
    type = '字符串转义错误';
    where = pos >= 0 ? `约字符位置 ${pos}（常见于 js 字段未转义的 "）` : '某字符串字段';
    hint = 'js/html/css 内每个 " 必须写成 \\"；换行用 \\n。';
  }

  const slice =
    pos >= 0
      ? text.slice(Math.max(0, pos - 40), Math.min(text.length, pos + 40))
      : text.slice(0, 120);

  return {
    type,
    where: slice ? `${where}\n上下文：…${slice}…` : where,
    hint,
    summary: `${type}: ${msg}`,
    error: msg,
  };
}

function buildJsonRepairMessage(diag) {
  const d = typeof diag === 'string' ? { type: 'JSON 解析失败', where: diag, hint: '', error: diag, summary: diag } : diag;
  return `【打回修正，重新生成 — JSON】
错误类型：${d.type}
错在哪里：${d.where}
引擎报错：${d.error || d.summary}
怎么改：${d.hint || '只输出合法 JSON；js 内双引号转义为 \\"；不要弯引号；不要解释文字。'}
请重发【完整】JSON 对象（可无 markdown 围栏）。`;
}

/**
 * @param {{ type?: string, where?: string, hint?: string, error?: string, snippet?: string, label?: string }} diag
 */
function buildCompileRepairMessage(diag = {}) {
  const type = diag.type || 'JS 校验失败';
  const where = diag.where || 'js 字段';
  const hint = diag.hint || '重写为单表达式 IIFE，末尾必须是 }; })()';
  const error = diag.error || type;
  const snippet = diag.snippet || '';
  const label = diag.label ? `${diag.label} · ` : '';

  return `【打回修正，重新生成 — JS 编译】
校验未通过，必须【整段重写】js 后再发完整 JSON（不要局部打补丁）。

${label}错误类型：${type}
错在哪里（请精确改这里）：
${where}
引擎报错：${error}
怎么改：${hint}

宿主编译：Function('"use strict"; return (' + js + ');')()
因此 js 必须是【单个表达式】，正确唯一收尾：
(function(){ return { setup:function(api){}, draw:function(api){} }; })()
注意：return 对象用 }; 结束，然后 })() —— 【禁止】末尾 )(); 【禁止】}});})()（对象 } 后多一个 )）
禁止：顶层 const/let/var、import/export、\`\`\` 围栏、Math.random()、requestAnimationFrame
若错误含 Math.random：整段 js 去掉 Math.random，改用
function seed(n){ var x=Math.sin(n*999)*10000; return x-Math.floor(x); }
粒子/雨/grain 用 seed(i) / seed(x*12.9+y*78.2)，禁止再出现字面量 Math.random。
若错误含 seed is not a function：删除 var/const seed=数字，改为上面的 function seed(n){...}。
若错误含 appendChild / not of type 'Node'：不要 root.appendChild(字符串)；setup 留空或只 appendChild(document.createElement(...))；画面只画 ctx。
注意：setup()/draw() 试跑失败属于【运行时】问题，不是 IIFE 括号语法问题——按引擎报错整段重写，勿只改收尾括号。
${snippet ? '\n问题代码摘录：\n' + snippet + '\n' : ''}
请输出修正后的【完整】JSON（含全新可编译的 js），不要解释。`;
}

/** @returns {{ ok:true, value } | { ok:false, error, repairMessage, repairBrief }} */
function validateSingleShotPayload(raw, label) {
  let shot = raw;
  if (raw?.scenes && Array.isArray(raw.scenes) && raw.scenes[0]) shot = raw.scenes[0];
  if (!shot || typeof shot !== 'object') {
    return {
      ok: false,
      error: `${label} JSON 缺少镜头对象`,
      repairBrief: `错误类型：结构缺失\n错在哪里：${label} 无镜头对象`,
      repairMessage: buildCompileRepairMessage({
        label,
        type: '结构缺失',
        where: '响应不是镜头对象（也无 scenes[0]）',
        hint: '输出单个镜头 JSON：{ id, title, duration, brief, html, css, js, attachments? }',
        error: `${label} JSON 缺少镜头对象`,
      }),
    };
  }

  const filled = withDefaultShell(shot);
  const jsCheck = inspectShotJs(filled.js);
  if (!jsCheck.ok) {
    const d = jsCheck.diagnosis || diagnoseJsFailure(filled.js, jsCheck.error);
    const pin = d.locate
      ? ` @${d.locate.line}:${d.locate.col}(偏移${d.locate.index})`
      : '';
    const whereOneLine = String(d.where || '')
      .split('\n')
      .filter(Boolean)
      .slice(0, 2)
      .join(' · ');
    return {
      ok: false,
      error: `${label} JS · ${d.type}: ${jsCheck.error}${pin}`,
      repairBrief: `错误类型：${d.type}${pin}\n错在哪里：${whereOneLine}`,
      repairMessage: buildCompileRepairMessage({
        label,
        type: d.type,
        where: d.where,
        hint: d.hint,
        error: jsCheck.error,
        snippet: d.snippet,
      }),
    };
  }

  const attachments = normalizeAttachments(filled.attachments);
  return { ok: true, value: { ...filled, js: jsCheck.js, attachments } };
}

/**
 * Read shot-count / duration intent from the user prompt.
 * Host UI duration is only a fallback when the prompt is silent.
 */
function inferShotPlanHints(prompt, hostDuration) {
  const text = String(prompt || '');
  let shotCount = null;
  const countRe =
    /(?:镜头(?:数|数量)|分镜(?:数|数量)|shots?|scenes?)\s*[=:：]?\s*(\d{1,2})|(?:共|一共|总计|总共)?\s*(\d{1,2})\s*(?:个)?(?:分镜|镜头|镜)(?!\s*头)|(\d{1,2})\s*(?:shots?|scenes?)\b/i;
  const cm = text.match(countRe);
  if (cm) {
    const n = Number(cm[1] || cm[2] || cm[3]);
    if (n >= 1 && n <= 48) shotCount = n;
  }

  let perShot = null;
  const perM =
    text.match(/每(?:镜|镜头|分镜)\s*(\d+(?:\.\d+)?)\s*秒/) ||
    text.match(/each\s+shot\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)\b/i);
  if (perM) {
    const v = Number(perM[1]);
    if (v > 0 && v <= 600) perShot = v;
  }

  let totalDuration = null;
  const totM =
    text.match(/(?:总(?:时长|时间)|成片时长|全片时长|视频时长)\s*[=:：]?\s*(\d+(?:\.\d+)?)\s*秒/) ||
    text.match(/(\d+(?:\.\d+)?)\s*秒\s*(?:成片|短片|视频|全片)/);
  if (totM) {
    const v = Number(totM[1]);
    if (v > 0 && v <= 600) totalDuration = v;
  }

  const host = Number(hostDuration);
  return {
    shotCount,
    perShot,
    totalDuration: totalDuration || (host > 0 ? host : null),
    hostDuration: host > 0 ? host : null,
    promptSpecifiesCount: shotCount != null,
    promptSpecifiesPerShot: perShot != null,
    promptSpecifiesTotal: !!(totM && Number(totM[1]) > 0),
  };
}

/** Outline phase: briefs + attachments only — reject any code fields. */
function validateOutlinePayload(raw, prompt, duration) {
  if (!raw || !Array.isArray(raw.scenes) || !raw.scenes.length) {
    return {
      ok: false,
      error: '缺少 scenes 数组',
      repairBrief: '错误类型：大纲结构缺失\n错在哪里：无非空 scenes 数组',
      repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：大纲结构缺失
错在哪里：响应缺少非空 scenes 数组
怎么改：只输出 JSON：{ name, duration, palette, scenes:[...] }，镜数与每镜 duration 必须按【用户提示词】规划（提示词未写清时再参考宿主总时长），【禁止】html/css/js。`,
    };
  }

  const hints = inferShotPlanHints(prompt, duration);
  const n = raw.scenes.length;

  if (n > 48) {
    return {
      ok: false,
      error: `镜头数 ${n} 过多（上限 48）`,
      repairBrief: `错误类型：镜头数量过多\n错在哪里：当前 ${n} 镜`,
      repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：镜头数量过多
错在哪里：scenes.length=${n}
怎么改：按用户提示词规划合理镜数（最多 48）；重发纯大纲 JSON。`,
    };
  }

  if (hints.promptSpecifiesCount && n !== hints.shotCount) {
    return {
      ok: false,
      error: `镜头数 ${n} 与提示词要求的 ${hints.shotCount} 不符`,
      repairBrief: `错误类型：镜头数量不符提示词\n错在哪里：当前 ${n} 镜，提示词要求 ${hints.shotCount}`,
      repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：镜头数量必须遵从用户提示词（禁止套用固定 3~6）
错在哪里：scenes.length=${n}，提示词要求 ${hints.shotCount} 镜
怎么改：scenes 恰好 ${hints.shotCount} 条；每镜 duration 也按提示词/叙事节奏分配；不要 html/css/js。`,
    };
  }

  if (!hints.promptSpecifiesCount && n < 1) {
    return {
      ok: false,
      error: '至少需要 1 个分镜',
      repairBrief: '错误类型：镜头数量不足\n错在哪里：scenes 为空',
      repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：镜头数量不足
怎么改：按用户提示词拆镜（未指定镜数时按叙事需要自定，勿强行 3~6）；重发大纲 JSON。`,
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
    let dur = Number(rest.duration);
    if (!(dur > 0)) {
      // Fallback only when model omitted duration — prefer prompt per-shot / even split
      if (hints.perShot) dur = hints.perShot;
      else if (hints.totalDuration && n > 0) dur = Math.max(0.5, hints.totalDuration / n);
      else dur = 3;
    }
    return {
      ...rest,
      title: rest.title || `镜头 ${i + 1}`,
      duration: dur,
      attachments: normalizeAttachments(rest.attachments),
    };
  });

  if (codeLeak.length) {
    return {
      ok: false,
      error: codeLeak[0],
      repairBrief: `错误类型：大纲阶段混入代码\n错在哪里：${codeLeak[0]}`,
      repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：大纲阶段混入代码
错在哪里：
${codeLeak.join('\n')}
怎么改：删掉所有 html/css/js 字段；可保留 attachments 的类型/描述；重发纯大纲 JSON。`,
    };
  }

  const sumDur = scenes.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  if (hints.promptSpecifiesPerShot && hints.perShot) {
    const bad = scenes.find((s) => Math.abs(Number(s.duration) - hints.perShot) > 0.35);
    if (bad) {
      return {
        ok: false,
        error: `分镜时长未按提示词「每镜 ${hints.perShot}s」`,
        repairBrief: `错误类型：分镜时长不符提示词\n错在哪里：要求每镜约 ${hints.perShot}s`,
        repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：分镜时长必须遵从用户提示词
错在哪里：提示词要求每镜约 ${hints.perShot} 秒，当前存在明显偏离
怎么改：每个 scene.duration ≈ ${hints.perShot}；镜数按提示词；禁止套用固定模板时长。`,
      };
    }
  }

  const targetTotal =
    hints.promptSpecifiesTotal || hints.promptSpecifiesPerShot
      ? hints.perShot && hints.promptSpecifiesCount
        ? hints.perShot * hints.shotCount
        : hints.totalDuration
      : hints.totalDuration;
  if (targetTotal && sumDur > 0) {
    const drift = Math.abs(sumDur - targetTotal) / targetTotal;
    // Only bounce on large drift when prompt/host gave a clear total
    if (drift > 0.28 && (hints.promptSpecifiesTotal || hints.promptSpecifiesPerShot || hints.hostDuration)) {
      return {
        ok: false,
        error: `分镜时长合计 ${sumDur.toFixed(1)}s 与目标约 ${targetTotal}s 偏差过大`,
        repairBrief: `错误类型：时长合计不符\n错在哪里：合计 ${sumDur.toFixed(1)}s，目标约 ${targetTotal}s`,
        repairMessage: `【打回修正，重新生成 — 大纲】
错误类型：分镜时长必须按用户提示词（或提示词未写明时的宿主总时长）分配
错在哪里：各镜 duration 之和=${sumDur.toFixed(1)}，目标约 ${targetTotal}
怎么改：按提示词重分配每镜 duration，使合计接近目标；镜数亦遵从提示词，勿固定 3~6。`,
      };
    }
  }

  const outlineDuration =
    Number(raw.duration) ||
    (sumDur > 0 ? sumDur : null) ||
    hints.totalDuration ||
    duration;

  return {
    ok: true,
    value: {
      name: raw.name || prompt?.slice(0, 24) || 'MotionCraft',
      duration: outlineDuration,
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
    intensity: 0.85,
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
      layout: { x: 0, y: 0, w: 1, h: 1 },
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
      // Atmospheric FX always full-bleed — partial layouts create hard panel boxes on screen
      p.layout = { x: 0, y: 0, w: 1, h: 1 };
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
    const raw = sanitizeJsSource(att.js);
    const check = raw ? validateSceneJs(raw) : { ok: false };
    if (check.ok) {
      node.props.js = check.js || raw;
      if (att.html) node.props.html = att.html;
      if (att.css != null) node.props.css = att.css;
    }
    return;
  }

  const cleaned = sanitizeJsSource(att.js);
  const jsCheck = cleaned ? validateSceneJs(cleaned) : { ok: false };
  if (jsCheck.ok) {
    // Persist auto-repaired js (seed inject / appendChild soften), not the raw broken source
    node.props.js = jsCheck.js || cleaned;
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

/** Dry-check js only — never swaps in synthesizer. May accept auto-shape-repaired js. */
function inspectShotJs(js) {
  const cleaned = sanitizeJsSource(js);
  const check = validateSceneJs(cleaned);
  if (!check.ok) {
    return {
      ok: false,
      error: check.error || 'invalid js',
      js: check.js || cleaned,
      diagnosis: check.diagnosis || diagnoseJsFailure(cleaned, check.error),
    };
  }
  return { ok: true, js: check.js || cleaned };
}

function stripFence(s) {
  return String(s)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}
