/**
 * High-detail procedural daylight product film (Canvas 2D).
 * Helpers inlined into each IIFE for Composer isolation.
 */

const LIB = `
  function hash(n){ return ((Math.sin(n*127.1)*43758.5453)%1+1)%1; }
  function lerp(a,b,t){ return a+(b-a)*t; }

  function skyDay(ctx,w,h,t){
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#6eb6de');
    g.addColorStop(0.35,'#a8d4ea');
    g.addColorStop(0.65,'#e5eef5');
    g.addColorStop(1,'#f2e4c4');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    // sun disc + bloom
    const sx=w*0.78, sy=h*0.18;
    const bloom=ctx.createRadialGradient(sx,sy,8,sx,sy,220);
    bloom.addColorStop(0,'rgba(255,245,200,0.95)');
    bloom.addColorStop(0.25,'rgba(255,230,150,0.35)');
    bloom.addColorStop(1,'rgba(255,220,140,0)');
    ctx.fillStyle=bloom;
    ctx.beginPath(); ctx.arc(sx,sy,220,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff8e0';
    ctx.shadowColor='#ffe8a0'; ctx.shadowBlur=40;
    ctx.beginPath(); ctx.arc(sx,sy,28,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // god rays
    ctx.save();
    ctx.globalAlpha=0.06;
    for(let i=0;i<8;i++){
      const a=-0.6+i*0.18+Math.sin(t*0.3+i)*0.02;
      ctx.fillStyle='#fff6d0';
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.lineTo(sx+Math.cos(a)*w*0.9, sy+Math.sin(a)*h*1.1);
      ctx.lineTo(sx+Math.cos(a+0.08)*w*0.9, sy+Math.sin(a+0.08)*h*1.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // soft clouds
    for(let i=0;i<5;i++){
      const cx=((hash(i)*w)+t*8*(i%2?1:-0.6)+w)%(w+180)-90;
      const cy=h*(0.1+hash(i+2)*0.18);
      const rg=ctx.createRadialGradient(cx,cy,10,cx,cy,90+i*20);
      rg.addColorStop(0,'rgba(255,255,255,0.45)');
      rg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=rg; ctx.fillRect(0,0,w,h*0.45);
    }
  }

  function hills(ctx,w,h,horizon,t){
    ctx.fillStyle='#8fbc8f';
    ctx.beginPath();
    ctx.moveTo(0,horizon+40);
    for(let x=0;x<=w;x+=40){
      ctx.lineTo(x, horizon-20-Math.sin(x*0.01+t*0.2)*18-hash(x)*25);
    }
    ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.fill();
    ctx.fillStyle='#6fa06f';
    ctx.beginPath();
    ctx.moveTo(0,horizon+70);
    for(let x=0;x<=w;x+=50){
      ctx.lineTo(x, horizon+30-Math.sin(x*0.008+1)*12);
    }
    ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.fill();
  }

  function ground(ctx,w,h,horizon,t){
    const g=ctx.createLinearGradient(0,horizon,0,h);
    g.addColorStop(0,'#d4c4a8');
    g.addColorStop(0.4,'#c8b898');
    g.addColorStop(1,'#b8a688');
    ctx.fillStyle=g;
    ctx.fillRect(0,horizon,w,h-horizon);
    // warm sun patch
    const patch=ctx.createRadialGradient(w*0.7,horizon+40,10,w*0.65,h*0.7,280);
    patch.addColorStop(0,'rgba(255,230,160,0.28)');
    patch.addColorStop(1,'rgba(255,230,160,0)');
    ctx.fillStyle=patch;
    ctx.fillRect(0,horizon,w,h-horizon);
    // grit
    ctx.globalAlpha=0.08;
    for(let i=0;i<40;i++){
      ctx.fillStyle=i%2?'#fff':'#000';
      ctx.fillRect(hash(i)*w, horizon+hash(i+1)*(h-horizon), 2, 2);
    }
    ctx.globalAlpha=1;
    // soft contact shadow pool for product area
    const sh=ctx.createRadialGradient(w/2,h*0.72,10,w/2,h*0.72,160);
    sh.addColorStop(0,'rgba(40,30,20,0.22)');
    sh.addColorStop(1,'rgba(40,30,20,0)');
    ctx.fillStyle=sh;
    ctx.beginPath(); ctx.ellipse(w/2,h*0.72,160,28,0,0,Math.PI*2); ctx.fill();
  }

  function buildingDay(ctx,x,y,bw,bh,t,seed){
    const body=ctx.createLinearGradient(x,y,x+bw,y);
    body.addColorStop(0,'#e8eef2');
    body.addColorStop(0.5,'#f4f7f9');
    body.addColorStop(1,'#d0d8e0');
    ctx.fillStyle=body;
    ctx.fillRect(x,y,bw,bh);
    // roof
    ctx.fillStyle='#c8d0d8';
    ctx.fillRect(x-4,y-6,bw+8,8);
    // windows
    const rows=Math.max(3,Math.floor(bh/22));
    const cols=Math.max(2,Math.floor(bw/18));
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const wx=x+8+c*((bw-12)/cols);
        const wy=y+10+r*((bh-16)/rows);
        const ww=Math.max(4,(bw-12)/cols-6);
        const wh=Math.max(5,(bh-16)/rows-8);
        const skyRef=ctx.createLinearGradient(wx,wy,wx,wy+wh);
        skyRef.addColorStop(0,'rgba(120,180,220,0.55)');
        skyRef.addColorStop(1,'rgba(80,140,180,0.35)');
        ctx.fillStyle=skyRef;
        ctx.fillRect(wx,wy,ww,wh);
        // glass highlight
        ctx.fillStyle='rgba(255,255,255,0.35)';
        ctx.fillRect(wx+1,wy+1,ww*0.3,wh*0.4);
      }
    }
    // shadow side
    ctx.fillStyle='rgba(0,0,0,0.06)';
    ctx.fillRect(x+bw*0.7,y,bw*0.3,bh);
  }

  function tree(ctx,x,baseY,scale,t,seed){
    ctx.save();
    ctx.translate(x,baseY);
    ctx.scale(scale,scale);
    // trunk
    ctx.fillStyle='#5a4030';
    ctx.beginPath();
    ctx.moveTo(-6,0); ctx.lineTo(-4,-40); ctx.lineTo(4,-40); ctx.lineTo(6,0);
    ctx.fill();
    // canopy layers
    [[0,-55,28,'#4a8f4a'],[-14,-48,20,'#3d7a3d'],[14,-50,22,'#5aa05a'],[0,-68,18,'#6ab06a']].forEach(([cx,cy,r,col],i)=>{
      const sway=Math.sin(t*1.2+seed+i)*3;
      const rg=ctx.createRadialGradient(cx+sway,cy,4,cx+sway,cy,r);
      rg.addColorStop(0,col);
      rg.addColorStop(1,'rgba(40,80,40,0.2)');
      ctx.fillStyle=rg;
      ctx.beginPath(); ctx.arc(cx+sway,cy,r,0,Math.PI*2); ctx.fill();
    });
    // ground shadow
    ctx.fillStyle='rgba(40,50,20,0.18)';
    ctx.beginPath(); ctx.ellipse(4,4,28,8,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function dustMotes(ctx,w,h,t){
    ctx.fillStyle='#fff8e0';
    for(let i=0;i<50;i++){
      const x=(hash(i)*w+Math.sin(t*0.4+i)*30+w)%w;
      const y=(hash(i+3)*h*0.7+Math.cos(t*0.5+i)*20+40);
      ctx.globalAlpha=0.15+0.35*hash(i+1)*(0.5+0.5*Math.sin(t*2+i));
      ctx.beginPath(); ctx.arc(x,y,1+hash(i)*1.5,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  function drawPersonDay(ctx,x,baseY,t,scale,opts){
    opts=opts||{};
    scale=scale||1;
    const walk=opts.walk!==false;
    const phase=(opts.phase||0)+(walk?t*5.2:0);
    const bob=walk?Math.sin(phase)*2.5:0;
    const leg=walk?Math.sin(phase)*12:0;
    const arm=walk?Math.cos(phase)*9:0;
    const coat=opts.coat||'#2a3544';
    const pants=opts.pants||'#1e2430';
    const skin='#c9a088';
    ctx.save();
    ctx.translate(x,baseY+bob);
    ctx.scale(scale*(opts.flip?-1:1),scale);
    // contact shadow
    ctx.fillStyle='rgba(40,30,15,0.28)';
    ctx.beginPath(); ctx.ellipse(0,80,22,6,0,0,Math.PI*2); ctx.fill();
    // shoes
    ctx.fillStyle='#1a1a1a';
    ctx.beginPath(); ctx.ellipse(-6,78,8,3,0.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7,78,8,3,-0.1,0,Math.PI*2); ctx.fill();
    // legs
    ctx.fillStyle=pants;
    ctx.save(); ctx.translate(-5,44); ctx.rotate(leg*0.035);
    ctx.fillRect(-4,0,8,34); ctx.restore();
    ctx.save(); ctx.translate(5,44); ctx.rotate(-leg*0.035);
    ctx.fillRect(-4,0,8,34); ctx.restore();
    // torso / coat
    const tg=ctx.createLinearGradient(-14,6,14,48);
    tg.addColorStop(0,coat);
    tg.addColorStop(1,'#1a222c');
    ctx.fillStyle=tg;
    ctx.beginPath();
    ctx.moveTo(-12,6); ctx.lineTo(-16,48); ctx.quadraticCurveTo(0,52,16,48); ctx.lineTo(12,6);
    ctx.quadraticCurveTo(0,12,-12,6); ctx.fill();
    // arms
    ctx.fillStyle=coat;
    ctx.save(); ctx.translate(-13,14); ctx.rotate((-22+arm)*Math.PI/180);
    ctx.fillRect(-3.5,0,7,26);
    ctx.fillStyle=skin; ctx.beginPath(); ctx.arc(0,28,3.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(13,14); ctx.rotate((18-arm)*Math.PI/180);
    ctx.fillStyle=coat; ctx.fillRect(-3.5,0,7,24);
    ctx.fillStyle=skin; ctx.beginPath(); ctx.arc(0,26,3.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // neck + head
    ctx.fillStyle=skin;
    ctx.fillRect(-3.5,2,7,8);
    ctx.beginPath(); ctx.arc(0,-2,11,0,Math.PI*2); ctx.fill();
    // hair
    ctx.fillStyle=opts.hair||'#2a2018';
    ctx.beginPath(); ctx.ellipse(0,-6,12,9,0,Math.PI,Math.PI*2); ctx.fill();
    // rim light from sun
    ctx.strokeStyle='rgba(255,230,160,0.35)';
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(4,-2,10,-0.9,0.8); ctx.stroke();
    // bag
    if(opts.bag){
      ctx.fillStyle='#3a2a20';
      ctx.fillRect(12,20,11,15);
      ctx.strokeStyle='#2a1a12'; ctx.beginPath(); ctx.moveTo(14,20); ctx.lineTo(10,10); ctx.stroke();
    }
    // breath / micro bob already via bob
    ctx.restore();
  }

  function productCard(ctx,cx,cy,t,hue,opts){
    opts=opts||{};
    const s=1+0.02*Math.sin(t*1.5);
    const tilt=Math.sin(t*0.6)*0.04;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(tilt);
    ctx.scale(s,s);
    // soft drop shadow
    ctx.fillStyle='rgba(40,30,20,0.25)';
    ctx.beginPath(); ctx.ellipse(8,150,110,22,0,0,Math.PI*2); ctx.fill();
    // card body
    ctx.shadowColor='rgba(0,0,0,0.2)';
    ctx.shadowBlur=28;
    ctx.fillStyle='#fafbfc';
    roundRect(ctx,-130,-160,260,300,18);
    ctx.fill();
    ctx.shadowBlur=0;
    // inner product block with material
    const pg=ctx.createLinearGradient(-90,-110,90,40);
    pg.addColorStop(0,'hsl('+hue+',48%,52%)');
    pg.addColorStop(0.5,'hsl('+hue+',42%,42%)');
    pg.addColorStop(1,'hsl('+hue+',38%,32%)');
    ctx.fillStyle=pg;
    roundRect(ctx,-90,-110,180,140,12);
    ctx.fill();
    // specular
    ctx.fillStyle='rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(-70,-95); ctx.lineTo(-20,-95); ctx.lineTo(-50,10); ctx.lineTo(-80,10);
    ctx.closePath(); ctx.fill();
    // label strip
    ctx.fillStyle='#1a1e24';
    ctx.fillRect(-70,50,140,8);
    ctx.font='600 18px Segoe UI, Microsoft YaHei, sans-serif';
    ctx.fillStyle='#2a3038';
    ctx.fillText(opts.label||'PRODUCT', -48, 90);
    ctx.font='400 13px Segoe UI, Microsoft YaHei, sans-serif';
    ctx.fillStyle='#889098';
    ctx.fillText(opts.sub||'crafted light', -42, 112);
    // edge highlight
    ctx.strokeStyle='rgba(255,255,255,0.6)';
    ctx.lineWidth=1.5;
    roundRect(ctx,-130,-160,260,300,18);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function cafeTable(ctx,w,h,t){
    const ty=h*0.62;
    // table top
    const wood=ctx.createLinearGradient(0,ty,0,ty+40);
    wood.addColorStop(0,'#c4a06a');
    wood.addColorStop(1,'#a07848');
    ctx.fillStyle=wood;
    ctx.beginPath();
    ctx.ellipse(w/2,ty,280,36,0,0,Math.PI*2);
    ctx.fill();
    // table rim
    ctx.strokeStyle='rgba(80,50,20,0.25)';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(w/2,ty,280,36,0,0,Math.PI*2); ctx.stroke();
    // legs hint
    ctx.fillStyle='#8a6840';
    ctx.fillRect(w/2-160,ty+20,14,h*0.2);
    ctx.fillRect(w/2+146,ty+20,14,h*0.2);
    // window light caustic on table
    const cau=ctx.createRadialGradient(w*0.65,ty-10,5,w*0.6,ty,120);
    cau.addColorStop(0,'rgba(255,245,200,0.35)');
    cau.addColorStop(1,'rgba(255,245,200,0)');
    ctx.fillStyle=cau;
    ctx.beginPath(); ctx.ellipse(w*0.62,ty-4,100,20,0,0,Math.PI*2); ctx.fill();
  }

  function caption(ctx,w,h,text,t,duration,dark){
    const a=Math.min(1,t/0.5)*Math.min(1,(duration-t)/0.4);
    if(a<=0||!text) return;
    ctx.save();
    ctx.globalAlpha=a;
    ctx.font='600 28px Segoe UI, Microsoft YaHei, sans-serif';
    const tw=ctx.measureText(text).width;
    const tx=(w-tw)/2, ty=h*0.9;
    ctx.fillStyle=dark?'rgba(20,24,30,0.55)':'rgba(0,0,0,0.4)';
    ctx.fillRect(tx-18,ty-30,tw+36,44);
    ctx.fillStyle='#c45c26';
    ctx.fillRect(tx-18,ty+12,tw+36,2);
    ctx.fillStyle='#fff';
    ctx.fillText(text,tx,ty);
    ctx.restore();
  }
  function progress(ctx,w,h,t,duration){
    ctx.fillStyle='rgba(0,0,0,0.12)';
    ctx.fillRect(0,h-3,w,3);
    ctx.fillStyle='#c45c26';
    ctx.fillRect(0,h-3,w*(t/Math.max(0.01,duration)),3);
  }
  function filmGrain(ctx,w,h,t){
    ctx.globalAlpha=0.035;
    for(let i=0;i<120;i++){
      const x=((i*97+t*700)%w);
      const y=((i*53+t*280)%h);
      ctx.fillStyle=i%2?'#fff':'#000';
      ctx.fillRect(x,y,1.3,1.3);
    }
    ctx.globalAlpha=1;
  }
  function vignette(ctx,w,h){
    const g=ctx.createRadialGradient(w/2,h/2,h*0.25,w/2,h/2,h*0.8);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(30,20,10,0.35)');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,w,h);
  }
  function warmGrade(ctx,w,h){
    ctx.globalAlpha=0.08;
    ctx.fillStyle='#ffd8a0';
    ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=1;
  }
`;

export function daySceneWide() {
  return `(function(){
  ${LIB}
  return {
    setup(){},
    draw({ ctx, canvas, t, duration }) {
      const w=canvas.width, h=canvas.height;
      // gentle handheld
      const hx=Math.sin(t*1.1)*2.5, hy=Math.cos(t*0.9)*1.8;
      ctx.save();
      ctx.translate(hx,hy);

      skyDay(ctx,w,h,t);
      hills(ctx,w,h,h*0.52,t);

      // distant buildings
      for(let i=0;i<10;i++){
        const bw=50+(i*37)%70;
        const bx=40+i*115;
        const bh=h*(0.18+0.2*hash(i));
        buildingDay(ctx, bx, h*0.52-bh, bw, bh, t, i);
      }

      ground(ctx,w,h,h*0.62,t);
      tree(ctx, w*0.12, h*0.68, 1.1, t, 1);
      tree(ctx, w*0.88, h*0.7, 0.95, t, 2);
      tree(ctx, w*0.28, h*0.66, 0.7, t, 3);

      // plaza walkers
      drawPersonDay(ctx, w*0.35+Math.sin(t*0.4)*40, h*0.7, t, 0.75, {walk:true, coat:'#3a4555', bag:true});
      drawPersonDay(ctx, w*0.62-t*12%50, h*0.72, t+1, 0.65, {walk:true, coat:'#5a3a30', hair:'#1a1010', flip:true});

      // hero product floating light card mid
      productCard(ctx, w/2, h*0.42, t, 200, {label:'AURORA', sub:'morning edition'});

      dustMotes(ctx,w,h,t);
      ctx.restore();
      warmGrade(ctx,w,h);
      vignette(ctx,w,h);
      filmGrain(ctx,w,h,t);
      caption(ctx,w,h,'MORNING LIGHT',t,duration,true);
      progress(ctx,w,h,t,duration);
    }
  };
})()`;
}

export function daySceneDetail() {
  return `(function(){
  ${LIB}
  return {
    setup(){},
    draw({ ctx, canvas, t, duration }) {
      const w=canvas.width, h=canvas.height;
      const hx=Math.sin(t*1.3)*1.5, hy=Math.cos(t*1.1)*1.2;
      ctx.save();
      ctx.translate(hx,hy);

      // interior window light background
      const bg=ctx.createLinearGradient(0,0,0,h);
      bg.addColorStop(0,'#c8dde8');
      bg.addColorStop(0.5,'#e8eef2');
      bg.addColorStop(1,'#d8c8b0');
      ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);

      // window panes left
      ctx.fillStyle='rgba(180,210,230,0.5)';
      ctx.fillRect(0,0,w*0.28,h*0.7);
      ctx.strokeStyle='rgba(255,255,255,0.4)';
      ctx.lineWidth=3;
      for(let i=0;i<3;i++){
        ctx.strokeRect(20,40+i*120,w*0.22,100);
      }
      // warm wall
      ctx.fillStyle='#f0e8dc';
      ctx.fillRect(w*0.28,0,w*0.72,h);

      // window light shaft
      ctx.globalAlpha=0.12;
      ctx.fillStyle='#fff6d0';
      ctx.beginPath();
      ctx.moveTo(w*0.28,80);
      ctx.lineTo(w*0.85,h*0.55);
      ctx.lineTo(w*0.55,h*0.7);
      ctx.lineTo(w*0.28,h*0.45);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha=1;

      cafeTable(ctx,w,h,t);

      // slow push-in on product
      const zoom=1+0.08*Math.min(1,t/duration);
      ctx.save();
      ctx.translate(w/2, h*0.48);
      ctx.scale(zoom,zoom);
      ctx.translate(-w/2,-h*0.48);
      productCard(ctx, w/2, h*0.48, t, 25, {label:'DETAIL', sub:'hand-finished'});
      ctx.restore();

      // steam / heat shimmer above product
      for(let i=0;i<6;i++){
        const sx=w/2-20+i*8+Math.sin(t*2+i)*6;
        const sy=h*0.32-((t*40+i*25)%80);
        ctx.globalAlpha=0.12*(1-((t*40+i*25)%80)/80);
        ctx.strokeStyle='#fff';
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(sx,sy+20);
        ctx.quadraticCurveTo(sx+8,sy+10,sx,sy);
        ctx.stroke();
      }
      ctx.globalAlpha=1;

      dustMotes(ctx,w,h,t);
      ctx.restore();
      warmGrade(ctx,w,h);
      vignette(ctx,w,h);
      filmGrain(ctx,w,h,t);
      caption(ctx,w,h,'DETAIL',t,duration,true);
      progress(ctx,w,h,t,duration);
    }
  };
})()`;
}

export function daySceneTitle() {
  return `(function(){
  ${LIB}
  return {
    setup(){},
    draw({ ctx, canvas, t, duration }) {
      const w=canvas.width, h=canvas.height;
      skyDay(ctx,w,h,t);
      hills(ctx,w,h,h*0.55,t);
      ground(ctx,w,h,h*0.65,t);

      tree(ctx, w*0.15, h*0.72, 1.2, t, 4);
      tree(ctx, w*0.85, h*0.74, 1.0, t, 5);

      // soft focus rings / lens
      const cx=w/2, cy=h*0.38;
      for(let i=0;i<4;i++){
        const r=40+i*32+Math.sin(t*1.5+i)*4;
        ctx.strokeStyle='rgba(255,200,120,'+(0.12+0.1*Math.sin(t*2+i))+')';
        ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      }

      const reveal=Math.min(1,Math.max(0,(t-0.2)/1.2));
      ctx.save();
      ctx.font='700 68px Segoe UI, Microsoft YaHei, sans-serif';
      const title='MotionCraft';
      const tw=ctx.measureText(title).width;
      const tx=(w-tw)/2, ty=h*0.4;
      ctx.beginPath();
      ctx.rect(tx-10, ty-70, tw*reveal+20, 90);
      ctx.clip();
      ctx.shadowColor='rgba(255,200,100,0.5)';
      ctx.shadowBlur=24;
      ctx.fillStyle='#1a2430';
      ctx.fillText(title, tx, ty);
      ctx.shadowBlur=0;
      ctx.fillStyle='#c45c26';
      ctx.fillRect(tx, ty+14, tw*reveal, 3);
      ctx.restore();

      ctx.font='400 16px Segoe UI, Microsoft YaHei, sans-serif';
      ctx.fillStyle='rgba(40,50,60,'+(0.35+0.55*reveal)+')';
      const sub='DAYLIGHT  ·  PRODUCT  ·  SHIP IT';
      const sw=ctx.measureText(sub).width;
      ctx.fillText(sub,(w-sw)/2, h*0.5);

      // product mini
      ctx.save();
      ctx.translate(w/2, h*0.68);
      ctx.scale(0.55,0.55);
      productCard(ctx, 0, 0, t, 150, {label:'SHIP IT', sub:'ready'});
      ctx.restore();

      drawPersonDay(ctx, w*0.3, h*0.78, t, 0.55, {walk:true, coat:'#354050'});
      drawPersonDay(ctx, w*0.72, h*0.8, t+0.8, 0.5, {walk:true, coat:'#4a3028', flip:true});

      dustMotes(ctx,w,h,t);
      warmGrade(ctx,w,h);
      vignette(ctx,w,h);
      filmGrain(ctx,w,h,t);
      progress(ctx,w,h,t,duration);
    }
  };
})()`;
}
