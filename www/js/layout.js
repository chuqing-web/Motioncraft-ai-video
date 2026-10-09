/**
 * Normalized layout (0–1 of 1280×720 canvas) for overlay nodes.
 * { x, y, w, h } — top-left origin.
 */

export const PLACEABLE = new Set([
  'text',
  'narration',
  'image',
  'video',
  'character',
  'chart',
  'effect',
  'comic_panel',
]);

export function defaultLayout(type) {
  switch (type) {
    case 'text':
      return { x: 0.12, y: 0.78, w: 0.76, h: 0.12 };
    case 'narration':
      return { x: 0.06, y: 0.72, w: 0.88, h: 0.2 };
    case 'image':
    case 'video':
      return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    case 'character':
      // Grounded on street: feet near bottom, slight right third
      return { x: 0.54, y: 0.36, w: 0.26, h: 0.54 };
    case 'chart':
      return { x: 0.15, y: 0.25, w: 0.7, h: 0.5 };
    case 'effect':
      return { x: 0, y: 0, w: 1, h: 1 };
    case 'comic_panel':
      return { x: 0.06, y: 0.06, w: 0.88, h: 0.4 };
    default:
      return { x: 0.2, y: 0.2, w: 0.6, h: 0.4 };
  }
}

/** Default normalized panel rects for a page with n panels (manga-ish grids). */
export function defaultComicPanelLayouts(n) {
  const count = Math.max(1, Math.min(12, Number(n) || 1));
  const g = 0.02;
  const m = 0.05;
  if (count === 1) return [{ x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m }];
  if (count === 2) {
    const h = (1 - 2 * m - g) / 2;
    return [
      { x: m, y: m, w: 1 - 2 * m, h },
      { x: m, y: m + h + g, w: 1 - 2 * m, h },
    ];
  }
  if (count === 3) {
    const topH = 0.42;
    const botH = (1 - 2 * m - g - topH) / 2;
    return [
      { x: m, y: m, w: 1 - 2 * m, h: topH },
      { x: m, y: m + topH + g, w: (1 - 2 * m - g) / 2, h: botH * 2 + g },
      { x: m + (1 - 2 * m - g) / 2 + g, y: m + topH + g, w: (1 - 2 * m - g) / 2, h: botH * 2 + g },
    ];
  }
  const cols = count <= 4 ? 2 : count <= 6 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const cellW = (1 - 2 * m - g * (cols - 1)) / cols;
  const cellH = (1 - 2 * m - g * (rows - 1)) / rows;
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({
      x: m + c * (cellW + g),
      y: m + r * (cellH + g),
      w: cellW,
      h: cellH,
    });
  }
  return out;
}

export function ensureLayout(props, type) {
  if (!props.layout || typeof props.layout !== 'object') {
    props.layout = defaultLayout(type);
  }
  props.layout = clampLayout(props.layout);
  return props.layout;
}

export function clampLayout(L) {
  let x = Number(L.x) || 0;
  let y = Number(L.y) || 0;
  let w = Number(L.w) || 0.2;
  let h = Number(L.h) || 0.2;
  w = Math.max(0.04, Math.min(1, w));
  h = Math.max(0.04, Math.min(1, h));
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { x, y, w, h };
}

/** Pixel rect on a canvas-sized surface */
export function layoutToRect(layout, canvasW, canvasH) {
  const L = clampLayout(layout || defaultLayout('text'));
  return {
    x: L.x * canvasW,
    y: L.y * canvasH,
    w: L.w * canvasW,
    h: L.h * canvasH,
  };
}

export const LAYOUT_PRESETS = [
  { id: 'caption', label: '底部字幕', layout: { x: 0.12, y: 0.78, w: 0.76, h: 0.12 } },
  { id: 'title', label: '居中标题', layout: { x: 0.15, y: 0.38, w: 0.7, h: 0.18 } },
  { id: 'full', label: '全屏', layout: { x: 0, y: 0, w: 1, h: 1 } },
  { id: 'left', label: '左半', layout: { x: 0.04, y: 0.15, w: 0.44, h: 0.7 } },
  { id: 'right', label: '右半', layout: { x: 0.52, y: 0.15, w: 0.44, h: 0.7 } },
  { id: 'pip', label: '画中画', layout: { x: 0.62, y: 0.58, w: 0.32, h: 0.32 } },
];
