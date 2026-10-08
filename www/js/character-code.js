/**
 * Default / synthesizer for character nodes — HTML/CSS/JS like scenes.
 * draw receives layout rect; motion from props.motion.
 */

export const CHARACTER_MOTIONS = ['idle', 'walk', 'run', 'talk', 'wave'];

export function defaultCharacterHtml() {
  return `<div class="char-root" data-motion="idle"><div class="char-label"></div></div>`;
}

export function defaultCharacterCss() {
  return `
.char-root{position:absolute;inset:0;pointer-events:none}
.char-label{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);
  font:600 11px Segoe UI,Microsoft YaHei,sans-serif;color:rgba(255,255,255,.55);white-space:nowrap}
`.trim();
}

/** Designed half-real silhouette with motion; replace via AI for custom looks */
export function defaultCharacterJs() {
  return `(function(){
  function seed(n){return ((Math.sin(n*127.1)*43758.5453)%1+1)%1;}
  function shade(hex, a){
    var h=(hex||'#1a2230').replace('#','');
    if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    r=Math.max(0,Math.min(255,r*a|0)); g=Math.max(0,Math.min(255,g*a|0)); b=Math.max(0,Math.min(255,b*a|0));
    return 'rgb('+r+','+g+','+b+')';
  }
  function limb(ctx,x,y,ang,len,w0,w1,color){
    ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.moveTo(-w0*0.5,0); ctx.lineTo(-w1*0.5,len); ctx.lineTo(w1*0.5,len); ctx.lineTo(w0*0.5,0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  return {
    setup({ root, props }) {
      const label = root?.querySelector?.('.char-label');
      if (label) label.textContent = (props && props.title) || '';
    },
    draw({ ctx, t, duration, rect, motion, props }) {
      if (!rect) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();

      const m = motion || (props && props.motion) || 'walk';
      const look = (props && props.look) || 'default';
      const coat = (props && props.coatColor) || '#1a2230';
      const skin = (props && props.skinColor) || '#c9a088';
      const hair = (props && props.hairColor) || '#2a2018';
      const scale = Math.min(rect.w, rect.h) / 128;
      const cx = rect.x + rect.w / 2;
      const baseY = rect.y + rect.h * 0.93;

      let phase = 0, bob = 0, leg = 0, arm = 0;
      if (m === 'walk') { phase = t * 5.2; bob = Math.sin(phase) * 2.2; leg = Math.sin(phase) * 16; arm = Math.cos(phase) * 12; }
      else if (m === 'run') { phase = t * 8.5; bob = Math.sin(phase) * 3.5; leg = Math.sin(phase) * 24; arm = Math.cos(phase) * 20; }
      else if (m === 'idle') { bob = Math.sin(t * 1.55) * 1.4; }
      else if (m === 'talk') { bob = Math.sin(t * 1.7) * 1; arm = Math.sin(t * 3.5) * 7; }
      else if (m === 'wave') { bob = Math.sin(t * 2) * 1; arm = 42 + Math.sin(t * 7.5) * 26; }

      let xOff = 0;
      if (m === 'walk' || m === 'run') {
        const u = (t / Math.max(0.01, duration)) % 1;
        xOff = (u - 0.5) * rect.w * 0.42;
      }
      const sway = Math.sin(t * 1.2) * 0.8;
      const coatLag = Math.sin(phase + 0.6) * 2.5;

      ctx.translate(cx + xOff, baseY + bob * scale);
      ctx.scale(scale, scale);

      // contact shadow on ground plane
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(leg * 0.08, 5, 24, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs (tapered) + shoes
      limb(ctx, -7, -42, leg * 0.038, 38, 9, 6, '#141a22');
      limb(ctx, 7, -42, -leg * 0.038, 38, 9, 6, '#10161e');
      ctx.fillStyle = '#0a0e14';
      ctx.beginPath(); ctx.ellipse(-7 + Math.sin(leg*0.04)*2, -2, 7, 3.2, 0.1, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7 - Math.sin(leg*0.04)*2, -2, 7, 3.2, -0.1, 0, Math.PI*2); ctx.fill();

      // coat body with shoulder / hem design
      const g = ctx.createLinearGradient(-20, -100, 18, -28);
      g.addColorStop(0, shade(coat, 1.12));
      g.addColorStop(0.45, coat);
      g.addColorStop(1, shade(coat, 0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-11, -96);
      ctx.lineTo(-20, -78);
      ctx.lineTo(-17 + coatLag * 0.15, -34);
      ctx.quadraticCurveTo(0, -28 + Math.abs(coatLag)*0.1, 17 - coatLag * 0.15, -34);
      ctx.lineTo(20, -78);
      ctx.lineTo(11, -96);
      ctx.quadraticCurveTo(0, -90, -11, -96);
      ctx.fill();
      // collar
      ctx.fillStyle = shade(coat, 0.75);
      ctx.beginPath();
      ctx.moveTo(-8, -96); ctx.lineTo(-3, -88); ctx.lineTo(0, -94); ctx.lineTo(3, -88); ctx.lineTo(8, -96);
      ctx.quadraticCurveTo(0, -100, -8, -96); ctx.fill();

      // arms tapered
      const la = ((-20 + (m === 'wave' ? 0 : arm)) * Math.PI) / 180;
      const ra = (((m === 'wave' ? arm : 16 - arm)) * Math.PI) / 180;
      limb(ctx, -15, -82, la, 30, 8, 5.5, coat);
      ctx.save(); ctx.translate(-15, -82); ctx.rotate(la);
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 32, 3.4, 3.8, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      limb(ctx, 15, -82, ra, 28, 8, 5.5, shade(coat, 0.92));
      ctx.save(); ctx.translate(15, -82); ctx.rotate(ra);
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 30, 3.4, 3.8, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();

      // neck + head (oval jaw), hair mass
      ctx.fillStyle = skin;
      ctx.fillRect(-3.5, -102, 7, 9);
      ctx.beginPath();
      ctx.ellipse(sway * 0.05, -112, 10.5, 12.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // hair volume
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.ellipse(0, -118, 12.5, 9, 0, Math.PI * 1.05, Math.PI * 2.05);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-12, -114); ctx.quadraticCurveTo(-14, -100, -6, -98); ctx.lineTo(-2, -110); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, -114); ctx.quadraticCurveTo(13, -102, 7, -99); ctx.lineTo(2, -110); ctx.fill();

      if (m === 'talk') {
        ctx.fillStyle = '#4a2030';
        const open = 1.2 + Math.abs(Math.sin(t * 10)) * 2.8;
        ctx.beginPath(); ctx.ellipse(0, -106, 2.8, open, 0, 0, Math.PI * 2); ctx.fill();
      }

      // environment rim (cool neon-ish)
      ctx.strokeStyle = 'rgba(120,210,255,0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(4, -112, 9.5, 11.5, 0.05, -1.0, 0.85); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,140,0.12)';
      ctx.beginPath(); ctx.ellipse(-3, -88, 14, 28, 0, 0.2, 1.4); ctx.stroke();

      if (look === 'umbrella' || (props && props.umbrella)) {
        const uSwing = Math.sin(t * 2.2) * 0.08;
        ctx.save(); ctx.translate(12, -100); ctx.rotate(uSwing);
        ctx.strokeStyle = '#1a1c22'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, -42); ctx.stroke();
        const ug = ctx.createLinearGradient(-28, -50, 40, -30);
        ug.addColorStop(0, '#152030'); ug.addColorStop(1, '#0a1018');
        ctx.fillStyle = ug;
        ctx.beginPath();
        ctx.moveTo(-26, -38); ctx.quadraticCurveTo(8, -68, 40, -36);
        ctx.quadraticCurveTo(8, -46, -26, -38); ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }
  };
})()`;
}

/**
 * Offline synthesizer from a character prompt / appearance brief.
 */
export function synthesizeCharacterCode(prompt, motion = 'walk') {
  const text = prompt || '行人';
  const umbrella = /伞|雨|neon|夜/i.test(text);
  const coat = /红|scarlet/i.test(text)
    ? '#5a2030'
    : /蓝|blue/i.test(text)
      ? '#1a3048'
      : /白|风衣/i.test(text)
        ? '#c8cdd4'
        : '#1a2230';
  const m = CHARACTER_MOTIONS.includes(motion) ? motion : 'walk';
  return {
    title: text.slice(0, 16) || '人物',
    motion: m,
    look: umbrella ? 'umbrella' : 'default',
    coatColor: coat,
    skinColor: '#c9a088',
    hairColor: '#2a2018',
    umbrella: umbrella,
    appearance: text,
    html: defaultCharacterHtml(),
    css: defaultCharacterCss(),
    js: defaultCharacterJs(),
    layout: { x: 0.54, y: 0.36, w: 0.26, h: 0.54 },
  };
}
