import {
  defaultCharacterHtml,
  defaultCharacterCss,
  defaultCharacterJs,
} from './character-code.js';
import { defaultChartHtml, defaultChartCss, defaultChartJs } from './chart-code.js';
import { defaultEffectHtml, defaultEffectCss, defaultEffectJs } from './effect-code.js';

/** @typedef {'scene'|'text'|'image'|'video'|'character'|'chart'|'effect'|'audio'|'narration'|'camera'|'ai'|'comic_page'|'comic_panel'|'comic_shot'} NodeType */

export const NODE_DEFS = [
  { type: 'scene', icon: 'SC', label: '分镜' },
  { type: 'text', icon: 'TX', label: '文本' },
  { type: 'image', icon: 'IM', label: '图片' },
  { type: 'video', icon: 'VD', label: '视频' },
  { type: 'character', icon: 'CH', label: '人物' },
  { type: 'chart', icon: 'CT', label: '图表' },
  { type: 'effect', icon: 'FX', label: '特效' },
  { type: 'audio', icon: 'AU', label: '音频' },
  { type: 'narration', icon: 'NA', label: '旁白' },
  { type: 'camera', icon: 'CM', label: '镜头' },
  { type: 'ai', icon: 'AI', label: '生成' },
  { type: 'comic_page', icon: 'PG', label: '页面' },
  { type: 'comic_panel', icon: 'PN', label: '分格' },
  { type: 'comic_shot', icon: 'CS', label: '格内' },
];

let seq = 1;
export const uid = (p = 'n') => `${p}_${Date.now().toString(36)}_${seq++}`;

export function createEmptyProject(name = '未命名项目') {
  return {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: { width: 1280, height: 720, fps: 30, duration: 12, durationCap: 600 },
    assets: [],
    nodes: [],
    edges: [],
    timeline: { tracks: [] },
  };
}

/** Coerce loaded / host JSON into a safe project shape (fixes partial opens). */
export function normalizeProject(raw, fallbackName = '未命名项目') {
  const base = createEmptyProject(
    (raw && typeof raw.name === 'string' && raw.name.trim()) || fallbackName,
  );
  if (!raw || typeof raw !== 'object') return base;

  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const timeline =
    raw.timeline && typeof raw.timeline === 'object'
      ? {
          tracks: Array.isArray(raw.timeline.tracks) ? raw.timeline.tracks : [],
        }
      : base.timeline;

  return {
    ...base,
    ...raw,
    version: Number(raw.version) || 1,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : base.name,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    settings: {
      ...base.settings,
      ...settings,
      width: Number(settings.width) || base.settings.width,
      height: Number(settings.height) || base.settings.height,
      fps: Number(settings.fps) || base.settings.fps,
      duration: Number(settings.duration) || base.settings.duration,
      durationCap: Number(settings.durationCap) || base.settings.durationCap,
    },
    assets: Array.isArray(raw.assets) ? raw.assets : [],
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    timeline,
  };
}

export function defaultProps(type) {
  const base = { title: NODE_DEFS.find((d) => d.type === type)?.label || type, duration: 3 };
  switch (type) {
    case 'scene':
      return {
        ...base,
        title: 'Scene',
        text: '',
        // Model-authored code — pixels come from js.draw(), not host templates
        html: '<div class="layer"><div class="caption"></div></div>',
        css: '.layer{position:absolute;inset:0}.caption{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);color:#fff}',
        js: `(function(){ return { setup(){}, draw({ctx,canvas,t,duration}){ ctx.fillStyle='#111'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#3dd6c6'; ctx.fillRect(0,canvas.height-4,canvas.width*(t/Math.max(0.01,duration)),4);} }; })()`,
      };
    case 'text':
      return {
        ...base,
        text: '字幕文案',
        animation: 'fade',
        duration: 3,
        layout: { x: 0.12, y: 0.78, w: 0.76, h: 0.12 },
      };
    case 'image':
      return {
        ...base,
        src: '',
        fit: 'cover',
        kenBurns: true,
        layout: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      };
    case 'video':
      return {
        ...base,
        src: '',
        muted: true,
        in: 0,
        out: 0,
        layout: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      };
    case 'character':
      // html/css/js filled lazily in createNode via character-code to avoid circular import
      return {
        ...base,
        title: '人物',
        motion: 'walk',
        look: 'default',
        appearance: '',
        coatColor: '#1a2230',
        skinColor: '#c9a088',
        hairColor: '#2a2018',
        umbrella: false,
        prompt: '',
        html: '',
        css: '',
        js: '',
        layout: { x: 0.54, y: 0.36, w: 0.26, h: 0.54 },
      };
    case 'chart':
      return {
        ...base,
        title: '图表',
        values: [40, 70, 55, 90, 65],
        chartType: 'bars',
        motion: 'grow',
        barColor: '#c45c26',
        appearance: '',
        prompt: '',
        html: '',
        css: '',
        js: '',
        layout: { x: 0.15, y: 0.25, w: 0.7, h: 0.5 },
      };
    case 'effect':
      return {
        ...base,
        title: '特效',
        effect: 'particles',
        motion: 'particles',
        appearance: '',
        prompt: '',
        html: '',
        css: '',
        js: '',
        duration: 3,
        layout: { x: 0, y: 0, w: 1, h: 1 },
      };
    case 'audio':
      return { ...base, src: '', volume: 0.8, fadeIn: 0.3, fadeOut: 0.3 };
    case 'narration':
      return {
        ...base,
        title: 'VO',
        speaker: 'VO',
        text: '旁白内容——声音从画面之外缓缓响起。',
        duration: 4,
        animation: 'type',
        layout: { x: 0.06, y: 0.72, w: 0.88, h: 0.2 },
      };
    case 'camera':
      return {
        ...base,
        move: 'pan',
        intensity: 1,
        letterbox: true,
        duration: 3,
      };
    case 'ai':
      return { ...base, prompt: '', provider: 'auto', duration: 1 };
    case 'comic_page':
      return {
        ...base,
        title: '页面',
        duration: 1,
        format: 'single', // single | spread
        spreadRole: 'right', // left | right
        pageBeat: 'dialogue', // establish | dialogue | action | climax | transition
        pageTurnHook: '',
        readingDir: 'ltr', // ltr | rtl
        pageWidth: 900,
        pageHeight: 1273,
        // 页面任务卡（服务场景 / 被格服务）
        sceneId: '',
        pageTask: '',
        pageInfoChange: '',
        pageEmotion: '',
        rhythmType: '建立-反应-钩子',
        mainPanelOrder: 1,
        readingPath: 'Z',
        linkPrevPage: '',
        linkNextPage: '',
        prompt: '',
        genStatus: 'pending',
      };
    case 'comic_panel':
      return {
        ...base,
        title: '分格',
        duration: 1,
        order: 1,
        size: 'm', // s | m | l | xl
        shape: 'rect', // rect | square | slant | round | borderless
        gutter: 'normal', // tight | normal | wide
        transitionIn: 'action', // action | scene | time | cutaway | parallel | memory
        layout: { x: 0.06, y: 0.06, w: 0.88, h: 0.4 },
        // 格设计卡（七变量 + 延伸）
        functionVerb: '推进', // 建立|定位|推进|反应|强调|过渡|转折|爆发|收束|悬念
        timeSpan: '几秒',
        infoChange: '',
        emotion: '',
        shotSize: 'medium',
        angle: 'eye',
        focus: '',
        staging: '',
        foreground: '',
        midground: '',
        background: '',
        lighting: '',
        dialogue: '',
        narration: '',
        thought: '',
        sfx: '',
        linkPrev: '',
        linkNext: '',
        pageSlot: '中段', // 开场|中段|页末
        panelRole: '辅格', // 主格|辅格|过渡格|反应格|钩子格
        howServesPage: '',
        brief: '',
        genStatus: 'pending',
      };
    case 'comic_shot':
      return {
        ...base,
        title: '格内构图',
        duration: 1,
        functionVerb: '推进',
        timeSpan: '几秒',
        infoChange: '',
        emotion: '',
        shotSize: 'medium', // extremeWide | wide | full | medium | close | extremeClose
        angle: 'eye', // eye | high | low | bird | worm | dutch | pov | ots
        focus: '',
        staging: '',
        foreground: '',
        midground: '',
        background: '',
        lighting: '',
        dialogue: '',
        narration: '',
        thought: '',
        sfx: '',
        linkPrev: '',
        linkNext: '',
        pageSlot: '中段',
        panelRole: '辅格',
        howServesPage: '',
        prompt: '',
        html: '<div class="layer"><div class="panel-art"></div><div class="balloon-slot"></div></div>',
        css: '.layer{position:absolute;inset:0}.panel-art{position:absolute;inset:0}.balloon-slot{position:absolute;inset:0;pointer-events:none}',
        js: `(function(){ return { setup(){}, draw({ctx,canvas,t,duration}){ var w=canvas.width,h=canvas.height; ctx.fillStyle='#f4f0e8'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=3; ctx.strokeRect(2,2,w-4,h-4); ctx.fillStyle='#333'; ctx.font='14px sans-serif'; ctx.fillText('comic panel',12,28);} }; })()`,
        genStatus: 'pending',
      };
    default:
      return base;
  }
}

export function createNode(type, x = 80, y = 80) {
  const props = defaultProps(type);
  if (type === 'character') {
    props.html = props.html || defaultCharacterHtml();
    props.css = props.css || defaultCharacterCss();
    props.js = props.js || defaultCharacterJs();
  } else if (type === 'chart') {
    props.html = props.html || defaultChartHtml();
    props.css = props.css || defaultChartCss();
    props.js = props.js || defaultChartJs();
  } else if (type === 'effect') {
    props.html = props.html || defaultEffectHtml();
    props.css = props.css || defaultEffectCss();
    props.js = props.js || defaultEffectJs();
  }
  return {
    id: uid('node'),
    type,
    x,
    y,
    props,
  };
}

export function createEdge(from, to, kind = 'sequence') {
  return { id: uid('edge'), from, to, kind };
}

/** Bake simple timeline from scene sequence + attached nodes */
export function bakeTimeline(project) {
  const scenes = project.nodes.filter((n) => n.type === 'scene');
  const seqEdges = project.edges.filter((e) => e.kind === 'sequence');
  const order = topologicalScenes(scenes, seqEdges);
  let t = 0;
  const sceneBlocks = [];
  const cameraBlocks = [];
  const audioBlocks = [];

  for (const scene of order) {
    const dur = Number(scene.props.duration) || 3;
    sceneBlocks.push({ id: scene.id, label: scene.props.title || scene.id, start: t, duration: dur, type: 'scene' });
    const attached = project.edges
      .filter((e) => e.kind === 'attach' && (e.to === scene.id || e.from === scene.id))
      .map((e) => {
        const other = e.to === scene.id ? e.from : e.to;
        return project.nodes.find((n) => n.id === other);
      })
      .filter((n) => n && n.type !== 'scene');
    const seen = new Set();
    for (const n of attached) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const nd = Number(n.props.duration) || dur;
      const block = { id: n.id, label: n.props.title || n.type, start: t, duration: Math.min(nd, dur), type: n.type };
      if (n.type === 'camera') cameraBlocks.push(block);
      else if (n.type === 'audio' || n.type === 'narration') audioBlocks.push(block);
    }
    t += dur;
  }

  // Orphan scenes not in graph
  for (const scene of scenes) {
    if (order.find((s) => s.id === scene.id)) continue;
    const dur = Number(scene.props.duration) || 3;
    sceneBlocks.push({ id: scene.id, label: scene.props.title || scene.id, start: t, duration: dur, type: 'scene' });
    t += dur;
  }

  const total = Math.max(t, Number(project.settings.duration) || 0);
  project.settings.bakedDuration = total || Number(project.settings.duration) || 12;
  project.timeline = {
    tracks: [
      { id: 'scene', name: 'Scene', blocks: sceneBlocks },
      { id: 'camera', name: 'Camera', blocks: cameraBlocks },
      { id: 'audio', name: 'Audio', blocks: audioBlocks },
    ],
  };
  return project.timeline;
}

function topologicalScenes(scenes, edges) {
  const ids = new Set(scenes.map((s) => s.id));
  const incoming = new Map([...ids].map((id) => [id, 0]));
  const outs = new Map([...ids].map((id) => [id, []]));
  for (const e of edges) {
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
  // append leftover cyclic nodes
  for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
  return ordered.map((id) => scenes.find((s) => s.id === id)).filter(Boolean);
}

export function touch(project) {
  project.updatedAt = new Date().toISOString();
  bakeTimeline(project);
  return project;
}
