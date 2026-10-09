/**
 * Export comic pages as PNG downloads and a minimal multi-page PDF (JPEG per page).
 */
import { paintAllComicPages, paintComicPage } from './comic-composer.js';
import { orderedComicPages, panelsForPage, shotForPanel } from './comic-director.js';

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      type,
      quality,
    );
  });
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** List pages/panels that are missing code or marked error. */
export function collectComicExportFailures(project) {
  const failed = [];
  for (const page of orderedComicPages(project)) {
    const panels = [];
    for (const panel of panelsForPage(project, page.id)) {
      const shot = shotForPanel(project, panel.id);
      if (
        !shot ||
        shot.props.genStatus === 'error' ||
        !shot.props.js ||
        !String(shot.props.js).includes('draw')
      ) {
        panels.push(panel.props.title || panel.id);
      }
    }
    if (panels.length) failed.push({ pageTitle: page.props.title || page.id, panels });
  }
  return { failed, ok: failed.length === 0 };
}

function assertExportable(project, onlyPageId) {
  if (onlyPageId) {
    const page = project.nodes.find((n) => n.id === onlyPageId && n.type === 'comic_page');
    if (!page) throw new Error('页面不存在');
    const panels = [];
    for (const panel of panelsForPage(project, onlyPageId)) {
      const shot = shotForPanel(project, panel.id);
      if (
        !shot ||
        shot.props.genStatus === 'error' ||
        !shot.props.js ||
        !String(shot.props.js).includes('draw')
      ) {
        panels.push(panel.props.title || panel.id);
      }
    }
    if (panels.length) {
      throw new Error(`当前页存在未完成格子：${panels.join(', ')}`);
    }
    return;
  }
  const gate = collectComicExportFailures(project);
  if (!gate.ok) {
    const msg = gate.failed.map((f) => `${f.pageTitle}: ${f.panels.join(', ')}`).join('；');
    throw new Error('存在未完成或失败的格子，已阻止导出：' + msg);
  }
}

export async function exportComicPngs(project, { basename = 'comic', onlyPageId = null } = {}) {
  assertExportable(project, onlyPageId);
  const pages = onlyPageId
    ? [paintComicPage(project, onlyPageId)]
    : paintAllComicPages(project);

  const blobs = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await canvasToBlob(pages[i].canvas, 'image/png');
    const name = `${basename}-p${String(i + 1).padStart(2, '0')}.png`;
    downloadBlob(blob, name);
    blobs.push({ name, blob });
  }
  return blobs;
}

async function canvasToJpegBytes(canvas, quality = 0.92) {
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  return new Uint8Array(await blob.arrayBuffer());
}

function concatBytes(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Minimal PDF: one page per comic page, full-bleed JPEG. */
export async function exportComicPdf(project, { basename = 'comic', onlyPageId = null } = {}) {
  assertExportable(project, onlyPageId);
  const painted = onlyPageId
    ? [paintComicPage(project, onlyPageId)]
    : paintAllComicPages(project);

  const images = [];
  for (const p of painted) {
    images.push({
      w: p.canvas.width,
      h: p.canvas.height,
      jpeg: await canvasToJpegBytes(p.canvas),
    });
  }

  const enc = new TextEncoder();
  const parts = [];
  const objOffsets = [];
  let size = 0;
  const write = (data) => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(b);
    size += b.length;
  };
  const startObj = (num) => {
    objOffsets[num] = size;
    write(`${num} 0 obj\n`);
  };
  const endObj = () => write('endobj\n');

  write('%PDF-1.4\n');

  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const imageIds = [];
  const contentIds = [];
  const pageIds = [];
  for (let i = 0; i < images.length; i++) {
    imageIds.push(nextId++);
    contentIds.push(nextId++);
    pageIds.push(nextId++);
  }

  startObj(catalogId);
  write(`<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`);
  endObj();

  startObj(pagesId);
  write(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\n`,
  );
  endObj();

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const w = img.w;
    const h = img.h;

    startObj(imageIds[i]);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`,
    );
    write(img.jpeg);
    write('\nendstream\n');
    endObj();

    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im${i} Do\nQ\n`;
    const contentBytes = enc.encode(content);
    startObj(contentIds[i]);
    write(`<< /Length ${contentBytes.length} >>\nstream\n`);
    write(contentBytes);
    write('\nendstream\n');
    endObj();

    startObj(pageIds[i]);
    write(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentIds[i]} 0 R /Resources << /XObject << /Im${i} ${imageIds[i]} 0 R >> >> >>\n`,
    );
    endObj();
  }

  const xrefPos = size;
  write(`xref\n0 ${nextId}\n`);
  write('0000000000 65535 f \n');
  for (let i = 1; i < nextId; i++) {
    write(`${String(objOffsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const blob = new Blob([concatBytes(parts)], { type: 'application/pdf' });
  downloadBlob(blob, `${basename}.pdf`);
  return blob;
}
