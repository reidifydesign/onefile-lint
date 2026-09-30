// CSS colour parsing and WCAG 2 contrast. Returns null for anything it cannot read exactly
// (gradients, color-mix, lab, currentcolor, var() without a value). It never guesses.

const NAMED = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00',
  gray: '808080', grey: '808080', silver: 'c0c0c0', maroon: '800000', purple: '800080', fuchsia: 'ff00ff',
  magenta: 'ff00ff', lime: '00ff00', olive: '808000', navy: '000080', teal: '008080', aqua: '00ffff',
  cyan: '00ffff', orange: 'ffa500', pink: 'ffc0cb', brown: 'a52a2a', gold: 'ffd700', indigo: '4b0082',
  violet: 'ee82ee', coral: 'ff7f50', crimson: 'dc143c', darkgray: 'a9a9a9', darkgrey: 'a9a9a9',
  dimgray: '696969', dimgrey: '696969', lightgray: 'd3d3d3', lightgrey: 'd3d3d3', whitesmoke: 'f5f5f5',
  gainsboro: 'dcdcdc', darkblue: '00008b', darkred: '8b0000', darkgreen: '006400', lightblue: 'add8e6',
  lightgreen: '90ee90', lightyellow: 'ffffe0', tomato: 'ff6347', salmon: 'fa8072', khaki: 'f0e68c',
  beige: 'f5f5dc', ivory: 'fffff0', lavender: 'e6e6fa', orchid: 'da70d6', plum: 'dda0dd', tan: 'd2b48c',
  turquoise: '40e0d0', skyblue: '87ceeb', steelblue: '4682b4', slategray: '708090', slategrey: '708090',
  royalblue: '4169e1', dodgerblue: '1e90ff', firebrick: 'b22222', forestgreen: '228b22', seagreen: '2e8b57',
  darkorange: 'ff8c00', hotpink: 'ff69b4', deeppink: 'ff1493', midnightblue: '191970', darkslategray: '2f4f4f',
  darkslategrey: '2f4f4f', snow: 'fffafa', aliceblue: 'f0f8ff', ghostwhite: 'f8f8ff', honeydew: 'f0fff0',
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function num(tok, pctScale) {
  tok = tok.trim();
  if (tok === 'none') return 0;
  if (tok.endsWith('%')) return (parseFloat(tok) / 100) * pctScale;
  const v = parseFloat(tok);
  return Number.isFinite(v) ? v : NaN;
}

function angle(tok) {
  tok = tok.trim();
  if (tok === 'none') return 0;
  let v = parseFloat(tok);
  if (!Number.isFinite(v)) return NaN;
  if (/turn$/i.test(tok)) v *= 360;
  else if (/rad$/i.test(tok)) v = (v * 180) / Math.PI;
  else if (/grad$/i.test(tok)) v = v * 0.9;
  return ((v % 360) + 360) % 360;
}

function hslToRgb(h, s, l) {
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    c = clamp(c, 0, 1);
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return g * 255;
  });
}

function splitArgs(inner) {
  // "r g b / a" or "r, g, b, a"
  const slash = inner.split('/');
  const main = slash[0].trim();
  const parts = main.includes(',') ? main.split(',') : main.split(/\s+/);
  const alpha = slash[1] !== undefined ? slash[1].trim() : parts.length > 3 ? parts[3] : null;
  return { parts: parts.slice(0, 3).map((p) => p.trim()), alpha };
}

export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[s]) return hex(NAMED[s]);
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return hex(h);
  }
  m = /^(rgba?|hsla?|oklab|oklch)\(\s*([^)]*)\)$/.exec(s);
  if (!m || /var\(|calc\(|from\b/.test(m[2])) return null;
  const fn = m[1];
  const { parts, alpha } = splitArgs(m[2]);
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  const a = alpha === null ? 1 : clamp(num(alpha, 1), 0, 1);
  if (!Number.isFinite(a)) return null;
  let rgb;
  if (fn.startsWith('rgb')) rgb = parts.map((p) => num(p, 255));
  else if (fn.startsWith('hsl')) {
    const h = angle(parts[0]);
    rgb = hslToRgb(h, num(parts[1], 1) / (parts[1].endsWith('%') ? 1 : 100), num(parts[2], 1) / (parts[2].endsWith('%') ? 1 : 100));
  } else if (fn === 'oklab') {
    rgb = oklabToSrgb(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4));
  } else {
    const L = num(parts[0], 1);
    const C = num(parts[1], 0.4);
    const h = (angle(parts[2]) * Math.PI) / 180;
    rgb = oklabToSrgb(L, C * Math.cos(h), C * Math.sin(h));
  }
  if (rgb.some((v) => !Number.isFinite(v))) return null;
  return { r: clamp(rgb[0], 0, 255), g: clamp(rgb[1], 0, 255), b: clamp(rgb[2], 0, 255), a };
}

function hex(h) {
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

export function luminance({ r, g, b }) {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(c1, c2) {
  const a = luminance(c1);
  const b = luminance(c2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
