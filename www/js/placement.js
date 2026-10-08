import { clampLayout, defaultLayout, LAYOUT_PRESETS, ensureLayout } from './layout.js';

/**
 * Interactive 16:9 placement preview — drag move + corner resize.
 * Writes normalized layout into props.layout continuously.
 */
export function mountPlacement(container, props, type, { onLive } = {}) {
  ensureLayout(props, type);
  const L = props.layout;

  container.innerHTML = `
    <div class="place-head">
      <span>画面放置</span>
      <div class="place-presets">
        ${LAYOUT_PRESETS.map((p) => `<button type="button" class="btn ghost place-preset" data-preset="${p.id}">${p.label}</button>`).join('')}
      </div>
    </div>
    <div class="place-stage" tabindex="0">
      <div class="place-box" style="left:${L.x * 100}%;top:${L.y * 100}%;width:${L.w * 100}%;height:${L.h * 100}%">
        <span class="place-label">${escape(type)}</span>
        <i class="place-h nw" data-h="nw"></i>
        <i class="place-h ne" data-h="ne"></i>
        <i class="place-h sw" data-h="sw"></i>
        <i class="place-h se" data-h="se"></i>
      </div>
    </div>
    <div class="place-nums">
      <label>X<input type="number" step="0.01" min="0" max="1" data-lk="x" value="${fmt(L.x)}" /></label>
      <label>Y<input type="number" step="0.01" min="0" max="1" data-lk="y" value="${fmt(L.y)}" /></label>
      <label>W<input type="number" step="0.01" min="0.04" max="1" data-lk="w" value="${fmt(L.w)}" /></label>
      <label>H<input type="number" step="0.01" min="0.04" max="1" data-lk="h" value="${fmt(L.h)}" /></label>
    </div>
    <p class="muted hint">拖拽框移动 · 四角缩放 · 数值为画面比例 0–1</p>
  `;

  const stage = container.querySelector('.place-stage');
  const box = container.querySelector('.place-box');

  const syncBox = () => {
    const c = clampLayout(props.layout);
    props.layout = c;
    box.style.left = c.x * 100 + '%';
    box.style.top = c.y * 100 + '%';
    box.style.width = c.w * 100 + '%';
    box.style.height = c.h * 100 + '%';
    for (const input of container.querySelectorAll('[data-lk]')) {
      if (document.activeElement !== input) input.value = fmt(c[input.dataset.lk]);
    }
    onLive?.(c);
  };

  container.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.onclick = () => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === btn.dataset.preset);
      if (!preset) return;
      props.layout = clampLayout({ ...preset.layout });
      syncBox();
    };
  });

  container.querySelectorAll('[data-lk]').forEach((input) => {
    input.addEventListener('change', () => {
      props.layout[input.dataset.lk] = Number(input.value);
      syncBox();
    });
  });

  let drag = null;

  const onMove = (e) => {
    if (!drag) return;
    const rect = stage.getBoundingClientRect();
    const dx = (e.clientX - drag.cx) / rect.width;
    const dy = (e.clientY - drag.cy) / rect.height;
    const o = drag.origin;
    if (drag.mode === 'move') {
      props.layout = clampLayout({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h });
    } else {
      let { x, y, w, h } = o;
      const corner = drag.mode;
      if (corner.includes('e')) w = o.w + dx;
      if (corner.includes('s')) h = o.h + dy;
      if (corner.includes('w')) {
        x = o.x + dx;
        w = o.w - dx;
      }
      if (corner.includes('n')) {
        y = o.y + dy;
        h = o.h - dy;
      }
      if (w < 0.04) {
        if (corner.includes('w')) x = o.x + o.w - 0.04;
        w = 0.04;
      }
      if (h < 0.04) {
        if (corner.includes('n')) y = o.y + o.h - 0.04;
        h = 0.04;
      }
      props.layout = clampLayout({ x, y, w, h });
    }
    syncBox();
  };

  const onUp = () => {
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  box.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('place-h')) return;
    e.preventDefault();
    drag = {
      mode: 'move',
      cx: e.clientX,
      cy: e.clientY,
      origin: { ...props.layout },
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  box.querySelectorAll('.place-h').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drag = {
        mode: h.dataset.h,
        cx: e.clientX,
        cy: e.clientY,
        origin: { ...props.layout },
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // init if missing
  if (!props.layout) props.layout = defaultLayout(type);
  syncBox();
}

function fmt(n) {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}
function escape(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
