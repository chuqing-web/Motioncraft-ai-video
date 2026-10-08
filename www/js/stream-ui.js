/**
 * Live AI stream display (director dialog + floating panel + host/MCP snapshot).
 */

let state = {
  active: false,
  title: '',
  status: '',
  text: '',
  source: '',
  updatedAt: 0,
};

const MAX_CHARS = 120_000;

function panelEls() {
  return {
    panel: document.getElementById('aiStreamPanel'),
    title: document.getElementById('aiStreamTitle'),
    status: document.getElementById('aiStreamStatus'),
    body: document.getElementById('aiStreamBody'),
  };
}

function postHost(payload) {
  try {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(JSON.stringify(payload));
    }
  } catch {
    /* ignore */
  }
}

function publishSnapshot() {
  const snap = {
    active: state.active,
    title: state.title,
    status: state.status,
    text: state.text,
    source: state.source,
    updatedAt: state.updatedAt,
    length: state.text.length,
  };
  window.__mcAiStream = snap;
  postHost({ type: 'aiStream', data: snap });
  return snap;
}

function paint() {
  const { panel, title, status, body } = panelEls();
  if (panel) {
    panel.classList.toggle('hidden', !state.active && !state.text);
    panel.classList.toggle('streaming', state.active);
  }
  if (title) title.textContent = state.title || 'AI 输出';
  if (status) status.textContent = state.status || (state.active ? '生成中…' : '');
  if (body) {
    body.textContent = state.text || (state.active ? '…' : '');
    body.scrollTop = body.scrollHeight;
  }

  const log = document.getElementById('directorLog');
  if (log && (state.source === 'director' || document.getElementById('directorDialog')?.open)) {
    const head = state.status ? `【${state.status}】\n` : '';
    log.textContent = head + (state.text || (state.active ? '正在流式接收…' : log.textContent));
    log.scrollTop = log.scrollHeight;
    log.classList.toggle('streaming', state.active);
  }
}

export function getAiStreamSnapshot() {
  return { ...state, length: state.text.length };
}

export function beginAiStream(title, { source = 'ai' } = {}) {
  state = {
    active: true,
    title: title || 'AI 生成',
    status: '连接模型…',
    text: '',
    source,
    updatedAt: Date.now(),
  };
  const { panel } = panelEls();
  if (panel) panel.classList.remove('hidden');
  paint();
  publishSnapshot();
}

export function statusAiStream(status) {
  state.status = status || '';
  state.updatedAt = Date.now();
  paint();
  publishSnapshot();
}

export function appendAiStream(delta) {
  if (!delta) return;
  state.text += delta;
  if (state.text.length > MAX_CHARS) {
    state.text = state.text.slice(-MAX_CHARS);
  }
  if (!state.status || state.status === '连接模型…') state.status = '流式接收中…';
  state.updatedAt = Date.now();
  paint();
  // Throttle host posts slightly for performance
  if (!appendAiStream._lastPost || Date.now() - appendAiStream._lastPost > 80) {
    appendAiStream._lastPost = Date.now();
    publishSnapshot();
  }
}

export function endAiStream(finalStatus = '完成') {
  state.active = false;
  state.status = finalStatus;
  state.updatedAt = Date.now();
  paint();
  publishSnapshot();
  const { panel } = panelEls();
  if (panel) {
    clearTimeout(endAiStream._hideTimer);
    endAiStream._hideTimer = setTimeout(() => {
      if (!state.active) panel.classList.add('hidden');
    }, 4500);
  }
}

export function failAiStream(message) {
  state.active = false;
  state.status = '失败';
  if (message) state.text = (state.text ? state.text + '\n\n' : '') + '⚠ ' + message;
  state.updatedAt = Date.now();
  paint();
  publishSnapshot();
}

/** Shared onStream handler for director / MCP-triggered runs */
export function makeDirectorStreamHandlers(title, source = 'ai') {
  beginAiStream(title, { source });
  return {
    onStream(ev) {
      if (!ev) return;
      if (ev.type === 'status') statusAiStream(ev.message || '');
      else if (ev.type === 'delta') appendAiStream(ev.text || '');
      else if (ev.type === 'attempt') {
        statusAiStream(`第 ${ev.attempt}/${ev.max} 次尝试${ev.repair ? '（打回修正）' : ''}`);
        if (ev.repair) appendAiStream('\n\n—— 打回修正，重新生成 ——\n\n');
      }
    },
    end(ok, msg) {
      if (ok) endAiStream(msg || '完成');
      else failAiStream(msg || '生成失败');
    },
  };
}
