/**
 * Comic page pipeline: outline → stream panel-by-panel code (page order × panel order).
 * Reuses director requestModelJson (local repair + bounce) and maximal code rules.
 */
import { createNode, createEdge, createEmptyProject, touch } from './model.js';
import { clampLayout } from './layout.js';
import {
  requestModelJson,
  validateSingleShotPayload,
  markGenerating,
  notifyProject,
} from './director.js';
import {
  SYSTEM_COMIC_OUTLINE,
  SYSTEM_COMIC_SHOT,
  buildComicOutlineUserMessage,
  buildComicShotUserMessage,
} from './quality-prompt.js';

const MIN_CODE_CHARS = 900;

export function orderedComicPages(project) {
  const pages = project.nodes.filter((n) => n.type === 'comic_page');
  const seq = project.edges.filter((e) => e.kind === 'sequence');
  const ids = new Set(pages.map((p) => p.id));
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
  return ordered.map((id) => pages.find((p) => p.id === id)).filter(Boolean);
}

export function panelsForPage(project, pageId) {
  const contain = project.edges.filter((e) => e.kind === 'contain' && e.from === pageId);
  const panels = contain
    .map((e) => project.nodes.find((n) => n.id === e.to && n.type === 'comic_panel'))
    .filter(Boolean);
  panels.sort((a, b) => (Number(a.props.order) || 0) - (Number(b.props.order) || 0));
  return panels;
}

export function shotForPanel(project, panelId) {
  const e = project.edges.find((x) => x.kind === 'compose' && x.from === panelId);
  if (!e) return null;
  return project.nodes.find((n) => n.id === e.to && n.type === 'comic_shot') || null;
}

export function validateComicGraph(project) {
  const errors = [];
  for (const panel of project.nodes.filter((n) => n.type === 'comic_panel')) {
    const parents = project.edges.filter((e) => e.kind === 'contain' && e.to === panel.id);
    if (parents.length !== 1) {
      errors.push(`分格「${panel.props.title || panel.id}」必须恰好挂在 1 个页面下（当前 ${parents.length}）`);
    }
    const shots = project.edges.filter((e) => e.kind === 'compose' && e.from === panel.id);
    if (shots.length > 1) {
      errors.push(`分格「${panel.props.title || panel.id}」至多 1 个格内节点`);
    }
  }
  return errors;
}

function pageSummary(page) {
  if (!page) return '';
  const p = page.props || {};
  return `${p.title || ''} · 场景:${p.sceneId || '?'} · 任务:${p.pageTask || p.pageBeat || ''} · 钩子:${p.pageTurnHook || '无'}`;
}

function findScene(project, sceneId) {
  const scenes = project.settings?.comicScenes;
  if (!Array.isArray(scenes) || !sceneId) return null;
  return scenes.find((s) => s.id === sceneId) || null;
}

function pickField(panelProps, shotProps, key, fallback = '') {
  const s = shotProps?.[key];
  const p = panelProps?.[key];
  if (s != null && String(s).trim()) return s;
  if (p != null && String(p).trim()) return p;
  return fallback;
}

function panelBrief(panel, shot) {
  if (!panel) return null;
  const p = panel.props || {};
  const s = shot?.props || {};
  return {
    title: p.title || s.title || '',
    order: Number(p.order) || 1,
    size: p.size || 'm',
    shape: p.shape || 'rect',
    gutter: p.gutter || 'normal',
    layout: p.layout || null,
    layoutNote: p.layoutNote || '',
    functionVerb: pickField(p, s, 'functionVerb', '推进'),
    timeSpan: pickField(p, s, 'timeSpan', '几秒'),
    infoChange: pickField(p, s, 'infoChange'),
    emotion: pickField(p, s, 'emotion'),
    shotSize: pickField(p, s, 'shotSize', 'medium'),
    angle: pickField(p, s, 'angle', 'eye'),
    focus: pickField(p, s, 'focus'),
    staging: pickField(p, s, 'staging'),
    foreground: pickField(p, s, 'foreground'),
    midground: pickField(p, s, 'midground'),
    background: pickField(p, s, 'background'),
    lighting: pickField(p, s, 'lighting'),
    dialogue: pickField(p, s, 'dialogue'),
    narration: pickField(p, s, 'narration'),
    thought: pickField(p, s, 'thought'),
    sfx: pickField(p, s, 'sfx'),
    linkPrev: pickField(p, s, 'linkPrev'),
    linkNext: pickField(p, s, 'linkNext'),
    pageSlot: pickField(p, s, 'pageSlot', '中段'),
    panelRole: pickField(p, s, 'panelRole', '辅格'),
    howServesPage: pickField(p, s, 'howServesPage'),
    brief: pickField(p, s, 'brief') || pickField(p, s, 'focus'),
  };
}

export function buildComicContinuity(project, shotId) {
  const shot = project.nodes.find((n) => n.id === shotId && n.type === 'comic_shot');
  if (!shot) throw new Error('格内节点不存在');
  const compose = project.edges.find((e) => e.kind === 'compose' && e.to === shotId);
  const panel = compose
    ? project.nodes.find((n) => n.id === compose.from && n.type === 'comic_panel')
    : null;
  if (!panel) throw new Error('格内未连接到分格');
  const contain = project.edges.find((e) => e.kind === 'contain' && e.to === panel.id);
  const page = contain
    ? project.nodes.find((n) => n.id === contain.from && n.type === 'comic_page')
    : null;
  if (!page) throw new Error('分格未连接到页面');

  const pages = orderedComicPages(project);
  const pageIndex = pages.findIndex((p) => p.id === page.id);
  const panels = panelsForPage(project, page.id);
  const panelIndex = panels.findIndex((p) => p.id === panel.id);
  const prevPanel = panelIndex > 0 ? panels[panelIndex - 1] : null;
  const nextPanel = panelIndex >= 0 && panelIndex < panels.length - 1 ? panels[panelIndex + 1] : null;
  const prevPage = pageIndex > 0 ? pages[pageIndex - 1] : null;
  const nextPage = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1] : null;

  const doneOnPage = panels
    .slice(0, Math.max(0, panelIndex))
    .map((pn) => {
      const sh = shotForPanel(project, pn.id);
      const st = sh?.props?.genStatus === 'done' || (sh?.props?.js && String(sh.props.js).length > 80);
      const verb = pn.props.functionVerb || sh?.props?.functionVerb || '';
      const focus = pn.props.focus || sh?.props?.focus || pn.props.brief || '';
      const role = pn.props.panelRole || sh?.props?.panelRole || '';
      return `#${pn.props.order} ${pn.props.title || ''} ${st ? '✓' : '·'} [${role}/${verb}] ${focus}`;
    })
    .join('\n');

  const ai = project.nodes.find((n) => n.type === 'ai');
  const work = project.settings?.comicWork || null;
  const scene = findScene(project, page.props.sceneId);
  return {
    shot,
    panel,
    page,
    pages,
    pageIndex,
    panelIndex,
    panels,
    storyPrompt: ai?.props?.prompt || project.name || '',
    readingDir: page.props.readingDir || project.settings?.comicReadingDir || 'ltr',
    panelTotal: panels.length,
    work,
    scene,
    prevPanel: panelBrief(prevPanel, prevPanel ? shotForPanel(project, prevPanel.id) : null),
    nextPanel: panelBrief(nextPanel, nextPanel ? shotForPanel(project, nextPanel.id) : null),
    prevPageSummary: pageSummary(prevPage),
    nextPageSummary: pageSummary(nextPage),
    pageBrief: {
      title: page.props.title,
      sceneId: page.props.sceneId || '',
      pageBeat: page.props.pageBeat,
      pageTask: page.props.pageTask || '',
      pageInfoChange: page.props.pageInfoChange || '',
      pageEmotion: page.props.pageEmotion || '',
      rhythmType: page.props.rhythmType || '',
      mainPanelOrder: page.props.mainPanelOrder ?? '',
      readingPath: page.props.readingPath || '',
      pageTurnHook: page.props.pageTurnHook,
      linkPrevPage: page.props.linkPrevPage || '',
      linkNextPage: page.props.linkNextPage || '',
      format: page.props.format,
      spreadRole: page.props.spreadRole,
    },
    panelBrief: panelBrief(panel, shot),
    doneOnPage: doneOnPage || '（尚无）',
  };
}

function validateComicShotPayload(raw, label) {
  const base = validateSingleShotPayload(raw, label);
  if (!base.ok) return base;
  const shot = base.value;
  const total =
    String(shot.html || '').length + String(shot.css || '').length + String(shot.js || '').length;
  if (total < MIN_CODE_CHARS) {
    return {
      ok: false,
      error: `${label} 代码过短（html+css+js=${total} < ${MIN_CODE_CHARS}），未吃满上限`,
      repairBrief: `错误类型：输出过短\n错在哪里：三字段合计仅 ${total} 字符`,
      repairMessage: `【打回修正 — 代码厚度且必须一次写对】
${label} 的 html+css+js 合计过短（${total}）。必须三者都加厚，逼近输出上限，禁止简格少写或只厚 js。
同时：整段必须完整可 parse、js 可编译、setup/draw 可试跑、无截断/无未定义变量——禁止再交有缺陷代码。
整段重发合法 JSON。`,
    };
  }
  return base;
}

function applyShotToComic(shotNode, shot, intent, panelNode) {
  shotNode.props.title = shot.title || shotNode.props.title || '格内构图';
  shotNode.props.text = shot.text ?? shotNode.props.text ?? '';
  shotNode.props.html = shot.html || '<div class="layer"></div>';
  shotNode.props.css = shot.css != null ? shot.css : '.layer{position:absolute;inset:0}';
  shotNode.props.js = shot.js || '';
  shotNode.props.style = shot.style || shotNode.props.style || '';
  const copyKeys = [
    'functionVerb',
    'timeSpan',
    'infoChange',
    'emotion',
    'shotSize',
    'angle',
    'focus',
    'staging',
    'foreground',
    'midground',
    'background',
    'lighting',
    'dialogue',
    'narration',
    'thought',
    'sfx',
    'linkPrev',
    'linkNext',
    'pageSlot',
    'panelRole',
    'howServesPage',
  ];
  for (const k of copyKeys) {
    if (shot[k] != null && String(shot[k]).trim()) {
      shotNode.props[k] = shot[k];
      if (panelNode?.props) panelNode.props[k] = shot[k];
    }
  }
  if (!shotNode.props.focus && shot.scene) shotNode.props.focus = shot.scene;
  if (!shotNode.props.shotSize) shotNode.props.shotSize = 'medium';
  if (!shotNode.props.angle) shotNode.props.angle = 'eye';
  shotNode.props.prompt = intent || shotNode.props.prompt || '';
  shotNode.props.genStatus = 'done';
  shotNode._codeSetupDone = false;
}

function applyDesignCardToNodes(panel, shot, br) {
  const keys = [
    'functionVerb',
    'timeSpan',
    'infoChange',
    'emotion',
    'shotSize',
    'angle',
    'focus',
    'staging',
    'foreground',
    'midground',
    'background',
    'lighting',
    'dialogue',
    'narration',
    'thought',
    'sfx',
    'linkPrev',
    'linkNext',
    'pageSlot',
    'panelRole',
    'howServesPage',
    'brief',
    'layoutNote',
  ];
  for (const k of keys) {
    if (br[k] != null && String(br[k]).trim()) {
      panel.props[k] = br[k];
      shot.props[k] = br[k];
    }
  }
}

function applyPageTaskCard(pageNode, pb) {
  pageNode.props.sceneId = pb.sceneId || pageNode.props.sceneId || '';
  pageNode.props.pageTask = pb.pageTask || '';
  pageNode.props.pageInfoChange = pb.pageInfoChange || '';
  pageNode.props.pageEmotion = pb.pageEmotion || '';
  pageNode.props.rhythmType = pb.rhythmType || '';
  pageNode.props.mainPanelOrder = Number(pb.mainPanelOrder) || 1;
  pageNode.props.readingPath = pb.readingPath || 'Z';
  pageNode.props.linkPrevPage = pb.linkPrevPage || '';
  pageNode.props.linkNextPage = pb.linkNextPage || '';
  const n = Number(pb.panelCount);
  pageNode.props.panelCount = Number.isFinite(n) && n > 0 ? n : (pb.panels?.length || 0);
}

function validateComicOutline(raw) {
  if (!raw || !Array.isArray(raw.pages) || !raw.pages.length) {
    return {
      ok: false,
      error: '大纲缺少 pages',
      repairBrief: '错误类型：大纲结构缺失\n错在哪里：无非空 pages',
      repairMessage: '【打回】必须输出 work + scenes + 非空 pages；每页含 panels。禁止 html/css/js。',
    };
  }
  if (!raw.work || typeof raw.work !== 'object') {
    return {
      ok: false,
      error: '大纲缺少 work（整体层）',
      repairBrief: '错误类型：缺少整体层',
      repairMessage: '【打回】必须输出 work：theme/characterArc/infoArc/emotionArc/rhythmArc/visualMotifs/endKnow/endFeel/endExpect。',
    };
  }
  const wMiss = ['theme', 'infoArc', 'emotionArc', 'endKnow', 'endFeel'].filter((k) => !raw.work[k]);
  if (wMiss.length) {
    return {
      ok: false,
      error: `work 缺少字段: ${wMiss.join(',')}`,
      repairBrief: `错误类型：整体层不完整\n缺：${wMiss.join(',')}`,
      repairMessage: `【打回】补全 work 字段：${wMiss.join(', ')}。`,
    };
  }
  if (!Array.isArray(raw.scenes) || !raw.scenes.length) {
    return {
      ok: false,
      error: '大纲缺少 scenes（场景层）',
      repairBrief: '错误类型：缺少场景层',
      repairMessage: '【打回】必须输出非空 scenes[]（id/title/goal/conflict/stateFrom/stateTo/position）。',
    };
  }
  const sceneIds = new Set(raw.scenes.map((s) => s.id).filter(Boolean));
  for (const page of raw.pages) {
    if (page.html || page.css || page.js) {
      return {
        ok: false,
        error: '大纲阶段禁止代码',
        repairBrief: '错误类型：大纲混入代码',
        repairMessage: '【打回】大纲禁止 html/css/js，只保留 work/scenes/pages/panels。',
      };
    }
    if (!page.sceneId || !sceneIds.has(page.sceneId)) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」sceneId 无效`,
        repairBrief: '错误类型：页未挂场景',
        repairMessage: '【打回】每一页必须有有效 sceneId，对应 scenes[].id。',
      };
    }
    const pageMiss = [];
    if (!page.pageTask) pageMiss.push('pageTask');
    if (!page.pageInfoChange) pageMiss.push('pageInfoChange');
    if (!page.pageEmotion) pageMiss.push('pageEmotion');
    if (!page.rhythmType) pageMiss.push('rhythmType');
    if (page.mainPanelOrder == null || page.mainPanelOrder === '') pageMiss.push('mainPanelOrder');
    if (!page.readingPath) pageMiss.push('readingPath');
    if (pageMiss.length) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」任务卡缺: ${pageMiss.join(',')}`,
        repairBrief: `错误类型：页面任务卡不完整\n缺：${pageMiss.join(',')}`,
        repairMessage: `【打回】补全页面任务卡：${pageMiss.join(', ')}。`,
      };
    }
    if (!Array.isArray(page.panels) || !page.panels.length) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」缺少 panels`,
        repairBrief: '错误类型：页无分格',
        repairMessage:
          '【打回】每一页必须由你决定格数并输出非空 panels[]；写明 panelCount=panels.length；每格含 size+layout。宿主无默认分格。',
      };
    }
    const declaredCount = Number(page.panelCount);
    if (Number.isFinite(declaredCount) && declaredCount !== page.panels.length) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」panelCount(${declaredCount}) ≠ panels.length(${page.panels.length})`,
        repairBrief: '错误类型：格数不一致',
        repairMessage:
          '【打回】panelCount 必须等于 panels 数组长度。格数由你决定，改 panelCount 或增删 panels 使二者一致。',
      };
    }
    if (!Number.isFinite(declaredCount) || declaredCount < 1) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」缺少 panelCount`,
        repairBrief: '错误类型：未声明本页格数',
        repairMessage:
          '【打回】每一页必须由你决定并填写 panelCount（正整数），且等于 panels.length。禁止省略、禁止套固定格数模板。',
      };
    }
    const mains = page.panels.filter((pan) => pan.panelRole === '主格');
    if (mains.length !== 1) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」必须恰好 1 个主格（当前 ${mains.length}）`,
        repairBrief: '错误类型：主格数量错误',
        repairMessage:
          '【打回】每一页 panels 中 panelRole="主格" 必须恰好一个，且 mainPanelOrder 等于该主格的 order。禁止 0 个或多个主格。',
      };
    }
    const countFail = validatePagePanelCounts(page);
    if (countFail) return countFail;
    const layouts = [];
    for (const pan of page.panels) {
      const missing = [];
      if (!pan.functionVerb) missing.push('functionVerb');
      if (!pan.timeSpan) missing.push('timeSpan');
      if (!pan.infoChange) missing.push('infoChange');
      if (!pan.emotion) missing.push('emotion');
      if (!pan.focus) missing.push('focus');
      if (!pan.staging) missing.push('staging');
      if (!pan.panelRole) missing.push('panelRole');
      if (!pan.howServesPage) missing.push('howServesPage');
      if (!pan.size || !['xs', 's', 'm', 'l', 'xl'].includes(String(pan.size))) {
        missing.push('size(xs|s|m|l|xl)');
      }
      const L = pan.layout;
      if (
        !L ||
        typeof L !== 'object' ||
        ![L.x, L.y, L.w, L.h].every((n) => Number.isFinite(Number(n)))
      ) {
        missing.push('layout{x,y,w,h}');
      }
      if (missing.length) {
        return {
          ok: false,
          error: `格「${pan.title || pan.order || '?'}」缺少设计卡字段: ${missing.join(',')}`,
          repairBrief: `错误类型：格设计卡不完整\n错在哪里：${missing.join(',')}`,
          repairMessage: `【打回】每一格必须写满设计卡 + panelRole + howServesPage + 精确 layout{x,y,w,h}。缺：${missing.join(', ')}。禁止代码。`,
        };
      }
      layouts.push({
        pan,
        x: Number(L.x),
        y: Number(L.y),
        w: Number(L.w),
        h: Number(L.h),
        area: Number(L.w) * Number(L.h),
      });
    }
    const layoutFail = validatePagePanelLayouts(page, layouts);
    if (layoutFail) return layoutFail;
    const sizeFail = validateSizeMatchesArea(page, layouts);
    if (sizeFail) return sizeFail;
  }
  if (raw.pages.length >= 3) {
    const counts = raw.pages.map((p) => Number(p.panelCount) || p.panels.length);
    if (counts.every((c) => c === counts[0])) {
      return {
        ok: false,
        error: `全本每页都是 ${counts[0]} 格（格数未由叙事变化）`,
        repairBrief: '错误类型：固定格数模板',
        repairMessage:
          '【打回】格数须由你按页自定。至少让部分页的 panelCount 不同（如 2/4/3 交替），禁止全本每页同一格数。',
      };
    }
  }
  return { ok: true, value: raw };
}

const LAYOUT_MARGIN = 0.028;
const LAYOUT_MIN_GUTTER = 0.018;

/** order 1..N unique; mainPanelOrder matches the sole 主格. */
function validatePagePanelCounts(page) {
  const title = page.title || '?';
  const n = page.panels.length;
  const orders = page.panels.map((p) => Number(p.order));
  if (orders.some((o) => !Number.isFinite(o) || o < 1 || o !== Math.floor(o))) {
    return {
      ok: false,
      error: `页面「${title}」存在非法 order（须为正整数）`,
      repairBrief: '错误类型：order 非法',
      repairMessage: `【打回】每格 order 必须是 1..${n} 的正整数。当前：${orders.join(',')}。重写 order 为连续序号。`,
    };
  }
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < n; i++) {
    if (sorted[i] !== i + 1) {
      return {
        ok: false,
        error: `页面「${title}」order 必须为 1..${n} 连续不重复（当前 ${orders.join(',')}）`,
        repairBrief: '错误类型：order 跳号/重复',
        repairMessage: `【打回】panels[].order 必须恰好是 1,2,…,${n} 各出现一次。禁止跳号、重复、从 0 起。当前：${orders.join(',')}。`,
      };
    }
  }
  const main = page.panels.find((p) => p.panelRole === '主格');
  const mainOrder = Number(main?.order);
  const declaredMain = Number(page.mainPanelOrder);
  if (!Number.isFinite(declaredMain) || declaredMain !== mainOrder) {
    return {
      ok: false,
      error: `页面「${title}」mainPanelOrder(${page.mainPanelOrder}) ≠ 主格 order(${mainOrder})`,
      repairBrief: '错误类型：主格序号不一致',
      repairMessage: `【打回】mainPanelOrder 必须等于 panelRole="主格" 那一格的 order（应为 ${mainOrder}）。逐项核对数量关系后再交。`,
    };
  }
  return null;
}

/** Largest area panel should be 主格 and size l|xl. */
function validateSizeMatchesArea(page, layouts) {
  const title = page.title || '?';
  if (layouts.length < 2) return null;
  const byArea = [...layouts].sort((a, b) => b.area - a.area);
  const biggest = byArea[0];
  if (biggest.pan.panelRole !== '主格') {
    return {
      ok: false,
      error: `页面「${title}」面积最大的格不是主格（数量/角色错误）`,
      repairBrief: '错误类型：主格面积未最大',
      repairMessage:
        '【打回】面积最大的 layout 必须是 panelRole="主格"。放大主格或缩小辅格，并保持零重叠；核对 order/mainPanelOrder。',
    };
  }
  const sz = String(biggest.pan.size || '');
  if (sz !== 'l' && sz !== 'xl') {
    return {
      ok: false,
      error: `页面「${title}」主格面积最大但 size=${sz || '空'}（应为 l 或 xl）`,
      repairBrief: '错误类型：size 与面积背离',
      repairMessage: '【打回】主格（面积最大）的 size 必须是 l 或 xl；小辅格用 xs/s。修正 size 字段与 layout 一致。',
    };
  }
  return null;
}

/** Reject overlap / messy packing / lazy equal grids; require main panel largest. */
function validatePagePanelLayouts(page, layouts) {
  const title = page.title || '?';
  const M = LAYOUT_MARGIN;
  for (const a of layouts) {
    if (a.w < 0.12 || a.h < 0.1) {
      return {
        ok: false,
        error: `页面「${title}」格过小（设计感不足）`,
        repairBrief: '错误类型：分格过碎',
        repairMessage:
          '【打回】每格 layout.w≥0.12、h≥0.1；用大小对比做设计，不要碎条凑数。重排本页全部 layout，并保证零重叠+gutter≥0.018。',
      };
    }
    if (a.w <= 0 || a.h <= 0 || !Number.isFinite(a.area)) {
      return {
        ok: false,
        error: `页面「${title}」存在非法 layout 尺寸`,
        repairBrief: '错误类型：layout 非法',
        repairMessage: '【打回】每格 w/h 必须为正有限数；重写全部 layout。',
      };
    }
    if (a.x < M - 0.005 || a.y < M - 0.005 || a.x + a.w > 1 - M + 0.005 || a.y + a.h > 1 - M + 0.005) {
      return {
        ok: false,
        error: `页面「${title}」格贴边过紧或越界（需页边 margin≈0.03~0.06）`,
        repairBrief: '错误类型：layout 越界/无页边',
        repairMessage: `【打回】每格须留页边：x,y≥${M} 且 x+w、y+h≤${(1 - M).toFixed(3)}。禁止画出页外。重排本页全部 layout，零重叠。`,
      };
    }
  }
  for (let i = 0; i < layouts.length; i++) {
    for (let j = i + 1; j < layouts.length; j++) {
      if (rectsCollideOrTooClose(layouts[i], layouts[j], LAYOUT_MIN_GUTTER)) {
        const A = layouts[i];
        const B = layouts[j];
        const aId = A.pan.order ?? A.pan.title ?? i + 1;
        const bId = B.pan.order ?? B.pan.title ?? j + 1;
        return {
          ok: false,
          error: `页面「${title}」格 #${aId} 与 #${bId} 重叠或间距不足`,
          repairBrief: `错误类型：格重叠/乱排\n错在哪里：#${aId} 与 #${bId}`,
          repairMessage: `【打回 — 分格重叠或排版乱】
页面「${title}」中格 #${aId} layout=(${A.x},${A.y},${A.w},${A.h}) 与格 #${bId} layout=(${B.x},${B.y},${B.w},${B.h}) 相交或 gutter < ${LAYOUT_MIN_GUTTER}。
怎么改：重排本页【全部】panels[].layout——先放大主格，再在剩余空区切辅格；任意两格须轴对齐分离且间距≥${LAYOUT_MIN_GUTTER}；页边≥${LAYOUT_MARGIN}；禁止叠压、禁止挤成一团。交验算 right=x+w、bottom=y+h 后再输出。`,
        };
      }
    }
  }
  const totalArea = layouts.reduce((s, x) => s + x.area, 0);
  if (layouts.length >= 2 && totalArea < 0.45) {
    return {
      ok: false,
      error: `页面「${title}」分格过稀（总面积 ${totalArea.toFixed(2)}，排版散乱）`,
      repairBrief: '错误类型：版式过稀/乱',
      repairMessage:
        '【打回】同页格总面积过小，版面散乱。放大主格、收拢辅格到相邻空带，保持 gutter≥0.018 且零重叠；目标总面积约 0.62~0.88。',
    };
  }
  if (totalArea > 0.94) {
    return {
      ok: false,
      error: `页面「${title}」分格过满（总面积 ${totalArea.toFixed(2)}，几乎无 gutter）`,
      repairBrief: '错误类型：版式过满',
      repairMessage:
        '【打回】格总面积过大，易重叠或无呼吸。缩小辅格、统一 gutter≥0.018，页边≥0.03，保证零重叠。',
    };
  }
  const main = layouts.find((x) => x.pan.panelRole === '主格');
  if (main) {
    const others = layouts.filter((x) => x !== main);
    const maxOther = others.reduce((m, x) => Math.max(m, x.area), 0);
    const ratio = maxOther > 0 ? main.area / maxOther : Infinity;
    if (others.length && ratio < 1.25) {
      return {
        ok: false,
        error: `页面「${title}」主格无视觉统治（面积比 ${ratio.toFixed(2)} < 1.25）`,
        repairBrief: `错误类型：主格无视觉统治\n主格 area=${main.area.toFixed(3)} 次大=${maxOther.toFixed(3)} 比=${ratio.toFixed(2)}`,
        repairMessage: `【打回 — 主格无视觉统治】
页面「${title}」：主格 area=${main.area.toFixed(3)}，次大格 area=${maxOther.toFixed(3)}，比值仅 ${ratio.toFixed(2)}（须 ≥1.25，设计目标 ≥1.35）。
怎么改：
1) 先放大主格 layout（常见 w≥0.75 且 h≥0.42，或等价面积），size 设为 l 或 xl；
2) 再缩小所有辅格，使每块 ≤ 主格面积×0.55；
3) 保持零重叠与 gutter≥${LAYOUT_MIN_GUTTER}、页边≥${LAYOUT_MARGIN}；
4) 重算每格 w*h，确认主格最大且比值≥1.35 后再交卷。禁止等分后再贴「主格」标签。`,
      };
    }
  }
  if (layouts.length >= 3) {
    const areas = layouts.map((x) => x.area).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)];
    const similar = layouts.filter((x) => Math.abs(x.area - median) / Math.max(median, 0.01) < 0.12);
    if (similar.length >= layouts.length) {
      return {
        ok: false,
        error: `页面「${title}」分格面积过于均一（无设计感）`,
        repairBrief: '错误类型：等分网格懒版式',
        repairMessage:
          '【打回】禁止等分/近等分网格。重排：主格显著更大，辅格更小；全程保持零重叠与 gutter≥0.018。',
      };
    }
    const fullW = layouts.filter((x) => x.w >= 0.85);
    if (fullW.length >= layouts.length) {
      const hs = fullW.map((x) => x.h);
      const avgH = hs.reduce((a, b) => a + b, 0) / hs.length;
      const flat = hs.every((h) => Math.abs(h - avgH) / Math.max(avgH, 0.01) < 0.15);
      if (flat) {
        return {
          ok: false,
          error: `页面「${title}」通栏等高叠罗汉（无设计感）`,
          repairBrief: '错误类型：通栏懒版式',
          repairMessage:
            '【打回】禁止整页满宽横条且高度接近。改用主格独大+左右分栏等；新坐标必须零重叠。',
        };
      }
    }
  }
  return null;
}

/** True if axis-aligned rects overlap or gap < minGap on all separating axes. */
function rectsCollideOrTooClose(a, b, minGap = LAYOUT_MIN_GUTTER) {
  return !(
    a.x + a.w + minGap <= b.x ||
    b.x + b.w + minGap <= a.x ||
    a.y + a.h + minGap <= b.y ||
    b.y + b.h + minGap <= a.y
  );
}

/**
 * Full comic director: outline shells, then stream page→panel→shot code.
 */
export async function runComicDirector({
  prompt,
  settings,
  provider,
  replace,
  currentProject,
  onStream,
  onProject,
  pageHint,
  continueFromPending,
}) {
  let project = replace ? createEmptyProject('漫画') : structuredClone(currentProject);
  if (replace) {
    project.nodes = [];
    project.edges = [];
  }

  let repairs = 0;
  const workList = [];

  if (!continueFromPending) {
    onStream?.({ type: 'status', message: '第 1 步：生成漫画大纲（无代码）…' });
    const outlineGot = await requestModelJson({
      system: SYSTEM_COMIC_OUTLINE,
      user: buildComicOutlineUserMessage(prompt, pageHint),
      settings,
      provider,
      onStream,
      validate: (raw) => validateComicOutline(raw),
    });
    repairs += outlineGot.repairs;
    const outline = outlineGot.value;
    project.name = outline.name || project.name || '漫画';
    project.settings.renderMode = 'comic-code';
    project.settings.comicReadingDir = outline.readingDir || 'ltr';
    project.settings.comicWork = outline.work || null;
    project.settings.comicScenes = Array.isArray(outline.scenes) ? outline.scenes : [];

    let x = 80;
    let y = 80;
    let prevPage = null;
    for (let pi = 0; pi < outline.pages.length; pi++) {
      const pb = outline.pages[pi];
      const page = createNode('comic_page', x, y);
      page.props.title = pb.title || `第 ${pi + 1} 页`;
      page.props.format = pb.format === 'spread' ? 'spread' : 'single';
      page.props.spreadRole = pb.spreadRole || 'right';
      page.props.pageBeat = pb.pageBeat || 'dialogue';
      page.props.pageTurnHook = pb.pageTurnHook || '';
      page.props.readingDir = outline.readingDir || pb.readingDir || 'ltr';
      page.props.prompt = prompt;
      page.props.genStatus = 'pending';
      applyPageTaskCard(page, pb);
      project.nodes.push(page);
      if (prevPage) project.edges.push(createEdge(prevPage.id, page.id, 'sequence'));
      prevPage = page;

      const panelsBrief = pb.panels || [];
      // Panel count / size / position come only from AI outline — no host default grid.
      for (let i = 0; i < panelsBrief.length; i++) {
        const br = panelsBrief[i];
        if (
          !br.layout ||
          typeof br.layout !== 'object' ||
          ![br.layout.x, br.layout.y, br.layout.w, br.layout.h].every((n) =>
            Number.isFinite(Number(n)),
          )
        ) {
          throw new Error(
            `大纲页「${pb.title || pi + 1}」格 ${i + 1} 缺少 AI layout；宿主不提供默认分格`,
          );
        }
        const panel = createNode('comic_panel', x + 220, y + i * 100);
        panel.props.title = br.title || `格 ${i + 1}`;
        panel.props.order = Number(br.order) || i + 1;
        panel.props.size = br.size || 'm';
        panel.props.shape = br.shape || 'rect';
        panel.props.gutter = br.gutter || 'normal';
        panel.props.transitionIn = br.transitionIn || 'action';
        panel.props.layout = clampLayout(br.layout);
        panel.props.layoutNote = br.layoutNote || '';
        panel.props.genStatus = 'pending';
        project.nodes.push(panel);
        project.edges.push(createEdge(page.id, panel.id, 'contain'));

        const shot = createNode('comic_shot', x + 440, y + i * 100);
        shot.props.title = br.title || `格内 ${i + 1}`;
        shot.props.prompt = prompt;
        shot.props.genStatus = 'pending';
        shot.props.html = '<div class="layer"></div>';
        shot.props.css = '.layer{position:absolute;inset:0}';
        shot.props.js = '';
        applyDesignCardToNodes(panel, shot, br);
        if (!panel.props.pageSlot) {
          const slot =
            i === 0 ? '开场' : i === panelsBrief.length - 1 ? '页末' : '中段';
          panel.props.pageSlot = br.pageSlot || slot;
          shot.props.pageSlot = panel.props.pageSlot;
        }
        project.nodes.push(shot);
        project.edges.push(createEdge(panel.id, shot.id, 'compose'));
        workList.push({ page, panel, shot });
      }

      x += 720;
      if (x > 1400) {
        x = 80;
        y += 520;
      }
    }

    if (!project.nodes.some((n) => n.type === 'ai')) {
      const ai = createNode('ai', 80, 20);
      ai.props.prompt = prompt;
      ai.props.provider = provider || 'auto';
      ai.props.title = '漫画导演';
      project.nodes.push(ai);
    } else {
      const ai = project.nodes.find((n) => n.type === 'ai');
      if (ai) ai.props.prompt = prompt;
    }

    const sceneCount = project.settings.comicScenes?.length || 0;
    onStream?.({
      type: 'status',
      message: `大纲就绪 · 整体✓ · ${sceneCount} 场景 · ${outline.pages.length} 页 · ${workList.length} 格`,
    });
    notifyProject(onProject, project, {
      phase: 'outline',
      pageCount: outline.pages.length,
      panelCount: workList.length,
      sceneCount,
      hasWork: !!project.settings.comicWork,
    });
  } else {
    for (const page of orderedComicPages(project)) {
      for (const panel of panelsForPage(project, page.id)) {
        const shot = shotForPanel(project, panel.id);
        if (!shot) continue;
        if (shot.props.genStatus === 'done' && shot.props.js && String(shot.props.js).length > 80) {
          continue;
        }
        workList.push({ page, panel, shot });
      }
    }
    if (!workList.length) {
      onStream?.({ type: 'status', message: '没有待生成的格子' });
      return { project, meta: { repairs: 0, panelCount: 0, continued: true } };
    }
    onStream?.({ type: 'status', message: `续跑 ${workList.length} 格…` });
  }

  const graphErr = validateComicGraph(project);
  if (graphErr.length) {
    throw new Error(graphErr.join('；'));
  }

  let done = 0;
  const total = workList.length;
  try {
    for (const item of workList) {
      const { page, panel, shot } = item;
      const pages = orderedComicPages(project);
      const pageIndex = pages.findIndex((p) => p.id === page.id);
      const panels = panelsForPage(project, page.id);
      const panelIndex = panels.findIndex((p) => p.id === panel.id);

      markGenerating(shot, true);
      shot.props.genStatus = 'generating';
      panel.props.genStatus = 'generating';
      notifyProject(onProject, project, {
        phase: 'panel-start',
        pageIndex: pageIndex + 1,
        panelIndex: panelIndex + 1,
        pageId: page.id,
        panelId: panel.id,
        shotId: shot.id,
        total,
        index: done + 1,
      });
      onStream?.({
        type: 'status',
        message: `生成第 ${pageIndex + 1} 页 · 第 ${panelIndex + 1}/${panels.length} 格「${panel.props.title}」…`,
      });
      onStream?.({
        type: 'delta',
        text: `\n\n—— 第 ${pageIndex + 1} 页 / 格 ${panelIndex + 1} ——\n`,
      });

      const cont = buildComicContinuity(project, shot.id);
      const got = await requestModelJson({
        system: SYSTEM_COMIC_SHOT,
        user: buildComicShotUserMessage({
          prompt,
          continuity: {
            storyPrompt: cont.storyPrompt,
            readingDir: cont.readingDir,
            panelIndex: panelIndex + 1,
            panelTotal: panels.length,
          },
          pageBrief: cont.pageBrief,
          panelBrief: cont.panelBrief,
          prevPanel: cont.prevPanel,
          nextPanel: cont.nextPanel,
          prevPage: cont.prevPageSummary,
          nextPage: cont.nextPageSummary,
          doneOnPage: cont.doneOnPage,
        }),
        settings,
        provider,
        onStream,
        validate: (raw) => validateComicShotPayload(raw, `第${pageIndex + 1}页格${panelIndex + 1}`),
      });
      repairs += got.repairs;
      applyShotToComic(shot, got.value, prompt, panel);
      markGenerating(shot, false);
      shot.props.genStatus = 'done';
      panel.props.genStatus = 'done';
      done += 1;
      touch(project);
      notifyProject(onProject, project, {
        phase: 'panel-done',
        pageIndex: pageIndex + 1,
        panelIndex: panelIndex + 1,
        pageId: page.id,
        panelId: panel.id,
        shotId: shot.id,
        index: done,
        total,
      });

      const pageDone = panels.every((pn) => {
        const sh = shotForPanel(project, pn.id);
        return sh?.props?.genStatus === 'done';
      });
      if (pageDone) {
        page.props.genStatus = 'done';
        notifyProject(onProject, project, {
          phase: 'page-done',
          pageIndex: pageIndex + 1,
          pageId: page.id,
        });
      }
    }
  } catch (err) {
    notifyProject(onProject, project, { phase: 'error', message: err.message });
    throw err;
  }

  touch(project);
  notifyProject(onProject, project, { phase: 'complete', panelCount: done });
  onStream?.({ type: 'status', message: `漫画生成完成 · ${done} 格` });
  return {
    project,
    meta: {
      repairs,
      panelCount: done,
      pageCount: orderedComicPages(project).length,
      mode: 'outline-then-panels',
    },
  };
}

/** Regenerate a single comic_shot with neighbor context (like runSceneDirector). */
export async function runComicShotDirector({
  project,
  shotId,
  prompt,
  settings,
  provider,
  onStream,
  onProject,
}) {
  const cont = buildComicContinuity(project, shotId);
  const { shot, panel } = cont;
  const intent =
    prompt ||
    shot.props.prompt ||
    panel.props.brief ||
    cont.storyPrompt ||
    '连贯漫画格';

  markGenerating(shot, true);
  shot.props.genStatus = 'generating';
  notifyProject(onProject, project, { phase: 'panel-start', shotId, kind: 'comic_shot' });
  try {
    const got = await requestModelJson({
      system: SYSTEM_COMIC_SHOT,
      user: buildComicShotUserMessage({
        prompt: intent,
        continuity: {
          storyPrompt: cont.storyPrompt,
          readingDir: cont.readingDir,
          panelIndex: cont.panelIndex + 1,
          panelTotal: cont.panelTotal,
        },
        pageBrief: cont.pageBrief,
        panelBrief: cont.panelBrief,
        prevPanel: cont.prevPanel,
        nextPanel: cont.nextPanel,
        prevPage: cont.prevPageSummary,
        nextPage: cont.nextPageSummary,
        doneOnPage: cont.doneOnPage,
      }),
      settings,
      provider,
      onStream,
      validate: (raw) => validateComicShotPayload(raw, '漫画格'),
    });
    applyShotToComic(shot, got.value, intent, panel);
    markGenerating(shot, false);
    shot.props.genStatus = 'done';
    panel.props.genStatus = 'done';
    touch(project);
    notifyProject(onProject, project, {
      phase: 'panel-done',
      shotId,
      kind: 'comic_shot',
      repairs: got.repairs,
    });
    return {
      project,
      shot,
      meta: {
        repairs: got.repairs,
        continuity: {
          panelIndex: cont.panelIndex + 1,
          panelTotal: cont.panelTotal,
          hasPrev: !!cont.prevPanel,
          hasNext: !!cont.nextPanel,
        },
      },
    };
  } catch (err) {
    markGenerating(shot, false);
    shot.props.genStatus = 'error';
    notifyProject(onProject, project, { phase: 'error', shotId, kind: 'comic_shot' });
    throw err;
  }
}
