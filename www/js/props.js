import { NODE_DEFS, uid } from './model.js';
import { pickLocalFile } from './overlays.js';
import { PLACEABLE, ensureLayout } from './layout.js';
import { mountPlacement } from './placement.js';

export function renderProps(el, node, {
  onChange,
  onDelete,
  onRegenerate,
  onGenerateScene,
  onGenerateCharacter,
  onGenerateChart,
  onGenerateEffect,
  project,
}) {
  if (!node) {
    el.innerHTML = `
      <div class="empty-props">
        <p class="muted">选中节点以编辑</p>
        <p class="muted hint">提示：从左侧拖入节点 · 输出端口拖到输入端口连线 · Delete 删除</p>
      </div>`;
    return;
  }
  const def = NODE_DEFS.find((d) => d.type === node.type);
  const p = node.props;
  const fields = [
    field('title', '标题', p.title),
    field('duration', '时长 (秒)', p.duration, 'number'),
  ];

  if (node.type === 'scene') {
    fields.push(areaField('prompt', '本镜 AI 提示词', p.prompt || p.text || ''));
    fields.push(areaField('text', '字幕/说明', p.text || ''));
    fields.push(`<p class="muted hint">AI 生成会注入 sequence 前后镜 + 成片主题，保证连贯</p>`);
    fields.push(
      `<div class="prop-actions"><button type="button" class="btn accent" id="propGenScene">AI 生成此镜</button></div>`,
    );
    fields.push(areaField('style', '风格 brief', p.style || ''));
    fields.push(areaField('sceneBrief', '环境 brief', p.sceneBrief || ''));
    fields.push(areaField('html', '模型 HTML', p.html || ''));
    fields.push(areaField('css', '模型 CSS', p.css || ''));
    fields.push(areaField('js', '模型 JS (setup/draw)', p.js || ''));
  }
  if (node.type === 'text') {
    fields.push(areaField('text', '文案', p.text || ''));
    fields.push(selectField('animation', '动画', p.animation || 'fade', ['fade', 'type', 'slide', 'rise']));
    fields.push(`<p class="muted hint">fade / type 打字 / slide 横滑 / rise 上浮。与分镜字幕相同时自动跳过</p>`);
  }
  if (node.type === 'narration') {
    fields.push(field('speaker', '说话人/角标', p.speaker || p.title || 'VO'));
    fields.push(areaField('text', '旁白文案', p.text || ''));
    fields.push(
      selectField('animation', '动画', p.animation || 'type', ['type', 'karaoke', 'fade', 'slide', 'rise']),
    );
    fields.push(
      `<label class="row"><input type="checkbox" data-prop-bool="skipIfDuplicate" ${p.skipIfDuplicate ? 'checked' : ''}/> 与分镜字幕相同时跳过</label>`,
    );
    fields.push(
      `<p class="muted hint">下三分栏 VO：角标 + 打字/卡拉OK高亮 + 进度条。attach 到分镜后预览</p>`,
    );
  }
  if (node.type === 'image' || node.type === 'video' || node.type === 'audio') {
    fields.push(field('src', '资源 URL', p.src || ''));
    fields.push(`<div class="prop-actions"><button type="button" class="btn" id="propImport">导入本地文件</button></div>`);
    if (node.type === 'image') {
      fields.push(`<label class="row"><input type="checkbox" data-prop-bool="kenBurns" ${p.kenBurns ? 'checked' : ''}/> Ken Burns</label>`);
    }
    if (node.type === 'video') {
      fields.push(`<label class="row"><input type="checkbox" data-prop-bool="muted" ${p.muted !== false ? 'checked' : ''}/> 静音</label>`);
    }
  }
  if (node.type === 'character') {
    fields.push(areaField('appearance', '形象描述', p.appearance || ''));
    fields.push(areaField('prompt', 'AI 生成提示词', p.prompt || p.appearance || ''));
    fields.push(
      selectField('motion', '运动状态', p.motion || 'walk', [
        'idle',
        'walk',
        'run',
        'talk',
        'wave',
      ]),
    );
    fields.push(selectField('look', '造型', p.look || 'default', ['default', 'umbrella']));
    fields.push(field('coatColor', '衣服色', p.coatColor || '#1a2230'));
    fields.push(field('skinColor', '肤色', p.skinColor || '#c9a088'));
    fields.push(field('hairColor', '发色', p.hairColor || '#2a2018'));
    fields.push(`<label class="row"><input type="checkbox" data-prop-bool="umbrella" ${p.umbrella ? 'checked' : ''}/> 雨伞</label>`);
    fields.push(
      `<div class="prop-actions"><button type="button" class="btn accent" id="propGenChar">AI 生成人物代码</button></div>`,
    );
    fields.push(`<p class="muted hint">人物用 HTML/CSS/JS 绘制；draw({rect,motion,t}) 控制形象与动作。改 JS 后点应用</p>`);
    fields.push(areaField('html', '人物 HTML', p.html || ''));
    fields.push(areaField('css', '人物 CSS', p.css || ''));
    fields.push(areaField('js', '人物 JS (setup/draw)', p.js || ''));
  }
  if (node.type === 'chart') {
    fields.push(areaField('appearance', '图表描述', p.appearance || ''));
    fields.push(areaField('prompt', 'AI 生成提示词', p.prompt || p.appearance || ''));
    fields.push(field('values', '数值 (逗号分隔)', (p.values || []).join(',')));
    fields.push(selectField('motion', '运动状态', p.motion || 'grow', ['grow', 'pulse', 'sweep', 'idle']));
    fields.push(field('barColor', '柱色', p.barColor || '#c45c26'));
    fields.push(
      `<div class="prop-actions"><button type="button" class="btn accent" id="propGenChart">AI 生成图表代码</button></div>`,
    );
    fields.push(`<p class="muted hint">图表用 HTML/CSS/JS；draw({rect,motion,t,props})。改代码后点应用</p>`);
    fields.push(areaField('html', '图表 HTML', p.html || ''));
    fields.push(areaField('css', '图表 CSS', p.css || ''));
    fields.push(areaField('js', '图表 JS (setup/draw)', p.js || ''));
  }
  if (node.type === 'effect') {
    fields.push(areaField('appearance', '特效描述', p.appearance || ''));
    fields.push(areaField('prompt', 'AI 生成提示词', p.prompt || p.appearance || ''));
    fields.push(
      selectField('motion', '运动/类型', p.motion || p.effect || 'particles', [
        'particles',
        'glow',
        'fade',
        'rain',
        'spark',
      ]),
    );
    fields.push(
      `<div class="prop-actions"><button type="button" class="btn accent" id="propGenFx">AI 生成特效代码</button></div>`,
    );
    fields.push(`<p class="muted hint">特效用 HTML/CSS/JS；draw({rect,motion,t})。改代码后点应用</p>`);
    fields.push(areaField('html', '特效 HTML', p.html || ''));
    fields.push(areaField('css', '特效 CSS', p.css || ''));
    fields.push(areaField('js', '特效 JS (setup/draw)', p.js || ''));
  }
  if (node.type === 'camera') {
    fields.push(
      selectField('move', '运镜', p.move || 'pan', [
        'pan',
        'zoom',
        'zoomOut',
        'tilt',
        'handheld',
        'static',
      ]),
    );
    fields.push(field('intensity', '强度 (0–2，建议 0.8–1.4)', p.intensity ?? 1, 'number'));
    fields.push(
      `<label class="row"><input type="checkbox" data-prop-bool="letterbox" ${p.letterbox !== false ? 'checked' : ''}/> 电影遮幅 letterbox</label>`,
    );
    fields.push(
      `<p class="muted hint">pan 大幅横移 · zoom/zoomOut 推拉 · tilt 荷兰角 · handheld 手持抖动 · static 锁定。带暗角与 CAM 指示</p>`,
    );
  }
  if (node.type === 'ai') {
    fields.push(areaField('prompt', '提示词', p.prompt || ''));
    fields.push(field('provider', '厂商', p.provider || 'auto'));
    fields.push(`<div class="prop-actions"><button type="button" class="btn accent" id="propRegen">用此提示词重新导演</button></div>`);
  }

  const placeable = PLACEABLE.has(node.type);
  if (placeable) ensureLayout(p, node.type);

  el.innerHTML = `
    <div class="muted">${def?.icon || ''} ${def?.label || node.type}</div>
    <div class="mono-id">${node.id}</div>
    ${placeable ? '<div id="propPlacement" class="prop-placement"></div>' : ''}
    ${fields.join('')}
    <div class="prop-actions">
      <button type="button" class="btn" id="propApply">应用</button>
      <button type="button" class="btn ghost" id="propDelete">删除</button>
    </div>
  `;

  if (placeable) {
    const host = el.querySelector('#propPlacement');
    mountPlacement(host, p, node.type, {
      onLive: () => {
        // live layout already on props; soft sync without full rebuild
      },
    });
  }

  el.querySelector('#propApply').onclick = () => {
    applyFields(el, p);
    if (node.type === 'character' || node.type === 'chart' || node.type === 'effect') {
      node._codeSetupDone = false;
      node._charSetupDone = false;
      if (node.type === 'effect') p.effect = p.motion || p.effect;
    }
    onChange();
  };
  el.querySelector('#propDelete').onclick = () => onDelete(node.id);

  const importBtn = el.querySelector('#propImport');
  if (importBtn) {
    importBtn.onclick = async () => {
      const accept =
        node.type === 'image' ? 'image/*' : node.type === 'video' ? 'video/*' : 'audio/*';
      const file = await pickLocalFile(accept);
      if (!file) return;
      const asset = {
        id: uid('asset'),
        name: file.name,
        url: file.url,
        mime: file.mime,
        kind: node.type,
      };
      project.assets = project.assets || [];
      project.assets.push(asset);
      p.assetId = asset.id;
      p.src = file.url;
      p.title = p.title || file.name;
      onChange();
    };
  }

  const regen = el.querySelector('#propRegen');
  if (regen) {
    regen.onclick = () => {
      applyFields(el, p);
      onRegenerate?.(p.prompt || '', p.provider || 'auto');
    };
  }

  const genScene = el.querySelector('#propGenScene');
  if (genScene) {
    genScene.onclick = () => {
      applyFields(el, p);
      onGenerateScene?.(node.id, p.prompt || p.text || p.title || '');
    };
  }

  const genChar = el.querySelector('#propGenChar');
  if (genChar) {
    genChar.onclick = () => {
      applyFields(el, p);
      node._codeSetupDone = false;
      node._charSetupDone = false;
      onGenerateCharacter?.(node.id, p.prompt || p.appearance || p.title || '');
    };
  }

  const genChart = el.querySelector('#propGenChart');
  if (genChart) {
    genChart.onclick = () => {
      applyFields(el, p);
      node._codeSetupDone = false;
      onGenerateChart?.(node.id, p.prompt || p.appearance || p.title || '');
    };
  }

  const genFx = el.querySelector('#propGenFx');
  if (genFx) {
    genFx.onclick = () => {
      applyFields(el, p);
      node._codeSetupDone = false;
      onGenerateEffect?.(node.id, p.prompt || p.appearance || p.title || '');
    };
  }
}

function applyFields(el, p) {
  for (const input of el.querySelectorAll('[data-prop]')) {
    const key = input.dataset.prop;
    let val = input.value;
    if (input.type === 'number') val = Number(val);
    if (key === 'values') val = String(val).split(',').map((x) => Number(x.trim()) || 0);
    p[key] = val;
  }
  for (const input of el.querySelectorAll('[data-prop-bool]')) {
    p[input.dataset.propBool] = input.checked;
  }
}

function field(key, label, value, type = 'text') {
  return `<label>${label}<input data-prop="${key}" type="${type}" value="${escapeAttr(value ?? '')}" /></label>`;
}
function areaField(key, label, value) {
  return `<label>${label}<textarea data-prop="${key}">${escapeHtml(value ?? '')}</textarea></label>`;
}
function selectField(key, label, value, options) {
  return `<label>${label}<select data-prop="${key}">${options
    .map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`)
    .join('')}</select></label>`;
}
function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
