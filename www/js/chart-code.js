/**
 * Chart node — HTML/CSS/JS like scenes/characters.
 * draw({ ctx, t, duration, rect, motion, props })
 */

export const CHART_MOTIONS = ['grow', 'pulse', 'sweep', 'idle'];

export function defaultChartHtml() {
  return `<div class="chart-root"><div class="chart-label"></div></div>`;
}

export function defaultChartCss() {
  return `
.chart-root{position:absolute;inset:0;pointer-events:none}
.chart-label{position:absolute;left:50%;top:2%;transform:translateX(-50%);
  font:600 11px Segoe UI,Microsoft YaHei,sans-serif;color:rgba(255,255,255,.5)}
`.trim();
}

export function defaultChartJs() {
  return `(function(){
  return {
    setup({ root, props }) {
      const el = root?.querySelector?.('.chart-label');
      if (el) el.textContent = (props && props.title) || 'CHART';
    },
    draw({ ctx, t, duration, rect, motion, props }) {
      if (!rect) return;
      const vals = (props && props.values) || [40,70,55,90,65];
      const color = (props && props.barColor) || '#c45c26';
      const m = motion || (props && props.motion) || 'grow';
      const max = Math.max(...vals, 1);
      const gap = rect.w * 0.04;
      const bw = (rect.w - gap * (vals.length + 1)) / vals.length;
      const base = rect.y + rect.h * 0.92;
      const maxH = rect.h * 0.78;

      let grow = 1;
      if (m === 'grow') grow = Math.min(1, t / Math.max(0.4, duration * 0.45));
      else if (m === 'pulse') grow = 0.85 + 0.15 * Math.sin(t * 3);
      else if (m === 'sweep') grow = 1;
      else grow = 1;

      // panel
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 4; i++) {
        const gy = rect.y + rect.h * 0.15 + i * (maxH / 3);
        ctx.beginPath();
        ctx.moveTo(rect.x + gap, gy);
        ctx.lineTo(rect.x + rect.w - gap, gy);
        ctx.stroke();
      }

      let x = rect.x + gap;
      const revealN = m === 'sweep'
        ? Math.floor(Math.min(1, t / Math.max(0.3, duration * 0.7)) * vals.length + 0.001)
        : vals.length;

      vals.forEach((v, i) => {
        if (i >= revealN) { x += bw + gap; return; }
        const bh = (v / max) * maxH * grow;
        const g = ctx.createLinearGradient(x, base - bh, x, base);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(90,42,18,0.9)');
        ctx.fillStyle = g;
        ctx.fillRect(x, base - bh, bw, bh);
        ctx.fillStyle = 'rgba(230,230,230,0.75)';
        ctx.font = Math.max(9, bw * 0.28) + 'px Consolas,monospace';
        const label = String(Math.round(v * (m === 'grow' ? grow : 1)));
        ctx.fillText(label, x + 2, base - bh - 4);
        x += bw + gap;
      });
    }
  };
})()`;
}

export function synthesizeChartCode(prompt, motion = 'grow') {
  const text = prompt || '数据增长';
  const nums = String(text).match(/\d+/g);
  const values = nums && nums.length >= 3
    ? nums.slice(0, 8).map((n) => Math.min(100, Number(n) || 40))
    : [42, 58, 51, 73, 88, 96];
  const m = CHART_MOTIONS.includes(motion) ? motion : 'grow';
  return {
    title: text.slice(0, 16) || '图表',
    appearance: text,
    prompt: text,
    motion: m,
    values,
    barColor: /蓝|cyan|teal/i.test(text) ? '#3dd6c6' : '#c45c26',
    chartType: 'bars',
    html: defaultChartHtml(),
    css: defaultChartCss(),
    js: defaultChartJs(),
    layout: { x: 0.15, y: 0.25, w: 0.7, h: 0.5 },
  };
}
