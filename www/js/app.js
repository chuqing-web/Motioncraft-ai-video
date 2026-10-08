import {
  NODE_DEFS,
  createEmptyProject,
  createNode,
  touch,
  uid,
} from './model.js';
import { GraphCanvas } from './canvas.js';
import { renderTimeline, updateTimelinePlayhead } from './timeline.js';
import { renderProps } from './props.js';
import { Composer } from './composer.js';
import { beginRecording, downloadBlob } from './export.js';
import {
  runDirector,
  runSceneDirector,
  runCharacterDirector,
  runChartDirector,
  runEffectDirector,
} from './director.js';
import { toast, confirmAsync, formatTime } from './ui.js';
import { TEMPLATES } from './templates.js';
import { pickLocalFile } from './overlays.js';
import { makeDirectorStreamHandlers, getAiStreamSnapshot } from './stream-ui.js';

const TAG = Object.fromEntries(NODE_DEFS.map((d) => [d.type, d.icon]));

const state = {
  project: createEmptyProject('MotionCraft Demo'),
  settings: {
    activeProvider: 'openai',
    bridgePort: Number(new URLSearchParams(location.search).get('bridge')) || 17865,
    providers: {},
  },
  selectedId: null,
  selectedEdgeId: null,
  previewTime: 0,
  paused: false,
  seeded: false,
};

const els = {
  palette: document.getElementById('nodePalette'),
  canvas: document.getElementById('nodeCanvas'),
  svg: document.getElementById('edgesSvg'),
  props: document.getElementById('propsPanel'),
  timeline: document.getElementById('timeline'),
  timelineMeta: document.getElementById('timelineMeta'),
  previewStage: document.getElementById('previewStage'),
  stageRoot: document.getElementById('stageRoot'),
  previewClock: document.getElementById('previewClock'),
  totalDuration: document.getElementById('totalDuration'),
  directorDialog: document.getElementById('directorDialog'),
  settingsDialog: document.getElementById('settingsDialog'),
  directorProvider: document.getElementById('directorProvider'),
  directorPrompt: document.getElementById('directorPrompt'),
  directorLog: document.getElementById('directorLog'),
  emptyCanvas: document.getElementById('emptyCanvas'),
  exportProgress: document.getElementById('exportProgress'),
  assetsDialog: document.getElementById('assetsDialog'),
};

const recordCanvas = document.createElement('canvas');
recordCanvas.width = 1280;
recordCanvas.height = 720;
recordCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:5;';
els.stageRoot.appendChild(recordCanvas);
const composer = new Composer(els.stageRoot, els.previewClock);

function postHost(msg) {
  if (window.chrome?.webview?.postMessage) {
    window.chrome.webview.postMessage(JSON.stringify(msg));
  }
}

function syncHost() {
  postHost({ type: 'project', data: state.project });
}

function refresh() {
  touch(state.project);
  graph.selectedId = state.selectedId;
  graph.selectedEdgeId = state.selectedEdgeId;
  graph.render();
  renderTimeline(els.timeline, state.project, els.timelineMeta, {
    currentTime: state.previewTime,
    onSeek: (t) => seekPreview(t),
  });
  const node = state.project.nodes.find((n) => n.id === state.selectedId) || null;
  renderProps(els.props, node, {
    project: state.project,
    onChange: () => {
      refresh();
      syncHost();
    },
    onDelete: (id) => deleteNode(id),
    onRegenerate: (prompt, provider) => openDirector(prompt, provider),
    onGenerateScene: (sceneId, prompt) => generateSceneForNode(sceneId, prompt),
    onGenerateCharacter: (id, prompt) => generateCharacterForNode(id, prompt),
    onGenerateChart: (id, prompt) => generateChartForNode(id, prompt),
    onGenerateEffect: (id, prompt) => generateEffectForNode(id, prompt),
  });
  els.totalDuration.value = state.project.settings.duration || 12;
  document.title = `${state.project.name || 'MotionCraft'}`;
  if (els.emptyCanvas) {
    els.emptyCanvas.classList.toggle('hidden', state.project.nodes.length > 0);
  }
  syncHost();
}

function deleteNode(id) {
  state.project.nodes = state.project.nodes.filter((n) => n.id !== id);
  state.project.edges = state.project.edges.filter((e) => e.from !== id && e.to !== id);
  state.selectedId = null;
  refresh();
  toast('已删除节点');
}

const graph = new GraphCanvas({
  canvasEl: els.canvas,
  svgEl: els.svg,
  getProject: () => state.project,
  onChange: () => refresh(),
  onSelect: (id) => {
    state.selectedId = id;
    // Only clear edge when selecting a node (not when clearing with null)
    if (id) state.selectedEdgeId = null;
    refresh();
  },
  onSelectEdge: (id) => {
    state.selectedEdgeId = id;
    // Only clear node when selecting an edge — select() also calls
    // onSelectEdge(null) to clear edges; that must not wipe selectedId.
    if (id) state.selectedId = null;
    refresh();
  },
});

function buildPalette() {
  els.palette.innerHTML = '';
  for (const def of NODE_DEFS) {
    const item = document.createElement('div');
    item.className = 'pal-item';
    item.draggable = true;
    item.dataset.type = def.type;
    item.innerHTML = `<span class="tag">${TAG[def.type] || def.icon}</span><span>${def.label}</span>`;
    item.title = '单击添加';
    item.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', def.type));
    // Single click to add — primary interaction
    item.addEventListener('click', (e) => {
      e.preventDefault();
      addNode(def.type);
    });
    els.palette.appendChild(item);
  }
  // Bind drop once
  if (!els.canvas.dataset.dropBound) {
    els.canvas.dataset.dropBound = '1';
    els.canvas.addEventListener('dragover', (e) => e.preventDefault());
    els.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const rect = els.canvas.getBoundingClientRect();
      const parent = els.canvas.parentElement;
      addNode(type, e.clientX - rect.left + parent.scrollLeft - 80, e.clientY - rect.top + parent.scrollTop - 30);
    });
  }
}

function addNode(type, x = 120 + Math.random() * 160, y = 100 + Math.random() * 100) {
  const n = createNode(type, x, y);
  state.project.nodes.push(n);
  state.selectedId = n.id;
  refresh();
  toast(`+ ${NODE_DEFS.find((d) => d.type === type)?.label || type}`, { ms: 1000 });
  return n;
}

async function applyTemplate(id) {
  const tpl = TEMPLATES.find((t) => t.id === id);
  if (!tpl) {
    toast('模板不存在', { type: 'err' });
    return;
  }
  if (state.project.nodes.length && !(await confirmAsync(`加载「${tpl.name}」并替换当前图？`))) return;
  state.project = tpl.build();
  state.selectedId = null;
  state.previewTime = 0;
  refresh();
  toast(`模板: ${tpl.name}`, { type: 'ok' });
}

/** Event delegation — all toolbar / data-act clicks */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  e.preventDefault();
  const act = btn.dataset.act;
  try {
    if (act === 'new') await newProject();
    else if (act === 'open') {
      if (window.chrome?.webview) postHost({ type: 'openProject' });
      else toast('请用宿主菜单打开项目', { type: 'info' });
    } else if (act === 'save') {
      if (window.chrome?.webview) postHost({ type: 'saveProject' });
      else downloadProjectJson();
    } else if (act === 'rename') await renameProject();
    else if (act === 'import-image') await importAsset('image');
    else if (act === 'import-video') await importAsset('video');
    else if (act === 'import-audio') await importAsset('audio');
    else if (act === 'show-assets') showAssets();
    else if (act === 'template-neon') await applyTemplate('neon');
    else if (act === 'template-day') await applyTemplate('day');
    else if (act === 'template-empty') await applyTemplate('empty');
    else if (act === 'template-data') await applyTemplate('data');
  } catch (err) {
    console.error(err);
    toast('操作失败: ' + err.message, { type: 'err' });
  }
});

async function newProject() {
  if (state.project.nodes.length && !(await confirmAsync('新建将清空当前画布，继续？'))) return;
  state.project = createEmptyProject('未命名项目');
  state.selectedId = null;
  state.previewTime = 0;
  refresh();
  toast('已新建空白项目');
}

function downloadProjectJson() {
  const blob = new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${state.project.name || 'project'}.motioncraft.json`);
  toast('已下载项目 JSON');
}

async function renameProject() {
  const name = prompt('项目名称', state.project.name || '');
  if (name == null) return;
  state.project.name = name.trim() || state.project.name;
  refresh();
  toast('已重命名');
}

async function importAsset(kind) {
  const accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*';
  const file = await pickLocalFile(accept);
  if (!file) return;
  const asset = { id: uid('asset'), name: file.name, url: file.url, mime: file.mime, kind };
  state.project.assets = state.project.assets || [];
  state.project.assets.push(asset);
  const n = addNode(kind, 120, 200);
  n.props.src = file.url;
  n.props.assetId = asset.id;
  n.props.title = file.name;
  refresh();
  toast(`已导入 ${file.name}`);
}

function showAssets() {
  const list = document.getElementById('assetsList');
  const assets = state.project.assets || [];
  list.innerHTML = assets.length
    ? assets
        .map(
          (a) =>
            `<div class="asset-row"><strong>${a.kind}</strong> ${a.name}<button type="button" data-aid="${a.id}" class="btn ghost">添加为节点</button></div>`,
        )
        .join('')
    : '<p class="muted">暂无素材。用「素材」菜单导入。</p>';
  list.querySelectorAll('[data-aid]').forEach((btn) => {
    btn.onclick = () => {
      const a = assets.find((x) => x.id === btn.dataset.aid);
      if (!a) return;
      const n = addNode(a.kind || 'image');
      n.props.src = a.url;
      n.props.assetId = a.id;
      n.props.title = a.name;
      refresh();
      els.assetsDialog.close();
    };
  });
  els.assetsDialog.showModal();
}

els.totalDuration.addEventListener('change', () => {
  let v = Number(els.totalDuration.value);
  if (!Number.isFinite(v)) v = 12;
  v = Math.min(600, Math.max(1, v));
  els.totalDuration.value = v;
  state.project.settings.duration = v;
  refresh();
});

function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => {
    e.preventDefault();
    try { fn(e); } catch (err) { toast(String(err.message || err), { type: 'err' }); }
  });
}
bind('btnPreview', () => startPreview(false));
bind('btnExport', () => startPreview(true));
bind('btnStopPreview', () => stopPreview());
bind('btnPausePreview', () => {
  state.paused = !state.paused;
  document.getElementById('btnPausePreview').textContent = state.paused ? '继续' : '暂停';
});
bind('btnDirector', () => openDirector());
bind('btnEmptyDirector', () => openDirector());
bind('btnEmptyTemplate', () => applyTemplate('neon'));
bind('btnSettings', () => openSettings());

function openDirector(prompt, provider) {
  fillProviderSelect();
  if (prompt) els.directorPrompt.value = prompt;
  if (provider) els.directorProvider.value = provider;
  els.directorLog.textContent = '';
  els.directorDialog.showModal();
}

async function generateCharacterForNode(characterId, prompt) {
  const ch = state.project.nodes.find((n) => n.id === characterId && n.type === 'character');
  if (!ch) {
    toast('未找到人物节点', { type: 'err' });
    return;
  }
  const stream = makeDirectorStreamHandlers('人物生成', 'character');
  toast('正在流式生成人物代码…', { type: 'info', ms: 2500 });
  try {
    const { meta } = await runCharacterDirector({
      project: state.project,
      characterId,
      prompt,
      settings: state.settings,
      provider: state.settings.activeProvider || 'auto',
      onStream: stream.onStream,
    });
    state.selectedId = characterId;
    refresh();
    const done = meta.fallback
      ? `人物完成（${meta.fallback}）`
      : meta.repairs
        ? `人物已生成（打回修正 ${meta.repairs} 次）`
        : '人物 HTML/CSS/JS 已生成';
    stream.end(true, done);
    toast(done, { type: meta.fallback ? 'info' : 'ok', ms: 3500 });
  } catch (err) {
    stream.end(false, err.message);
    toast('人物生成失败: ' + err.message, { type: 'err' });
  }
}

async function generateChartForNode(chartId, prompt) {
  if (!state.project.nodes.find((n) => n.id === chartId && n.type === 'chart')) {
    toast('未找到图表节点', { type: 'err' });
    return;
  }
  const stream = makeDirectorStreamHandlers('图表生成', 'chart');
  toast('正在流式生成图表代码…', { type: 'info', ms: 2500 });
  try {
    const { meta } = await runChartDirector({
      project: state.project,
      chartId,
      prompt,
      settings: state.settings,
      provider: state.settings.activeProvider || 'auto',
      onStream: stream.onStream,
    });
    state.selectedId = chartId;
    refresh();
    const done = meta.fallback
      ? `图表完成（${meta.fallback}）`
      : meta.repairs
        ? `图表已生成（打回修正 ${meta.repairs} 次）`
        : '图表 HTML/CSS/JS 已生成';
    stream.end(true, done);
    toast(done, { type: meta.fallback ? 'info' : 'ok', ms: 3500 });
  } catch (err) {
    stream.end(false, err.message);
    toast('图表生成失败: ' + err.message, { type: 'err' });
  }
}

async function generateEffectForNode(effectId, prompt) {
  if (!state.project.nodes.find((n) => n.id === effectId && n.type === 'effect')) {
    toast('未找到特效节点', { type: 'err' });
    return;
  }
  const stream = makeDirectorStreamHandlers('特效生成', 'effect');
  toast('正在流式生成特效代码…', { type: 'info', ms: 2500 });
  try {
    const { meta } = await runEffectDirector({
      project: state.project,
      effectId,
      prompt,
      settings: state.settings,
      provider: state.settings.activeProvider || 'auto',
      onStream: stream.onStream,
    });
    state.selectedId = effectId;
    refresh();
    const done = meta.fallback
      ? `特效完成（${meta.fallback}）`
      : meta.repairs
        ? `特效已生成（打回修正 ${meta.repairs} 次）`
        : '特效 HTML/CSS/JS 已生成';
    stream.end(true, done);
    toast(done, { type: meta.fallback ? 'info' : 'ok', ms: 3500 });
  } catch (err) {
    stream.end(false, err.message);
    toast('特效生成失败: ' + err.message, { type: 'err' });
  }
}

async function generateSceneForNode(sceneId, prompt) {
  const scene = state.project.nodes.find((n) => n.id === sceneId && n.type === 'scene');
  if (!scene) {
    toast('未找到分镜', { type: 'err' });
    return;
  }
  const stream = makeDirectorStreamHandlers('分镜生成', 'scene');
  toast('正在流式生成此镜…', { type: 'info', ms: 2500 });
  try {
    const { meta } = await runSceneDirector({
      project: state.project,
      sceneId,
      prompt,
      settings: state.settings,
      provider: state.settings.activeProvider || 'auto',
      onStream: stream.onStream,
    });
    state.selectedId = sceneId;
    refresh();
    const pos = meta.continuity
      ? `第 ${meta.continuity.index}/${meta.continuity.total} 镜`
      : '此镜';
    const continuityNote =
      meta.continuity?.hasPrev || meta.continuity?.hasNext ? ' · 已注入连贯上下文' : '';
    const attachNote = meta.attachCount ? ` · 附加 ${meta.attachCount} 节点` : '';
    const msg = meta.fallback
      ? `${pos} 完成（${meta.fallback}）`
      : meta.repairs
        ? `${pos} AI 生成完成（打回修正 ${meta.repairs} 次）${continuityNote}${attachNote}`
        : `${pos} AI 生成完成${continuityNote}${attachNote}`;
    stream.end(true, msg);
    toast(msg, { type: meta.fallback ? 'info' : 'ok', ms: 4000 });
  } catch (err) {
    stream.end(false, err.message);
    toast('分镜生成失败: ' + err.message, { type: 'err' });
  }
}

document.getElementById('directorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') {
    els.directorDialog.close();
    return;
  }
  const prompt = els.directorPrompt.value.trim();
  if (!prompt) {
    els.directorLog.textContent = '请输入提示词';
    return;
  }
  const replace = document.getElementById('directorReplace').checked;
  if (replace && state.project.nodes.length && !(await confirmAsync('将替换当前节点图，继续？'))) return;

  const btn = document.getElementById('btnRunDirector');
  btn.disabled = true;
  btn.textContent = '生成中…';
  const stream = makeDirectorStreamHandlers('导演生成', 'director');
  els.directorLog.textContent = '正在流式调用模型…';
  try {
    const { project, meta } = await runDirector({
      prompt,
      duration: Number(els.totalDuration.value) || 12,
      settings: state.settings,
      provider: els.directorProvider.value || 'auto',
      replace,
      currentProject: state.project,
      onStream: stream.onStream,
    });
    state.project = project;
    state.selectedId = null;
    state.previewTime = 0;
    refresh();
    const attachNote = meta.attachCount ? ` · 附加节点 ${meta.attachCount}` : '';
    const msg = meta.fallback
      ? `完成（${meta.fallback}）· ${meta.sceneCount} 镜${attachNote}`
      : meta.repairs
        ? `完成 · 模型代码 ${meta.sceneCount} 镜（打回修正 ${meta.repairs} 次）${attachNote}`
        : `完成 · 模型代码 ${meta.sceneCount} 镜${attachNote}`;
    stream.end(true, msg);
    els.directorLog.textContent = msg;
    toast(msg, { type: meta.fallback ? 'info' : 'ok' });
  } catch (err) {
    stream.end(false, err.message);
    els.directorLog.textContent = '失败: ' + err.message;
    toast('导演失败: ' + err.message, { type: 'err' });
  } finally {
    btn.disabled = false;
    btn.textContent = '生成';
  }
});

function fillProviderSelect() {
  const sel = els.directorProvider;
  sel.innerHTML = `<option value="auto">自动（当前 ${state.settings.activeProvider || 'openai'}）</option>`;
  for (const [id, cfg] of Object.entries(state.settings.providers || {})) {
    sel.innerHTML += `<option value="${id}">${cfg.label || id}${cfg.apiKey || cfg.hasKey ? '' : ' · 无Key'}</option>`;
  }
}

/* ——— Settings (same as before, condensed) ——— */
const settingsUi = { selectedId: null, drafts: {} };

function openSettings() {
  const providers = state.settings.providers || {};
  const ids = Object.keys(providers);
  settingsUi.selectedId =
    state.settings.activeProvider && providers[state.settings.activeProvider]
      ? state.settings.activeProvider
      : ids[0];
  settingsUi.drafts = {};
  renderSettingsList();
  renderSettingsEditor();
  document.getElementById('settingsLockBadge').textContent =
    state.settings.encryptedAtRest === false ? 'LOCAL' : 'DPAPI';
  document.getElementById('settingsStatus').textContent = state.settings.settingsPath
    ? `配置：${state.settings.settingsPath}`
    : '保存后由宿主 DPAPI 加密';
  els.settingsDialog.showModal();
}

function renderSettingsList() {
  const list = document.getElementById('settingsProviderList');
  const providers = state.settings.providers || {};
  list.innerHTML = '';
  for (const id of Object.keys(providers)) {
    const cfg = providers[id];
    const draft = settingsUi.drafts[id];
    const has = draft?.clearKey ? false : !!(draft?.apiKeyDraft || cfg.apiKey || cfg.hasKey);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = id === settingsUi.selectedId ? 'active' : '';
    btn.innerHTML = `<span class="dot ${has ? '' : 'off'}">${has ? '●' : '○'}</span>${cfg.label || id}`;
    btn.onclick = () => {
      settingsUi.selectedId = id;
      renderSettingsList();
      renderSettingsEditor();
    };
    list.appendChild(btn);
  }
}

function renderSettingsEditor() {
  const wrap = document.getElementById('settingsFields');
  const providers = state.settings.providers || {};
  const id = settingsUi.selectedId;
  const cfg = providers[id];
  if (!cfg) {
    wrap.innerHTML = '<p class="muted">无厂商</p>';
    return;
  }
  if (!settingsUi.drafts[id]) settingsUi.drafts[id] = {};
  const draft = settingsUi.drafts[id];
  const mask = cfg.keyMask || '';
  const hint = draft.clearKey
    ? '将在保存后清除密钥'
    : cfg.hasKey || cfg.apiKey
      ? `已加密保存${mask ? `（${mask}）` : ''}，留空保持`
      : '尚未设置密钥';
  wrap.innerHTML = `
    <fieldset>
      <label>默认厂商<select id="setActive">${Object.keys(providers)
        .map((pid) => `<option value="${pid}" ${pid === state.settings.activeProvider ? 'selected' : ''}>${providers[pid].label || pid}</option>`)
        .join('')}</select></label>
      <label>显示名<input data-k="label" value="${esc(cfg.label || id)}" /></label>
      <label>Base URL<input data-k="baseUrl" value="${esc(cfg.baseUrl || '')}" /></label>
      <label>Model<input data-k="model" value="${esc(cfg.model || '')}" /></label>
      <label>API Key
        <div class="key-row">
          <input data-k="apiKey" id="setApiKey" type="password" value="${esc(draft.apiKeyDraft || '')}" placeholder="粘贴新 Key…" autocomplete="off" />
          <button type="button" class="btn ghost" id="btnToggleKey">显示</button>
          <button type="button" class="btn ghost" id="btnClearKey">清除</button>
        </div>
        <div class="hint" id="keyHint">${hint}</div>
      </label>
    </fieldset>`;
  wrap.querySelector('#btnToggleKey').onclick = () => {
    const input = wrap.querySelector('#setApiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  };
  wrap.querySelector('#btnClearKey').onclick = () => {
    draft.clearKey = true;
    draft.apiKeyDraft = '';
    wrap.querySelector('#setApiKey').value = '';
    wrap.querySelector('#keyHint').textContent = '将在保存后清除密钥';
    renderSettingsList();
  };
  wrap.querySelector('#setApiKey').addEventListener('input', (e) => {
    draft.apiKeyDraft = e.target.value;
    draft.clearKey = false;
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

document.getElementById('btnOpenHostSettings')?.addEventListener('click', () => {
  postHost({ type: 'openSettings' });
});

document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') {
    els.settingsDialog.close();
    return;
  }
  const id = settingsUi.selectedId;
  if (id && state.settings.providers[id]) {
    for (const input of document.querySelectorAll('#settingsFields [data-k]')) {
      if (input.dataset.k === 'apiKey') continue;
      state.settings.providers[id][input.dataset.k] = input.value;
    }
  }
  const active = document.getElementById('setActive')?.value;
  if (active) state.settings.activeProvider = active;
  const payloadProviders = {};
  for (const [pid, cfg] of Object.entries(state.settings.providers || {})) {
    const draft = settingsUi.drafts[pid] || {};
    const entry = { label: cfg.label, baseUrl: cfg.baseUrl, model: cfg.model };
    if (draft.clearKey) {
      entry.clearKey = true;
      entry.apiKey = '__CLEAR__';
      cfg.apiKey = '';
      cfg.hasKey = false;
    } else if (draft.apiKeyDraft?.trim()) {
      entry.apiKey = draft.apiKeyDraft.trim();
      cfg.apiKey = entry.apiKey;
      cfg.hasKey = true;
    }
    payloadProviders[pid] = entry;
  }
  const saveBody = { activeProvider: state.settings.activeProvider, providers: payloadProviders };
  postHost({ type: 'saveSettings', data: saveBody });
  fetch(`http://127.0.0.1:${state.settings.bridgePort}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saveBody),
  }).catch(() => {});
  toast('设置已提交保存', { type: 'ok' });
  els.settingsDialog.close();
});

/* ——— Preview / Export ——— */
function stopPreview() {
  composer.stop();
  state.paused = false;
  els.previewStage.classList.add('hidden');
  els.exportProgress.textContent = '';
  document.getElementById('btnPausePreview').textContent = '暂停';
}

function seekPreview(t) {
  state.previewTime = t;
  els.previewStage.classList.remove('hidden');
  if (!composer.shots?.length) composer.build(state.project, recordCanvas);
  composer.paintAt(t);
  els.previewClock.textContent = formatTime(t);
  renderTimeline(els.timeline, state.project, els.timelineMeta, {
    currentTime: t,
    onSeek: (tt) => seekPreview(tt),
  });
}

async function startPreview(doExport) {
  if (!state.project.nodes.some((n) => n.type === 'scene')) {
    toast('请先添加分镜或运行 AI 导演', { type: 'err' });
    return;
  }
  els.previewStage.classList.remove('hidden');
  composer.stop();
  state.paused = false;
  document.getElementById('btnPausePreview').textContent = '暂停';
  const { duration } = composer.build(state.project, recordCanvas);

  let session = null;
  if (doExport) {
    try {
      session = beginRecording(recordCanvas, state.project.settings.fps || 30);
      els.exportProgress.textContent = '录制中…';
    } catch (err) {
      toast('无法开始录制: ' + err.message, { type: 'err' });
      return;
    }
  }

  let pauseAccum = 0;
  let pauseStarted = 0;
  const startTs = performance.now();

  await new Promise((resolve) => {
    composer.playing = true;
    const tick = (now) => {
      if (!composer.playing) {
        resolve();
        return;
      }
      if (state.paused) {
        if (!pauseStarted) pauseStarted = now;
        composer.raf = requestAnimationFrame(tick);
        return;
      }
      if (pauseStarted) {
        pauseAccum += now - pauseStarted;
        pauseStarted = 0;
      }
      const t = (now - startTs - pauseAccum) / 1000;
      state.previewTime = Math.min(t, duration);
      els.previewClock.textContent = formatTime(state.previewTime);
      updateTimelinePlayhead(els.timeline, els.timelineMeta, state.project, state.previewTime);
      if (doExport) {
        els.exportProgress.textContent = `录制 ${Math.min(100, Math.round((t / duration) * 100))}%`;
      }
      composer.paintAt(t);
      if (t >= duration) {
        composer.playing = false;
        resolve();
        return;
      }
      composer.raf = requestAnimationFrame(tick);
    };
    composer.paintAt(0);
    composer.raf = requestAnimationFrame(tick);
  });

  if (session) {
    try {
      const { blob, ext, mime } = await session.stop();
      downloadBlob(blob, `${state.project.name || 'motioncraft'}.${ext}`);
      els.exportProgress.textContent = '';
      toast(`导出完成（${mime}）`, { type: 'ok', ms: 4000 });
    } catch (err) {
      toast('导出失败: ' + err.message, { type: 'err' });
    }
  }
  refresh();
}

/* ——— Keyboard ——— */
window.addEventListener('keydown', async (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
  if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
    e.preventDefault();
    if (graph.deleteSelection()) {
      state.selectedId = graph.selectedId;
      state.selectedEdgeId = graph.selectedEdgeId;
      refresh();
      toast('已删除');
    }
  }
  if (e.key === 'Escape') {
    if (!els.previewStage.classList.contains('hidden')) stopPreview();
    graph.cancelLink();
  }
  if (e.code === 'Space' && !typing && !e.repeat) {
    if (!els.previewStage.classList.contains('hidden') && composer.playing) {
      e.preventDefault();
      state.paused = !state.paused;
      document.getElementById('btnPausePreview').textContent = state.paused ? '继续' : '暂停';
    } else if (els.previewStage.classList.contains('hidden')) {
      e.preventDefault();
      startPreview(false);
    }
  }
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    postHost({ type: 'saveProject' });
    if (!window.chrome?.webview) downloadProjectJson();
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    postHost({ type: 'openProject' });
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    await newProject();
  }
});

/* ——— Host API ——— */
window.MotionCraftAPI = {
  getProject: () => state.project,
  getAiStream: () => getAiStreamSnapshot(),
  setProject(p) {
    state.project = p;
    state.selectedId = null;
    state.previewTime = 0;
    refresh();
    toast('已加载项目');
  },
  setProjectFromBase64(b64) {
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    this.setProject(JSON.parse(json));
  },
  newProject() {
    state.project = createEmptyProject();
    state.selectedId = null;
    refresh();
  },
  onHostReady(host) {
    if (!host?.settings) return;
    state.settings = {
      ...state.settings,
      ...host.settings,
      bridgePort: host.bridgePort || state.settings.bridgePort,
      encryptedAtRest: host.settings.encryptedAtRest !== false,
      settingsPath: host.settings.settingsPath || '',
    };
    if (host.settings.providers) {
      state.settings.providers = {};
      for (const [id, cfg] of Object.entries(host.settings.providers)) {
        state.settings.providers[id] = {
          label: cfg.label || cfg.Label,
          baseUrl: cfg.baseUrl || cfg.BaseUrl,
          model: cfg.model || cfg.Model,
          apiKey: cfg.apiKey || cfg.ApiKey || '',
          hasKey: !!(cfg.hasKey || cfg.apiKey || cfg.ApiKey),
          keyMask: cfg.keyMask || '',
        };
      }
      state.settings.activeProvider = host.settings.activeProvider || state.settings.activeProvider;
    }
  },
  async runCommandFromBase64(b64) {
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return this.runCommand(JSON.parse(json));
  },
  async runCommand(cmd) {
    switch (cmd.action) {
      case 'list_nodes':
        return { ok: true, nodes: state.project.nodes };
      case 'add_node': {
        const n = createNode(cmd.type || 'scene', cmd.x || 120, cmd.y || 120);
        if (cmd.props) Object.assign(n.props, cmd.props);
        state.project.nodes.push(n);
        refresh();
        return { ok: true, node: n };
      }
      case 'connect': {
        const { createEdge } = await import('./model.js');
        state.project.edges.push(createEdge(cmd.from, cmd.to, cmd.kind || 'sequence'));
        refresh();
        return { ok: true };
      }
      case 'update_props': {
        const n = state.project.nodes.find((x) => x.id === cmd.id);
        if (!n) return { ok: false, error: 'not found' };
        Object.assign(n.props, cmd.props || {});
        refresh();
        return { ok: true, node: n };
      }
      case 'run_director': {
        const stream = makeDirectorStreamHandlers('MCP · 导演生成', 'mcp');
        try {
          const { project, meta } = await runDirector({
            prompt: cmd.prompt || '',
            duration: cmd.duration || state.project.settings.duration || 12,
            settings: state.settings,
            provider: cmd.provider || 'auto',
            replace: cmd.replace !== false,
            currentProject: state.project,
            onStream: stream.onStream,
          });
          state.project = project;
          refresh();
          stream.end(true, `完成 · ${meta.sceneCount || 0} 镜`);
          return { ok: true, meta, stream: getAiStreamSnapshot() };
        } catch (err) {
          stream.end(false, err.message);
          throw err;
        }
      }
      case 'run_scene_director': {
        if (!cmd.sceneId) return { ok: false, error: 'sceneId required' };
        const stream = makeDirectorStreamHandlers('MCP · 分镜生成', 'mcp');
        try {
          const { meta } = await runSceneDirector({
            project: state.project,
            sceneId: cmd.sceneId,
            prompt: cmd.prompt || '',
            settings: state.settings,
            provider: cmd.provider || 'auto',
            onStream: stream.onStream,
          });
          refresh();
          stream.end(true, '分镜完成');
          return { ok: true, meta, stream: getAiStreamSnapshot() };
        } catch (err) {
          stream.end(false, err.message);
          throw err;
        }
      }
      case 'run_character_director': {
        if (!cmd.characterId) return { ok: false, error: 'characterId required' };
        const stream = makeDirectorStreamHandlers('MCP · 人物生成', 'mcp');
        try {
          const { meta } = await runCharacterDirector({
            project: state.project,
            characterId: cmd.characterId,
            prompt: cmd.prompt || '',
            settings: state.settings,
            provider: cmd.provider || 'auto',
            onStream: stream.onStream,
          });
          refresh();
          stream.end(true, '人物完成');
          return { ok: true, meta, stream: getAiStreamSnapshot() };
        } catch (err) {
          stream.end(false, err.message);
          throw err;
        }
      }
      case 'run_chart_director': {
        if (!cmd.chartId) return { ok: false, error: 'chartId required' };
        const stream = makeDirectorStreamHandlers('MCP · 图表生成', 'mcp');
        try {
          const { meta } = await runChartDirector({
            project: state.project,
            chartId: cmd.chartId,
            prompt: cmd.prompt || '',
            settings: state.settings,
            provider: cmd.provider || 'auto',
            onStream: stream.onStream,
          });
          refresh();
          stream.end(true, '图表完成');
          return { ok: true, meta, stream: getAiStreamSnapshot() };
        } catch (err) {
          stream.end(false, err.message);
          throw err;
        }
      }
      case 'run_effect_director': {
        if (!cmd.effectId) return { ok: false, error: 'effectId required' };
        const stream = makeDirectorStreamHandlers('MCP · 特效生成', 'mcp');
        try {
          const { meta } = await runEffectDirector({
            project: state.project,
            effectId: cmd.effectId,
            prompt: cmd.prompt || '',
            settings: state.settings,
            provider: cmd.provider || 'auto',
            onStream: stream.onStream,
          });
          refresh();
          stream.end(true, '特效完成');
          return { ok: true, meta, stream: getAiStreamSnapshot() };
        } catch (err) {
          stream.end(false, err.message);
          throw err;
        }
      }
      case 'ai_progress':
        return { ok: true, stream: getAiStreamSnapshot() };
      case 'preview':
        await startPreview(false);
        return { ok: true };
      case 'export_video':
        await startPreview(true);
        return { ok: true };
      case 'get_project':
        return { ok: true, project: state.project };
      default:
        return { ok: false, error: 'unknown action' };
    }
  },
};

try {
  buildPalette();

  if (!Object.keys(state.settings.providers || {}).length) {
    state.settings.providers = {
      openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' },
      anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest', apiKey: '' },
      doubao: { label: '豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'ep-xxxx', apiKey: '' },
      deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' },
      custom: { label: '自定义', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3', apiKey: '' },
    };
  }

  document.getElementById('btnCloseAiStream')?.addEventListener('click', () => {
    document.getElementById('aiStreamPanel')?.classList.add('hidden');
  });

  // First run: neon template
  if (!localStorage.getItem('mc_skip_seed') && !state.project.nodes.length) {
    state.project = TEMPLATES.find((t) => t.id === 'neon').build();
    localStorage.setItem('mc_skip_seed', '1');
  }
  refresh();
  toast('就绪', { ms: 1600 });
} catch (err) {
  const box = document.getElementById('bootError');
  if (box) {
    box.style.display = 'block';
    box.textContent = '初始化失败:\n' + (err.stack || err.message || err);
  }
  console.error(err);
}
