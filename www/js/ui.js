/** Lightweight toast / confirm / dropdown helpers */

export function toast(message, { type = 'info', ms = 2800 } = {}) {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, ms);
}

export function confirmAsync(message, { okText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="dialog-body">
        <p style="margin:0 0 14px;line-height:1.5">${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button type="submit" value="cancel" class="btn ghost">${cancelText}</button>
          <button type="submit" value="ok" class="btn accent">${okText}</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      dlg.remove();
      resolve(ok);
    });
    dlg.showModal();
  });
}

export function formatTime(s) {
  const t = Math.max(0, s || 0);
  const m = Math.floor(t / 60);
  const r = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

