/**
 * Effect node — HTML/CSS/JS like scenes/characters.
 * draw({ ctx, t, duration, rect, motion, props })
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
  function hash(n){ return ((Math.sin(n*127.1)*43758.5453)%1+1)%1; }
  return {
    setup(){},
    draw({ ctx, t, duration, rect, motion, props }) {
      if (!rect) return;
      const kind = motion || (props && props.effect) || (props && props.motion) || 'particles';
      const dur = Math.max(0.01, duration || 4);

      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();

      if (kind === 'glow') {
        const pulses = [
          { x:0.3,y:0.35,c:'255,180,80',phase:0 },
          { x:0.7,y:0.4,c:'80,200,255',phase:1.2 },
          { x:0.5,y:0.55,c:'255,80,140',phase:2.4 },
        ];
        for (const p of pulses) {
          const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + p.phase));
          const cx = rect.x + rect.w * p.x;
          const cy = rect.y + rect.h * p.y;
          const rad = Math.min(rect.w, rect.h) * (0.25 + 0.2 * pulse);
          const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
          g.addColorStop(0, 'rgba('+p.c+','+(0.28*pulse)+')');
          g.addColorStop(1, 'rgba('+p.c+',0)');
          ctx.fillStyle = g;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.restore();
        return;
      }

      if (kind === 'fade') {
        const edge = Math.min(Math.min(1, t / 0.7), Math.min(1, (dur - t) / 0.7));
        const veil = 1 - edge;
        if (veil > 0.01) {
          ctx.fillStyle = 'rgba(5,7,12,'+(veil*0.92)+')';
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        const vig = ctx.createRadialGradient(
          rect.x+rect.w/2, rect.y+rect.h/2, rect.h*0.15,
          rect.x+rect.w/2, rect.y+rect.h/2, rect.h*0.7);
        vig.addColorStop(0,'rgba(0,0,0,0)');
        vig.addColorStop(1,'rgba(0,0,0,'+(0.25+0.2*(1-edge))+')');
        ctx.fillStyle = vig;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
        return;
      }

      if (kind === 'rain') {
        ctx.strokeStyle = 'rgba(180,210,255,0.35)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 60; i++) {
          const sx = hash(i);
          const x = rect.x + ((sx * rect.w + t * 80) % rect.w);
          const y = rect.y + ((hash(i+3) * rect.h + t * (400+sx*200)) % rect.h);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 2, y + 14 + sx * 10);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      if (kind === 'spark') {
        for (let i = 0; i < 40; i++) {
          const a = t * (1.5 + hash(i)) + i;
          const rr = 20 + hash(i+1) * Math.min(rect.w, rect.h) * 0.35;
          const x = rect.x + rect.w/2 + Math.cos(a) * rr;
          const y = rect.y + rect.h/2 + Math.sin(a) * rr * 0.55;
          ctx.fillStyle = i % 2 ? 'rgba(255,45,106,0.7)' : 'rgba(45,224,255,0.7)';
          ctx.fillRect(x, y, 2.5, 2.5);
        }
        ctx.restore();
        return;
      }

      // particles
      for (let i = 0; i < 56; i++) {
        const sx = hash(i);
        const sy = hash(i + 7);
        const px = rect.x + ((sx * rect.w + t * (20 + sx * 50) * (i % 2 ? 1 : -0.6) + rect.w * 4) % rect.w);
        const py = rect.y + ((sy * rect.h + t * (10 + sy * 30) + rect.h * 4) % rect.h);
        const a = 0.15 + 0.4 * sx * (0.5 + 0.5 * Math.sin(t * 3 + i));
        ctx.fillStyle = i % 3 === 0 ? 'rgba(255,220,160,'+a+')' : 'rgba(200,220,255,'+a+')';
        ctx.beginPath();
        ctx.arc(px, py, 1.2 + sx * 1.8, 0, Math.PI * 2);
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
  else if (/光|glow|bloom/i.test(text)) m = 'glow';
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
