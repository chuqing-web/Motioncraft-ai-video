/**
 * Effect node — HTML/CSS/JS like scenes/characters.
 * draw({ ctx, t, duration, rect, motion, props })
 * Atmospheric FX are painted full-bleed (host expands rect) — no hard panel boxes.
 */

export const EFFECT_MOTIONS = ['particles', 'glow', 'fade', 'rain', 'spark'];

export function defaultEffectHtml() {
  return `<div class="fx-root" data-fx="particles"></div>`;
}

export function defaultEffectCss() {
  return `.fx-root{position:absolute;inset:0;pointer-events:none}`;
}

export function defaultEffectJs() {
  return `(function(){
  function hash(n){ var x=Math.sin(n*127.1)*43758.5453; return x-Math.floor(x); }
  return {
    setup(){},
    draw({ ctx, t, duration, rect, motion, props }) {
      if (!rect) return;
      const kind = motion || (props && props.effect) || (props && props.motion) || 'particles';
      const dur = Math.max(0.01, duration || 4);
      const x0 = rect.x, y0 = rect.y, W = rect.w, H = rect.h;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, W, H);
      ctx.clip();
      // Soften additive FX — never paint opaque panels
      ctx.globalCompositeOperation = kind === 'fade' ? 'source-over' : 'lighter';

      if (kind === 'glow') {
        const pulses = [
          { x:0.28,y:0.32,c:'255,190,110',phase:0, s:0.42 },
          { x:0.72,y:0.38,c:'90,200,255',phase:1.3, s:0.38 },
          { x:0.52,y:0.58,c:'255,120,170',phase:2.1, s:0.32 },
        ];
        for (const p of pulses) {
          const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.8 + p.phase));
          const cx = x0 + W * p.x;
          const cy = y0 + H * p.y;
          const rad = Math.min(W, H) * p.s * (0.75 + 0.35 * pulse);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, 'rgba('+p.c+','+(0.22*pulse)+')');
          g.addColorStop(0.45, 'rgba('+p.c+','+(0.08*pulse)+')');
          g.addColorStop(1, 'rgba('+p.c+',0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        // sparse bokeh orbs (soft, no box fill)
        for (let i = 0; i < 14; i++) {
          const sx = hash(i * 3.1);
          const sy = hash(i * 5.7 + 2);
          const cx = x0 + ((sx * W + t * (8 + sx * 20)) % W);
          const cy = y0 + sy * H * 0.7;
          const rad = 6 + sx * 18;
          const a = 0.04 + 0.08 * (0.5 + 0.5 * Math.sin(t * 1.2 + i));
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, 'rgba(255,240,200,'+a+')');
          g.addColorStop(1, 'rgba(255,240,200,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      if (kind === 'fade') {
        ctx.globalCompositeOperation = 'source-over';
        const edge = Math.min(Math.min(1, t / 0.85), Math.min(1, (dur - t) / 0.85));
        const veil = 1 - edge;
        if (veil > 0.02) {
          const g = ctx.createRadialGradient(
            x0 + W / 2, y0 + H / 2, H * 0.08,
            x0 + W / 2, y0 + H / 2, H * 0.72);
          g.addColorStop(0, 'rgba(5,7,12,'+(veil * 0.15)+')');
          g.addColorStop(0.55, 'rgba(5,7,12,'+(veil * 0.55)+')');
          g.addColorStop(1, 'rgba(5,7,12,'+(veil * 0.92)+')');
          ctx.fillStyle = g;
          ctx.fillRect(x0, y0, W, H);
        }
        ctx.restore();
        return;
      }

      if (kind === 'rain') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        for (let i = 0; i < 72; i++) {
          const sx = hash(i);
          const spd = 280 + sx * 320;
          const len = 10 + sx * 16;
          const x = x0 + ((sx * W + t * (40 + sx * 50)) % (W + 20)) - 10;
          const y = y0 + ((hash(i + 3) * H + t * spd) % (H + 30)) - 15;
          const a = 0.12 + 0.28 * sx;
          ctx.strokeStyle = 'rgba(170,200,230,'+a+')';
          ctx.lineWidth = 0.8 + sx * 0.7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 3 - sx * 2, y + len);
          ctx.stroke();
        }
        // soft ground mist band (no hard rect edge)
        const mist = ctx.createLinearGradient(x0, y0 + H * 0.72, x0, y0 + H);
        mist.addColorStop(0, 'rgba(180,200,220,0)');
        mist.addColorStop(1, 'rgba(180,200,220,0.08)');
        ctx.fillStyle = mist;
        ctx.fillRect(x0, y0 + H * 0.72, W, H * 0.28);
        ctx.restore();
        return;
      }

      if (kind === 'spark') {
        for (let i = 0; i < 36; i++) {
          const life = (t * (0.9 + hash(i)) + hash(i + 2)) % 1;
          const a = Math.sin(life * Math.PI) * (0.35 + hash(i) * 0.4);
          const ang = hash(i + 4) * Math.PI * 2 + t * (0.8 + hash(i) * 1.4);
          const rr = life * Math.min(W, H) * (0.18 + hash(i + 1) * 0.22);
          const px = x0 + W / 2 + Math.cos(ang) * rr;
          const py = y0 + H / 2 + Math.sin(ang) * rr * 0.55;
          const rad = 1.2 + hash(i) * 2.2 * (1 - life);
          const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 3);
          const col = i % 2 ? '255,90,130' : '80,220,255';
          g.addColorStop(0, 'rgba('+col+','+a+')');
          g.addColorStop(1, 'rgba('+col+',0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, rad * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      // particles — dust / pollen / light motes
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 48; i++) {
        const sx = hash(i);
        const sy = hash(i + 7);
        const drift = t * (12 + sx * 28) * (i % 2 ? 1 : -0.55);
        const px = x0 + ((sx * W + drift + W * 4) % W);
        const py = y0 + ((sy * H + t * (6 + sy * 18) + H * 4) % H);
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + i);
        const a = 0.08 + 0.22 * sx * pulse;
        const rad = 0.8 + sx * 2.4;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.5);
        const col = i % 3 === 0 ? '255,220,170' : '200,220,255';
        g.addColorStop(0, 'rgba('+col+','+a+')');
        g.addColorStop(1, 'rgba('+col+',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rad * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };
})()`;
}

export function synthesizeEffectCode(prompt, motion = 'particles') {
  const text = prompt || '粒子特效';
  let m = motion;
  if (/雨|rain/i.test(text)) m = 'rain';
  else if (/光|glow|bloom|bokeh/i.test(text)) m = 'glow';
  else if (/淡|fade|溶解/i.test(text)) m = 'fade';
  else if (/火花|spark|霓虹/i.test(text)) m = 'spark';
  else if (EFFECT_MOTIONS.includes(motion)) m = motion;
  else m = 'particles';
  return {
    title: text.slice(0, 16) || '特效',
    appearance: text,
    prompt: text,
    motion: m,
    effect: m,
    html: defaultEffectHtml(),
    css: defaultEffectCss(),
    js: defaultEffectJs(),
    layout: { x: 0, y: 0, w: 1, h: 1 },
  };
}
