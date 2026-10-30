// Scoring: pure functions on plain images, { width, height, data } with RGBA bytes.

import { VISIONS, deltaE2000, linearToLab, linearToSrgb, simulate, srgbToLinear } from './color.js';

const MAX_EFFECT_SIDE = 128;
const BACKGROUND_WIDTH = 512;
const PASS_FROM = 0.7;
const WARN_FROM = 0.4;
const PLACEMENTS = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

/** Nearest-neighbour resize. */
export function resize(image, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor((y * image.height) / height);
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x * image.width) / width);
      const from = (sy * image.width + sx) * 4;
      const to = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[to + c] = image.data[from + c];
    }
  }
  return { width, height, data };
}

/** Shrinks an effect to at most 128 px and converts its visible pixels to linear RGB. */
export function prepareEffect(image) {
  const scale = Math.min(1, MAX_EFFECT_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const { data } = resize(image, width, height);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = [srgbToLinear(data[i]), srgbToLinear(data[i + 1]), srgbToLinear(data[i + 2])];
    pixels.push({ x: (i / 4) % width, y: Math.floor(i / 4 / width), r, g, b, a: data[i + 3] / 255 });
  }
  return { width, height, pixels };
}

/** Resizes a background to 512 px wide and caches its linear RGB and its Lab values per vision. */
export function prepareBackground(image) {
  const width = BACKGROUND_WIDTH;
  const height = Math.max(1, Math.round((image.height * width) / image.width));
  const { data } = resize(image, width, height);
  const linear = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) linear[i * 3 + c] = srgbToLinear(data[i * 4 + c]);
  }
  const lab = {};
  for (const [vision, matrix] of Object.entries(VISIONS)) {
    lab[vision] = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const [r, g, b] = simulate(linear[i * 3], linear[i * 3 + 1], linear[i * 3 + 2], matrix);
      lab[vision].set(linearToLab(r, g, b), i * 3);
    }
  }
  return { width, height, linear, lab };
}

/** Top-left corner of the effect when its centre sits at a placement, clamped to stay inside. */
function offset(effect, background, [px, py]) {
  const clamp = (v, size, max) => Math.max(0, Math.min(Math.round(v - size / 2), max - size));
  return {
    x: clamp(px * background.width, effect.width, background.width),
    y: clamp(py * background.height, effect.height, background.height),
  };
}

/** Effect pixel p over the background's linear RGB at index i. Compositing is done in linear light. */
function composite(p, linear, i) {
  const q = 1 - p.a;
  return [p.a * p.r + q * linear[i], p.a * p.g + q * linear[i + 1], p.a * p.b + q * linear[i + 2]];
}

/** Share of the effect's pixels (alpha at least 0.5) that differ from the background by at least T. */
function scorePlacement(effect, background, placement, vision, T) {
  const bgLab = background.lab[vision];
  const { x: ox, y: oy } = offset(effect, background, placement);
  let total = 0;
  let different = 0;
  for (const p of effect.pixels) {
    const y = oy + p.y;
    if (p.a < 0.5 || y >= background.height) continue; // A very short background can cut an effect off.
    const i = (y * background.width + ox + p.x) * 3;
    const [r, g, b] = composite(p, background.linear, i);
    const [L, A, B] = linearToLab(...simulate(r, g, b, VISIONS[vision]));
    if (deltaE2000(L, A, B, bgLab[i], bgLab[i + 1], bgLab[i + 2]) >= T) different++;
    total++;
  }
  return total === 0 ? null : different / total;
}

/** Cell score: the lowest of the five placements, plus which placement that was. */
export function scoreCell(effect, background, vision, T) {
  let worst = { score: Infinity };
  for (const placement of PLACEMENTS) {
    const score = scorePlacement(effect, background, placement, vision, T);
    if (score === null) return { score: 0, placement: PLACEMENTS[0], note: 'no visible pixels' };
    if (score < worst.score) worst = { score, placement };
  }
  return worst;
}

export function verdict(score) {
  if (score >= PASS_FROM) return 'pass';
  return score >= WARN_FROM ? 'warn' : 'fail';
}

/** The effect composited on the background at a placement, as seen under one vision. */
export function renderPlacement(effect, background, placement, vision) {
  const { width, height, linear } = background;
  const pixels = Float32Array.from(linear);
  const { x: ox, y: oy } = offset(effect, background, placement);
  for (const p of effect.pixels) {
    if (oy + p.y >= height) continue;
    const i = ((oy + p.y) * width + ox + p.x) * 3;
    pixels.set(composite(p, linear, i), i);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const rgb = simulate(pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2], VISIONS[vision]);
    data.set([linearToSrgb(rgb[0]), linearToSrgb(rgb[1]), linearToSrgb(rgb[2]), 255], i * 4);
  }
  return { width, height, data };
}

/** Results are { effect, background, vision, score, verdict }, with names as strings. */
export function summarize(results) {
  if (results.length === 0) return 'Add at least one effect and one background.';
  const fails = results.filter((r) => r.verdict === 'fail');
  const line = `${fails.length} of ${results.length} checks fail.`;
  const visions = [...new Set(fails.map((r) => r.vision.toLowerCase()))];
  if (visions.length !== 1) return line;
  const who = fails.length === 1 ? 'It fails' : `All ${fails.length} fail`;
  return `${line} ${who} only under ${visions[0]}.`;
}

const csvField = (text) => (/[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

export function toCsv(results) {
  const rows = results.map((r) =>
    [csvField(r.effect), csvField(r.background), r.vision, r.score.toFixed(4), r.verdict].join(','));
  return ['effect,background,vision,score,verdict', ...rows].join('\n') + '\n';
}
