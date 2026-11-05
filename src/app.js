// Page code: everything that touches the DOM. The maths lives in color.js and score.js.

import { VISIONS } from './color.js';
import { drawSamples } from './samples.js';
import { prepareBackground, prepareEffect, renderPlacement, scoreCell, summarize, toCsv, verdict } from './score.js';

const MAX_ITEMS = 12;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SYMBOLS = { pass: '✓', warn: '!', fail: '✕' };
const PREPARE = { effects: prepareEffect, backgrounds: prepareBackground };

const $ = (id) => document.getElementById(id);
const create = (tag, properties) => Object.assign(document.createElement(tag), properties);
// Rounds down, so a score just under a threshold never displays as the threshold.
const percent = (score) => `${Math.floor(score * 100)}%`;

// items: { name, sample, prepared }
const items = { effects: [], backgrounds: [] };
let results = [];
let currentRun = 0;

/** Reads a canvas into the plain image format score.js works with. */
function readCanvas(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height);
  return { width, height, data };
}

async function readFile(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = create('canvas', { width: bitmap.width, height: bitmap.height });
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return readCanvas(canvas);
}

async function addFiles(kind, files) {
  const refused = [];
  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      refused.push(`${file.name} (not PNG, JPG or WebP)`);
    } else if (items[kind].length >= MAX_ITEMS) {
      refused.push(`${file.name} (limit is ${MAX_ITEMS} ${kind})`);
    } else {
      try {
        items[kind].push({ name: file.name, sample: false, prepared: PREPARE[kind](await readFile(file)) });
      } catch {
        refused.push(`${file.name} (could not be read)`);
      }
    }
  }
  $('message').textContent = refused.length ? `Refused: ${refused.join(', ')}.` : '';
  computeGrids();
}

/** Builds the four empty tables and returns one entry per check, in the order to compute them. */
function buildGrids() {
  const checks = [];
  $('grids').replaceChildren();
  for (const vision of Object.keys(VISIONS)) {
    const section = create('section');
    const table = create('table');
    table.style.setProperty('--columns', items.effects.length);
    const headRow = table.insertRow();
    const header = (name) => create('th', { textContent: name, title: name });
    headRow.append(header(''), ...items.effects.map((effect) => header(effect.name)));
    for (const background of items.backgrounds) {
      const row = table.insertRow();
      row.append(header(background.name));
      for (const effect of items.effects) {
        const cell = create('button', { className: 'cell', disabled: true });
        Object.assign(cell.dataset, { effect: effect.name, background: background.name, vision });
        row.insertCell().append(cell);
        checks.push({ effect, background, vision, cell });
      }
    }
    section.append(create('h2', { textContent: vision }), table);
    $('grids').append(section);
  }
  return checks;
}

/** Scores one check per timeout so the page stays responsive. A newer run cancels this one. */
function computeGrids() {
  const run = ++currentRun;
  results = [];
  $('detail').hidden = true;
  $('csv').disabled = true;
  const checks = buildGrids();
  const T = Number($('threshold').value);
  let next = 0;
  function step() {
    if (run !== currentRun) return;
    if (next === checks.length) {
      $('summary').textContent = summarize(results);
      $('csv').disabled = false;
      return;
    }
    const check = checks[next++];
    const scored = scoreCell(check.effect.prepared, check.background.prepared, check.vision, T);
    const names = { effect: check.effect.name, background: check.background.name, vision: check.vision };
    const result = { ...names, ...scored, verdict: verdict(scored.score) };
    results.push(result);
    check.cell.disabled = false;
    check.cell.dataset.verdict = result.verdict;
    check.cell.textContent = `${SYMBOLS[result.verdict]} ${percent(result.score)}`;
    check.cell.title = result.note ?? '';
    check.cell.onclick = () => openDetail(check, result);
    $('summary').textContent = `Computing: ${next} of ${checks.length} checks done.`;
    setTimeout(step);
  }
  step();
}

function drawImage(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
}

function openDetail({ effect, background }, result) {
  const render = (vision) => renderPlacement(effect.prepared, background.prepared, result.placement, vision);
  drawImage($('detail-normal'), render('Normal'));
  drawImage($('detail-vision'), render(result.vision));
  $('detail-vision-label').textContent = result.vision;
  const [x, y] = result.placement;
  const score = `${SYMBOLS[result.verdict]} ${percent(result.score)} ${result.verdict}`;
  const where = result.note ?? `Worst of five placements: centred at x ${x}, y ${y}`;
  $('detail-title').textContent = `${result.effect} on ${result.background} under ${result.vision}: ${score}. ${where}.`;
  $('detail').hidden = false;
}

function downloadCsv() {
  const href = URL.createObjectURL(new Blob([toCsv(results)], { type: 'text/csv' }));
  create('a', { href, download: 'readability-grid.csv' }).click();
  URL.revokeObjectURL(href);
}

function setUpDropZone(id, kind) {
  const zone = $(id);
  const picker = zone.querySelector('input');
  zone.addEventListener('dragover', (event) => event.preventDefault());
  zone.addEventListener('drop', (event) => { event.preventDefault(); addFiles(kind, [...event.dataTransfer.files]); });
  zone.querySelector('button').addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => { addFiles(kind, [...picker.files]); picker.value = ''; });
}

setUpDropZone('drop-effects', 'effects');
setUpDropZone('drop-backgrounds', 'backgrounds');
$('threshold').addEventListener('input', () => { $('threshold-value').textContent = $('threshold').value; });
$('threshold').addEventListener('change', computeGrids); // Fires on release, not while dragging.
$('csv').addEventListener('click', downloadCsv);
$('clear').addEventListener('click', () => {
  for (const kind of Object.keys(items)) items[kind] = items[kind].filter((item) => !item.sample);
  computeGrids();
});

const samples = drawSamples();
for (const kind of Object.keys(items)) {
  items[kind] = samples[kind].map(({ name, canvas }) => (
    { name, sample: true, prepared: PREPARE[kind](readCanvas(canvas)) }
  ));
}
computeGrids();
