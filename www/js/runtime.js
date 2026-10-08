/**
 * Compile model-authored IIFE → { setup, draw }.
 * Shared by scenes and character overlays.
 */

/** Strip markdown fences / BOM that models often wrap around js fields. */
export function sanitizeJsSource(jsSource) {
  let s = String(jsSource ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!s) return '';

  const fenced = s.match(/^```(?:javascript|js|ts)?\s*\r?\n([\s\S]*?)\r?\n?```$/i);
  if (fenced) return fenced[1].trim();

  // Opening fence only / trailing fence remnant
  s = s
    .replace(/^```(?:javascript|js|ts)?\s*\r?\n?/i, '')
    .replace(/\r?\n?```$/i, '')
    .trim();
  return s;
}

/**
 * Dry-run compile without painting error placeholders.
 * @returns {{ ok: true, runtime: {setup?:Function, draw:Function} } | { ok: false, error: string }}
 */
export function validateSceneJs(jsSource) {
  const src = sanitizeJsSource(jsSource);
  if (!src) return { ok: false, error: 'empty js' };

  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${src});`)();
    let runtime = value;
    if (typeof value === 'function') {
      runtime = value();
    }
    if (!runtime || typeof runtime !== 'object') {
      return { ok: false, error: 'IIFE must return { setup, draw } object' };
    }
    if (typeof runtime.draw !== 'function') {
      return { ok: false, error: 'missing draw function on returned object' };
    }
    if (runtime.setup != null && typeof runtime.setup !== 'function') {
      return { ok: false, error: 'setup must be a function when present' };
    }
    return { ok: true, runtime };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function compileSceneRuntime(jsSource) {
  const src = sanitizeJsSource(jsSource);
  if (!src) {
    return {
      setup() {},
      draw({ ctx, canvas, t, duration }) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#888';
        ctx.font = '24px sans-serif';
        ctx.fillText('（此镜无模型 JS 代码）', 48, 80);
        ctx.fillRect(0, canvas.height - 4, canvas.width * (t / Math.max(0.01, duration)), 4);
      },
    };
  }

  const result = validateSceneJs(src);
  if (result.ok) {
    const rt = result.runtime;
    return {
      setup: typeof rt.setup === 'function' ? rt.setup.bind(rt) : () => {},
      draw: rt.draw.bind(rt),
    };
  }

  console.warn('compile scene js failed', result.error);
  const msg = result.error || 'unknown';
  return {
    setup() {},
    draw({ ctx, canvas }) {
      ctx.fillStyle = '#300';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '18px monospace';
      const line = 'JS 编译失败: ' + msg;
      ctx.fillText(line.slice(0, 80), 24, 48);
      if (line.length > 80) ctx.fillText(line.slice(80, 160), 24, 72);
    },
  };
}
