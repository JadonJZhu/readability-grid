// Sample effects and backgrounds, drawn on canvases at runtime. No image files, no randomness.

// Colours are tuned so that Venom on Rust Wall is clear under normal vision and hard to see
// under protanopia and deuteranopia. That pair is the demo's central case.
const COLORS = {
  ember: { core: '#FFE08A', burst: '#FF7A1A' },
  venom: '#287814',
  frost: '#6FE3F5',
  violet: '#A24DF0',
  rust: { base: '#BE4623', dark: '#B04020', light: '#C84C28' },
  moss: { base: '#3F5A2E', dark: '#344D26', light: '#4A6836' },
  sand: { base: '#D2B98A', dark: '#C5AB7C', light: '#DEC79A' },
  night: { base: '#141C2E', dark: '#0D1422', light: '#1F2A42' },
};

function newCanvas(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  return canvas;
}

function circle(g, x, y, radius) {
  g.beginPath();
  g.arc(x, y, radius, 0, 2 * Math.PI);
  g.fill();
}

function ember(g) {
  g.fillStyle = COLORS.ember.burst;
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12;
    const radius = i % 2 ? 28 : 60;
    g.lineTo(64 + radius * Math.cos(angle), 64 + radius * Math.sin(angle));
  }
  g.fill();
  g.fillStyle = COLORS.ember.core;
  circle(g, 64, 64, 18);
}

function venom(g) {
  g.fillStyle = COLORS.venom;
  // Golden angle spiral: dots spread evenly like a spray, the same way on every load.
  for (let i = 0; i < 140; i++) {
    const angle = i * 2.39996;
    const distance = 5 * Math.sqrt(i);
    circle(g, 64 + distance * Math.cos(angle), 64 + distance * Math.sin(angle), 6 - i / 35);
  }
}

function strokeArc(g, color, lineWidth, y, radius, start, end) {
  g.strokeStyle = color;
  g.lineWidth = lineWidth;
  g.beginPath();
  g.arc(64, y, radius, start, end);
  g.stroke();
}

const frost = (g) => strokeArc(g, COLORS.frost, 16, 64, 48, 0, 2 * Math.PI);
const violet = (g) => strokeArc(g, COLORS.violet, 22, 84, 50, Math.PI, 2 * Math.PI);

// Every background is a base colour with a repeating pattern of darker and lighter panels.
const panels = ({ base, dark, light }, columns, rows) => (g) => {
  const [w, h] = [512 / columns, 288 / rows];
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 288);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const shade = (x * 3 + y * 5) % 4;
      if (shade === 0 || shade === 2) continue;
      g.fillStyle = shade === 1 ? dark : light;
      g.fillRect(x * w, y * h, w, h);
    }
  }
};

/** Returns the four sample effects and four sample backgrounds as { name, canvas }. */
export function drawSamples() {
  const effect = (name, draw) => ({ name, canvas: newCanvas(128, 128, draw) });
  const background = (name, draw) => ({ name, canvas: newCanvas(512, 288, draw) });
  return {
    effects: [effect('Ember', ember), effect('Venom', venom), effect('Frost', frost), effect('Violet', violet)],
    backgrounds: [
      background('Rust Wall', panels(COLORS.rust, 8, 4)),
      background('Moss Court', panels(COLORS.moss, 12, 7)),
      background('Sand Yard', panels(COLORS.sand, 16, 9)),
      background('Night Tile', panels(COLORS.night, 10, 6)),
    ],
  };
}
