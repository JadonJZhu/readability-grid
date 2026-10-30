import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VISIONS, deltaE2000, linearToLab, linearToSrgb, simulate, srgbToLinear } from '../src/color.js';

test('CIEDE2000 matches the Sharma et al. vectors to 4 decimals', () => {
  const vectors = [
    [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
    [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
    [50, 2.8361, -74.02, 50, 0, -82.7485, 3.4412],
    // Two more from the same table, because the three above never cross the hue wraparound.
    [50, 2.5, 0, 50, 0, -2.5, 4.3065],
    [50, 2.5, 0, 73, 25, -18, 27.1492],
  ];
  for (const [L1, a1, b1, L2, a2, b2, expected] of vectors) {
    assert.equal(deltaE2000(L1, a1, b1, L2, a2, b2).toFixed(4), expected.toFixed(4));
  }
});

test('Lab of sRGB white and red match the published values', () => {
  const [L, a, b] = linearToLab(1, 1, 1);
  assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
  const red = linearToLab(1, 0, 0);
  assert.ok(Math.abs(red[0] - 53.24) < 0.01 && Math.abs(red[1] - 80.09) < 0.01 && Math.abs(red[2] - 67.2) < 0.01);
});

test('sRGB to linear and back returns the same value', () => {
  for (const byte of [0, 1, 10, 128, 200, 255]) assert.equal(linearToSrgb(srgbToLinear(byte)), byte);
});

test('black, white and neutral grey stay neutral under each matrix', () => {
  for (const [name, matrix] of Object.entries(VISIONS)) {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const out = simulate(v, v, v, matrix);
      assert.ok(Math.max(...out) - Math.min(...out) <= 0.02, `${name} at ${v}: ${out}`);
    }
  }
});

test('simulation clamps results to 0..1', () => {
  for (const c of simulate(0, 1, 0, VISIONS.Protanopia)) assert.ok(c >= 0 && c <= 1);
  assert.equal(simulate(0, 0, 1, VISIONS.Protanopia)[0], 0);
});
