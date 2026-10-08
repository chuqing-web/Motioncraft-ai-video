/**
 * High-detail procedural neon city — people / wet streets / rain FX.
 * Helpers are inlined into each IIFE for Composer isolation.
 */

const LIB = `
  function hash(n){ return ((Math.sin(n*127.1)*43758.5453)%1+1)%1; }
  function lerp(a,b,t){ return a+(b-a)*t; }

  function sky(ctx,w,h,t){
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#02040a');
    g.addColorStop(0.28,'#070e1a');
    g.addColorStop(0.55,'#101428');
    g.addColorStop(0.78,'#1a1230');
    g.addColorStop(1,'#1c0e18');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    // layered city glow haze
    [[0.62,0.32,'rgba(255,35,100,0.28)',0.55],[0.28,0.38,'rgba(20,170,255,0.18)',0.5],
     [0.88,0.48,'rgba(150,50,255,0.16)',0.42],[0.5,0.55,'rgba(255,180,40,0.1)',0.35]].forEach(([x,y,c,r])=>{
      const rg=ctx.createRadialGradient(w*x,h*y,8,w*x,h*y,w*r);
      rg.addColorStop(0,c); rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=rg; ctx.fillRect(0,0,w,h);
    });
    // stars
    ctx.fillStyle='#fff';
    for(let i=0;i<90;i++){
      const sx=hash(i*3.1)*w;
      const sy=hash(i*7.7)*h*0.42;
      ctx.globalAlpha=0.12+0.55*(0.5+0.5*Math.sin(t*1.8+i));
      ctx.fillRect(sx,sy,1+hash(i)*1.4,1+hash(i+1)*1.2);
    }
    ctx.globalAlpha=1;
    // distant cloud bands
    for(let i=0;i<4;i++){
      const cx=((hash(i)*w)+t*6*(i%2?1:-1)+w)%(w+200)-100;
      const cy=h*(0.12+i*0.06);
      const rg=ctx.createRadialGradient(cx,cy,10,cx,cy,160+i*40);
      rg.addColorStop(0,'rgba(80,100,140,0.07)');
      rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=rg; ctx.fillRect(0,0,w,h*0.5);
    }
  }

  function building(ctx,x,y,bw,bh,t,seed,detail){
    const body=ctx.createLinearGradient(x,y,x+bw,y);
    const shade=0.85+0.15*hash(seed);
    body.addColorStop(0,'rgb('+Math.floor(5*shade)+','+Math.floor(7*shade)+','+Math.floor(14*shade)+')');
    body.addColorStop(0.45,'rgb('+Math.floor(12*shade)+','+Math.floor(16*shade)+','+Math.floor(26*shade)+')');
    body.addColorStop(1,'rgb('+Math.floor(4*shade)+','+Math.floor(6*shade)+','+Math.floor(12*shade)+')');
    ctx.fillStyle=body;
    ctx.fillRect(x,y,bw,bh);
    // vertical edge highlight
    ctx.fillStyle='rgba(120,160,200,0.06)';
    ctx.fillRect(x+bw-3,y,2,bh);
    // roof ledge + AC units
    ctx.fillStyle='#141a26';
    ctx.fillRect(x-3,y-5,bw+6,7);
    if(detail>0.4){
      ctx.fillStyle='#1a2232';
      ctx.fillRect(x+bw*0.15,y-16,bw*0.12,14);
      ctx.fillRect(x+bw*0.55,y-12,bw*0.18,10);
      // antenna
      ctx.strokeStyle='#2a3344';
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x+bw*0.7,y-5); ctx.lineTo(x+bw*0.7,y-28-hash(seed)*20); ctx.stroke();
      ctx.beginPath(); ctx.arc(x+bw*0.7,y-28-hash(seed)*20,2,0,Math.PI*2); ctx.fill();
    }
    // facade panel lines
    ctx.strokeStyle='rgba(255,255,255,0.03)';
    ctx.lineWidth=1;
    for(let i=1;i<4;i++){
      const lx=x+bw*(i/4);
      ctx.beginPath(); ctx.moveTo(lx,y); ctx.lineTo(lx,y+bh); ctx.stroke();
    }
    // window grid
    const rows=Math.max(5,Math.floor(bh/14));
    const cols=Math.max(2,Math.floor(bw/12));
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const hv=((seed*131+r*17+c*43)%11);
        if(hv<2) continue;
        const wx=x+5+c*((bw-8)/cols);
        const wy=y+7+r*((bh-10)/rows);
        const ww=Math.max(2.5,(bw-8)/cols-3.5);
        const wh=Math.max(2.5,(bh-10)/rows-4.5);
        const flicker=0.5+0.5*Math.sin(t*(1.2+hv*0.18)+r*0.4+c+seed);
        const warm=hv%3!==0;
        const a=0.18+0.55*flicker*(hv>4?1:0.6);
        ctx.fillStyle=warm?('rgba(255,'+(160+hv*6)+',55,'+a+')'):('rgba(60,185,255,'+a+')');
        ctx.fillRect(wx,wy,ww,wh);
        if(hv>7){
          ctx.fillStyle=warm?'rgba(255,235,170,0.4)':'rgba(190,235,255,0.35)';
          ctx.fillRect(wx+0.8,wy+0.8,ww*0.38,wh*0.4);
        }
        // blinds
        if(detail>0.6 && hv%5===0){
          ctx.fillStyle='rgba(0,0,0,0.35)';
          ctx.fillRect(wx,wy+wh*0.45,ww,wh*0.55);
        }
      }
    }
    // ground floor shop glass
    if(detail>0.55 && bh>120){
      const gh=Math.min(48,bh*0.12);
      const gy=y+bh-gh;
      const sg=ctx.createLinearGradient(x,gy,x,gy+gh);
      sg.addColorStop(0,'rgba(40,60,90,0.55)');
      sg.addColorStop(1,'rgba(10,15,25,0.8)');
      ctx.fillStyle=sg;
      ctx.fillRect(x+4,gy,bw-8,gh-4);
      ctx.fillStyle='rgba(255,255,255,0.06)';
      ctx.fillRect(x+8,gy+4,bw*0.25,gh*0.35);
    }
  }

  function neonSign(ctx,x,y,text,color,t,scale){
    scale=scale||1;
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,scale);
    const pulse=0.62+0.38*Math.sin(t*3.2+x*0.015);
    const flicker=hash(Math.floor(t*8)+x)>0.04?1:0.35;
    // backboard
    ctx.fillStyle='rgba(0,0,0,0.65)';
    ctx.fillRect(-8,-24,text.length*14+18,34);
    ctx.strokeStyle='rgba(255,255,255,0.08)';
    ctx.strokeRect(-8,-24,text.length*14+18,34);
    // outer glow bloom
    ctx.shadowColor=color;
    ctx.shadowBlur=28*pulse*flicker;
    ctx.strokeStyle=color;
    ctx.lineWidth=2.5;
    ctx.globalAlpha=0.55*flicker;
    ctx.strokeRect(-8,-24,text.length*14+18,34);
    ctx.font='700 17px Segoe UI, Microsoft YaHei, sans-serif';
    ctx.fillStyle=color;
    ctx.globalAlpha=(0.65+0.35*pulse)*flicker;
    ctx.shadowBlur=18*pulse;
    ctx.fillText(text,0,-2);
    // secondary softer fill
    ctx.shadowBlur=0;
    ctx.globalAlpha=0.35*flicker;
    ctx.fillStyle='#fff';
    ctx.fillText(text,0,-2);
    ctx.restore();
    ctx.globalAlpha=1;
  }

  function shopFront(ctx,x,y,bw,bh,t,seed,color){
    ctx.fillStyle='#080a10';
    ctx.fillRect(x,y,bw,bh);
    // awning
    ctx.fillStyle=color;
    ctx.globalAlpha=0.85;
    ctx.beginPath();
    ctx.moveTo(x-4,y);
    ctx.lineTo(x+bw+4,y);
    ctx.lineTo(x+bw,y+14);
    ctx.lineTo(x,y+14);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha=1;
    // glass
    const gg=ctx.createLinearGradient(x,y+14,x,y+bh);
    gg.addColorStop(0,'rgba(30,50,80,0.7)');
    gg.addColorStop(0.5,'rgba(15,25,45,0.85)');
    gg.addColorStop(1,'rgba(8,10,18,0.95)');
    ctx.fillStyle=gg;
    ctx.fillRect(x+3,y+16,bw-6,bh-20);
    // interior warm light
    ctx.fillStyle='rgba(255,180,80,0.12)';
    ctx.fillRect(x+8,y+22,bw-16,bh*0.35);
    // reflection streak
    ctx.fillStyle='rgba(255,255,255,0.07)';
    ctx.fillRect(x+6,y+18,bw*0.18,bh*0.5);
    // door
    ctx.fillStyle='#0a0c14';
    ctx.fillRect(x+bw*0.55,y+bh*0.35,bw*0.28,bh*0.55);
    ctx.fillStyle=color;
    ctx.globalAlpha=0.4+0.3*Math.sin(t*2+seed);
    ctx.fillRect(x+bw*0.55+2,y+bh*0.4,4,6);
    ctx.globalAlpha=1;
  }

  function wetStreet(ctx,w,h,horizon,t,glows){
    const g=ctx.createLinearGradient(0,horizon,0,h);
    g.addColorStop(0,'#080a10');
    g.addColorStop(0.35,'#0a0e16');
    g.addColorStop(0.7,'#070910');
    g.addColorStop(1,'#05060c');
    ctx.fillStyle=g;
    ctx.fillRect(0,horizon,w,h-horizon);
    // asphalt grit bands
    ctx.save();
    ctx.beginPath(); ctx.rect(0,horizon,w,h-horizon); ctx.clip();
    ctx.globalAlpha=0.06;
    for(let i=0;i<25;i++){
      const yy=horizon+((i*37+t*20)%(h-horizon));
      ctx.fillStyle=i%2?'#fff':'#000';
      ctx.fillRect(0,yy,w,1);
    }
    // perspective center dashed lane
    ctx.globalAlpha=0.12;
    ctx.strokeStyle='#8899aa';
    ctx.setLineDash([18,22]);
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(w*0.5,horizon+8);
    ctx.lineTo(w*0.5+(Math.sin(t)*4),h);
    ctx.stroke();
    ctx.setLineDash([]);
    // neon color mirrors — stretched vertically for wet look
    for(const gl of glows){
      ctx.save();
      ctx.transform(1,0,0,2.8,0,horizon*(1-2.8));
      const rg=ctx.createRadialGradient(gl.x,horizon+18,3,gl.x,horizon+50,gl.r||130);
      rg.addColorStop(0,gl.c.replace('ALPHA','0.42'));
      rg.addColorStop(0.45,gl.c.replace('ALPHA','0.14'));
      rg.addColorStop(1,gl.c.replace('ALPHA','0'));
      ctx.fillStyle=rg;
      ctx.globalAlpha=0.9;
      ctx.fillRect(0,horizon,w,h-horizon);
      ctx.restore();
    }
    // long wet streak smears
    ctx.globalAlpha=0.1;
    for(let i=0;i<55;i++){
      const x=(hash(i*2.2)*w)+Math.sin(t*0.8+i)*12;
      ctx.strokeStyle=i%3===0?'#2de0ff':(i%3===1?'#ff2d6a':'#ffd24a');
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(x,horizon+6);
      ctx.lineTo(x+(hash(i)-0.5)*30,h);
      ctx.stroke();
    }
    // puddles with ripple
    for(let i=0;i<8;i++){
      const px=w*(0.1+i*0.11);
      const py=horizon+35+hash(i*4)*90;
      const rg=ctx.createRadialGradient(px,py,2,px,py,45+hash(i)*25);
      rg.addColorStop(0,'rgba(140,190,255,0.32)');
      rg.addColorStop(0.5,'rgba(80,120,180,0.1)');
      rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.globalAlpha=0.55;
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.ellipse(px,py,50+hash(i)*20,10+hash(i+1)*4,0,0,Math.PI*2);
      ctx.fill();
      // ripple rings
      ctx.strokeStyle='rgba(180,210,255,0.2)';
      ctx.lineWidth=1;
      const rr=8+((t*40+i*20)%28);
      ctx.globalAlpha=0.25*(1-rr/36);
      ctx.beginPath();
      ctx.ellipse(px,py,rr*1.8,rr*0.35,0,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha=1;
  }

  function rainLayer(ctx,w,h,rains,dt,wind,depth){
    wind=wind||0; depth=depth||1;
    for(const r of rains){
      r.y+=r.spd*dt*depth;
      r.x+=wind*dt*depth;
      if(r.y>h+10){ r.y=-r.len; r.x=Math.random()*w; }
      if(r.x>w+10) r.x=-5;
      if(r.x<-10) r.x=w+5;
      ctx.strokeStyle='rgba(200,220,255,'+(r.a*depth)+')';
      ctx.lineWidth=r.w||1.1;
      ctx.beginPath();
      ctx.moveTo(r.x,r.y);
      ctx.lineTo(r.x-wind*0.025-1.2*depth,r.y+r.len*depth);
      ctx.stroke();
      if(r.y+r.len>h*0.75 && Math.random()>0.88){
        ctx.globalAlpha=0.35*depth;
        ctx.fillStyle='#cde';
        const sx=r.x, sy=h*0.78+Math.random()*h*0.15;
        ctx.beginPath();
        ctx.ellipse(sx,sy,2+Math.random()*3,1,0,0,Math.PI*2);
        ctx.fill();
        // splash rays
        ctx.strokeStyle='rgba(200,220,255,0.25)';
        ctx.lineWidth=0.8;
        for(let k=0;k<3;k++){
          const ang=-Math.PI/2+(k-1)*0.5;
          ctx.beginPath();
          ctx.moveTo(sx,sy);
          ctx.lineTo(sx+Math.cos(ang)*6,sy+Math.sin(ang)*4);
          ctx.stroke();
        }
        ctx.globalAlpha=1;
      }
    }
  }

  function mist(ctx,w,h,t,y0){
    for(let i=0;i<7;i++){
      const x=w*((i*0.18+t*0.015*(i%2?1:-1))%1.3)-w*0.15;
      const rg=ctx.createRadialGradient(x,y0+Math.sin(t+i)*8,8,x,y0,160+i*30);
      rg.addColorStop(0,'rgba(130,150,190,0.09)');
      rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=rg;
      ctx.fillRect(0,y0-120,w,260);
    }
  }

  function streetLamp(ctx,lx,top,h,t){
    // pole
    ctx.fillStyle='#161b26';
    ctx.fillRect(lx-3.5,top,7,h*0.35);
    // arm
    ctx.fillRect(lx-3,top,28,4);
    // fixture
    ctx.fillStyle='#2a303c';
    ctx.fillRect(lx+18,top-4,14,10);
    // bulb
    const pulse=0.85+0.15*Math.sin(t*4+lx);
    ctx.fillStyle='rgba(255,230,180,'+(0.9*pulse)+')';
    ctx.beginPath(); ctx.arc(lx+25,top+2,4,0,Math.PI*2); ctx.fill();
    // volumetric cone
    const cone=ctx.createRadialGradient(lx+25,top+6,2,lx+25,top+h*0.28,100);
    cone.addColorStop(0,'rgba(255,220,160,'+(0.35*pulse)+')');
    cone.addColorStop(0.5,'rgba(255,200,120,0.08)');
    cone.addColorStop(1,'rgba(255,200,120,0)');
    ctx.fillStyle=cone;
    ctx.beginPath();
    ctx.moveTo(lx+18,top+6);
    ctx.lineTo(lx+32,top+6);
    ctx.lineTo(lx+95,top+h*0.38);
    ctx.lineTo(lx-45,top+h*0.38);
    ctx.closePath();
    ctx.fill();
    // ground pool
    const pool=ctx.createRadialGradient(lx+20,top+h*0.36,4,lx+20,top+h*0.36,70);
    pool.addColorStop(0,'rgba(255,210,140,0.2)');
    pool.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=pool;
    ctx.beginPath(); ctx.ellipse(lx+20,top+h*0.36,70,14,0,0,Math.PI*2); ctx.fill();
  }

  function drawCar(ctx,cx,cy,dir,color,t){
    ctx.save();
    ctx.translate(cx,cy);
    if(dir<0) ctx.scale(-1,1);
    // reflection under car
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0,14,36,5,0,0,Math.PI*2); ctx.fill();
    // body
    const bg=ctx.createLinearGradient(0,-14,0,12);
    bg.addColorStop(0,'#1a1e28');
    bg.addColorStop(1,'#0a0c12');
    ctx.fillStyle=bg;
    ctx.beginPath();
    ctx.moveTo(-32,4);
    ctx.lineTo(-28,-6);
    ctx.lineTo(-12,-14);
    ctx.lineTo(18,-14);
    ctx.lineTo(34,-4);
    ctx.lineTo(36,8);
    ctx.lineTo(-32,8);
    ctx.closePath();
    ctx.fill();
    // windows
    ctx.fillStyle='rgba(60,100,140,0.55)';
    ctx.beginPath();
    ctx.moveTo(-10,-12);
    ctx.lineTo(14,-12);
    ctx.lineTo(22,-4);
    ctx.lineTo(-18,-4);
    ctx.closePath();
    ctx.fill();
    // neon side stripe
    ctx.fillStyle=color;
    ctx.globalAlpha=0.7;
    ctx.fillRect(-26,2,48,2.5);
    ctx.globalAlpha=1;
    // headlights
    ctx.fillStyle='#fff8e0';
    ctx.shadowColor='#ffe8a0';
    ctx.shadowBlur=12;
    ctx.fillRect(32,-2,6,5);
    ctx.shadowBlur=0;
    // headlight beam
    const beam=ctx.createRadialGradient(38,0,2,70,0,90);
    beam.addColorStop(0,'rgba(255,240,180,0.35)');
    beam.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=beam;
    ctx.beginPath();
    ctx.moveTo(36,-4);
    ctx.lineTo(110,-18);
    ctx.lineTo(110,22);
    ctx.lineTo(36,6);
    ctx.closePath();
    ctx.fill();
    // taillights
    ctx.fillStyle='#ff2244';
    ctx.globalAlpha=0.85;
    ctx.fillRect(-34,-2,5,5);
    ctx.globalAlpha=1;
    // wheels
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.arc(-18,10,5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(20,10,5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawPerson(ctx,x,baseY,t,scale,opts){
    opts=opts||{};
    scale=scale||1;
    const walk=opts.walk!==false;
    const phase=(opts.phase||0)+ (walk?t*(opts.cadence||5.5):0);
    const bob=walk?Math.sin(phase)*3:0;
    const legA=walk?Math.sin(phase)*14:0;
    const armA=walk?Math.cos(phase)*11:0;
    const coat=opts.coat||'#0a0c12';
    const pants=opts.pants||'#080a10';
    const skin=opts.skin||'#1a1520';
    ctx.save();
    ctx.translate(x, baseY+bob);
    ctx.scale(scale*(opts.flip?-1:1), scale);
    // contact shadow
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0,82,24,7,0,0,Math.PI*2); ctx.fill();
    // shoes
    ctx.fillStyle='#050608';
    ctx.beginPath(); ctx.ellipse(-7+legA*0.15,80,9,3.5,0.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8-legA*0.15,80,9,3.5,-0.1,0,Math.PI*2); ctx.fill();
    // legs with volume
    ctx.fillStyle=pants;
    ctx.save(); ctx.translate(-6,46); ctx.rotate(legA*0.035);
    ctx.beginPath();
    ctx.moveTo(-5,0); ctx.lineTo(-6,34); ctx.lineTo(5,34); ctx.lineTo(6,0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(6,46); ctx.rotate(-legA*0.035);
    ctx.beginPath();
    ctx.moveTo(-5,0); ctx.lineTo(-6,34); ctx.lineTo(5,34); ctx.lineTo(6,0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // coat torso with flare
    const tg=ctx.createLinearGradient(-16,8,16,52);
    tg.addColorStop(0,coat);
    tg.addColorStop(0.5,'#12151c');
    tg.addColorStop(1,coat);
    ctx.fillStyle=tg;
    ctx.beginPath();
    ctx.moveTo(-13,6);
    ctx.quadraticCurveTo(0,12,-13,6);
    ctx.lineTo(-18,52);
    ctx.quadraticCurveTo(0,56,18,52);
    ctx.lineTo(13,6);
    ctx.quadraticCurveTo(0,14,-13,6);
    ctx.fill();
    // coat lapel
    ctx.strokeStyle='rgba(255,255,255,0.06)';
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,10); ctx.lineTo(0,48); ctx.stroke();
    // collar
    ctx.fillStyle='#0e1016';
    ctx.beginPath();
    ctx.moveTo(-11,8); ctx.lineTo(0,18); ctx.lineTo(11,8); ctx.lineTo(8,4); ctx.lineTo(0,12); ctx.lineTo(-8,4);
    ctx.closePath(); ctx.fill();
    // arms
    ctx.fillStyle=coat;
    ctx.save(); ctx.translate(-14,14); ctx.rotate((-25+armA)*Math.PI/180);
    ctx.beginPath();
    ctx.moveTo(-4,0); ctx.lineTo(-5,30); ctx.lineTo(4,30); ctx.lineTo(5,0);
    ctx.closePath(); ctx.fill();
    // hand
    ctx.fillStyle=skin;
    ctx.beginPath(); ctx.arc(0,32,3.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(14,14); ctx.rotate((22-armA)*Math.PI/180);
    ctx.fillStyle=coat;
    ctx.beginPath();
    ctx.moveTo(-4,0); ctx.lineTo(-5,28); ctx.lineTo(4,28); ctx.lineTo(5,0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=skin;
    ctx.beginPath(); ctx.arc(0,30,3.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // neck
    ctx.fillStyle=skin;
    ctx.fillRect(-4,2,8,8);
    // head
    ctx.beginPath(); ctx.arc(0,-2,11.5,0,Math.PI*2); ctx.fill();
    // hair / hood
    if(opts.hood){
      ctx.fillStyle='#0c0e14';
      ctx.beginPath();
      ctx.ellipse(0,-6,14,13,0,Math.PI*1.05,Math.PI*1.95);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-13,2); ctx.quadraticCurveTo(0,18,13,2); ctx.lineTo(12,-2); ctx.quadraticCurveTo(0,10,-12,-2);
      ctx.fill();
    } else {
      ctx.fillStyle='#080a10';
      ctx.beginPath();
      ctx.ellipse(0,-6,12.5,9,0,Math.PI,Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-11,-2); ctx.quadraticCurveTo(-14,6,-8,8); ctx.lineTo(-6,0);
      ctx.fill();
    }
    // face rim (neon side light)
    ctx.strokeStyle='rgba(100,200,255,0.22)';
    ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.arc(3,-2,10, -0.8, 0.9); ctx.stroke();
    // bag
    if(opts.bag){
      ctx.fillStyle='#0a0c12';
      ctx.fillRect(12,22,12,16);
      ctx.strokeStyle='#222';
      ctx.beginPath(); ctx.moveTo(14,22); ctx.lineTo(10,12); ctx.stroke();
    }
    // umbrella
    if(opts.umbrella!==false){
      ctx.strokeStyle='#1a1c22';
      ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(22,-32); ctx.stroke();
      const ug=ctx.createLinearGradient(-28,-48,42,-18);
      ug.addColorStop(0, opts.umbColor||'#1a2030');
      ug.addColorStop(0.5,'#0e121c');
      ug.addColorStop(1,'#080a12');
      ctx.fillStyle=ug;
      ctx.beginPath();
      ctx.moveTo(-26,-30);
      ctx.quadraticCurveTo(10,-54, 46,-28);
      ctx.quadraticCurveTo(10,-36, -26,-30);
      ctx.fill();
      // panel seams
      ctx.strokeStyle='rgba(255,255,255,0.06)';
      ctx.lineWidth=1;
      for(let i=0;i<4;i++){
        const px=-20+i*16;
        ctx.beginPath(); ctx.moveTo(10,-36); ctx.lineTo(px,-30); ctx.stroke();
      }
      // neon rim
      ctx.strokeStyle='rgba(45,224,255,0.4)';
      ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.moveTo(-24,-30);
      ctx.quadraticCurveTo(10,-52, 44,-28);
      ctx.stroke();
      // dripping water
      ctx.strokeStyle='rgba(180,200,230,0.25)';
      ctx.lineWidth=1;
      for(let i=0;i<3;i++){
        const dx=-10+i*18;
        const dy=-28+((t*60+i*20)%20);
        ctx.beginPath(); ctx.moveTo(dx,-28); ctx.lineTo(dx-1,dy); ctx.stroke();
      }
    }
    // body cyan rim light
    ctx.strokeStyle='rgba(80,200,255,0.28)';
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(14,8); ctx.lineTo(16,50); ctx.stroke();
    // magenta opposite rim
    ctx.strokeStyle='rgba(255,60,120,0.12)';
    ctx.beginPath(); ctx.moveTo(-14,10); ctx.lineTo(-16,48); ctx.stroke();
    ctx.restore();
  }

  function powerLines(ctx,w,h,y0,t){
    ctx.strokeStyle='rgba(20,24,36,0.7)';
    ctx.lineWidth=1.2;
    for(let i=0;i<3;i++){
      ctx.beginPath();
      ctx.moveTo(0,y0+i*8);
      for(let x=0;x<=w;x+=40){
        ctx.lineTo(x, y0+i*8+Math.sin(x*0.02+t+i)*4);
      }
      ctx.stroke();
    }
    // poles
    for(let i=0;i<5;i++){
      const px=w*(0.1+i*0.2);
      ctx.fillStyle='#12161e';
      ctx.fillRect(px-3,y0-40,6,h*0.55-y0+40);
      ctx.fillRect(px-18,y0-8,36,4);
    }
  }

  function caption(ctx,w,h,text,t,duration,accent){
    const a=Math.min(1,t/0.55)*Math.min(1,(duration-t)/0.45);
    if(a<=0||!text) return;
    ctx.save();
    ctx.globalAlpha=a;
    ctx.font='600 28px Segoe UI, Microsoft YaHei, sans-serif';
    const tw=ctx.measureText(text).width;
    const tx=(w-tw)/2, ty=h*0.9;
    ctx.fillStyle='rgba(0,0,0,0.62)';
    ctx.fillRect(tx-20,ty-30,tw+40,46);
    ctx.fillStyle=accent||'#2de0ff';
    ctx.fillRect(tx-20,ty+14,tw+40,2);
    ctx.fillStyle='#f2f4f7';
    ctx.fillText(text,tx,ty);
    ctx.restore();
  }
  function progress(ctx,w,h,t,duration){
    ctx.fillStyle='rgba(255,255,255,0.08)';
    ctx.fillRect(0,h-3,w,3);
    ctx.fillStyle='#c45c26';
    ctx.fillRect(0,h-3,w*(t/Math.max(0.01,duration)),3);
  }
  function filmGrain(ctx,w,h,t){
    ctx.globalAlpha=0.045;
    for(let i=0;i<160;i++){
      const x=((i*97+t*900)%w);
      const y=((i*53+t*340)%h);
      ctx.fillStyle=i%2?'#fff':'#000';
      ctx.fillRect(x,y,1.4,1.4);
    }
    ctx.globalAlpha=1;
  }
  function vignette(ctx,w,h){
    const g=ctx.createRadialGradient(w/2,h/2,h*0.18,w/2,h/2,h*0.78);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(0.65,'rgba(0,0,0,0.15)');
    g.addColorStop(1,'rgba(0,0,0,0.62)');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,w,h);
  }
  function chromaticEdge(ctx,w,h,t){
    ctx.globalAlpha=0.04;
    ctx.fillStyle='#ff2d6a';
    ctx.fillRect(1+Math.sin(t)*1,0,w,h);
    ctx.fillStyle='#2de0ff';
    ctx.globalCompositeOperation='screen';
    ctx.fillRect(-1,0,w,h);
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
  }
`;

export function neonSceneFar() {
  return `(function(){
  ${LIB}
  let rains=[], rainsFar=[], last=0;
  return {
    setup({ canvas }) {
      rains = Array.from({length: 220}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        len: 12+Math.random()*24,
        spd: 560+Math.random()*520,
        a: 0.14+Math.random()*0.42,
        w: 1+Math.random()*0.8
      }));
      rainsFar = Array.from({length: 100}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        len: 6+Math.random()*12,
        spd: 280+Math.random()*200,
        a: 0.06+Math.random()*0.15,
        w: 0.7
      }));
      last = performance.now();
    },
    draw({ ctx, canvas, t, duration }) {
      const w=canvas.width, h=canvas.height;
      const now=performance.now();
      const dt=Math.min(0.05,(now-last)/1000); last=now;
      sky(ctx,w,h,t);

      // far skyline silhouette
      for(let i=0;i<42;i++){
        const bw=28+(i*67)%85;
        const bx=((i*73 + t*6)% (w+140))-70;
        const bh=h*(0.14+0.36*Math.abs(Math.sin(i*1.19+0.3)));
        building(ctx, bx, h*0.5-bh, bw, bh+h*0.22, t, i+1, 0.25);
      }
      // mid density layer
      for(let i=0;i<22;i++){
        const bw=48+(i*47)%110;
        const bx=((i*101 + t*14)% (w+100))-50;
        const bh=h*(0.26+0.34*Math.abs(Math.sin(i*0.93)));
        building(ctx, bx, h*0.56-bh, bw, bh+h*0.18, t, i+50, 0.75);
      }

      powerLines(ctx,w,h,h*0.42,t);

      neonSign(ctx, w*0.12, h*0.34, 'BAR', '#ff2d6a', t, 1.15);
      neonSign(ctx, w*0.32, h*0.28, '夜市', '#2de0ff', t, 1.2);
      neonSign(ctx, w*0.52, h*0.33, 'OPEN', '#ffd24a', t, 1.05);
      neonSign(ctx, w*0.72, h*0.26, '25:00', '#b14dff', t, 1.1);
      neonSign(ctx, w*0.88, h*0.36, 'HOTEL', '#3dd6c6', t, 0.9);

      wetStreet(ctx,w,h,h*0.68,t,[
        {x:w*0.15,c:'rgba(255,45,106,ALPHA)',r:150},
        {x:w*0.38,c:'rgba(45,224,255,ALPHA)',r:170},
        {x:w*0.58,c:'rgba(255,210,74,ALPHA)',r:130},
        {x:w*0.78,c:'rgba(177,77,255,ALPHA)',r:120},
        {x:w*0.92,c:'rgba(61,214,198,ALPHA)',r:90},
      ]);

      streetLamp(ctx, w*0.25, h*0.38, h, t);
      streetLamp(ctx, w*0.55, h*0.36, h, t);
      streetLamp(ctx, w*0.82, h*0.39, h, t);

      // distant crowd
      for(let i=0;i<7;i++){
        const px=w*(0.15+i*0.12)+Math.sin(t*0.4+i)*20;
        drawPerson(ctx, px, h*0.72+hash(i)*10, t*0.6+i, 0.28+hash(i)*0.12, {
          umbrella: i%3!==1, walk:true, phase:i*1.7, hood:i%4===0, bag:i%5===0
        });
      }

      mist(ctx,w,h,t,h*0.66);
      rainLayer(ctx,w,h,rainsFar,dt,20,0.7);
      rainLayer(ctx,w,h,rains,dt,38,1);
      chromaticEdge(ctx,w,h,t);
      vignette(ctx,w,h);
      filmGrain(ctx,w,h,t);
      caption(ctx,w,h,'RAIN CITY',t,duration,'#2de0ff');
      progress(ctx,w,h,t,duration);
    }
  };
})()`;
}

export function neonSceneStreet() {
  return `(function(){
  ${LIB}
  let rains=[], rainsClose=[], last=0, cars=[];
  return {
    setup({ canvas }) {
      rains = Array.from({length: 180}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        len: 14+Math.random()*22,
        spd: 600+Math.random()*540,
        a: 0.15+Math.random()*0.4,
        w: 1.1+Math.random()
      }));
      rainsClose = Array.from({length: 40}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        len: 20+Math.random()*30,
        spd: 780+Math.random()*400,
        a: 0.25+Math.random()*0.35,
        w: 1.8
      }));
      cars = [
        {x:0.15, lane:0.82, speed:55, color:'#ff3355'},
        {x:0.75, lane:0.87, speed:-70, color:'#44ddff'},
        {x:0.45, lane:0.84, speed:40, color:'#ffd24a'},
      ];
      last = performance.now();
    },
    draw({ ctx, canvas, t, duration }) {
      const w=canvas.width, h=canvas.height;
      const now=performance.now();
      const dt=Math.min(0.05,(now-last)/1000); last=now;
      sky(ctx,w,h,t);

      // flanking towers
      building(ctx, -40, h*0.02, w*0.32, h*0.82, t, 3, 1);
      building(ctx, w*0.72, h*0.0, w*0.34, h*0.85, t, 8, 1);
      building(ctx, w*0.2, h*0.15, w*0.15, h*0.58, t, 12, 0.85);
      building(ctx, w*0.62, h*0.12, w*0.13, h*0.6, t, 15, 0.85);

      powerLines(ctx,w,h,h*0.32,t);

      // shop row
      const shopColors=['#ff2d6a','#2de0ff','#ffd24a','#b14dff','#3dd6c6'];
      for(let i=0;i<6;i++){
        shopFront(ctx, w*0.28+i*72, h*0.48, 68, h*0.14, t, i, shopColors[i%5]);
      }
      const labels=['ラーメン','酒','薬','ゲーム','CLUB','寿司'];
      for(let i=0;i<6;i++){
        neonSign(ctx, w*0.3+i*72, h*0.46, labels[i], shopColors[i%5], t, 0.72);
      }

      wetStreet(ctx,w,h,h*0.58,t,[
        {x:w*0.3,c:'rgba(255,45,106,ALPHA)',r:160},
        {x:w*0.48,c:'rgba(45,224,255,ALPHA)',r:190},
        {x:w*0.65,c:'rgba(255,210,74,ALPHA)',r:140},
        {x:w*0.8,c:'rgba(177,77,255,ALPHA)',r:110},
      ]);

      streetLamp(ctx, w*0.3, h*0.3, h, t);
      streetLamp(ctx, w*0.7, h*0.28, h, t);

      // cars
      cars.forEach((c) => {
        c.x += c.speed * dt / w;
        if(c.x>1.25) c.x=-0.25;
        if(c.x<-0.25) c.x=1.25;
        drawCar(ctx, c.x*w, c.lane*h, c.speed>0?1:-1, c.color, t);
      });

      // background pedestrians
      drawPerson(ctx, w*0.22+Math.sin(t*0.5)*15, h*0.66, t+0.5, 0.55, {
        umbrella:true, walk:true, hood:true, umbColor:'#1a2838', coat:'#0c1018'
      });
      drawPerson(ctx, w*0.78-Math.sin(t*0.35)*20, h*0.67, t+2, 0.5, {
        umbrella:false, walk:true, bag:true, coat:'#121018', pants:'#0a0c14'
      });

      // hero walker crossing frame
      const p = Math.min(1, t / duration);
      const hx = w*0.08 + w*0.78*p;
      drawPerson(ctx, hx, h*0.64, t, 1.25, {
        umbrella:true, walk:true, umbColor:'#152030', coat:'#0a0e16', cadence:6
      });

      // opposite walker
      drawPerson(ctx, w*0.9 - w*0.35*p, h*0.67, t+1.4, 0.85, {
        umbrella:true, walk:true, flip:true, hood:true, umbColor:'#201018', coat:'#100c14'
      });

      mist(ctx,w,h,t,h*0.6);
      rainLayer(ctx,w,h,rains,dt,50,1);
      rainLayer(ctx,w,h,rainsClose,dt,70,1.15);
      chromaticEdge(ctx,w,h,t);
      vignette(ctx,w,h);
      filmGrain(ctx,w,h,t);
      caption(ctx,w,h,'NEON WALK',t,duration,'#ff2d6a');
      progress(ctx,w,h,t,duration);
    }
  };
})()`;
}

export function neonSceneTitle() {
  return `(function(){
  ${LIB}
  let sparks=[], rains=[], last=0;
  return {
    setup({ canvas }) {
      sparks = Array.from({length: 100}, (_,i) => ({
        a: Math.random()*Math.PI*2,
        r: 35+Math.random()*240,
        s: 0.35+Math.random()*1.4,
        c: i%3===0?'#ff2d6a':(i%3===1?'#2de0ff':'#ffd24a'),
        sz: 1.5+Math.random()*2
      }));
      rains = Array.from({length: 80}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        len: 10+Math.random()*18,
        spd: 400+Math.random()*300,
        a: 0.08+Math.random()*0.2,
        w: 0.9
      }));
      last = performance.now();
    },
    draw({ ctx, canvas, t, duration }) {
      const w=canvas.width, h=canvas.height;
      const now=performance.now();
      const dt=Math.min(0.05,(now-last)/1000); last=now;
      sky(ctx,w,h,t);

      // deep corridor buildings
      for(let i=0;i<14;i++){
        const depth=i/14;
        const bw=lerp(w*0.08, w*0.28, 1-depth);
        const bx=lerp(w*0.5-bw/2-w*0.35, w*0.5-bw/2, depth);
        const by=lerp(h*0.05, h*0.35, depth);
        const bh=lerp(h*0.7, h*0.35, depth);
        building(ctx, bx, by, bw, bh, t, i+20, 0.4+depth*0.5);
        const bx2=lerp(w*0.5+w*0.08, w*0.5+bw*0.1, depth);
        building(ctx, bx2, by, bw, bh, t, i+40, 0.4+depth*0.5);
      }

      const vanish=h*0.55;
      wetStreet(ctx,w,h,vanish,t,[
        {x:w*0.35,c:'rgba(255,45,106,ALPHA)',r:140},
        {x:w*0.5,c:'rgba(45,224,255,ALPHA)',r:180},
        {x:w*0.65,c:'rgba(255,210,74,ALPHA)',r:120},
      ]);

      // perspective floor lines
      ctx.strokeStyle='rgba(120,160,200,0.08)';
      ctx.lineWidth=1;
      for(let i=0;i<12;i++){
        const p=i/12;
        const y=vanish+(h-vanish)*p*p;
        ctx.globalAlpha=0.05+0.12*(1-p);
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      }
      ctx.globalAlpha=1;

      const cx=w/2, cy=h*0.34;
      // neon rings
      for(let i=0;i<6;i++){
        const r=28+i*26+Math.sin(t*2.2+i)*6;
        ctx.strokeStyle=i%2?'#ff2d6a':'#2de0ff';
        ctx.globalAlpha=0.22+0.32*Math.sin(t*2.5+i);
        ctx.lineWidth=2.2;
        ctx.shadowColor=ctx.strokeStyle;
        ctx.shadowBlur=18;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      }
      ctx.shadowBlur=0; ctx.globalAlpha=1;

      // orbiting sparks
      for(const s of sparks){
        s.a+=s.s*dt;
        const x=cx+Math.cos(s.a)*s.r;
        const y=cy+Math.sin(s.a)*s.r*0.42;
        ctx.fillStyle=s.c;
        ctx.globalAlpha=0.5;
        ctx.shadowColor=s.c; ctx.shadowBlur=10;
        ctx.fillRect(x,y,s.sz,s.sz);
      }
      ctx.shadowBlur=0; ctx.globalAlpha=1;

      // title reveal
      const reveal=Math.min(1,Math.max(0,(t-0.2)/1.3));
      ctx.save();
      ctx.font='700 72px Segoe UI, Microsoft YaHei, sans-serif';
      const title='MotionCraft';
      const tw=ctx.measureText(title).width;
      const tx=(w-tw)/2, ty=h*0.38;
      ctx.beginPath();
      ctx.rect(tx-14, ty-76, tw*reveal+28, 100);
      ctx.clip();
      ctx.shadowColor='#2de0ff'; ctx.shadowBlur=32;
      ctx.fillStyle='#f5f7fa';
      ctx.fillText(title, tx, ty);
      ctx.shadowColor='#ff2d6a';
      ctx.fillStyle='#ff2d6a';
      ctx.fillRect(tx, ty+16, tw*reveal, 3.5);
      ctx.restore();

      ctx.font='400 16px Segoe UI, Microsoft YaHei, sans-serif';
      ctx.fillStyle='rgba(190,205,220,'+(0.3+0.6*reveal)+')';
      const sub='RAIN  ·  NEON  ·  FRAME ENGINE';
      const sw=ctx.measureText(sub).width;
      ctx.fillText(sub,(w-sw)/2, h*0.5);

      drawPerson(ctx, w*0.32, h*0.7, t, 0.6, {umbrella:true, walk:true, hood:true});
      drawPerson(ctx, w*0.68, h*0.72, t+1.1, 0.55, {umbrella:true, walk:true, bag:true});

      mist(ctx,w,h,t,h*0.68);
      rainLayer(ctx,w,h,rains,dt,25,0.85);
      chromaticEdge(ctx,w,h,t);
      vignette(ctx,w,h);
      filmGrain(ctx,w,h,t);
      progress(ctx,w,h,t,duration);
    }
  };
})()`;
}
