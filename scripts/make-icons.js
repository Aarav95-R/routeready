/**
 * The app icon and everything derived from it.
 *
 *   node scripts/make-icons.js            writes the shipping assets
 *   node scripts/make-icons.js --variants writes all four to a scratch folder
 *
 * Plain JS rather than tsx because it runs at design time, not in the app, and
 * pngjs is the only image library the tree carries.
 *
 * Shapes are signed distance fields rather than SVG paths, so a pixel's
 * coverage is an exact analytic clamp(0.5 - d) rather than a supersample.
 * That matters at 48px, where the favicon's stroke is four pixels wide and a
 * jagged edge would be half of it.
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

// The app's palette, unchanged from src/ui/theme.ts.
const GROUND = "#F5F0E8";
const INK = "#1C1917";
const LEAF = "#1A875E";
const CLAY = "#B8624A";

/** Which mark ships. Changing this line changes every asset below. */
const VARIANT = "a-stone";

const ASSETS = path.join(__dirname, "..", "assets", "images");

const rgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// ── Distance functions ────────────────────────────────────────────────────

/** Rounded rectangle. Negative inside, positive outside, in pixels. */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
    + Math.min(Math.max(qx, qy), 0) - r;
}

const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

/** The outline of a shape: its distance, folded about zero. */
const outline = (d, w) => Math.abs(d) - w / 2;

/**
 * Rounded isoceles triangle pointing up.
 *
 * The intersection of three half-planes, inflated by r, which rounds all three
 * corners for free. The outward normals are (2h, -w) and (-2h, -w); getting
 * the sign of the second component wrong inverts both planes and fills the
 * complement of the triangle, which is exactly as obvious as it sounds once
 * you have looked at the render.
 */
function sdTriangle(px, py, cx, cy, halfW, halfH, r) {
  const x = px - cx, y = py - cy;
  const nx = halfH * 2, ny = halfW;
  const len = Math.hypot(nx, ny);
  return Math.max(
    y - halfH,
    (nx * x - ny * (y + halfH)) / len,
    (-nx * x - ny * (y + halfH)) / len,
  ) - r;
}

// ── Canvas ────────────────────────────────────────────────────────────────

/** `ground` null leaves the canvas transparent, for the Android and splash marks. */
function canvas(size, ground) {
  const px = new Float64Array(size * size * 4);
  if (ground) {
    const g = rgb(ground);
    for (let i = 0; i < size * size; i++) {
      // A barely-there vertical lift, 3%, so the ground is not dead flat under
      // the iOS corner mask. Any more and it reads as a 2013 gradient.
      const lift = 1 + 0.03 * (1 - Math.floor(i / size) / size);
      px[i * 4] = Math.min(255, g[0] * lift);
      px[i * 4 + 1] = Math.min(255, g[1] * lift);
      px[i * 4 + 2] = Math.min(255, g[2] * lift);
      px[i * 4 + 3] = 255;
    }
  }
  return { px, size };
}

/** Composite one distance function over the canvas, source-over. */
function paint(c, colour, sdf) {
  const col = rgb(colour);
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const a = Math.max(0, Math.min(1, 0.5 - sdf(x + 0.5, y + 0.5)));
      if (a <= 0) continue;
      const i = (y * c.size + x) * 4;
      const dst = c.px[i + 3] / 255;
      const out = a + dst * (1 - a);
      for (let k = 0; k < 3; k++) {
        c.px[i + k] = (col[k] * a + c.px[i + k] * dst * (1 - a)) / out;
      }
      c.px[i + 3] = out * 255;
    }
  }
}

function write(c, file, opaque) {
  const png = new PNG({ width: c.size, height: c.size });
  for (let i = 0; i < c.size * c.size * 4; i++) png.data[i] = Math.round(c.px[i]);
  // colorType 2 is RGB with no alpha channel at all. App Store upload rejects
  // an icon that has one, even when every pixel in it is fully opaque.
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: opaque ? 2 : 6 }));
  console.log(`  ${path.basename(file).padEnd(22)} ${c.size}x${c.size}  ${fs.statSync(file).size} bytes`);
}

// ── The mark ──────────────────────────────────────────────────────────────

/**
 * A practice loop with you on it.
 *
 * A circuit rather than a circle: a plain ring is every other icon on the home
 * screen, and the route the app hands you comes back to where it started. The
 * dot is clay because that is what the live-navigation puck is — green is the
 * road, clay is you.
 *
 * The halo is not decoration. Clay on leaf is two mid-tones meeting, and
 * without a ground-coloured gap between them the dot muddies into the ring at
 * home-screen size.
 *
 * `scale` is a fraction of the canvas, so every size below is one drawing.
 */
function loop(c, colours, scale) {
  const S = c.size;
  const u = (n) => (n / 1024) * S * scale;
  const cx = S / 2;
  const cy = S / 2 - u(26);
  const hw = u(296);

  paint(c, colours.ring, (x, y) =>
    outline(sdRoundRect(x, y, cx, cy, hw, hw, u(132)), u(98)));
  paint(c, colours.halo, (x, y) => sdCircle(x, y, cx, cy + hw, u(104)));
  paint(c, colours.dot, (x, y) => sdCircle(x, y, cx, cy + hw, u(76)));
}

const VARIANTS = {
  // Metaphor-true: the route is green, exactly as it is on the practice screen.
  "a-stone": { ground: GROUND, ring: LEAF, dot: CLAY, halo: GROUND },
  // The same mark on ink. Holds its own against a pale wallpaper.
  "b-ink": { ground: INK, ring: LEAF, dot: CLAY, halo: INK },
  // Green-dominant, but it inverts the metaphor: here the road is cream.
  "c-leaf": { ground: LEAF, ring: GROUND, dot: CLAY, halo: LEAF },
};

/** The navigation puck. Kept honest: at icon size this is a triangle. */
function puck(c) {
  const S = c.size, u = (n) => (n / 1024) * S;
  paint(c, GROUND, (x, y) => sdTriangle(x, y, S / 2, S / 2 + u(30), u(268), u(250), u(40)));
  paint(c, CLAY, (x, y) => sdTriangle(x, y, S / 2, S / 2 + u(22), u(214), u(200), u(34)));
}

// ── Outputs ───────────────────────────────────────────────────────────────

if (process.argv.includes("--variants")) {
  const out = process.argv[process.argv.indexOf("--variants") + 1] || ".";
  console.log("variants:");
  for (const [name, v] of Object.entries(VARIANTS)) {
    const c = canvas(1024, v.ground);
    loop(c, v, 1);
    write(c, path.join(out, `icon-${name}.png`), true);
  }
  const d = canvas(1024, LEAF);
  puck(d);
  write(d, path.join(out, "icon-d-puck.png"), true);
} else {
  const v = VARIANTS[VARIANT];
  console.log(`shipping assets, variant ${VARIANT}:`);

  // iOS and the store listing. Full bleed, opaque, no alpha channel.
  const icon = canvas(1024, v.ground);
  loop(icon, v, 1);
  write(icon, path.join(ASSETS, "icon.png"), true);

  // Android adaptive foreground. The launcher masks to a circle and can scale
  // up by 1.5x, so anything outside the central 66% is liable to be cropped;
  // the mark is drawn at 60% and the ground colour moves to app.config.js.
  // The halo stays painted rather than left transparent: it is what keeps the
  // clay dot off the ring, and a hole there would show the launcher's own
  // background through the middle of the mark.
  const adaptive = canvas(1024, null);
  loop(adaptive, v, 0.6);
  write(adaptive, path.join(ASSETS, "adaptive-icon.png"), false);

  // The splash mark. expo-splash-screen scales this to imageWidth, so it wants
  // to fill its canvas rather than carry its own margin.
  const splash = canvas(1024, null);
  loop(splash, v, 0.92);
  write(splash, path.join(ASSETS, "splash-icon.png"), false);

  // Web. Rendered at 48 rather than downsampled, so the stroke stays crisp.
  const favicon = canvas(48, v.ground);
  loop(favicon, v, 1);
  write(favicon, path.join(ASSETS, "favicon.png"), true);
}
