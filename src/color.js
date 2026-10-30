// Colour maths: sRGB to linear to CIE Lab, CIEDE2000, and colour blindness simulation.

// Machado et al. 2009, severity 1.0. Applied to linear RGB. Normal vision has no matrix.
export const VISIONS = {
  Normal: null,
  Protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  Deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  Tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Lookup table: every pixel goes through this, and there are only 256 possible inputs.
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

/** Converts an sRGB channel (0..255) to linear light (0..1). */
export const srgbToLinear = (byte) => LINEAR[byte];

/** Converts a linear channel (0..1) back to an sRGB value (0..255). */
export function linearToSrgb(v) {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(s) * 255);
}

/** Applies a vision matrix to a linear [r, g, b]. A null matrix (normal vision) changes nothing. */
export function simulate(r, g, b, matrix) {
  if (!matrix) return [r, g, b];
  const [m0, m1, m2] = matrix;
  return [
    clamp01(m0[0] * r + m0[1] * g + m0[2] * b),
    clamp01(m1[0] * r + m1[1] * g + m1[2] * b),
    clamp01(m2[0] * r + m2[1] * g + m2[2] * b),
  ];
}

const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);

/** Converts linear RGB to CIE Lab, D65 white. */
export function linearToLab(r, g, b) {
  const x = labF((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = labF(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = labF((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const RAD = Math.PI / 180;
// Chroma weight shared by two steps of the formula.
const chromaRatio = (c) => Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7));

const hueDegrees = (a, b) => {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / RAD;
  return h < 0 ? h + 360 : h;
};

/**
 * CIEDE2000 colour difference with kL = kC = kH = 1, following Sharma et al. 2005.
 * Takes six numbers instead of two arrays because it runs once per pixel.
 */
export function deltaE2000(L1, a1, b1, L2, a2, b2) {
  const G = 0.5 * (1 - chromaRatio((Math.sqrt(a1 * a1 + b1 * b1) + Math.sqrt(a2 * a2 + b2 * b2)) / 2));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.sqrt(a1p * a1p + b1 * b1);
  const C2 = Math.sqrt(a2p * a2p + b2 * b2);
  const h1 = hueDegrees(a1p, b1);
  const h2 = hueDegrees(a2p, b2);
  const neutral = C1 * C2 === 0;

  // Hue difference, going the short way round the circle.
  let dh = neutral ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = C2 - C1;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * RAD) / 2);

  // Mean hue, also the short way round.
  const sum = h1 + h2;
  let h = sum;
  if (!neutral) {
    if (Math.abs(h1 - h2) <= 180) h = sum / 2;
    else h = sum < 360 ? (sum + 360) / 2 : (sum - 360) / 2;
  }
  const L = (L1 + L2) / 2;
  const C = (C1 + C2) / 2;

  const T = 1 - 0.17 * Math.cos((h - 30) * RAD) + 0.24 * Math.cos(2 * h * RAD)
    + 0.32 * Math.cos((3 * h + 6) * RAD) - 0.2 * Math.cos((4 * h - 63) * RAD);
  const theta = 30 * Math.exp(-(((h - 275) / 25) ** 2));
  const RT = -2 * chromaRatio(C) * Math.sin(2 * theta * RAD);
  const L50 = (L - 50) ** 2;
  const lTerm = dL / (1 + (0.015 * L50) / Math.sqrt(20 + L50));
  const cTerm = dC / (1 + 0.045 * C);
  const hTerm = dH / (1 + 0.015 * C * T);
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + RT * cTerm * hTerm);
}
