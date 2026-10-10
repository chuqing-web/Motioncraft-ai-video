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

/**
 * Fallback panel rects when outline omits layout.
 * Designed (hero + satellites), not equal grids / stacked equal bars.
 */
export function defaultComicPanelLayouts(n) {
  const count = Math.max(1, Math.min(12, Number(n) || 1));
  const g = 0.02;
  const m = 0.04;
  const innerW = 1 - 2 * m;
  if (count === 1) return [{ x: m, y: m, w: innerW, h: 1 - 2 * m }];
  if (count === 2) {
    // Large establish + smaller hook / reaction
    const topH = 0.58;
    return [
      { x: m, y: m, w: innerW, h: topH },
      { x: m, y: m + topH + g, w: innerW, h: 1 - 2 * m - topH - g },
    ];
  }
  if (count === 3) {
    // Hero top + two unequal bottom (left wider)
    const topH = 0.5;
    const botY = m + topH + g;
    const botH = 1 - m - botY;
    const leftW = innerW * 0.58;
    return [
      { x: m, y: m, w: innerW, h: topH },
      { x: m, y: botY, w: leftW, h: botH },
      { x: m + leftW + g, y: botY, w: innerW - leftW - g, h: botH },
    ];
  }
  if (count === 4) {
    // Big left hero + three stacked right
    const heroW = innerW * 0.58;
    const sideX = m + heroW + g;
    const sideW = innerW - heroW - g;
    const rowH = (1 - 2 * m - 2 * g) / 3;
    return [
      { x: m, y: m, w: heroW, h: 1 - 2 * m },
      { x: sideX, y: m, w: sideW, h: rowH },
      { x: sideX, y: m + rowH + g, w: sideW, h: rowH },
      { x: sideX, y: m + 2 * (rowH + g), w: sideW, h: rowH },
    ];
  }
  if (count === 5) {
    // Wide hero + 2 mid + 2 bottom (bottom pair unequal)
    const topH = 0.4;
    const midH = 0.24;
    const botY = m + topH + g + midH + g;
    const botH = 1 - m - botY;
    const midW = (innerW - g) / 2;
    const leftW = innerW * 0.62;
    return [
      { x: m, y: m, w: innerW, h: topH },
      { x: m, y: m + topH + g, w: midW, h: midH },
      { x: m + midW + g, y: m + topH + g, w: midW, h: midH },
      { x: m, y: botY, w: leftW, h: botH },
      { x: m + leftW + g, y: botY, w: innerW - leftW - g, h: botH },
    ];
  }
  if (count === 6) {
    // Hero + five satellites (not 2×3 equal)
    const topH = 0.36;
    const midH = 0.28;
    const botY = m + topH + g + midH + g;
    const botH = 1 - m - botY;
    const third = (innerW - 2 * g) / 3;
    const leftW = innerW * 0.55;
    return [
      { x: m, y: m, w: innerW, h: topH },
      { x: m, y: m + topH + g, w: third, h: midH },
      { x: m + third + g, y: m + topH + g, w: third, h: midH },
      { x: m + 2 * (third + g), y: m + topH + g, w: third, h: midH },
      { x: m, y: botY, w: leftW, h: botH },
      { x: m + leftW + g, y: botY, w: innerW - leftW - g, h: botH },
    ];
  }
  // 7–12: first panel hero strip, remaining in uneven rows (avoid equal cells)
  const heroH = 0.34;
  const rest = count - 1;
  const cols = rest <= 4 ? 2 : 3;
  const rows = Math.ceil(rest / cols);
  const areaH = 1 - 2 * m - heroH - g;
  const cellH = (areaH - g * (rows - 1)) / rows;
  const out = [{ x: m, y: m, w: innerW, h: heroH }];
  for (let i = 0; i < rest; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const rowCols = Math.min(cols, rest - r * cols);
    // last cell in a short row stretches; first col slightly wider
    const weights = Array.from({ length: rowCols }, (_, k) => (k === 0 ? 1.25 : 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    let x = m;
    for (let k = 0; k < c; k++) {
      x += (innerW - g * (rowCols - 1)) * (weights[k] / sum) + g;
    }
    const w = (innerW - g * (rowCols - 1)) * (weights[c] / sum);
    out.push({
      x,
      y: m + heroH + g + r * (cellH + g),
      w,
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
