import { bakeTimeline } from './model.js';
import { formatTime } from './ui.js';

/**
 * @param {HTMLElement} el
 * @param {object} project
 * @param {HTMLElement|null} metaEl
 * @param {{ currentTime?: number, onSeek?: (t:number)=>void }} opts
 */
export function renderTimeline(el, project, metaEl, opts = {}) {
  bakeTimeline(project);
  const total = Math.max(0.1, project.settings.bakedDuration || project.settings.duration || 12);
  const current = Math.min(total, Math.max(0, opts.currentTime || 0));
  const step = Math.max(1, Math.floor(total / 5));
  const marks = [];
  for (let t = 0; t <= total + 0.001; t += step) {
    const pct = Math.min(100, (t / total) * 100);
    marks.push(`<span class="tl-mark" style="left:${pct}%">${escapeHtml(formatTime(t))}</span>`);
  }

  // Ruler shares the same 64px | 1fr grid as tracks so % positions align
  let html = `<div class="tl-row tl-ruler-row"><div class="tl-label"></div><div class="tl-ruler" data-total="${total}">${marks.join('')}<div class="tl-playhead" style="left:${(current / total) * 100}%"></div></div></div>`;

  for (const track of project.timeline.tracks) {
    html += `<div class="tl-row"><div class="tl-label">${escapeHtml(track.name)}</div><div class="tl-track" data-total="${total}">`;
    for (const b of track.blocks) {
      const left = (b.start / total) * 100;
      const rawW = (b.duration / total) * 100;
      const width = Math.max(0.35, Math.min(100 - left, rawW));
      const cls = b.type === 'camera' ? 'camera' : b.type === 'audio' || b.type === 'narration' ? 'audio' : '';
      const title = `${b.label} @ ${formatTime(b.start)}`;
      html += `<div class="tl-block ${cls}" data-start="${b.start}" style="left:${left}%;width:${width}%" title="${escapeAttr(title)}">${escapeHtml(b.label)}</div>`;
    }
    html += `<div class="tl-playhead" style="left:${(current / total) * 100}%"></div></div></div>`;
  }
  el.innerHTML = html;
  if (metaEl) {
    metaEl.textContent = `${formatTime(current)} / ${formatTime(total)} · ${project.nodes.length} 节点 · ${project.edges.length} 连线`;
  }

  const seekFromEvent = (e, target) => {
    const totalSec = Number(target.dataset.total) || total;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    opts.onSeek?.(ratio * totalSec);
  };

  el.querySelectorAll('.tl-ruler, .tl-track').forEach((bar) => {
    bar.addEventListener('click', (e) => {
      if (e.target.classList.contains('tl-block')) {
        opts.onSeek?.(Number(e.target.dataset.start) || 0);
        return;
      }
      seekFromEvent(e, bar);
    });
  });
}

/** Move playheads without rebuilding DOM (preview tick). */
export function updateTimelinePlayhead(el, metaEl, project, currentTime) {
  if (!el) return;
  const total = Math.max(0.1, project?.settings?.bakedDuration || project?.settings?.duration || 12);
  const current = Math.min(total, Math.max(0, currentTime || 0));
  const pct = `${(current / total) * 100}%`;
  el.querySelectorAll('.tl-playhead').forEach((ph) => {
    ph.style.left = pct;
  });
  if (metaEl) {
    metaEl.textContent = `${formatTime(current)} / ${formatTime(total)} · ${project.nodes.length} 节点 · ${project.edges.length} 连线`;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
