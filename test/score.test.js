import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VISIONS } from '../src/color.js';
import { prepareBackground, prepareEffect, renderPlacement, resize, scoreCell, summarize, toCsv, verdict } from '../src/score.js';

function solid(width, height, r, g, b, a = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, a], i);
  return { width, height, data };
}

const visions = Object.keys(VISIONS);
const black = prepareBackground(solid(64, 36, 0, 0, 0));

test('a solid effect on the same solid background scores 0 under all visions', () => {
  const effect = prepareEffect(solid(16, 16, 120, 80, 200));
  const background = prepareBackground(solid(64, 36, 120, 80, 200));
  for (const vision of visions) assert.equal(scoreCell(effect, background, vision, 15).score, 0);
});

test('a white effect on a black background scores 100 under all visions', () => {
  const effect = prepareEffect(solid(16, 16, 255, 255, 255));
  for (const vision of visions) assert.equal(scoreCell(effect, black, vision, 15).score, 1);
});

test('an effect with no pixels at alpha 0.5 or more scores 0 with a note', () => {
  const effect = prepareEffect(solid(16, 16, 255, 255, 255, 100));
  const result = scoreCell(effect, black, 'Normal', 15);
  assert.equal(result.score, 0);
  assert.equal(result.note, 'no visible pixels');
});

test('the cell score is the lowest of the five placements', () => {
  // Left half white, right half black. A white effect at a left quarter point is invisible.
  const image = solid(512, 288, 0, 0, 0);
  for (let i = 0; i < image.data.length; i += 4) {
    if ((i / 4) % 512 < 256) image.data.set([255, 255, 255, 255], i);
  }
  const effect = prepareEffect(solid(64, 64, 255, 255, 255));
  const result = scoreCell(effect, prepareBackground(image), 'Normal', 15);
  assert.equal(result.score, 0);
  assert.equal(result.placement[0], 0.25);
});

test('an effect taller than the background is cut off, not read out of bounds', () => {
  const effect = prepareEffect(solid(128, 128, 255, 255, 255));
  const background = prepareBackground(solid(512, 40, 0, 0, 0));
  assert.equal(scoreCell(effect, background, 'Normal', 15).score, 1);
});

test('sizes: effect longest side at most 128, background 512 wide', () => {
  const effect = prepareEffect(solid(400, 200, 255, 0, 0));
  assert.deepEqual([effect.width, effect.height], [128, 64]);
  const small = prepareEffect(solid(20, 10, 255, 0, 0));
  assert.deepEqual([small.width, small.height], [20, 10]);
  const background = prepareBackground(solid(1024, 512, 0, 0, 0));
  assert.deepEqual([background.width, background.height], [512, 256]);
  assert.equal(resize(solid(4, 4, 9, 8, 7), 2, 2).data[0], 9);
});

test('verdict boundaries', () => {
  assert.equal(verdict(0.7), 'pass');
  assert.equal(verdict(0.6999), 'warn');
  assert.equal(verdict(0.4), 'warn');
  assert.equal(verdict(0.3999), 'fail');
});

test('T changes the result', () => {
  const effect = prepareEffect(solid(16, 16, 60, 60, 60));
  const background = prepareBackground(solid(64, 36, 40, 40, 40));
  assert.equal(scoreCell(effect, background, 'Normal', 5).score, 1);
  assert.equal(scoreCell(effect, background, 'Normal', 40).score, 0);
});

test('renderPlacement draws the effect on the background', () => {
  const effect = prepareEffect(solid(16, 16, 255, 255, 255));
  const { width, data } = renderPlacement(effect, black, [0.5, 0.5], 'Normal');
  const centre = (144 * width + 256) * 4;
  assert.deepEqual([...data.slice(centre, centre + 4)], [255, 255, 255, 255]);
  assert.deepEqual([...data.slice(0, 4)], [0, 0, 0, 255]);
});

const row = (vision, v) => ({ effect: 'A', background: 'B', vision, score: 0.1, verdict: v });

test('summary line', () => {
  assert.equal(summarize([]), 'Add at least one effect and one background.');
  assert.equal(summarize([row('Normal', 'pass')]), '0 of 1 checks fail.');
  assert.equal(summarize([row('Deuteranopia', 'fail'), row('Normal', 'pass')]), '1 of 2 checks fail. It fails only under deuteranopia.');
  assert.equal(summarize([row('Deuteranopia', 'fail'), row('Deuteranopia', 'fail')]), '2 of 2 checks fail. All 2 fail only under deuteranopia.');
  assert.equal(summarize([row('Normal', 'fail'), row('Deuteranopia', 'fail')]), '2 of 2 checks fail.');
});

test('CSV has the right columns and quotes names that need it', () => {
  const csv = toCsv([{ ...row('Normal', 'fail'), effect: 'a,"b".png' }]);
  assert.equal(csv, 'effect,background,vision,score,verdict\n"a,""b"".png",B,Normal,0.1000,fail\n');
});
