// Procedural canvas textures — everything is generated at load, no image files.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, renderer, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, w, h, rng, count, colors, sMin = 1, sMax = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    const s = sMin + rng() * (sMax - sMin);
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

function blotches(ctx, w, h, rng, count, rgb, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    const x = rng() * w, y = rng() * h, r = rMin + rng() * (rMax - rMin);
    const a = aMin + rng() * (aMax - aMin);
    // draw wrapped so the tile seams stay invisible
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

function cracks(ctx, w, h, rng, count, color, width) {
  ctx.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = width * (0.5 + rng());
    ctx.beginPath();
    let x = rng() * w, y = rng() * h, a = rng() * Math.PI * 2;
    ctx.moveTo(x, y);
    const n = 6 + Math.floor(rng() * 14);
    for (let j = 0; j < n; j++) {
      a += (rng() - 0.5) * 1.2;
      x += Math.cos(a) * (6 + rng() * 14);
      y += Math.sin(a) * (6 + rng() * 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function makeTextures(renderer) {
  const T = {};
  const rng = mulberry32(7);

  // ---- asphalt ----
  {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#4a4c4e'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, rng, 40, '20,22,24', 0.05, 0.16, 30, 110);
    blotches(g, 512, 512, rng, 20, '120,118,112', 0.03, 0.08, 20, 80);
    speckle(g, 512, 512, rng, 9000, ['#5b5d5f', '#3a3c3e', '#66655f', '#2f3133', '#727068'], 1, 2.2);
    cracks(g, 512, 512, rng, 7, 'rgba(18,18,20,0.55)', 1.2);
    // oil stains
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(rng() * 512, rng() * 512);
      g.scale(1, 0.6 + rng() * 0.4);
      const r = 18 + rng() * 26;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(12,12,14,0.45)'); gr.addColorStop(1, 'rgba(12,12,14,0)');
      g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
    T.asphalt = toTexture(c, renderer);
  }

  // ---- concrete (floors / walls) ----
  {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#9b978f'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, rng, 60, '70,66,60', 0.04, 0.12, 20, 90);
    blotches(g, 512, 512, rng, 30, '200,196,186', 0.04, 0.1, 20, 70);
    speckle(g, 512, 512, rng, 6000, ['#8a867e', '#aaa69d', '#7d7a73', '#b5b1a7'], 1, 2);
    // panel seams
    g.fillStyle = 'rgba(40,38,34,0.35)';
    g.fillRect(0, 0, 512, 2); g.fillRect(0, 256, 512, 2);
    g.fillRect(0, 0, 2, 512); g.fillRect(256, 0, 2, 512);
    // form-tie holes
    g.fillStyle = 'rgba(40,38,34,0.4)';
    for (const x of [64, 192, 320, 448]) for (const y of [64, 192, 320, 448]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    cracks(g, 512, 512, rng, 4, 'rgba(40,38,34,0.35)', 0.8);
    T.concrete = toTexture(c, renderer);
  }

  // ---- concrete wall with drip stains ----
  {
    const [c, g] = makeCanvas(256, 512);
    g.fillStyle = '#8e8a82'; g.fillRect(0, 0, 256, 512);
    blotches(g, 256, 512, rng, 30, '60,56,50', 0.05, 0.12, 20, 60);
    speckle(g, 256, 512, rng, 3000, ['#827e76', '#9d998f', '#76736c'], 1, 2);
    for (let i = 0; i < 26; i++) {
      const x = rng() * 256, len = 80 + rng() * 300, w = 2 + rng() * 8;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, 'rgba(40,36,30,0.28)'); gr.addColorStop(1, 'rgba(40,36,30,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
    g.fillStyle = 'rgba(30,28,24,0.4)'; g.fillRect(0, 0, 256, 3);
    T.wall = toTexture(c, renderer);
  }

  // ---- corrugated container steel (tinted by material colour) ----
  {
    const [c, g] = makeCanvas(256, 256);
    for (let x = 0; x < 256; x++) {
      const p = (x / 256) * 9 * Math.PI * 2;
      const s = 0.72 + 0.28 * Math.sin(p) + 0.06 * Math.sin(p * 2);
      const v = Math.floor(232 * s);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, 256);
    }
    // top and bottom rails (container height = texture height)
    g.fillStyle = 'rgba(30,30,30,0.55)'; g.fillRect(0, 0, 256, 9); g.fillRect(0, 247, 256, 9);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 9, 256, 2); g.fillRect(0, 245, 256, 2);
    // grime from the bottom
    const gr = g.createLinearGradient(0, 256, 0, 120);
    gr.addColorStop(0, 'rgba(40,30,20,0.45)'); gr.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = gr; g.fillRect(0, 120, 256, 136);
    blotches(g, 256, 256, rng, 26, '70,38,18', 0.15, 0.4, 3, 14);
    blotches(g, 256, 256, rng, 12, '30,24,20', 0.08, 0.2, 10, 40);
    // scratches
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const x = rng() * 256, y = rng() * 256, l = 5 + rng() * 30, a = (rng() - 0.5) * 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    T.corrugated = toTexture(c, renderer);
  }

  // ---- warehouse siding (horizontal ribs) ----
  {
    const [c, g] = makeCanvas(256, 256);
    for (let y = 0; y < 256; y++) {
      const p = (y / 256) * 8 * Math.PI * 2;
      const s = 0.8 + 0.2 * Math.sin(p);
      g.fillStyle = `rgb(${Math.floor(150 * s)},${Math.floor(162 * s)},${Math.floor(166 * s)})`;
      g.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 18; i++) {
      const x = rng() * 256, len = 60 + rng() * 200, w = 3 + rng() * 10;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, 'rgba(60,46,30,0.32)'); gr.addColorStop(1, 'rgba(60,46,30,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
    blotches(g, 256, 256, rng, 20, '40,40,40', 0.05, 0.12, 10, 40);
    g.fillStyle = 'rgba(20,24,26,0.5)'; g.fillRect(126, 0, 3, 256); g.fillRect(0, 0, 3, 256);
    T.siding = toTexture(c, renderer);
  }

  // ---- wooden crate (face-mapped) ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#9c7445'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = `rgb(${150 + Math.floor(rng() * 25)},${108 + Math.floor(rng() * 20)},${62 + Math.floor(rng() * 15)})`;
      g.fillRect(0, y + 1, 256, 30);
      g.strokeStyle = 'rgba(70,45,20,0.35)';
      for (let k = 0; k < 6; k++) {
        g.lineWidth = 0.6 + rng();
        g.beginPath();
        const yy = y + 4 + rng() * 24;
        g.moveTo(0, yy);
        for (let x = 0; x <= 256; x += 32) g.lineTo(x, yy + (rng() - 0.5) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(50,30,12,0.7)'; g.fillRect(0, y, 256, 2);
    }
    // frame
    g.fillStyle = '#7b5530';
    g.fillRect(0, 0, 256, 24); g.fillRect(0, 232, 256, 24); g.fillRect(0, 0, 24, 256); g.fillRect(232, 0, 24, 256);
    g.save(); g.translate(128, 128); g.rotate(Math.PI / 4);
    g.fillRect(-170, -12, 340, 24);
    g.restore();
    g.strokeStyle = 'rgba(40,24,8,0.6)'; g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254); g.strokeRect(24, 24, 208, 208);
    g.fillStyle = '#2b2b2b';
    for (const [x, y] of [[12, 12], [244, 12], [12, 244], [244, 244], [128, 12], [128, 244], [12, 128], [244, 128]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(30,20,10,0.55)';
    g.font = 'bold 20px monospace';
    g.fillText('P7-' + (100 + Math.floor(rng() * 800)), 150, 214);
    T.crate = toTexture(c, renderer);
  }

  // ---- diamond tread plate ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#6c7277'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, rng, 20, '30,30,30', 0.05, 0.15, 10, 40);
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) {
      const ox = (y / 16) % 2 ? 8 : 0;
      g.save(); g.translate(x + ox + 4, y + 8);
      g.rotate(((y / 16) % 2 ? 1 : -1) * 0.8);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-5, -1.5, 10, 1.5);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-5, 0, 10, 1.5);
      g.restore();
    }
    T.tread = toTexture(c, renderer);
  }

  // ---- hazard stripes ----
  {
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = '#d9a91f'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1e1e1e';
    for (let i = -2; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 32 + 128, 128); g.lineTo(i * 64 + 128, 128);
      g.closePath(); g.fill();
    }
    blotches(g, 128, 128, rng, 14, '60,50,40', 0.1, 0.3, 4, 18);
    speckle(g, 128, 128, rng, 300, ['rgba(255,255,255,0.15)', 'rgba(0,0,0,0.2)'], 1, 2);
    T.hazard = toTexture(c, renderer);
  }

  // ---- painted block wall (office) ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#c4bdaf'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, rng, 30, '90,84,72', 0.04, 0.1, 10, 50);
    g.fillStyle = 'rgba(80,74,64,0.45)';
    for (let r = 0; r < 8; r++) {
      g.fillRect(0, r * 32, 256, 2);
      const off = r % 2 ? 32 : 0;
      for (let x = off; x < 256 + 64; x += 64) g.fillRect(x, r * 32, 2, 32);
    }
    const gr = g.createLinearGradient(0, 256, 0, 180);
    gr.addColorStop(0, 'rgba(60,50,40,0.35)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = gr; g.fillRect(0, 180, 256, 76);
    T.blocks = toTexture(c, renderer);
  }

  // ---- roof metal ----
  {
    const [c, g] = makeCanvas(256, 256);
    for (let x = 0; x < 256; x++) {
      const s = 0.75 + 0.25 * Math.sin((x / 256) * 6 * Math.PI * 2);
      const v = Math.floor(96 * s);
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`; g.fillRect(x, 0, 1, 256);
    }
    blotches(g, 256, 256, rng, 25, '90,60,40', 0.08, 0.2, 8, 40);
    T.roof = toTexture(c, renderer);
  }

  // ---- bullet hole decal (alpha) ----
  {
    const [c, g] = makeCanvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.18, 'rgba(10,10,10,0.95)');
    gr.addColorStop(0.3, 'rgba(40,36,30,0.6)'); gr.addColorStop(1, 'rgba(40,36,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(20,20,20,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, l = 10 + rng() * 14;
      g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l); g.stroke();
    }
    T.hole = toTexture(c, renderer, true, false);
  }

  // ---- scorch decal ----
  {
    const [c, g] = makeCanvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, 'rgba(8,8,8,0.9)'); gr.addColorStop(0.5, 'rgba(20,18,16,0.6)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    T.scorch = toTexture(c, renderer, true, false);
  }

  // ---- soft glow (sprites) ----
  {
    const [c, g] = makeCanvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    T.glow = toTexture(c, renderer, false, false);
  }

  // ---- muzzle flash star ----
  {
    const [c, g] = makeCanvas(128, 128);
    g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr;
    for (let i = 0; i < 7; i++) {
      g.save(); g.rotate((i / 7) * Math.PI * 2 + rng() * 0.3);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(58 * (0.6 + rng() * 0.4), 0); g.lineTo(0, 6); g.closePath(); g.fill();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
    T.flash = toTexture(c, renderer, false, false);
  }

  // ---- smoke puff ----
  {
    const [c, g] = makeCanvas(64, 64);
    for (let i = 0; i < 9; i++) {
      const x = 20 + rng() * 24, y = 20 + rng() * 24, r = 10 + rng() * 14;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    T.smoke = toTexture(c, renderer, false, false);
  }

  // ---- water normal map ----
  {
    const N = 256;
    const [c, g] = makeCanvas(N, N);
    const img = g.createImageData(N, N);
    const H = new Float32Array(N * N);
    const waves = [];
    for (let i = 0; i < 9; i++) waves.push([1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6), rng() * 6.28, 0.3 + rng() * 0.7]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0;
      for (const [kx, ky, ph, a] of waves) h += a * Math.sin(((x * kx + y * ky) / N) * Math.PI * 2 + ph);
      H[y * N + x] = h;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)];
      const hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
      let nx = -hx * 0.6, ny = -hy * 0.6, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    T.waterNormal = toTexture(c, renderer, false, true);
  }

  // ---- painted ground markings (alpha) ----
  {
    const [c, g] = makeCanvas(64, 256);
    g.fillStyle = 'rgba(230,190,60,0.9)'; g.fillRect(0, 0, 64, 256);
    blotches(g, 64, 256, rng, 30, '60,60,60', 0.2, 0.6, 3, 12);
    speckle(g, 64, 256, rng, 400, ['rgba(40,40,40,0.5)'], 1, 3);
    T.paint = toTexture(c, renderer);
  }


  // ================= additional environments =================
  // ---- plaster / stucco (tinted per building by vertex colour) ----
  {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#e6dccb'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, rng, 70, '150,130,100', 0.04, 0.12, 20, 90);
    blotches(g, 512, 512, rng, 40, '255,250,240', 0.05, 0.12, 15, 70);
    speckle(g, 512, 512, rng, 5000, ['#d9cfbd', '#efe6d6', '#cfc3ae'], 1, 2);
    cracks(g, 512, 512, rng, 5, 'rgba(110,95,75,0.35)', 0.8);
    for (let i = 0; i < 14; i++) {
      const x = rng() * 512, len = 40 + rng() * 160, w = 2 + rng() * 6;
      const gr = g.createLinearGradient(0, 512 - len, 0, 512);
      gr.addColorStop(0, 'rgba(90,75,55,0)'); gr.addColorStop(1, 'rgba(90,75,55,0.25)');
      g.fillStyle = gr; g.fillRect(x, 512 - len, w, len);
    }
    T.plaster = toTexture(c, renderer);
  }
  // ---- brick ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? 32 : 0;
      for (let x = -64; x < 256; x += 64) {
        const v = 0.8 + rng() * 0.35;
        g.fillStyle = `rgb(${Math.floor(150 * v)},${Math.floor(72 * v)},${Math.floor(52 * v)})`;
        g.fillRect(x + off + 2, r * 32 + 2, 60, 28);
      }
    }
    speckle(g, 256, 256, rng, 2500, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.12)'], 1, 2);
    blotches(g, 256, 256, rng, 16, '40,30,25', 0.06, 0.18, 10, 40);
    T.brick = toTexture(c, renderer);
  }
  // ---- cobblestone ----
  {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#3c3a36'; g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) {
      const ox = (y / 32) % 2 ? 16 : 0;
      const v = 0.75 + rng() * 0.4;
      g.fillStyle = `rgb(${Math.floor(138 * v)},${Math.floor(130 * v)},${Math.floor(118 * v)})`;
      const w = 26 + rng() * 4, h = 26 + rng() * 4;
      g.beginPath();
      if (g.roundRect) g.roundRect(x + ox + 2 + rng() * 2, y + 2 + rng() * 2, w, h, 7); else g.rect(x + ox + 2, y + 2, w, h);
      g.fill();
    }
    blotches(g, 512, 512, rng, 30, '20,18,15', 0.08, 0.2, 20, 80);
    speckle(g, 512, 512, rng, 3000, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.2)'], 1, 2);
    T.cobble = toTexture(c, renderer);
  }
  // ---- wooden planks (vertical) ----
  {
    const [c, g] = makeCanvas(256, 256);
    for (let x = 0; x < 256; x += 32) {
      const v = 0.8 + rng() * 0.3;
      g.fillStyle = `rgb(${Math.floor(128 * v)},${Math.floor(88 * v)},${Math.floor(54 * v)})`;
      g.fillRect(x, 0, 32, 256);
      g.strokeStyle = 'rgba(50,30,15,0.35)';
      for (let k = 0; k < 5; k++) { g.lineWidth = 0.8; g.beginPath(); const xx = x + 3 + rng() * 26; g.moveTo(xx, 0); for (let y = 0; y <= 256; y += 32) g.lineTo(xx + (rng() - 0.5) * 3, y); g.stroke(); }
      g.fillStyle = 'rgba(30,18,8,0.7)'; g.fillRect(x, 0, 2, 256);
    }
    T.wood = toTexture(c, renderer);
  }
  // ---- snow ----
  {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#e9eff4'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, rng, 60, '150,170,195', 0.05, 0.14, 20, 100);
    blotches(g, 512, 512, rng, 30, '255,255,255', 0.2, 0.4, 20, 80);
    speckle(g, 512, 512, rng, 3000, ['rgba(255,255,255,0.9)', 'rgba(170,190,215,0.5)'], 1, 2);
    T.snow = toTexture(c, renderer);
  }
  // ---- lab wall panels ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#c9cfd3'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, rng, 20, '90,100,110', 0.04, 0.1, 10, 50);
    g.fillStyle = 'rgba(40,48,56,0.45)';
    g.fillRect(0, 0, 256, 2); g.fillRect(0, 128, 256, 2); g.fillRect(0, 0, 2, 256); g.fillRect(128, 0, 2, 256);
    g.fillStyle = 'rgba(40,48,56,0.5)';
    for (const x of [8, 120, 136, 248]) for (const y of [8, 120, 136, 248]) { g.beginPath(); g.arc(x, y, 2, 0, 6.28); g.fill(); }
    const gr = g.createLinearGradient(0, 256, 0, 200);
    gr.addColorStop(0, 'rgba(60,70,80,0.3)'); gr.addColorStop(1, 'rgba(60,70,80,0)');
    g.fillStyle = gr; g.fillRect(0, 200, 256, 56);
    T.labpanel = toTexture(c, renderer);
  }
  // ---- layered rock ----
  {
    const [c, g] = makeCanvas(512, 512);
    for (let y = 0; y < 512; y++) {
      const band = Math.sin(y * 0.045) * 0.5 + Math.sin(y * 0.13 + 1.3) * 0.3;
      const v = 0.78 + band * 0.12;
      g.fillStyle = `rgb(${Math.floor(176 * v)},${Math.floor(118 * v)},${Math.floor(78 * v)})`;
      g.fillRect(0, y, 512, 1);
    }
    blotches(g, 512, 512, rng, 60, '70,40,25', 0.06, 0.18, 15, 90);
    blotches(g, 512, 512, rng, 30, '230,190,150', 0.05, 0.12, 15, 70);
    cracks(g, 512, 512, rng, 14, 'rgba(50,28,15,0.45)', 1.2);
    speckle(g, 512, 512, rng, 4000, ['rgba(0,0,0,0.15)', 'rgba(255,230,200,0.15)'], 1, 2);
    T.rock = toTexture(c, renderer);
  }
  // ---- sand ----
  {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#cfae7c'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(120,90,50,0.12)'; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) { const y0 = rng() * 512; g.beginPath(); for (let x = 0; x <= 512; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.03 + i) * 8); g.stroke(); }
    blotches(g, 512, 512, rng, 40, '150,110,65', 0.05, 0.15, 20, 100);
    speckle(g, 512, 512, rng, 8000, ['#bf9c6a', '#ddbf90', '#a8875a'], 1, 2);
    T.sand = toTexture(c, renderer);
  }
  // ---- station wall tiles (with a coloured band) ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#8f938f'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 32) {
      const band = y >= 112 && y < 144;
      const v = 0.93 + rng() * 0.07;
      g.fillStyle = band ? `rgb(${Math.floor(46 * v)},${Math.floor(132 * v)},${Math.floor(124 * v)})` : `rgb(${Math.floor(232 * v)},${Math.floor(228 * v)},${Math.floor(214 * v)})`;
      g.fillRect(x + 1, y + 1, 30, 14);
    }
    blotches(g, 256, 256, rng, 12, '60,60,55', 0.05, 0.12, 10, 50);
    T.tile = toTexture(c, renderer);
  }
  // ---- floor tiles ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#5c5f62'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      const v = 0.9 + rng() * 0.12;
      g.fillStyle = `rgb(${Math.floor(150 * v)},${Math.floor(152 * v)},${Math.floor(150 * v)})`;
      g.fillRect(x + 1, y + 1, 62, 62);
    }
    speckle(g, 256, 256, rng, 2000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], 1, 2);
    blotches(g, 256, 256, rng, 12, '40,40,40', 0.05, 0.12, 10, 40);
    T.floortile = toTexture(c, renderer);
  }
  // ---- track ballast ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#4a4540'; g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, rng, 7000, ['#6b645c', '#36322e', '#7c746a', '#2a2724', '#5a534c'], 2, 5);
    T.ballast = toTexture(c, renderer);
  }
  // ---- chain-link fence (alpha) ----
  {
    const [c, g] = makeCanvas(64, 64);
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(190,198,205,1)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(-32, 32); g.lineTo(0, 0); g.moveTo(64, 0); g.lineTo(96, 32); g.stroke();
    T.chainlink = toTexture(c, renderer, true, true);
  }
  // ---- striped awning fabric ----
  {
    const [c, g] = makeCanvas(128, 128);
    for (let x = 0; x < 128; x += 32) { g.fillStyle = '#b23a2e'; g.fillRect(x, 0, 16, 128); g.fillStyle = '#efe6d2'; g.fillRect(x + 16, 0, 16, 128); }
    blotches(g, 128, 128, rng, 10, '60,40,30', 0.08, 0.2, 10, 40);
    T.awning = toTexture(c, renderer);
  }
  // ---- distant city windows (emissive) ----
  {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let y = 4; y < 256; y += 10) for (let x = 3; x < 256; x += 8) {
      if (rng() < 0.32) {
        const warm = rng() < 0.7;
        g.fillStyle = warm ? `rgba(255,${190 + Math.floor(rng() * 40)},${110 + Math.floor(rng() * 40)},${0.5 + rng() * 0.5})` : `rgba(170,210,255,${0.4 + rng() * 0.4})`;
        g.fillRect(x, y, 4, 5);
      }
    }
    T.windows = toTexture(c, renderer);
  }

  return T;
}

// Name-tag sprite texture
export function makeLabelTexture(text, color) {
  const [c, g] = makeCanvas(256, 64);
  g.font = '600 30px "Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(8,12,16,0.85)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvas texture with station / shop signage text
export function makeSignTexture(lines, bg = '#1f4f7a', fg = '#ffffff', w = 512, h = 128) {
  const [c, g] = makeCanvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((t, i) => {
    const size = i === 0 ? Math.floor(h * (n > 1 ? 0.38 : 0.55)) : Math.floor(h * 0.2);
    g.font = `700 ${size}px "Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif`;
    g.fillText(t, w / 2, n === 1 ? h / 2 : i === 0 ? h * 0.42 : h * 0.78);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
