/**
 * Paint attached non-scene nodes on top of model draw().
 * Camera transform is applied in Composer before draw().
 * Position/size from props.layout (normalized 0–1).
 */

import { ensureLayout, layoutToRect, defaultLayout } from './layout.js';
import { compileSceneRuntime } from './runtime.js';
import { defaultCharacterJs } from './character-code.js';
import { defaultChartJs } from './chart-code.js';
import { defaultEffectJs } from './effect-code.js';

const mediaCache = new Map();
const codeRuntimeCache = new Map();

function fallbackJs(type) {
  if (type === 'character') return defaultCharacterJs();
  if (type === 'chart') return defaultChartJs();
  if (type === 'effect') return defaultEffectJs();
  return '';
}

function getCodeRuntime(props, type) {
  const js = (props.js && String(props.js).includes('draw') ? props.js : '') || fallbackJs(type);
  const key = type + ':' + js.length + ':' + js.slice(0, 80) + ':' + js.slice(-40);
  if (codeRuntimeCache.has(key)) return codeRuntimeCache.get(key);
  const runtime = compileSceneRuntime(js, { persistProps: props });
  // Cache under repaired source key if host rewrote props.js
  const fixed = props.js && String(props.js);
  if (fixed && fixed !== js) {
    const key2 = type + ':' + fixed.length + ':' + fixed.slice(0, 80) + ':' + fixed.slice(-40);
    codeRuntimeCache.set(key2, runtime);
  }
  codeRuntimeCache.set(key, runtime);
  return runtime;
}

/** Atmospheric FX must cover the full frame — partial rects create hard “panel” boxes. */
function isAtmosphericEffect(props, motion) {
  if (props?.localFx) return false;
  const kind = String(motion || props?.motion || props?.effect || '');
  if (/particles|glow|fade|rain|spark|dust|fog|mist|bloom|bokeh|雪|雾|雨|尘|光/i.test(kind)) return true;
  const L = props?.layout;
  if (L && Number(L.w) >= 0.85 && Number(L.h) >= 0.85) return true;
  return false;
}

/** Shared HTML/CSS/JS overlay painter for character / chart / effect */
function paintCodeOverlay(ctx, canvas, t, duration, props, node, type, defaultMotion) {
  ensureLayout(props, type);
  const motion = props.motion || props.effect || defaultMotion;
  if (type === 'effect' && isAtmosphericEffect(props, motion)) {
    props.layout = { x: 0, y: 0, w: 1, h: 1 };
  }
  const r =
    type === 'effect' && isAtmosphericEffect(props, motion)
      ? { x: 0, y: 0, w: canvas.width, h: canvas.height }
      : rectOf(props, type, canvas);
  const runtime = getCodeRuntime(props, type);

  const flag = '_codeSetupDone';
  if (node && !node[flag]) {
    try {
      if (typeof document !== 'undefined') {
        const root = document.createElement('div');
        root.className = type + '-code-root';
        root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
        if (props.css) {
          const st = document.createElement('style');
          st.textContent = props.css;
          root.appendChild(st);
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = props.html || `<div class="${type}-root"></div>`;
        root.appendChild(wrap);
        node._codeDomRoot = root;
      }
      runtime.setup?.({
        root: node?._codeDomRoot || null,
        canvas,
        ctx,
        duration,
        layout: props.layout,
        props,
        motion,
      });
      if (node) node[flag] = true;
    } catch (err) {
      console.warn(type + ' setup failed', err);
    }
  }

  try {
    runtime.draw?.({
      ctx,
      canvas,
      t,
      duration,
      root: node?._codeDomRoot || null,
      layout: props.layout,
      rect: r,
      motion,
      props,
    });
  } catch (err) {
    console.warn(type + ' draw failed', err);
    // Do not paint a tinted box — that reads as a broken “panel” on screen
  }
}

function rectOf(props, type, canvas) {
  const L = props.layout || defaultLayout(type);
  return layoutToRect(L, canvas.width, canvas.height);
}

export function resolveAssetUrl(project, props) {
  if (props?.assetId) {
    const a = project.assets?.find((x) => x.id === props.assetId);
    if (a?.url) return a.url;
  }
  return props?.src || '';
}

/**
 * Strong cinematic camera — call inside ctx.save() before draw.
 * Moves: pan | zoom | zoomOut | tilt | handheld | static
 * intensity 0–2 (default 1.0 feels obvious on 1280 canvas)
 */
export function applyCameraTransform(ctx, canvas, cam, localT, duration) {
  if (!cam) return;
  const intensity = Math.max(0, Math.min(2, Number(cam.props.intensity) ?? 1));
  const move = cam.props.move || 'pan';
  const dur = Math.max(0.01, duration || 4);
  const u = Math.min(1, Math.max(0, localT / dur));
  // smoother cinematic ease (less snappy than classic smoothstep alone)
  const ease = u * u * (3 - 2 * u);
  const easeIn = u * u;
  const easeOut = 1 - (1 - u) * (1 - u);
  const w = canvas.width;
  const h = canvas.height;

  // Subtle handheld — strong shake reads as broken framing
  const shakeAmp = intensity * (move === 'handheld' ? 5.5 : 2.2);
  const handX = Math.sin(localT * 5.1) * shakeAmp + Math.sin(localT * 9.7) * shakeAmp * 0.28;
  const handY = Math.cos(localT * 4.4) * shakeAmp * 0.7 + Math.sin(localT * 8.3) * shakeAmp * 0.22;
  const handRot = Math.sin(localT * 3.1) * intensity * (move === 'handheld' ? 0.007 : 0.0025);

  const pivot = () => {
    ctx.translate(w / 2, h / 2);
  };
  const unpivot = () => {
    ctx.translate(-w / 2, -h / 2);
  };

  if (move === 'static') {
    const settle = (1 - easeOut) * intensity * 5;
    ctx.translate(settle * 0.35 + handX * 0.12, settle * 0.15 + handY * 0.12);
    return;
  }

  if (move === 'handheld') {
    pivot();
    ctx.rotate(handRot);
    ctx.translate(handX, handY);
    const sc = 1.08 + intensity * 0.03; // overscan hides shake edges
    ctx.scale(sc, sc);
    unpivot();
    return;
  }

  if (move === 'pan') {
    const sweep = (ease - 0.5) * 2;
    const dx = sweep * intensity * 72 + handX;
    const dy = Math.sin(ease * Math.PI) * intensity * 12 + handY;
    pivot();
    ctx.rotate(handRot * 0.45);
    ctx.translate(dx, dy);
    ctx.scale(1.1 + intensity * 0.03, 1.1 + intensity * 0.03);
    unpivot();
    return;
  }

  if (move === 'zoom') {
    const sc = 1 + intensity * 0.22 * ease;
    pivot();
    ctx.rotate(handRot * 0.6);
    ctx.translate(handX * 0.4, handY * 0.4);
    ctx.scale(sc, sc);
    unpivot();
    return;
  }

  if (move === 'zoomOut') {
    const sc = 1 + intensity * 0.22 * (1 - ease);
    pivot();
    ctx.rotate(handRot * 0.6);
    ctx.translate(handX * 0.35, handY * 0.35);
    ctx.scale(Math.max(1.04, sc), Math.max(1.04, sc));
    unpivot();
    return;
  }

  if (move === 'tilt') {
    const ang = (ease - 0.5) * 2 * intensity * 0.05;
    const dy = (easeIn - 0.5) * intensity * 24;
    pivot();
    ctx.rotate(ang + handRot);
    ctx.translate(handX, dy + handY);
    ctx.scale(1.12, 1.12);
    unpivot();
    return;
  }

  // fallback: gentle pan with overscan
  pivot();
  ctx.translate((ease - 0.5) * intensity * 56 + handX, handY);
  ctx.scale(1.08, 1.08);
  unpivot();
}

/**
 * Screen-space camera chrome AFTER ctx.restore() — letterbox, focus pulse, edge vignette.
 */
export function paintCameraChrome(ctx, canvas, cam, localT, duration) {
  if (!cam) return;
  const intensity = Math.max(0, Math.min(2, Number(cam.props.intensity) ?? 1));
  const move = cam.props.move || 'pan';
  const letterbox = cam.props.letterbox !== false;
  const w = canvas.width;
  const h = canvas.height;
  const dur = Math.max(0.01, duration || 4);
  const u = Math.min(1, localT / dur);

  ctx.save();
  if (letterbox) {
    // Slimmer bars — thick bars + vignette stacked like opaque “panels”
    const bar = h * (0.055 + intensity * 0.012);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.88;
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#c45c26';
    ctx.fillRect(0, bar - 1, w, 1);
    ctx.fillRect(0, h - bar, w, 1);
  }

  // Soft vignette (avoid a second dark rectangle in the frame)
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.65, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(0,0,0,${0.22 + intensity * 0.08})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // Tiny HUD — only first ~0.9s, low opacity
  const labA = Math.max(0, 1 - localT / 0.9) * 0.45;
  if (labA > 0.03) {
    ctx.globalAlpha = labA;
    ctx.font = '600 11px Consolas, monospace';
    ctx.fillStyle = '#c45c26';
    const label = `CAM · ${String(move).toUpperCase()}`;
    ctx.fillText(label, 14, letterbox ? h * 0.08 + 12 : 18);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(14, letterbox ? h * 0.08 + 16 : 22, 64, 1.5);
    ctx.fillStyle = '#c45c26';
    ctx.fillRect(14, letterbox ? h * 0.08 + 16 : 22, 64 * u, 1.5);
  }
  ctx.restore();
}

export function paintOverlays(ctx, canvas, attached, localT, duration, project, scene) {
  if (!attached?.length) return;
  for (const n of attached) {
    try {
      switch (n.type) {
        case 'text': {
          const text = n.props.text || n.props.title || '';
          if (shouldSkipCaption(scene, text)) break;
          paintCaption(ctx, canvas, text, localT, duration, n.props, 'text');
          break;
        }
        case 'narration': {
          const text = n.props.text || n.props.title || '';
          // VO lower-third is intentional — only skip when user opts in
          if (n.props.skipIfDuplicate && shouldSkipCaption(scene, text)) break;
          paintNarration(ctx, canvas, text, localT, duration, n.props);
          break;
        }
        case 'image':
          paintImage(ctx, canvas, resolveAssetUrl(project, n.props), n.props, localT, duration);
          break;
        case 'video':
          paintVideo(ctx, canvas, resolveAssetUrl(project, n.props), n.props, localT);
          break;
        case 'character':
          paintCodeOverlay(ctx, canvas, localT, duration, n.props, n, 'character', 'walk');
          break;
        case 'chart':
          paintCodeOverlay(ctx, canvas, localT, duration, n.props, n, 'chart', 'grow');
          break;
        case 'effect':
          paintCodeOverlay(
            ctx,
            canvas,
            localT,
            duration,
            n.props,
            n,
            'effect',
            n.props.effect || 'particles',
          );
          break;
        case 'camera':
          break;
        default:
          break;
      }
    } catch {
      /* skip overlay errors */
    }
  }
}

/** Avoid double subtitles when scene JS already paints the same caption. */
function shouldSkipCaption(scene, text) {
  if (!scene || !text) return false;
  const js = String(scene.props?.js || '');
  if (!js.includes('draw')) return false;
  // scene code embeds this exact string → assume draw paints it
  if (js.includes(JSON.stringify(text)) || js.includes(text)) return true;
  // same as scene.props.text and scene has caption-like drawing helpers
  if (scene.props?.text === text && /caption|fillText\s*\(/i.test(js)) return true;
  return false;
}

function paintCaption(ctx, canvas, text, t, duration, props = {}, kind = 'text') {
  if (!text) return;
  ensureLayout(props, kind === 'narration' ? 'narration' : 'text');
  const r = rectOf(props, kind === 'narration' ? 'narration' : 'text', canvas);
  const anim = props.animation || 'fade';
  const dur = Math.max(0.01, duration || 4);
  const fadeIn = 0.35;
  const fadeOut = 0.4;
  let alpha = 1;
  if (t < fadeIn) alpha = t / fadeIn;
  if (t > dur - fadeOut) alpha = Math.max(0, (dur - t) / fadeOut);

  const fontSize = Math.max(16, Math.min(56, r.h * 0.48));
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  ctx.clip();

  let display = text;
  let slideOff = 0;
  let riseOff = 0;

  if (anim === 'slide') {
    const p = Math.min(1, t / 0.5);
    const ease = 1 - Math.pow(1 - p, 3);
    slideOff = (1 - ease) * r.w * 0.35;
    alpha *= ease;
  } else if (anim === 'rise') {
    const p = Math.min(1, t / 0.55);
    const ease = 1 - Math.pow(1 - p, 3);
    riseOff = (1 - ease) * r.h * 0.8;
    alpha *= ease;
  } else if (anim === 'type') {
    const cps = Math.max(10, text.length / 1.4);
    const n = Math.min(text.length, Math.floor(t * cps));
    display = text.slice(0, n);
    if (!display) {
      ctx.restore();
      return;
    }
  } else {
    alpha *= Math.min(1, t / fadeIn);
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(r.x, r.y + riseOff, r.w, r.h);
  ctx.fillStyle = '#c45c26';
  ctx.fillRect(r.x, r.y + riseOff + r.h - 3, r.w, 3);

  ctx.font = `600 ${fontSize}px Segoe UI, Microsoft YaHei, sans-serif`;
  const tw = ctx.measureText(display).width;
  const tx = r.x + (r.w - tw) / 2 + slideOff;
  const ty = r.y + riseOff + r.h * 0.62;
  ctx.fillStyle = '#f2f4f7';
  ctx.fillText(display, tx, ty);

  if (anim === 'type' && display.length < text.length && Math.floor(t * 5) % 2 === 0) {
    ctx.fillStyle = '#c45c26';
    ctx.fillRect(tx + tw + 3, ty - fontSize * 0.8, 3, fontSize);
  }
  ctx.restore();
}

/** Lower-third VO narration — distinct from plain text captions */
function paintNarration(ctx, canvas, text, t, duration, props = {}) {
  if (!text) return;
  ensureLayout(props, 'narration');
  const r = rectOf(props, 'narration', canvas);
  const anim = props.animation || 'type';
  const dur = Math.max(0.01, duration || 4);
  const speaker = props.speaker || props.title || 'VO';

  const fadeIn = 0.45;
  const fadeOut = 0.5;
  let alpha = 1;
  if (t < fadeIn) alpha = easeOutCubic(t / fadeIn);
  if (t > dur - fadeOut) alpha = Math.max(0, (dur - t) / fadeOut);

  // reveal progress for karaoke / type
  let reveal = 1;
  if (anim === 'type' || anim === 'karaoke') {
    reveal = Math.min(1, t / Math.max(0.8, dur * 0.75));
  } else if (anim === 'fade') {
    reveal = Math.min(1, t / fadeIn);
  } else if (anim === 'slide' || anim === 'rise') {
    reveal = Math.min(1, t / 0.55);
  }

  const slideX = anim === 'slide' ? (1 - easeOutCubic(Math.min(1, t / 0.55))) * r.w * 0.4 : 0;
  const riseY = anim === 'rise' ? (1 - easeOutCubic(Math.min(1, t / 0.55))) * 40 : 0;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // soft full-width dim behind lower third
  const dim = ctx.createLinearGradient(0, r.y - 30, 0, r.y + r.h + 20);
  dim.addColorStop(0, 'rgba(0,0,0,0)');
  dim.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  dim.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = dim;
  ctx.fillRect(0, r.y - 40, canvas.width, r.h + 80);

  const bx = r.x + slideX;
  const by = r.y + riseY;

  // panel
  ctx.fillStyle = 'rgba(12,14,18,0.82)';
  roundRectPath(ctx, bx, by, r.w, r.h, 6);
  ctx.fill();

  // accent bar left
  ctx.fillStyle = '#c45c26';
  ctx.fillRect(bx, by, 4, r.h);

  // VO badge
  ctx.fillStyle = '#c45c26';
  const badgeW = Math.max(36, Math.min(72, r.w * 0.12));
  ctx.fillRect(bx + 14, by + 10, badgeW, 18);
  ctx.fillStyle = '#fff';
  ctx.font = '700 11px Segoe UI, Microsoft YaHei, sans-serif';
  ctx.fillText(String(speaker).slice(0, 6).toUpperCase(), bx + 20, by + 23);

  // body text
  const fontSize = Math.max(15, Math.min(28, r.h * 0.32));
  ctx.font = `500 ${fontSize}px Segoe UI, Microsoft YaHei, sans-serif`;
  const maxW = r.w - 28 - badgeW;
  const lines = wrapText(ctx, text, maxW);
  const lineH = fontSize * 1.35;
  let ty = by + 42;

  if (anim === 'karaoke') {
    const totalChars = text.length || 1;
    const shown = Math.floor(reveal * totalChars);
    let count = 0;
    for (const line of lines.slice(0, 3)) {
      let x = bx + 14 + badgeW + 8;
      for (const ch of line) {
        ctx.fillStyle = count < shown ? '#f5f7fa' : 'rgba(180,190,200,0.35)';
        ctx.fillText(ch, x, ty);
        x += ctx.measureText(ch).width;
        count++;
      }
      ty += lineH;
    }
  } else if (anim === 'type') {
    const flat = lines.join('');
    const n = Math.floor(reveal * flat.length);
    let left = n;
    for (const line of lines.slice(0, 3)) {
      const slice = line.slice(0, Math.max(0, left));
      left -= line.length;
      ctx.fillStyle = '#eef1f5';
      ctx.fillText(slice, bx + 14 + badgeW + 8, ty);
      if (left <= 0 && n < flat.length && Math.floor(t * 5) % 2 === 0) {
        const tw = ctx.measureText(slice).width;
        ctx.fillStyle = '#c45c26';
        ctx.fillRect(bx + 14 + badgeW + 8 + tw + 2, ty - fontSize * 0.85, 2, fontSize);
      }
      ty += lineH;
      if (left <= 0) break;
    }
  } else {
    ctx.fillStyle = '#eef1f5';
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, bx + 14 + badgeW + 8, ty);
      ty += lineH;
    }
  }

  // timing progress under panel
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by + r.h - 3, r.w, 3);
  ctx.fillStyle = '#c45c26';
  ctx.fillRect(bx, by + r.h - 3, r.w * Math.min(1, t / dur), 3);

  ctx.restore();
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function wrapText(ctx, text, maxW) {
  const chars = String(text);
  const lines = [];
  let line = '';
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = ch;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function roundRectPath(ctx, x, y, w, h, rad) {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintImage(ctx, canvas, src, props, t, duration) {
  if (!src) return;
  const img = getImage(src);
  if (!img || !img.complete || !img.naturalWidth) return;
  ensureLayout(props, 'image');
  const r = rectOf(props, 'image', canvas);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  let scale = 1;
  if (props.kenBurns) scale = 1 + 0.08 * (t / Math.max(0.01, duration));
  const w = r.w * scale;
  const h = r.h * scale;
  ctx.globalAlpha = Math.min(1, Number(props.opacity) || 1);
  ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  ctx.restore();
}

function paintVideo(ctx, canvas, src, props, t) {
  if (!src) return;
  const v = getVideo(src, props.muted !== false);
  if (!v || v.readyState < 2) return;
  if (Math.abs(v.currentTime - t) > 0.35) {
    try {
      v.currentTime = t;
    } catch {
      /* ignore */
    }
  }
  if (v.paused) v.play().catch(() => {});
  ensureLayout(props, 'video');
  const r = rectOf(props, 'video', canvas);
  ctx.drawImage(v, r.x, r.y, r.w, r.h);
}

function getImage(src) {
  if (mediaCache.has(src)) return mediaCache.get(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  mediaCache.set(src, img);
  return img;
}

function getVideo(src, muted) {
  const key = 'v:' + src;
  if (mediaCache.has(key)) return mediaCache.get(key);
  const v = document.createElement('video');
  v.src = src;
  v.muted = muted;
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  mediaCache.set(key, v);
  return v;
}

export function pickLocalFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      resolve({ name: file.name, url, mime: file.type, size: file.size });
    };
    input.click();
  });
}
