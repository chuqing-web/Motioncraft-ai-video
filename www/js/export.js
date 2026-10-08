/**
 * Record canvas while an external paint loop runs.
 * Prefer recordWhilePainting() so frames stay in sync with draw().
 */

export function pickMime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

/**
 * @param {HTMLCanvasElement} canvasEl
 * @param {number} fps
 * @returns {{ recorder: MediaRecorder, stop: () => Promise<{blob:Blob,mime:string,ext:string}>, mime: string }}
 */
export function beginRecording(canvasEl, fps = 30) {
  if (!canvasEl?.captureStream) {
    throw new Error('当前环境不支持 canvas.captureStream，请更新 WebView2');
  }
  const stream = canvasEl.captureStream(fps);
  const mime = pickMime();
  const chunks = [];
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  recorder.start(100);

  return {
    mime: mime || 'video/webm',
    recorder,
    async stop() {
      if (recorder.state !== 'inactive') {
        await new Promise((resolve, reject) => {
          recorder.onstop = () => resolve();
          recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'));
          recorder.stop();
        });
      }
      stream.getTracks().forEach((t) => t.stop());
      const type = mime || recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      return { blob, mime: type, ext };
    },
  };
}

/** @deprecated wall-clock sleep export — kept for fallback */
export async function exportStage(canvasEl, durationSec, fps = 30) {
  const session = beginRecording(canvasEl, fps);
  await new Promise((r) => setTimeout(r, Math.max(0.8, durationSec) * 1000 + 200));
  return session.stop();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
