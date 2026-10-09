/**
 * Comic page pipeline: outline → stream panel-by-panel code (page order × panel order).
 * Reuses director requestModelJson (local repair + bounce) and maximal code rules.
 */
import { createNode, createEdge, createEmptyProject, touch } from './model.js';
import { defaultComicPanelLayouts, clampLayout } from './layout.js';
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
      repairMessage: `【打回修正 — 代码厚度】
${label} 的 html+css+js 合计过短（${total}）。必须三者都加厚，逼近输出上限，禁止简格少写或只厚 js。
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
        repairMessage: '【打回】每一页必须有非空 panels 数组。',
      };
    }
    const mains = page.panels.filter((pan) => pan.panelRole === '主格');
    if (mains.length !== 1) {
      return {
        ok: false,
        error: `页面「${page.title || '?'}」必须恰好 1 个主格（当前 ${mains.length}）`,
        repairBrief: '错误类型：主格数量错误',
        repairMessage: '【打回】每一页 panels 中 panelRole="主格" 必须恰好一个，并与 mainPanelOrder 一致。',
      };
    }
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
      if (missing.length) {
        return {
          ok: false,
          error: `格「${pan.title || pan.order || '?'}」缺少设计卡字段: ${missing.join(',')}`,
          repairBrief: `错误类型：格设计卡不完整\n错在哪里：${missing.join(',')}`,
          repairMessage: `【打回】每一格必须写满设计卡 + panelRole + howServesPage。缺：${missing.join(', ')}。禁止代码。`,
        };
      }
    }
  }
  return { ok: true, value: raw };
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
      const layouts = defaultComicPanelLayouts(panelsBrief.length);
      for (let i = 0; i < panelsBrief.length; i++) {
        const br = panelsBrief[i];
        const panel = createNode('comic_panel', x + 220, y + i * 100);
        panel.props.title = br.title || `格 ${i + 1}`;
        panel.props.order = Number(br.order) || i + 1;
        panel.props.size = br.size || 'm';
        panel.props.shape = br.shape || 'rect';
        panel.props.gutter = br.gutter || 'normal';
        panel.props.transitionIn = br.transitionIn || 'action';
        panel.props.layout = clampLayout(br.layout || layouts[i] || layouts[0]);
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
