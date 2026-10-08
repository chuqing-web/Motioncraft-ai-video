import { createEmptyProject, createNode, createEdge, touch } from './model.js';
import { neonSceneFar, neonSceneStreet, neonSceneTitle } from './neon-scenes.js';
import { daySceneWide, daySceneDetail, daySceneTitle } from './day-scenes.js';

/**
 * Hand-authored templates.
 * Scene JS paints main frame captions — attach text/narration use different copy
 * so overlays are not auto-skipped. No image/video in templates (per product).
 */
export const TEMPLATES = [
  {
    id: 'empty',
    name: '空白项目',
    desc: '从空画布开始',
    build: () => createEmptyProject('未命名项目'),
  },
  {
    id: 'neon',
    name: '霓虹城市漫步',
    desc: '雨夜霓虹 · 全节点演示',
    build: () => buildNeonCity(),
  },
  {
    id: 'day',
    name: '日光产品片',
    desc: '日景 · 全节点演示',
    build: () => buildDayProduct(),
  },
  {
    id: 'data',
    name: '数据叙事',
    desc: '图表叙事',
    build: () => buildDataStory(),
  },
];

function projectShell(name, duration) {
  const p = createEmptyProject(name);
  p.settings.duration = duration;
  p.settings.renderMode = 'model-code';
  return p;
}

function addScene(project, shot, prev) {
  const scene = createNode('scene', shot.x, shot.y);
  scene.props.title = shot.title;
  scene.props.duration = shot.duration;
  scene.props.text = shot.text || '';
  scene.props.html = shot.html || '<div class="layer"></div>';
  scene.props.css = shot.css || '.layer{position:absolute;inset:0}';
  scene.props.js = shot.js;
  scene.props.prompt = shot.prompt || shot.text || '';
  scene.props.style = shot.style || '';
  scene.props.sceneBrief = shot.sceneBrief || '';
  scene.props.character = shot.character || '';
  scene.props.environment = shot.environment || '';
  scene.props.camera = shot.camera || '';
  scene.props.lighting = shot.lighting || '';
  scene.props.effects = shot.effects || '';
  scene.props.post = shot.post || '';
  project.nodes.push(scene);
  if (prev) project.edges.push(createEdge(prev.id, scene.id, 'sequence'));
  return scene;
}

function attach(project, child, scene) {
  project.edges.push(createEdge(child.id, scene.id, 'attach'));
}

function place(node, x, y) {
  node.x = x;
  node.y = y;
  return node;
}

/** Neon night — cold palette, rain/spark, handheld/pan/zoom, VO type/karaoke */
function wireNeonExtras(project, scenes) {
  const [s0, s1, s2] = scenes;

  // —— Scene 0: far rain ——
  const cam0 = place(createNode('camera'), 80, 360);
  cam0.props.title = '夜·手持';
  cam0.props.move = 'handheld';
  cam0.props.intensity = 1.15;
  cam0.props.letterbox = true;
  cam0.props.duration = s0.props.duration;
  project.nodes.push(cam0);
  attach(project, cam0, s0);

  const fx0 = place(createNode('effect'), 260, 360);
  fx0.props.title = '夜雨';
  fx0.props.motion = 'rain';
  fx0.props.effect = 'rain';
  fx0.props.appearance = '冷色斜雨';
  fx0.props.layout = { x: 0, y: 0, w: 1, h: 1 };
  project.nodes.push(fx0);
  attach(project, fx0, s0);

  const na0 = place(createNode('narration'), 440, 360);
  na0.props.speaker = '夜';
  na0.props.title = '夜';
  na0.props.text = '雨落在霓虹上，城市开始呼吸。';
  na0.props.animation = 'type';
  na0.props.duration = s0.props.duration;
  na0.props.layout = { x: 0.06, y: 0.74, w: 0.88, h: 0.18 };
  project.nodes.push(na0);
  attach(project, na0, s0);

  const tx0 = place(createNode('text'), 620, 360);
  tx0.props.text = '雨夜 · 远景';
  tx0.props.animation = 'rise';
  tx0.props.duration = s0.props.duration;
  tx0.props.layout = { x: 0.08, y: 0.08, w: 0.35, h: 0.1 };
  project.nodes.push(tx0);
  attach(project, tx0, s0);

  const au0 = place(createNode('audio'), 800, 360);
  au0.props.title = '雨声床';
  au0.props.volume = 0.55;
  au0.props.fadeIn = 0.6;
  au0.props.fadeOut = 0.8;
  au0.props.duration = s0.props.duration;
  project.nodes.push(au0);
  attach(project, au0, s0);

  // —— Scene 1: street walk ——
  const cam1 = place(createNode('camera'), 80, 520);
  cam1.props.title = '夜·横移';
  cam1.props.move = 'pan';
  cam1.props.intensity = 1.2;
  cam1.props.letterbox = true;
  cam1.props.duration = s1.props.duration;
  project.nodes.push(cam1);
  attach(project, cam1, s1);

  const ch1 = place(createNode('character'), 260, 520);
  ch1.props.title = '撑伞行人';
  ch1.props.motion = 'walk';
  ch1.props.look = 'umbrella';
  ch1.props.umbrella = true;
  ch1.props.coatColor = '#1a2838';
  ch1.props.appearance = '雨夜风衣撑伞';
  ch1.props.layout = { x: 0.55, y: 0.42, w: 0.28, h: 0.48 };
  project.nodes.push(ch1);
  attach(project, ch1, s1);

  const fx1 = place(createNode('effect'), 440, 520);
  fx1.props.title = '霓虹火花';
  fx1.props.motion = 'spark';
  fx1.props.effect = 'spark';
  fx1.props.layout = { x: 0.15, y: 0.1, w: 0.7, h: 0.55 };
  project.nodes.push(fx1);
  attach(project, fx1, s1);

  const ct1 = place(createNode('chart'), 620, 520);
  ct1.props.title = '夜流量';
  ct1.props.values = [28, 45, 62, 88, 95, 70];
  ct1.props.motion = 'sweep';
  ct1.props.barColor = '#2de0ff';
  ct1.props.appearance = '霓虹青柱';
  ct1.props.layout = { x: 0.58, y: 0.12, w: 0.36, h: 0.32 };
  project.nodes.push(ct1);
  attach(project, ct1, s1);

  const na1 = place(createNode('narration'), 800, 520);
  na1.props.speaker = '街';
  na1.props.text = '脚步踩进倒影里，灯牌一声一声亮着。';
  na1.props.animation = 'karaoke';
  na1.props.duration = s1.props.duration;
  project.nodes.push(na1);
  attach(project, na1, s1);

  const tx1 = place(createNode('text'), 980, 520);
  tx1.props.text = '霓虹 · 街道';
  tx1.props.animation = 'slide';
  tx1.props.layout = { x: 0.08, y: 0.1, w: 0.32, h: 0.09 };
  project.nodes.push(tx1);
  attach(project, tx1, s1);

  // —— Scene 2: title ——
  const cam2 = place(createNode('camera'), 80, 680);
  cam2.props.title = '夜·推进';
  cam2.props.move = 'zoom';
  cam2.props.intensity = 1.1;
  cam2.props.letterbox = true;
  cam2.props.duration = s2.props.duration;
  project.nodes.push(cam2);
  attach(project, cam2, s2);

  const fx2 = place(createNode('effect'), 260, 680);
  fx2.props.title = '品红光晕';
  fx2.props.motion = 'glow';
  fx2.props.effect = 'glow';
  fx2.props.layout = { x: 0.2, y: 0.15, w: 0.6, h: 0.55 };
  project.nodes.push(fx2);
  attach(project, fx2, s2);

  const ch2 = place(createNode('character'), 440, 680);
  ch2.props.title = '剪影';
  ch2.props.motion = 'wave';
  ch2.props.look = 'umbrella';
  ch2.props.umbrella = true;
  ch2.props.coatColor = '#201018';
  ch2.props.layout = { x: 0.12, y: 0.5, w: 0.22, h: 0.38 };
  project.nodes.push(ch2);
  attach(project, ch2, s2);

  const tx2 = place(createNode('text'), 620, 680);
  tx2.props.text = 'FRAME ENGINE';
  tx2.props.animation = 'slide';
  tx2.props.layout = { x: 0.25, y: 0.58, w: 0.5, h: 0.1 };
  project.nodes.push(tx2);
  attach(project, tx2, s2);

  const na2 = place(createNode('narration'), 800, 680);
  na2.props.speaker = 'END';
  na2.props.text = 'MotionCraft — 雨与霓虹写成帧。';
  na2.props.animation = 'fade';
  na2.props.duration = s2.props.duration;
  project.nodes.push(na2);
  attach(project, na2, s2);
}

/** Daylight — warm palette, dust/glow/fade, pan/zoom/tilt, VO rise/fade */
function wireDayExtras(project, scenes) {
  const [s0, s1, s2] = scenes;

  // —— Scene 0: morning ——
  const cam0 = place(createNode('camera'), 80, 360);
  cam0.props.title = '日·横移';
  cam0.props.move = 'pan';
  cam0.props.intensity = 0.95;
  cam0.props.letterbox = true;
  cam0.props.duration = s0.props.duration;
  project.nodes.push(cam0);
  attach(project, cam0, s0);

  const fx0 = place(createNode('effect'), 260, 360);
  fx0.props.title = '晨尘';
  fx0.props.motion = 'particles';
  fx0.props.effect = 'particles';
  fx0.props.appearance = '暖色尘埃';
  fx0.props.layout = { x: 0, y: 0, w: 1, h: 1 };
  project.nodes.push(fx0);
  attach(project, fx0, s0);

  const na0 = place(createNode('narration'), 440, 360);
  na0.props.speaker = '晨';
  na0.props.text = '阳光铺开广场，产品在光里醒来。';
  na0.props.animation = 'rise';
  na0.props.duration = s0.props.duration;
  project.nodes.push(na0);
  attach(project, na0, s0);

  const tx0 = place(createNode('text'), 620, 360);
  tx0.props.text = '晨光 · 开场';
  tx0.props.animation = 'fade';
  tx0.props.layout = { x: 0.08, y: 0.08, w: 0.35, h: 0.1 };
  project.nodes.push(tx0);
  attach(project, tx0, s0);

  const ch0 = place(createNode('character'), 800, 360);
  ch0.props.title = '行人';
  ch0.props.motion = 'walk';
  ch0.props.look = 'default';
  ch0.props.umbrella = false;
  ch0.props.coatColor = '#3a4555';
  ch0.props.skinColor = '#c9a088';
  ch0.props.layout = { x: 0.18, y: 0.48, w: 0.22, h: 0.4 };
  project.nodes.push(ch0);
  attach(project, ch0, s0);

  // —— Scene 1: detail ——
  const cam1 = place(createNode('camera'), 80, 520);
  cam1.props.title = '日·推进';
  cam1.props.move = 'zoom';
  cam1.props.intensity = 1.25;
  cam1.props.letterbox = true;
  cam1.props.duration = s1.props.duration;
  project.nodes.push(cam1);
  attach(project, cam1, s1);

  const fx1 = place(createNode('effect'), 260, 520);
  fx1.props.title = '暖光晕';
  fx1.props.motion = 'glow';
  fx1.props.effect = 'glow';
  fx1.props.layout = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 };
  project.nodes.push(fx1);
  attach(project, fx1, s1);

  const ct1 = place(createNode('chart'), 440, 520);
  ct1.props.title = '转化';
  ct1.props.values = [35, 48, 52, 68, 82, 96];
  ct1.props.motion = 'grow';
  ct1.props.barColor = '#c45c26';
  ct1.props.appearance = '暖色增长柱';
  ct1.props.layout = { x: 0.08, y: 0.18, w: 0.34, h: 0.36 };
  project.nodes.push(ct1);
  attach(project, ct1, s1);

  const na1 = place(createNode('narration'), 620, 520);
  na1.props.speaker = '质感';
  na1.props.text = '材质在窗光下慢慢显形，细节即产品。';
  na1.props.animation = 'type';
  na1.props.duration = s1.props.duration;
  project.nodes.push(na1);
  attach(project, na1, s1);

  const au1 = place(createNode('audio'), 800, 520);
  au1.props.title = '环境柔垫';
  au1.props.volume = 0.4;
  au1.props.fadeIn = 0.4;
  au1.props.fadeOut = 0.5;
  au1.props.duration = s1.props.duration;
  project.nodes.push(au1);
  attach(project, au1, s1);

  const tx1 = place(createNode('text'), 980, 520);
  tx1.props.text = 'DETAIL';
  tx1.props.animation = 'slide';
  tx1.props.layout = { x: 0.62, y: 0.12, w: 0.3, h: 0.1 };
  project.nodes.push(tx1);
  attach(project, tx1, s1);

  // —— Scene 2: title ——
  const cam2 = place(createNode('camera'), 80, 680);
  cam2.props.title = '日·荷兰角';
  cam2.props.move = 'tilt';
  cam2.props.intensity = 0.85;
  cam2.props.letterbox = true;
  cam2.props.duration = s2.props.duration;
  project.nodes.push(cam2);
  attach(project, cam2, s2);

  const fx2 = place(createNode('effect'), 260, 680);
  fx2.props.title = '落版溶解';
  fx2.props.motion = 'fade';
  fx2.props.effect = 'fade';
  fx2.props.layout = { x: 0, y: 0, w: 1, h: 1 };
  project.nodes.push(fx2);
  attach(project, fx2, s2);

  const ch2 = place(createNode('character'), 440, 680);
  ch2.props.title = '远景人';
  ch2.props.motion = 'idle';
  ch2.props.look = 'default';
  ch2.props.coatColor = '#4a3028';
  ch2.props.layout = { x: 0.72, y: 0.52, w: 0.2, h: 0.35 };
  project.nodes.push(ch2);
  attach(project, ch2, s2);

  const na2 = place(createNode('narration'), 620, 680);
  na2.props.speaker = 'SHIP';
  na2.props.text = '日光写完最后一帧，准备出货。';
  na2.props.animation = 'fade';
  na2.props.duration = s2.props.duration;
  project.nodes.push(na2);
  attach(project, na2, s2);

  const tx2 = place(createNode('text'), 800, 680);
  tx2.props.text = 'SHIP IT';
  tx2.props.animation = 'rise';
  tx2.props.layout = { x: 0.3, y: 0.55, w: 0.4, h: 0.1 };
  project.nodes.push(tx2);
  attach(project, tx2, s2);
}

function buildNeonCity() {
  const duration = 18;
  const project = projectShell('霓虹城市漫步', duration);
  const shots = [
    {
      title: '远景·雨夜',
      duration: 6,
      text: 'RAIN CITY',
      js: neonSceneFar(),
      style: '电影级写实雨夜，35mm，冷青品红霓虹，浅景深，轻手持',
      sceneBrief: '雨夜城市天际线，多层楼宇窗灯，湿沥青倒影',
      character: '远处撑伞剪影行人',
      environment: '斜雨、薄雾、电线、路灯体积光、水坑涟漪',
      camera: '35mm，缓慢横移，焦点在街道中景',
      lighting: '冷蓝环境光，品红/青霓虹轮廓光，软阴影与接触阴影',
      effects: '双层雨、溅水、雾、胶片颗粒、轻色差',
      post: 'bloom, grain, vignette, teal-magenta',
    },
    {
      title: '街道·行人',
      duration: 6,
      text: 'NEON WALK',
      js: neonSceneStreet(),
      style: '街道跟拍写实，50mm，浅景深，霓虹侧光',
      sceneBrief: '霓虹店招街道，湿路，车灯与店面橱窗',
      character: '风衣撑伞行人穿过画面，对面有反向行人',
      environment: '雨、店招闪烁、路灯锥光、车灯光束、薄雾',
      camera: '50mm，跟主体横移，轻微手持',
      lighting: '暖窗光 + 冷霓虹 rim，接触阴影在脚底',
      effects: '近景大雨滴、溅射、湿反射拉丝',
      post: 'bloom, grain, vignette',
    },
    {
      title: '落版',
      duration: 6,
      text: 'MotionCraft',
      js: neonSceneTitle(),
      style: '片尾落版，透视街道走廊，霓虹光环',
      sceneBrief: '纵深雨夜街道尽头，标题揭示',
      character: '远处两名撑伞剪影',
      environment: '透视湿路、轨道光环、火花粒子、薄雾',
      camera: '缓慢推近标题，焦点在 logo',
      lighting: '青/品红对称霓虹，地面反射',
      effects: '轨道火花、雨丝、颗粒',
      post: 'bloom, grain, vignette, reveal wipe',
    },
  ];
  const scenes = [];
  let prev = null;
  shots.forEach((s, i) => {
    prev = addScene(project, { ...s, x: 80 + i * 260, y: 120 }, prev);
    scenes.push(prev);
  });

  wireNeonExtras(project, scenes);

  const ai = place(createNode('ai'), 80, 40);
  ai.props.prompt =
    '写实雨夜霓虹城：湿反光路面、多层楼宇、撑伞行人、雨雾与霓虹光晕，落版 MotionCraft；叠层含镜头/旁白/特效/人物/图表';
  ai.props.title = '生成';
  project.nodes.push(ai);

  return touch(project);
}

function buildDayProduct() {
  const duration = 15;
  const project = projectShell('日光产品片', duration);
  const shots = [
    {
      title: '开场·晨光',
      duration: 5,
      text: 'MORNING LIGHT',
      js: daySceneWide(),
      style: '日光产品片开场，自然光，35mm，暖色，轻手持',
      sceneBrief: '晨光广场，远楼与树木，产品卡悬浮于中景',
      character: '广场行人散步',
      environment: '太阳光柱、软云、尘埃、地面暖光斑',
      camera: '35mm，轻手持，焦点在产品卡',
      lighting: '高位暖阳光，柔和环境光，接触阴影',
      effects: '丁达尔光柱、漂浮尘埃',
      post: 'warm grade, grain, soft vignette',
    },
    {
      title: '特写·材质',
      duration: 5,
      text: 'DETAIL',
      js: daySceneDetail(),
      style: '室内窗光产品特写，50mm，浅景深，缓慢推近',
      sceneBrief: '窗边木桌，窗格光，产品卡材质特写',
      character: '',
      environment: '窗光焦散、蒸汽感、室内暖墙、尘埃',
      camera: '50mm，缓慢 zoom-in，焦点在产品高光',
      lighting: '侧窗自然光，暖高光与软阴影',
      effects: '蒸汽丝、尘埃、桌面焦散',
      post: 'warm grade, grain, vignette',
    },
    {
      title: '落版',
      duration: 5,
      text: 'SHIP IT',
      js: daySceneTitle(),
      style: '日景落版，标题揭示，温暖日光',
      sceneBrief: '户外丘陵天空，标题与迷你产品卡',
      character: '远景行人',
      environment: '阳光、树木、尘埃、镜头光环',
      camera: '标题揭示推近，焦点在 MotionCraft',
      lighting: '暖日光，柔和阴影',
      effects: '光环、尘埃',
      post: 'warm grade, grain, vignette',
    },
  ];
  const scenes = [];
  let prev = null;
  shots.forEach((s, i) => {
    prev = addScene(project, { ...s, x: 80 + i * 260, y: 120 }, prev);
    scenes.push(prev);
  });

  wireDayExtras(project, scenes);

  const ai = place(createNode('ai'), 80, 40);
  ai.props.prompt =
    '日光产品片：晨光广场、窗边木桌特写、体积光与尘埃、写实行人与落版；叠层含镜头/旁白/特效/人物/图表';
  ai.props.title = '生成';
  project.nodes.push(ai);

  return touch(project);
}

function buildDataStory() {
  const project = projectShell('数据叙事', 12);
  const js = `(function(){
  const vals=[42,58,51,73,88,96];
  return {
    setup(){},
    draw({ctx,canvas,t,duration}){
      const w=canvas.width,h=canvas.height;
      ctx.fillStyle='#0e1114'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(255,255,255,0.06)';
      for(let i=0;i<8;i++){ ctx.beginPath(); ctx.moveTo(80,80+i*70); ctx.lineTo(w-60,80+i*70); ctx.stroke(); }
      const grow=Math.min(1,t/1.4);
      const max=Math.max(...vals);
      const gap=36, bw=54, base=h*0.78, left=(w-(vals.length*(bw+gap)))/2;
      vals.forEach((v,i)=>{
        const bh=(v/max)*h*0.45*grow;
        const x=left+i*(bw+gap);
        const g=ctx.createLinearGradient(x,base-bh,x,base);
        g.addColorStop(0,'#c45c26'); g.addColorStop(1,'#5a2a12');
        ctx.fillStyle=g; ctx.fillRect(x,base-bh,bw,bh);
        ctx.fillStyle='#aaa'; ctx.font='12px Consolas,monospace';
        ctx.fillText(String(Math.round(v*grow)), x+12, base-bh-8);
      });
      const cap='GROWTH  +120%';
      const a=Math.min(1,t/0.5);
      ctx.globalAlpha=a;
      ctx.font='600 28px Segoe UI,Microsoft YaHei,sans-serif';
      const tw=ctx.measureText(cap).width;
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect((w-tw)/2-14,h*0.12-28,tw+28,40);
      ctx.fillStyle='#e8eaed'; ctx.fillText(cap,(w-tw)/2,h*0.12);
      ctx.globalAlpha=1;
      ctx.fillStyle='#c45c26'; ctx.fillRect(0,h-3,w*(t/Math.max(0.01,duration)),3);
    }
  };
})()`;
  addScene(
    project,
    {
      x: 200,
      y: 140,
      title: '增长',
      duration: 12,
      text: 'GROWTH +120%',
      js,
      style: '工业数据叙事，深底暖强调色，图表生长动画',
      sceneBrief: '深色网格背景，柱状增长图',
      environment: '细网格参考线',
      camera: 'static',
      lighting: '平面 UI 光，强调色柱体渐变',
      effects: '柱体生长',
      post: 'subtle grain',
    },
    null,
  );
  return touch(project);
}
