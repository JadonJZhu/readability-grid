// One browser test against the real page. Run with: npm run smoke
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

process.env.PORT = '0';
const { server } = await import('../scripts/serve.mjs');
if (!server.listening) await once(server, 'listening');
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

const finished = () => page.waitForFunction(() => /checks fail/.test(document.getElementById('summary').textContent));
const cellOf = (effect, background, vision) => page.locator(
  `.cell[data-effect="${effect}"][data-background="${background}"][data-vision="${vision}"]`,
);

try {
  // Acceptance 6: time from starting navigation to the finished grid.
  const start = Date.now();
  await page.goto(url);
  await finished();
  const elapsed = Date.now() - start;
  console.log(`4x4 grid finished in ${elapsed} ms`);
  assert.ok(elapsed <= 3000, `grid took ${elapsed} ms`);

  // Acceptance 5: four grids of 16 cells.
  assert.equal(await page.locator('#grids table').count(), 4);
  for (const table of await page.locator('#grids table').all()) {
    assert.equal(await table.locator('.cell').count(), 16);
  }

  // Acceptance 3: the demo's central case.
  for (const vision of ['Normal', 'Protanopia', 'Deuteranopia', 'Tritanopia']) {
    const cell = cellOf('Venom', 'Rust Wall', vision);
    console.log(`Venom on Rust Wall, ${vision}: ${await cell.textContent()} ${await cell.getAttribute('data-verdict')}`);
  }
  assert.equal(await cellOf('Venom', 'Rust Wall', 'Normal').getAttribute('data-verdict'), 'pass');
  for (const vision of ['Protanopia', 'Deuteranopia']) {
    assert.match(await cellOf('Venom', 'Rust Wall', vision).getAttribute('data-verdict'), /fail|warn/);
  }
  console.log(`Summary: ${await page.locator('#summary').textContent()}`);

  // Acceptance 5: CSV downloads, with a header and one row per check.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
  const lines = readFileSync(await download.path(), 'utf8').trim().split('\n');
  assert.equal(lines[0], 'effect,background,vision,score,verdict');
  assert.equal(lines.length, 65);

  // The T slider rescores on release.
  const scoreBefore = await cellOf('Venom', 'Rust Wall', 'Normal').textContent();
  await page.locator('#threshold').evaluate((slider) => {
    slider.value = 40;
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
  });
  await finished();
  assert.notEqual(await cellOf('Venom', 'Rust Wall', 'Normal').textContent(), scoreBefore);
  await page.locator('#threshold').evaluate((slider) => {
    slider.value = 15;
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
  });
  await finished();

  // Dropping 9 more effects on top of the 4 samples: 8 fit, 1 is refused with a message.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const dataTransfer = new DataTransfer();
    for (let i = 0; i < 9; i++) dataTransfer.items.add(new File([blob], `drop${i}.png`, { type: 'image/png' }));
    document.getElementById('drop-effects').dispatchEvent(new DragEvent('drop', { dataTransfer, cancelable: true }));
  });
  await page.waitForFunction(() => document.getElementById('message').textContent.includes('drop8.png'));
  await finished();
  assert.equal(await page.locator('#grids table').first().locator('.cell').count(), 48);

  // Clear samples leaves only the dropped effects, and no backgrounds, so the grid is empty.
  await page.click('#clear');
  await page.waitForFunction(() => document.getElementById('summary').textContent.startsWith('Add at least'));
  assert.equal(await page.locator('.cell').count(), 0);

  // Back to a fresh page for the detail panel and the screenshot.
  await page.reload();
  await finished();
  await cellOf('Venom', 'Rust Wall', 'Deuteranopia').click();
  assert.equal(await page.locator('#detail').isVisible(), true);
  assert.match(await page.locator('#detail-title').textContent(), /Venom on Rust Wall under Deuteranopia/);
  console.log(`Detail: ${await page.locator('#detail-title').textContent()}`);
  await page.screenshot({ path: new URL('../docs/screenshot.png', import.meta.url).pathname });

  assert.deepEqual(errors, []);
  console.log('Smoke test passed. No console errors.');
} finally {
  await browser.close();
  server.close();
}
