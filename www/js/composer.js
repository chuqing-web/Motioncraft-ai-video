import { bakeTimeline } from './model.js';
import { paintOverlays, applyCameraTransform, paintCameraChrome } from './overlays.js';
import { compileSceneRuntime } from './runtime.js';
export { compileSceneRuntime } from './runtime.js';

/**
 * Executes model-authored HTML/CSS/JS per scene, then paints attached overlays.
 */
export class Composer {
  constructor(stageRoot, clockEl) {
    this.stageRoot = stageRoot;
    this.clockEl = clockEl;
    this.raf = 0;
    this.playing = false;
    this.shots = [];
    this.duration = 12;
    this.project = null;
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  build(project, paintCanvas) {
    this.project = project;
    bakeTimeline(project);
    const track = project.timeline.tracks.find((t) => t.id === 'scene');
    const blocks = track?.blocks || [];
    this.stageRoot.querySelectorAll('.shot').forEach((el) => el.remove());

    const shots = [];
    for (const block of blocks) {
      const scene = project.nodes.find((n) => n.id === block.id);
      if (!scene) continue;
      const attached = collectAttached(project, scene.id);

      const shot = document.createElement('div');
      shot.className = 'shot';
      shot.dataset.start = String(block.start);
      shot.dataset.end = String(block.start + block.duration);

      const style = document.createElement('style');
      style.textContent = scene.props.css || '';
      shot.appendChild(style);

      const root = document.createElement('div');
      root.className = 'code-root';
      root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
      root.innerHTML = scene.props.html || '<div class="layer"></div>';
      shot.appendChild(root);

      const runtime = compileSceneRuntime(scene.props.js, { persistProps: scene.props });
      try {
        runtime.setup?.({
          root,
          canvas: paintCanvas,
          ctx: paintCanvas.getContext('2d'),
          duration: block.duration,
        });
      } catch (err) {
        console.warn('scene setup failed', scene.id, err);
      }

      this.stageRoot.appendChild(shot);
      shots.push({
        el: shot,
        root,
        start: block.start,
        end: block.start + block.duration,
        duration: block.duration,
        scene,
        attached,
        runtime,
      });
    }

    this.shots = shots;
    this.duration = project.settings.bakedDuration || project.settings.duration || 12;
    this.paintCanvas = paintCanvas;
    return { duration: this.duration, shots };
  }

  paintAt(t) {
    const canvas = this.paintCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let painted = false;
    for (const s of this.shots) {
      const on = t >= s.start && t < s.end;
      s.el.classList.toggle('active', on);
      if (!on) continue;
      const localT = t - s.start;
      const cam = s.attached.find((n) => n.type === 'camera');
      ctx.save();
      applyCameraTransform(ctx, canvas, cam, localT, s.duration);
      try {
        s.runtime.draw?.({
          ctx,
          canvas,
          t: localT,
          duration: s.duration,
          root: s.root,
        });
        paintOverlays(
          ctx,
          canvas,
          s.attached.filter((n) => n.type !== 'camera'),
          localT,
          s.duration,
          this.project,
          s.scene,
        );
        painted = true;
      } catch (err) {
        console.warn('scene draw failed', s.scene.id, err);
        ctx.fillStyle = '#200';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '20px sans-serif';
        ctx.fillText('draw() 错误: ' + err.message, 40, 80);
        painted = true;
      }
      ctx.restore();
      // letterbox / vignette / cam HUD in screen space (not affected by transform)
      if (cam) paintCameraChrome(ctx, canvas, cam, localT, s.duration);
    }
    if (!painted) {
      ctx.fillStyle = '#05070b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#667';
      ctx.font = '22px Segoe UI, sans-serif';
      ctx.fillText('暂无分镜 — 用 AI 导演或模板开始', 48, 80);
    }
  }
}

function collectAttached(project, sceneId) {
  return project.edges
    .filter((e) => e.kind === 'attach' && (e.to === sceneId || e.from === sceneId))
    .map((e) => project.nodes.find((n) => n.id === (e.to === sceneId ? e.from : e.to)))
    .filter((n) => n && n.type !== 'scene');
}
