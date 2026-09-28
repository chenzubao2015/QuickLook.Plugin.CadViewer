import { DxfViewer } from 'dxf-viewer';
import opentype from 'opentype.js';
import * as THREE from 'three';

const stage = document.getElementById('stage');
const loading = document.getElementById('loading');
const statusText = document.getElementById('status');
const errorBox = document.getElementById('error');
const errorText = document.getElementById('error-text');
const fitButton = document.getElementById('fit');

const params = new URLSearchParams(location.search);
const modelUrl = params.get('src');
const fileName = params.get('name') || 'drawing';
const kind = (params.get('kind') || 'dxf').toLowerCase();
const hostFontUrls = JSON.parse(params.get('fonts') || '[]');

let dxfViewer = null;
let svgPanner = null;
let ready = false;

function post(message) {
  if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(message);
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  post('error:' + message);
  loading.hidden = true;
  errorText.textContent = message;
  errorBox.hidden = false;
}

function setStatus(text) {
  statusText.textContent = text;
}

window.addEventListener('error', event => post('window-error:' + event.message));
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  post('unhandled-rejection:' + (reason && reason.message ? reason.message : String(reason)));
});

/* Fonts are fetched by dxf-viewer through opentype.parse() with no error tolerance, so every
 * candidate is validated here first and silently dropped when it cannot be parsed. The result is
 * cached because a single CJK font can be several megabytes. */
const FONT_CACHE_KEY = 'cadviewer.fonts.v1';

function readFontCache() {
  try {
    return JSON.parse(localStorage.getItem(FONT_CACHE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function writeFontCache(cache) {
  try {
    localStorage.setItem(FONT_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    /* Cache is an optimization only. */
  }
}

async function isUsableFont(url, cache) {
  if (cache[url] === true) return true;
  if (cache[url] === false) return false;
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    opentype.parse(await response.arrayBuffer());
    cache[url] = true;
    return true;
  } catch (e) {
    cache[url] = false;
    return false;
  }
}

async function buildFontList() {
  const cache = readFontCache();
  const usable = [];
  // The host supplies fonts that already exist on this machine, in the order they should be
  // consulted, so nothing has to be bundled or redistributed with the plugin.
  for (const url of hostFontUrls) {
    if (await isUsableFont(url, cache)) usable.push(url);
  }
  writeFontCache(cache);
  return usable;
}

/* ------------------------------------------------------------------ DXF via dxf-viewer */

async function showDxf(fonts) {
  setStatus('正在解析 DXF 图纸…');
  dxfViewer = new DxfViewer(stage, {
    autoResize: true,
    antialias: true,
    clearColor: new THREE.Color(0xffffff),
    colorCorrection: true,
    blackWhiteInversion: true
  });

  dxfViewer.Subscribe('message', event => post('viewer:' + event.level + ':' + event.message));

  await dxfViewer.Load({
    url: modelUrl,
    fonts,
    progressCbk: (phase, processed, total) => {
      if (phase === 'fetch' && total) {
        setStatus('正在读取图纸… ' + Math.round(processed / total * 100) + '%');
      } else if (phase === 'parse') {
        setStatus('正在解析 DXF 图纸…');
      } else if (phase === 'prepare') {
        setStatus('正在生成图形…');
      }
    }
  });

  const bounds = dxfViewer.GetBounds();
  if (!bounds) throw new Error('图纸中没有可显示的图形。');
  return {
    fit: () => {
      const origin = dxfViewer.GetOrigin();
      dxfViewer.FitView(
        bounds.minX - origin.x, bounds.maxX - origin.x,
        bounds.minY - origin.y, bounds.maxY - origin.y);
    },
    state: () => {
      const camera = dxfViewer.GetCamera();
      return {
        mode: 'dxf',
        left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom,
        // An orthographic zoom changes camera.zoom instead of the frustum edges.
        zoom: camera.zoom,
        position: camera.position.toArray(),
        layers: [...dxfViewer.GetLayers(true)].length
      };
    }
  };
}

/* ------------------------------------------------------------------ DWG via libredwg (WASM) */

/* The DWG to SVG converter throws on ACAD_TABLE entities, which aborts the whole preview. Such
 * entities are dropped before conversion; everything else is rendered by the converter. */
const UNSUPPORTED_ENTITIES = new Set(['ACAD_TABLE']);

function dropUnsupportedEntities(database) {
  const keep = list => (list || []).filter(entity => !UNSUPPORTED_ENTITIES.has(String(entity.type)));
  database.entities = keep(database.entities);
  const records = database.tables && database.tables.BLOCK_RECORD;
  for (const record of (records && records.entries) || []) {
    if (record.entities) record.entities = keep(record.entities);
  }
}

function svgFromDwg(libredwg, fileType, bytes) {
  const pointer = libredwg.dwg_read_data(bytes, fileType.DWG);
  if (!pointer) throw new Error('无法读取此 DWG 文件，可能是不受支持的版本或已损坏。');
  try {
    const database = libredwg.convert(pointer);
    dropUnsupportedEntities(database);
    const svg = libredwg.dwg_to_svg(database);
    if (!svg) throw new Error('此 DWG 文件中没有可显示的图形。');
    return svg;
  } finally {
    try { libredwg.dwg_free(pointer); } catch (e) { /* Freed on unload as well. */ }
  }
}

function luminance(red, green, blue) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

/* libredwg writes the drawing's own colors, which are frequently white or yellow and therefore
 * invisible on the light preview background. Light colors are darkened while keeping their hue. */
function adaptSvgColors(root) {
  const pattern = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;
  for (const element of root.querySelectorAll('[stroke],[fill]')) {
    for (const attribute of ['stroke', 'fill']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const match = pattern.exec(value);
      if (!match) continue;
      const red = Number(match[1]), green = Number(match[2]), blue = Number(match[3]);
      if (luminance(red, green, blue) < 0.62) continue;
      const factor = 0.34;
      element.setAttribute(attribute, 'rgb(' +
        Math.round(red * factor) + ',' + Math.round(green * factor) + ',' + Math.round(blue * factor) + ')');
    }
  }
}

/* The DWG converter publishes percentage stroke widths, which a browser resolves in user space
 * and then multiplies by the element's own transform. A block instance scaled a few thousand
 * times therefore paints a hairline as a filled band across the whole view. Strokes are pinned
 * to a screen-space width instead. Attributes are used rather than a CSS rule because the value
 * has to reach the content cloned behind <use>, which document CSS does not restyle. */
function normalizeStrokes(svg) {
  const shapes = svg.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect');
  for (const shape of shapes) {
    shape.setAttribute('vector-effect', 'non-scaling-stroke');
    shape.setAttribute('stroke-width', '1px');
  }
}

function createSvgPanner(svg) {
  const initial = (svg.getAttribute('viewBox') || '0 0 1 1').trim().split(/[\s,]+/).map(Number);
  const home = { x: initial[0], y: initial[1], width: initial[2], height: initial[3] };
  const view = { ...home };
  let dragging = false;
  let lastX = 0, lastY = 0;

  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  const apply = () => svg.setAttribute('viewBox',
    view.x + ' ' + view.y + ' ' + view.width + ' ' + view.height);

  function scale() {
    const rect = stage.getBoundingClientRect();
    return Math.min(rect.width / view.width, rect.height / view.height);
  }

  function toDrawing(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const factor = scale();
    const offsetX = rect.left + (rect.width - view.width * factor) / 2;
    const offsetY = rect.top + (rect.height - view.height * factor) / 2;
    return {
      x: view.x + (clientX - offsetX) / factor,
      y: view.y + (clientY - offsetY) / factor
    };
  }

  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const anchor = toDrawing(event.clientX, event.clientY);
    const factor = Math.min(Math.max(Math.exp(event.deltaY * 0.0015), 0.2), 5);
    const width = view.width * factor;
    const height = view.height * factor;
    const ratioX = (anchor.x - view.x) / view.width;
    const ratioY = (anchor.y - view.y) / view.height;
    view.x = anchor.x - ratioX * width;
    view.y = anchor.y - ratioY * height;
    view.width = width;
    view.height = height;
    apply();
  }, { passive: false });

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.classList.add('panning');
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', event => {
    if (!dragging) return;
    const factor = scale();
    view.x -= (event.clientX - lastX) / factor;
    view.y -= (event.clientY - lastY) / factor;
    lastX = event.clientX;
    lastY = event.clientY;
    apply();
    post('input:pan');
  });

  const stop = event => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('panning');
    if (event.pointerId !== undefined && stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);

  apply();
  return {
    fit: () => {
      Object.assign(view, home);
      apply();
    },
    state: () => ({ mode: 'dwg', viewBox: [view.x, view.y, view.width, view.height] })
  };
}

async function showDwg() {
  setStatus('正在加载 DWG 解析器…');
  const libraryUrl = new URL('vendor/libredwg/dist/libredwg-web.js', document.baseURI).href;
  const module = await import(libraryUrl);
  const libredwg = await module.LibreDwg.create('vendor/libredwg/wasm');

  setStatus('正在读取图纸…');
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error('无法读取图纸文件（HTTP ' + response.status + '）。');
  const bytes = new Uint8Array(await response.arrayBuffer());

  setStatus('正在转换 DWG 图纸…');
  const svgText = svgFromDwg(libredwg, module.Dwg_File_Type, bytes);

  stage.innerHTML = svgText;
  const svg = stage.querySelector('svg');
  if (!svg) throw new Error('DWG 转换未生成可显示的内容。');
  adaptSvgColors(svg);
  normalizeStrokes(svg);
  return createSvgPanner(svg);
}

/* ------------------------------------------------------------------ bootstrap */

(async () => {
  try {
    if (!modelUrl) throw new Error('缺少图纸路径参数。');
    post('start:' + fileName);

    const fonts = kind === 'dxf' ? await buildFontList() : [];
    const renderer = kind === 'dxf' ? await showDxf(fonts) : await showDwg();

    fitButton.addEventListener('click', () => renderer.fit());
    ready = true;
    loading.hidden = true;
    renderer.fit();
    post('loaded:' + kind);

    window.getCadViewerState = () => ({ ready, filename: fileName, fonts, ...renderer.state() });
  } catch (error) {
    fail(error);
  }
})();
