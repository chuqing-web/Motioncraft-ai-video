/**
 * Hand-authored comic panel draw() IIFEs for the comic demo template.
 * Each export returns a self-contained IIFE string (Composer / ComicComposer).
 */

function wrap(body) {
  return `(function(){
  return {
    setup(){},
    draw({ctx,canvas,t,duration}){
      const w=canvas.width,h=canvas.height;
${body}
    }
  };
})()`;
}

/** Page1 · 远景晨街 */
export function comicPanelSkyline() {
  return wrap(`
      ${balloonFn()}
      const g=ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#7ec4e8'); g.addColorStop(0.55,'#d9eaf4'); g.addColorStop(1,'#f3e2c0');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      ctx.fillStyle='rgba(255,240,180,0.9)';
      ctx.beginPath(); ctx.arc(w*0.82,h*0.18,Math.min(w,h)*0.08,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,230,160,0.25)';
      ctx.beginPath(); ctx.arc(w*0.82,h*0.18,Math.min(w,h)*0.22,0,Math.PI*2); ctx.fill();
      for(let i=0;i<7;i++){
        const bw=w*(0.1+ (i%3)*0.02), bh=h*(0.28+((i*37)%40)/100);
        const x=w*0.04+i*(w*0.13);
        const y=h*0.72-bh;
        ctx.fillStyle=i%2?'#6a8fa8':'#5a7a90';
        ctx.fillRect(x,y,bw,bh);
        ctx.fillStyle='rgba(255,250,220,0.35)';
        for(let r=0;r<4;r++) for(let c=0;c<2;c++)
          ctx.fillRect(x+6+c*12,y+10+r*14,7,9);
      }
      ctx.fillStyle='#c4b49a'; ctx.fillRect(0,h*0.72,w,h*0.28);
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=3; ctx.setLineDash([14,10]);
      ctx.beginPath(); ctx.moveTo(0,h*0.86); ctx.lineTo(w,h*0.86); ctx.stroke(); ctx.setLineDash([]);
      const px=w*0.35, py=h*0.78;
      ctx.fillStyle='#2a2a2a';
      ctx.beginPath(); ctx.arc(px,py-18,7,0,Math.PI*2); ctx.fill();
      ctx.fillRect(px-5,py-12,10,16);
      ctx.fillRect(px-8,py+4,6,10); ctx.fillRect(px+2,py+4,6,10);
      drawBalloon(ctx,w*0.08,h*0.08,w*0.42,h*0.16,'晨光里的街道……');
  `);
}

/** Page1 · 中景侧脸 */
export function comicPanelCloseLook() {
  return wrap(`
      ${balloonFn()}
      const g=ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#b8d8ea'); g.addColorStop(1,'#efe4d0');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      // soft window light
      ctx.fillStyle='rgba(255,248,210,0.45)';
      ctx.beginPath(); ctx.moveTo(w*0.55,0); ctx.lineTo(w,0); ctx.lineTo(w,h); ctx.lineTo(w*0.35,h); ctx.fill();
      // head
      const cx=w*0.42, cy=h*0.48, r=Math.min(w,h)*0.28;
      ctx.fillStyle='#f2c8a8';
      ctx.beginPath(); ctx.ellipse(cx,cy,r*0.85,r,0,0,Math.PI*2); ctx.fill();
      // hair
      ctx.fillStyle='#2c241c';
      ctx.beginPath(); ctx.ellipse(cx-r*0.1,cy-r*0.35,r*0.95,r*0.7, -0.2, Math.PI*1.1, Math.PI*2.1); ctx.fill();
      ctx.fillRect(cx-r*0.9,cy-r*0.2,r*0.35,r*1.1);
      // eye
      ctx.fillStyle='#1a1a1a';
      ctx.beginPath(); ctx.ellipse(cx+r*0.25,cy-r*0.05,r*0.12,r*0.16,0.1,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(cx+r*0.28,cy-r*0.1,r*0.04,0,Math.PI*2); ctx.fill();
      // mouth soft
      ctx.strokeStyle='#c48a6a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx+r*0.2,cy+r*0.35,r*0.12,0.1,Math.PI-0.1); ctx.stroke();
      // shoulder
      ctx.fillStyle='#3d6e8f';
      ctx.beginPath(); ctx.ellipse(cx,cy+r*1.15,r*1.1,r*0.45,0,Math.PI,0); ctx.fill();
      drawBalloon(ctx,w*0.05,h*0.06,w*0.7,h*0.2,'今天的风好暖。');
  `);
}

/** Page1 · 手部细节 */
export function comicPanelHands() {
  return wrap(`
      ${balloonFn()}
      ctx.fillStyle='#e8dcc8'; ctx.fillRect(0,0,w,h);
      // table
      ctx.fillStyle='#a67c52'; ctx.fillRect(0,h*0.55,w,h*0.45);
      ctx.fillStyle='#8a643f'; ctx.fillRect(0,h*0.55,w,h*0.04);
      // cup
      const cx=w*0.55, cy=h*0.48;
      ctx.fillStyle='#f5f0e6';
      ctx.beginPath(); ctx.moveTo(cx-28,cy-10); ctx.lineTo(cx-22,cy+40); ctx.lineTo(cx+22,cy+40); ctx.lineTo(cx+28,cy-10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#333'; ctx.lineWidth=2; ctx.stroke();
      ctx.strokeStyle='#c45c26'; ctx.beginPath(); ctx.arc(cx+28,cy+12,12,-1.2,1.2); ctx.stroke();
      // steam
      ctx.strokeStyle='rgba(80,80,80,0.35)'; ctx.lineWidth=2;
      for(let i=0;i<3;i++){
        ctx.beginPath();
        ctx.moveTo(cx-8+i*8,cy-14);
        ctx.bezierCurveTo(cx-14+i*8,cy-30,cx+2+i*8,cy-40,cx-6+i*8,cy-55);
        ctx.stroke();
      }
      // hands
      ctx.fillStyle='#f2c8a8';
      ctx.beginPath(); ctx.ellipse(w*0.28,h*0.62,w*0.14,h*0.1,-0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w*0.72,h*0.64,w*0.13,h*0.09,0.25,0,Math.PI*2); ctx.fill();
      drawBalloon(ctx,w*0.08,h*0.06,w*0.55,h*0.18,'先喝一口。');
  `);
}

/** Page1 · 翻页钩子：窗外动静 */
export function comicPanelHook() {
  return wrap(`
      ${balloonFn()}
      const g=ctx.createLinearGradient(0,0,w,h);
      g.addColorStop(0,'#9ec9e0'); g.addColorStop(1,'#f0e6d2');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      // window frame
      ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=Math.max(4,w*0.015);
      ctx.strokeRect(w*0.08,h*0.1,w*0.84,h*0.72);
      ctx.beginPath(); ctx.moveTo(w*0.5,h*0.1); ctx.lineTo(w*0.5,h*0.82);
      ctx.moveTo(w*0.08,h*0.46); ctx.lineTo(w*0.92,h*0.46); ctx.stroke();
      // butterfly blur outside
      ctx.fillStyle='rgba(255,180,60,0.85)';
      const bx=w*0.68, by=h*0.28;
      ctx.beginPath(); ctx.ellipse(bx-10,by,14,8,-0.4,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx+10,by,14,8,0.4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(bx,by,3,0,Math.PI*2); ctx.fill();
      // character back silhouette bottom
      ctx.fillStyle='#2a2a2a';
      ctx.beginPath(); ctx.ellipse(w*0.32,h*0.95,w*0.18,h*0.12,0,Math.PI,0); ctx.fill();
      drawBalloon(ctx,w*0.1,h*0.55,w*0.45,h*0.22,'……那是？');
  `);
}

/** Page2 · 大格：追蝶 */
export function comicPanelChase() {
  return wrap(`
      ${balloonFn()}
      const g=ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#6eb6de'); g.addColorStop(0.5,'#cfe6f2'); g.addColorStop(1,'#e8d9b0');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      // trees
      for(let i=0;i<5;i++){
        const tx=w*(0.1+i*0.18), ty=h*0.62;
        ctx.fillStyle='#5a8a4a';
        ctx.beginPath(); ctx.arc(tx,ty-40,28+i*3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#6b4a2a'; ctx.fillRect(tx-4,ty-20,8,50);
      }
      ctx.fillStyle='#8fbc6a'; ctx.fillRect(0,h*0.7,w,h*0.3);
      // runner
      const px=w*0.38+Math.sin(0)*8, py=h*0.72;
      ctx.fillStyle='#2c241c';
      ctx.beginPath(); ctx.arc(px,py-36,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3d6e8f'; ctx.fillRect(px-8,py-28,16,22);
      ctx.fillStyle='#2a2a2a';
      ctx.fillRect(px-10,py-6,8,18); ctx.fillRect(px+2,py-6,8,16);
      ctx.fillRect(px-18,py-22,10,5); ctx.fillRect(px+8,py-18,14,5);
      // butterfly trail
      ctx.strokeStyle='rgba(255,200,80,0.5)'; ctx.lineWidth=2; ctx.setLineDash([4,6]);
      ctx.beginPath(); ctx.moveTo(px+20,py-50); ctx.quadraticCurveTo(w*0.6,h*0.35,w*0.78,h*0.22); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#ffb84d';
      ctx.beginPath(); ctx.ellipse(w*0.78,h*0.22,16,9,-0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w*0.82,h*0.2,16,9,0.35,0,Math.PI*2); ctx.fill();
      drawBalloon(ctx,w*0.08,h*0.06,w*0.4,h*0.14,'等等！');
      // sfx
      ctx.fillStyle='#c45c26'; ctx.font='bold '+Math.floor(Math.min(w,h)*0.08)+'px Segoe UI,Microsoft YaHei,sans-serif';
      ctx.fillText('啪嗒', w*0.55, h*0.55);
  `);
}

/** Page2 · 接住瞬间 */
export function comicPanelCatch() {
  return wrap(`
      ${balloonFn()}
      ctx.fillStyle='#d8ebe0'; ctx.fillRect(0,0,w,h);
      // soft bokeh
      for(let i=0;i<8;i++){
        ctx.fillStyle='rgba(255,255,255,'+(0.15+i*0.03)+')';
        ctx.beginPath(); ctx.arc(w*(0.1+i*0.1),h*(0.2+(i%3)*0.15),12+i*2,0,Math.PI*2); ctx.fill();
      }
      // cupped hands
      ctx.fillStyle='#f2c8a8';
      ctx.beginPath(); ctx.ellipse(w*0.38,h*0.58,w*0.2,h*0.12,0.2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w*0.58,h*0.58,w*0.2,h*0.12,-0.2,0,Math.PI*2); ctx.fill();
      // butterfly resting
      ctx.fillStyle='#ffb84d';
      ctx.beginPath(); ctx.ellipse(w*0.48,h*0.48,18,10,-0.2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w*0.54,h*0.46,18,10,0.25,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(w*0.5,h*0.48,3,0,Math.PI*2); ctx.fill();
      drawBalloon(ctx,w*0.1,h*0.08,w*0.7,h*0.2,'轻轻的……');
  `);
}

/** Page2 · 落版 */
export function comicPanelTitle() {
  return wrap(`
      ${balloonFn()}
      const g=ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#f7f1e4'); g.addColorStop(1,'#e8d4b0');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      // soft sun disk
      ctx.fillStyle='rgba(255,220,140,0.5)';
      ctx.beginPath(); ctx.arc(w*0.5,h*0.38,Math.min(w,h)*0.28,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#2a2a2a';
      ctx.font='600 '+Math.floor(Math.min(w,h)*0.11)+'px Segoe UI,Microsoft YaHei,sans-serif';
      ctx.textAlign='center';
      ctx.fillText('MotionCraft', w*0.5, h*0.42);
      ctx.font='400 '+Math.floor(Math.min(w,h)*0.055)+'px Segoe UI,Microsoft YaHei,sans-serif';
      ctx.fillStyle='#5a4a3a';
      ctx.fillText('COMIC PAGE DEMO', w*0.5, h*0.52);
      ctx.textAlign='left';
      // mini character wave
      const px=w*0.5, py=h*0.78;
      ctx.fillStyle='#2c241c'; ctx.beginPath(); ctx.arc(px,py-28,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3d6e8f'; ctx.fillRect(px-7,py-20,14,18);
      ctx.fillStyle='#2a2a2a'; ctx.fillRect(px-8,py-2,6,14); ctx.fillRect(px+2,py-2,6,14);
      ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(px+7,py-16); ctx.lineTo(px+22,py-28); ctx.stroke();
      drawBalloon(ctx,w*0.12,h*0.08,w*0.76,h*0.16,'今天也是好故事。');
  `);
}

function balloonFn() {
  return `
      function drawBalloon(ctx,x,y,bw,bh,text){
        ctx.save();
        ctx.fillStyle='rgba(255,255,255,0.94)';
        ctx.strokeStyle='#1a1a1a';
        ctx.lineWidth=2;
        const r=Math.min(12,bw*0.08,bh*0.2);
        ctx.beginPath();
        ctx.moveTo(x+r,y);
        ctx.arcTo(x+bw,y,x+bw,y+bh,r);
        ctx.arcTo(x+bw,y+bh,x,y+bh,r);
        ctx.arcTo(x,y+bh,x,y,r);
        ctx.arcTo(x,y,x+bw,y,r);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // tail
        ctx.beginPath();
        ctx.moveTo(x+bw*0.22,y+bh);
        ctx.lineTo(x+bw*0.18,y+bh+10);
        ctx.lineTo(x+bw*0.32,y+bh);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#1a1a1a';
        const fs=Math.max(11, Math.min(bw,bh)*0.16);
        ctx.font=fs+'px Segoe UI,Microsoft YaHei,sans-serif';
        ctx.fillText(text, x+10, y+bh*0.55);
        ctx.restore();
      }
  `;
}
