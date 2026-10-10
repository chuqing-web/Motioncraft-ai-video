/**
 * Static comic page compositor — paints each comic_shot as a finished still
 * (runtime signature still passes t/duration for API compat; prompts forbid t-driven motion).
 */
import { ensureLayout, layoutToRect } from './layout.js';
import { compileSceneRuntime } from './runtime.js';
import {
  orderedComicPages,
  panelsForPage,
  shotForPanel,
} from './comic-director.js';

function pageSize(page) {
  const w = Number(page?.props?.pageWidth) || 900;
  const h = Number(page?.props?.pageHeight) || 1273;
  return { w, h };
}

function paintShotIntoRect(ctx, rect, shot) {
  const pw = Math.max(8, Math.floor(rect.w));
  const ph = Math.max(8, Math.floor(rect.h));
  const off = document.createElement('canvas');
  off.width = pw;
  off.height = ph;
  const octx = off.getContext('2d');
  octx.fillStyle = '#f2eee6';
  octx.fillRect(0, 0, pw, ph);

  const js = shot?.props?.js || '';
  if (!js || !String(js).includes('draw')) {
    octx.strokeStyle = '#bbb';
    octx.strokeRect(1, 1, pw - 2, ph - 2);
    octx.fillStyle = '#888';
    octx.font = '13px sans-serif';
    octx.fillText(shot?.props?.genStatus === 'generating' ? '生成中…' : '待生成', 10, 22);
    ctx.drawImage(off, rect.x, rect.y);
    return;
  }

  const runtime = compileSceneRuntime(js, { persistProps: shot.props });
  let root = null;
  try {
    root = document.createElement('div');
    root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    if (shot.props.css) {
      const st = document.createElement('style');
      st.textContent = shot.props.css;
      root.appendChild(st);
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = shot.props.html || '<div class="layer"></div>';
    root.appendChild(wrap);
    runtime.setup?.({
      root,
      canvas: off,
      ctx: octx,
      duration: 1,
      props: shot.props,
      layout: { x: 0, y: 0, w: 1, h: 1 },
    });
    runtime.draw?.({
      ctx: octx,
      canvas: off,
      t: 0,
      duration: 1,
      root,
      props: shot.props,
      layout: { x: 0, y: 0, w: 1, h: 1 },
      rect: { x: 0, y: 0, w: pw, h: ph },
    });
  } catch (err) {
    console.warn('comic panel paint failed', shot.id, err);
    octx.fillStyle = 'rgba(196,92,38,0.12)';
    octx.fillRect(0, 0, pw, ph);
    octx.fillStyle = '#c45c26';
    octx.font = '12px sans-serif';
    octx.fillText('绘制失败', 10, 22);
  }

  ctx.drawImage(off, rect.x, rect.y);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = Math.max(2, Math.min(pw, ph) * 0.008);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
}

/**
 * Paint one comic page onto canvas (resizes canvas to page size).
 * @returns {{ canvas: HTMLCanvasElement, page, failed: string[] }}
 */
export function paintComicPage(project, pageId, canvas) {
  const page = project.nodes.find((n) => n.id === pageId && n.type === 'comic_page');
  if (!page) throw new Error('页面不存在');
  const { w, h } = pageSize(page);
  const c = canvas || document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f3eb';
  ctx.fillRect(0, 0, w, h);

  const failed = [];
  const panels = panelsForPage(project, page.id);
  for (const panel of panels) {
    ensureLayout(panel.props, 'comic_panel');
    const rect = layoutToRect(panel.props.layout, w, h);
    const shot = shotForPanel(project, panel.id);
    if (!shot) {
      failed.push(panel.props.title || panel.id);
      continue;
    }
    if (shot.props.genStatus === 'error') failed.push(panel.props.title || panel.id);
    paintShotIntoRect(ctx, rect, shot);
  }

  // page label
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = '11px sans-serif';
  ctx.fillText(page.props.title || 'page', 10, h - 10);

  return { canvas: c, page, failed };
}

export function listComicPageIds(project) {
  return orderedComicPages(project).map((p) => p.id);
}

/** Render all pages to canvases in sequence order. */
export function paintAllComicPages(project) {
  return listComicPageIds(project).map((id) => paintComicPage(project, id));
}
