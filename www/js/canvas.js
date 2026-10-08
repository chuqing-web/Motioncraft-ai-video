import { NODE_DEFS, createEdge } from './model.js';

const TYPE_TAG = {
  scene: 'SC',
  text: 'TX',
  image: 'IMG',
  video: 'VID',
  character: 'CH',
  chart: 'CHT',
  effect: 'FX',
  audio: 'AUD',
  narration: 'NAR',
  camera: 'CAM',
  ai: 'AI',
};

export class GraphCanvas {
  constructor({ canvasEl, svgEl, getProject, onChange, onSelect, onSelectEdge }) {
    this.canvasEl = canvasEl;
    this.svgEl = svgEl;
    this.getProject = getProject;
    this.onChange = onChange;
    this.onSelect = onSelect;
    this.onSelectEdge = onSelectEdge || (() => {});
    this.selectedId = null;
    this.selectedEdgeId = null;
    this.drag = null;
    this.link = null;
    this.spacePan = false;
    this.panning = null;
    this._ctx = ensureCtxMenu();

    this.svgEl.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6a727a" />
        </marker>
        <marker id="arrowActive" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#c45c26" />
        </marker>
      </defs>
      <g id="edgePaths"></g>
      <path id="tempEdge" stroke="#c45c26" stroke-width="1.5" fill="none" stroke-dasharray="4 3"></path>
    `;

    this.canvasEl.addEventListener('pointerdown', (e) => {
      if (e.target !== this.canvasEl) return;
      hideCtxMenu();
      if (this.spacePan || e.button === 1) {
        const wrap = this.canvasEl.parentElement;
        this.panning = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop };
        return;
      }
      if (e.button !== 0) return;
      this.cancelLink();
      this.selectedId = null;
      this.selectedEdgeId = null;
      this.onSelect(null);
      this.onSelectEdge(null);
      this.render();
    });

    this.canvasEl.addEventListener('contextmenu', (e) => {
      if (e.target !== this.canvasEl && !e.target.classList?.contains('graph-node')) return;
      // empty canvas: no menu
      if (e.target === this.canvasEl) {
        e.preventDefault();
        hideCtxMenu();
      }
    });

    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e.target)) this.spacePan = true;
      if (e.key === 'Escape') {
        this.cancelLink();
        hideCtxMenu();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spacePan = false;
    });
    window.addEventListener('click', () => hideCtxMenu());
    window.addEventListener('blur', () => hideCtxMenu());
  }

  showNodeMenu(clientX, clientY, nodeId) {
    this.select(nodeId);
    showCtxMenu(clientX, clientY, [
      {
        label: '删除节点',
        danger: true,
        action: () => {
          this.selectedId = nodeId;
          this.selectedEdgeId = null;
          this.deleteSelection();
        },
      },
    ]);
  }

  showEdgeMenu(clientX, clientY, edgeId) {
    this.selectEdge(edgeId);
    showCtxMenu(clientX, clientY, [
      {
        label: '删除连线',
        danger: true,
        action: () => {
          this.selectedEdgeId = edgeId;
          this.selectedId = null;
          this.deleteSelection();
        },
      },
    ]);
  }

  cancelLink() {
    this.link = null;
    this.svgEl.querySelector('#tempEdge')?.setAttribute('d', '');
  }

  select(id) {
    this.selectedId = id;
    this.selectedEdgeId = null;
    this.onSelect(id);
    this.onSelectEdge(null);
    this.render();
  }

  selectEdge(id) {
    this.selectedEdgeId = id;
    this.selectedId = null;
    this.onSelect(null);
    this.onSelectEdge(id);
    this.render();
  }

  deleteSelection() {
    const project = this.getProject();
    if (this.selectedEdgeId) {
      project.edges = project.edges.filter((e) => e.id !== this.selectedEdgeId);
      this.selectedEdgeId = null;
      this.onSelectEdge(null);
      this.onChange();
      return true;
    }
    if (this.selectedId) {
      const id = this.selectedId;
      project.nodes = project.nodes.filter((n) => n.id !== id);
      project.edges = project.edges.filter((e) => e.from !== id && e.to !== id);
      this.selectedId = null;
      this.onSelect(null);
      this.onChange();
      return true;
    }
    return false;
  }

  render() {
    const project = this.getProject();
    this.canvasEl.querySelectorAll('.graph-node').forEach((n) => n.remove());
    for (const node of project.nodes) {
      const el = document.createElement('div');
      el.className = 'graph-node' + (node.id === this.selectedId ? ' selected' : '');
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      const def = NODE_DEFS.find((d) => d.type === node.type);
      el.innerHTML = `
        <div class="head"><span>${TYPE_TAG[node.type] || node.type}</span><span>${node.props.duration || ''}s</span></div>
        <div class="title">${escapeHtml(node.props.title || def?.label || node.id)}</div>
        <div class="ports">
          <div class="port in" data-port="in" title="输入"></div>
          <div class="port out" data-port="out" title="输出"></div>
        </div>
      `;
      el.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('port')) return;
        e.stopPropagation();
        // Right-click: select only, no drag
        if (e.button === 2) {
          this.select(node.id);
          return;
        }
        if (e.button !== 0) return;
        this.select(node.id);
        this.drag = { id: node.id, ox: e.clientX - node.x, oy: e.clientY - node.y };
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showNodeMenu(e.clientX, e.clientY, node.id);
      });
      el.querySelector('.port.out').addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        this.link = { from: node.id };
      });
      el.querySelector('.port.in').addEventListener('pointerup', (e) => {
        e.stopPropagation();
        this.finishLink(node.id);
      });
      this.canvasEl.appendChild(el);
    }
    this.drawEdges();
  }

  finishLink(toId) {
    if (!this.link || this.link.from === toId) {
      this.cancelLink();
      return;
    }
    const project = this.getProject();
    const fromNode = project.nodes.find((n) => n.id === this.link.from);
    const toNode = project.nodes.find((n) => n.id === toId);
    if (!fromNode || !toNode) {
      this.cancelLink();
      return;
    }
    let edge;
    if (fromNode.type === 'scene' && toNode.type === 'scene') {
      edge = createEdge(this.link.from, toId, 'sequence');
    } else if (toNode.type === 'scene') {
      edge = createEdge(this.link.from, toId, 'attach');
    } else if (fromNode.type === 'scene') {
      edge = createEdge(toId, this.link.from, 'attach');
    } else {
      edge = createEdge(this.link.from, toId, 'attach');
    }
    const dup = project.edges.some((e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind);
    if (!dup) project.edges.push(edge);
    this.cancelLink();
    this.onChange();
  }

  drawEdges() {
    const project = this.getProject();
    const g = this.svgEl.querySelector('#edgePaths');
    g.innerHTML = '';
    for (const edge of project.edges) {
      const a = project.nodes.find((n) => n.id === edge.from);
      const b = project.nodes.find((n) => n.id === edge.to);
      if (!a || !b) continue;
      const x1 = a.x + 156;
      const y1 = a.y + 40;
      const x2 = b.x;
      const y2 = b.y + 40;
      const mid = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.classList.add('hit');
      hit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button === 2) return;
        this.selectEdge(edge.id);
      });
      hit.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showEdgeMenu(e.clientX, e.clientY, edge.id);
      });

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('marker-end', edge.id === this.selectedEdgeId ? 'url(#arrowActive)' : 'url(#arrow)');
      if (edge.kind === 'attach') path.classList.add('attach');
      if (edge.id === this.selectedEdgeId) path.classList.add('selected');

      g.appendChild(hit);
      g.appendChild(path);
    }
  }

  onPointerMove(e) {
    if (this.panning) {
      const wrap = this.canvasEl.parentElement;
      wrap.scrollLeft = this.panning.sl - (e.clientX - this.panning.x);
      wrap.scrollTop = this.panning.st - (e.clientY - this.panning.y);
      return;
    }
    if (this.drag) {
      const project = this.getProject();
      const node = project.nodes.find((n) => n.id === this.drag.id);
      if (!node) return;
      node.x = Math.max(0, e.clientX - this.drag.ox);
      node.y = Math.max(0, e.clientY - this.drag.oy);
      const el = this.canvasEl.querySelector(`[data-id="${node.id}"]`);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
      this.drawEdges();
    }
    if (this.link) {
      const project = this.getProject();
      const a = project.nodes.find((n) => n.id === this.link.from);
      if (!a) return;
      const rect = this.canvasEl.getBoundingClientRect();
      const wrap = this.canvasEl.parentElement;
      const x1 = a.x + 156;
      const y1 = a.y + 40;
      const x2 = e.clientX - rect.left + wrap.scrollLeft;
      const y2 = e.clientY - rect.top + wrap.scrollTop;
      const mid = (x1 + x2) / 2;
      this.svgEl.querySelector('#tempEdge').setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
    }
  }

  onPointerUp() {
    if (this.panning) {
      this.panning = null;
      return;
    }
    if (this.drag) {
      this.drag = null;
      this.onChange();
    }
    // Do NOT cancel link here — wait for port.in pointerup or Esc
  }
}

function isTyping(el) {
  const tag = el?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ensureCtxMenu() {
  let el = document.getElementById('graphCtxMenu');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'graphCtxMenu';
  el.className = 'ctx-menu hidden';
  document.body.appendChild(el);
  return el;
}

function hideCtxMenu() {
  const el = document.getElementById('graphCtxMenu');
  if (el) {
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

function showCtxMenu(x, y, items) {
  const el = ensureCtxMenu();
  el.innerHTML = '';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = item.danger ? 'danger' : '';
    btn.textContent = item.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideCtxMenu();
      item.action?.();
    });
    el.appendChild(btn);
  }
  el.classList.remove('hidden');
  const pad = 8;
  const rect = { w: 140, h: items.length * 32 + 8 };
  let left = x;
  let top = y;
  if (left + rect.w > window.innerWidth - pad) left = window.innerWidth - rect.w - pad;
  if (top + rect.h > window.innerHeight - pad) top = window.innerHeight - rect.h - pad;
  el.style.left = `${Math.max(pad, left)}px`;
  el.style.top = `${Math.max(pad, top)}px`;
}
