import * as THREE from 'three';

// Textures procédurales générées au chargement (canvas 2D) : façades, tuiles, bruit de sol.
// Les façades sont un tableau de couches (une couche = une travée x un étage) avec mipmaps et filtrage anisotrope :
// plus de fenêtres calculées pixel par pixel dans le shader => plus de scintillement ni de pixelisation.

const S = 512;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cnv = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
const MASK = { wall: '#00ff00', glass: '#ff0000', none: '#000000' };

// ---------------------------------------------------------------- façades
function drawLayer(ctx, mode, L) {
  const rnd = mulberry(L.seed);
  const fill = (x, y, w, h, n, m) => { ctx.fillStyle = mode ? m : (typeof n === 'function' ? n() : n); ctx.fillRect(x, y, w, h); };
  const deco = (fn) => { if (!mode) { ctx.save(); fn(); ctx.restore(); } };
  const grad = (y0, y1, stops) => () => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };

  // --- crépi ---
  fill(0, 0, S, S, '#f3eee3', MASK.wall);
  deco(() => {
    for (let i = 0; i < 26; i++) {   // grandes taches
      const x = rnd() * S, y = rnd() * S, r = 40 + rnd() * 120, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd() < 0.5 ? '255,255,255' : '90,75,55'; g.addColorStop(0, `rgba(${c},${0.05 + rnd() * 0.06})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 14000; i++) {   // grain fin
      const s = 1 + rnd() * 2.5; ctx.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.03 + rnd() * 0.07})` : `rgba(60,45,30,${0.03 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * S, rnd() * S, s, s);
    }
    if (L.stone) {   // pierre de taille / joints
      ctx.strokeStyle = 'rgba(60,50,40,0.18)'; ctx.lineWidth = 2;
      for (let y = 0; y < S; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
      for (let y = 0; y < S; y += 64) for (let x = ((y / 64) & 1) * 64; x < S; x += 128) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(0, 0, S, 10);            // corniche
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(0, 10, S, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(0, S - 26, S, 8);        // bandeau d'étage
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, S - 18, S, 6);
  });

  const glassGrad = (y, h, warm) => grad(y, y + h, [[0, warm ? '#b6b7a8' : '#a9bfd3'], [0.35, '#5f7690'], [1, '#1b2836']]);
  const win = (x, y, w, h, o = {}) => {
    const fw = o.fw || 14, mw = o.mw || 10, leaves = o.leaves || 2;
    deco(() => { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); });     // ébrasement
    fill(x, y, w, h, o.frame || '#efece3', MASK.none);
    const pw = (w - 2 * fw - (leaves - 1) * mw) / leaves;
    for (let i = 0; i < leaves; i++) {
      const px = x + fw + i * (pw + mw), py = y + fw, ph = h - 2 * fw;
      fill(px, py, pw, ph, glassGrad(py, ph, o.warm), MASK.glass);
      deco(() => {
        ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.beginPath(); ctx.moveTo(px + pw * 0.15, py); ctx.lineTo(px + pw * 0.55, py); ctx.lineTo(px + pw * 0.05, py + ph * 0.7); ctx.lineTo(px - pw * 0.2, py + ph * 0.7); ctx.fill();
        if (o.curtain && (i + (L.seed & 1)) % 2 === 0) { ctx.fillStyle = 'rgba(236,228,208,0.62)'; ctx.fillRect(px, py, pw, ph * (0.35 + rnd() * 0.3)); }
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(px, py, pw, 9); ctx.fillRect(px, py, 8, ph);        // ombre portée intérieure
      });
      if (o.transom) fill(px, py + ph * o.transom, pw, 8, o.frame || '#efece3', MASK.none);
      if (o.bars) { for (let b = 1; b < o.bars; b++) fill(px + pw * b / o.bars - 2, py, 4, ph, o.frame || '#efece3', MASK.none); for (let b = 1; b < o.bars + 1; b++) fill(px, py + ph * b / (o.bars + 1) - 2, pw, 4, o.frame || '#efece3', MASK.none); }
    }
    deco(() => { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y, w, 3); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y + h - 3, w, 3); });
    if (o.sill !== false) {
      fill(x - 14, y + h, w + 28, 16, '#ffffff', MASK.wall);
      deco(() => { const g = ctx.createLinearGradient(0, y + h + 16, 0, y + h + 34); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - 14, y + h + 16, w + 28, 18);
        const d = ctx.createLinearGradient(0, y + h + 16, 0, y + h + 150); d.addColorStop(0, 'rgba(60,50,40,0.20)'); d.addColorStop(1, 'rgba(60,50,40,0)'); ctx.fillStyle = d; ctx.fillRect(x + w * 0.15, y + h + 16, w * 0.7, 134); });
    }
    if (o.lintel !== false) {
      fill(x - 10, y - 22, w + 20, 18, '#fffdf8', MASK.wall);
      deco(() => { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - 10, y - 5, w + 20, 3); });
    }
    if (o.shutter) {
      const sw = w / 2 - 2;
      for (const sx of [x - sw - 8, x + w + 8]) {
        fill(sx, y - 6, sw, h + 12, o.shutter, MASK.none);
        deco(() => {
          ctx.fillStyle = 'rgba(0,0,0,0.28)'; for (let yy = y + 4; yy < y + h + 4; yy += 15) ctx.fillRect(sx + 6, yy, sw - 12, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.13)'; for (let yy = y + 7; yy < y + h + 4; yy += 15) ctx.fillRect(sx + 6, yy, sw - 12, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(sx, y - 6, 5, h + 12); ctx.fillRect(sx + sw - 5, y - 6, 5, h + 12);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx - 4, y - 2, 4, h + 12);
        });
      }
    }
  };
  const railing = (x, y, w, h) => {   // garde-corps en fer forgé
    fill(x - 18, y + h - 6, w + 36, 22, '#ffffff', MASK.wall);
    deco(() => { const g = ctx.createLinearGradient(0, y + h + 16, 0, y + h + 60); g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - 18, y + h + 16, w + 36, 44); });
    const top = y + h - 96;
    fill(x - 14, top, w + 28, 6, '#222226', MASK.none);
    for (let xx = x - 12; xx < x + w + 14; xx += 16) fill(xx, top, 3.5, 90, '#26262a', MASK.none);
    fill(x - 14, y + h - 22, w + 28, 4, '#222226', MASK.none);
  };
  const W = 190;
  switch (L.kind) {
    case 'shutter': win((S - W) / 2, S * 0.16, W, S * 0.68, { shutter: L.col, bars: 2, leaves: 2, curtain: L.curtain }); break;
    case 'plain': win((S - 225) / 2, S * 0.22, 225, S * 0.58, { leaves: 2, transom: 0.34, curtain: L.curtain, warm: L.warm }); break;
    case 'plain2': win((S - 200) / 2, S * 0.20, 200, S * 0.62, { leaves: 2, bars: 2, curtain: L.curtain }); break;
    case 'small': win((S - 150) / 2, S * 0.27, 150, S * 0.48, { leaves: 1, transom: 0.4, curtain: L.curtain }); break;
    case 'balcony': win((S - W) / 2, S * 0.10, W, S * 0.72, { leaves: 2, transom: 0.22, curtain: L.curtain, sill: false, shutter: L.col }); railing((S - W) / 2, S * 0.10, W, S * 0.72); if (L.flowers) deco(() => { const bx = (S - W) / 2 - 12, by = S * 0.10 + S * 0.72 - 14; ctx.fillStyle = '#6b4a30'; ctx.fillRect(bx, by, W + 24, 16); for (let i = 0; i < 26; i++) { ctx.fillStyle = ['#c8323a', '#e8c4d0', '#3d7a3a', '#e6c94a', '#4f9a45'][i % 5]; ctx.beginPath(); ctx.arc(bx + 6 + i * (W + 12) / 26, by - 4 - (i * 7 % 9), 6 + (i % 3), 0, 6.3); ctx.fill(); } }); break;
    case 'wide': {
      const x = S * 0.05, y = S * 0.30, w = S * 0.90, h = S * 0.42;
      fill(x, y, w, h, '#5b5e63', MASK.none);
      for (let i = 0; i < 3; i++) { const px = x + 10 + i * (w - 20) / 3, pw = (w - 20) / 3 - 8, gy = y + 10, gh = h - 20; fill(px, gy, pw, gh, glassGrad(gy, gh), MASK.glass);
        deco(() => { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(px + pw * 0.2, gy); ctx.lineTo(px + pw * 0.5, gy); ctx.lineTo(px, gy + gh * 0.6); ctx.lineTo(px - pw * 0.2, gy + gh * 0.6); ctx.fill(); }); }
      deco(() => { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y + h, w, 60); });
      fill(x - 6, y + h, w + 12, 12, '#ffffff', MASK.wall);
      break;
    }
    case 'wide2': win(S * 0.07, S * 0.26, S * 0.40, S * 0.50, { leaves: 2, sill: false, lintel: false, frame: '#7d8085', fw: 10 }); win(S * 0.53, S * 0.26, S * 0.40, S * 0.50, { leaves: 2, sill: false, lintel: false, frame: '#7d8085', fw: 10 }); break;
    case 'arch': {   // fenêtre cintrée
      const x = (S - 170) / 2, y = S * 0.16, w = 170, h = S * 0.66, r = w / 2, fw = 14;
      const path = (x0, y0, w0, h0) => { ctx.beginPath(); ctx.moveTo(x0, y0 + h0); ctx.lineTo(x0, y0 + w0 / 2); ctx.arc(x0 + w0 / 2, y0 + w0 / 2, w0 / 2, Math.PI, 0); ctx.lineTo(x0 + w0, y0 + h0); ctx.closePath(); };
      deco(() => { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.fillStyle = '#000'; path(x, y, w, h); ctx.fill(); });
      ctx.fillStyle = mode ? MASK.wall : '#fffdf8'; path(x - 12, y - 12, w + 24, h + 12); ctx.fill();   // encadrement de pierre
      ctx.fillStyle = mode ? MASK.none : '#efece3'; path(x, y, w, h); ctx.fill();
      const gl = ctx.createLinearGradient(0, y, 0, y + h); [[0, '#a9bfd3'], [0.35, '#5f7690'], [1, '#1b2836']].forEach(([o, c]) => gl.addColorStop(o, c));
      ctx.fillStyle = mode ? MASK.glass : gl; path(x + fw, y + fw, w - 2 * fw, h - 2 * fw); ctx.fill();
      fill(x + w / 2 - 3, y + fw, 6, h - 2 * fw, '#efece3', MASK.none); fill(x + fw, y + h * 0.42, w - 2 * fw, 6, '#efece3', MASK.none);
      fill(x - 14, y + h, w + 28, 16, '#ffffff', MASK.wall); break; }
    case 'tall': {   // haute porte-fenêtre à fronton et garde-corps
      const x = (S - 175) / 2, y = S * 0.20, w = 175, h = S * 0.74;
      win(x, y, w, h * 0.92, { leaves: 2, transom: 0.16, curtain: L.curtain, sill: false, lintel: false });
      ctx.fillStyle = mode ? MASK.wall : '#f7f3ea'; ctx.beginPath(); ctx.moveTo(x - 16, y - 2); ctx.lineTo(x + w / 2, y - 46); ctx.lineTo(x + w + 16, y - 2); ctx.closePath(); ctx.fill();
      deco(() => { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 16, y - 4, w + 32, 4); });
      const top = y + h * 0.92 - 70; fill(x - 8, top, w + 16, 5, '#222226', MASK.none); for (let xx = x - 6; xx < x + w + 8; xx += 14) fill(xx, top, 3, 70, '#26262a', MASK.none); break; }
    case 'triple': for (let i = 0; i < 3; i++) win(S * 0.06 + i * S * 0.31, S * 0.30, S * 0.26, S * 0.42, { leaves: 1, transom: 0.35, sill: i === 1, lintel: false, fw: 10, curtain: L.curtain }); break;
    case 'dark': {   // menuiserie alu sombre + caisson de volet roulant
      win((S - 215) / 2, S * 0.26, 215, S * 0.56, { leaves: 2, frame: '#3b3d42', fw: 12, bars: 1, curtain: L.curtain });
      fill((S - 235) / 2, S * 0.17, 235, 34, '#8d8b84', MASK.none); deco(() => { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect((S - 235) / 2, S * 0.17 + 30, 235, 4); }); break; }
    case 'pipe': {   // mur aveugle : descente d'eau pluviale, grille d'aération, fissure
      fill(S * 0.78, 0, 14, S, '#6b6d70', MASK.none); deco(() => { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(S * 0.78 + 2, 0, 3, S); for (let yy = 40; yy < S; yy += 170) { ctx.fillStyle = '#55575a'; ctx.fillRect(S * 0.78 - 4, yy, 22, 8); } });
      fill(S * 0.3, S * 0.62, 70, 40, '#4a4c50', MASK.none); deco(() => { ctx.fillStyle = 'rgba(200,200,200,0.5)'; for (let yy = S * 0.62 + 6; yy < S * 0.62 + 38; yy += 8) ctx.fillRect(S * 0.3 + 6, yy, 58, 3); });
      deco(() => { ctx.strokeStyle = 'rgba(50,40,30,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(S * 0.15, S * 0.25); ctx.lineTo(S * 0.19, S * 0.4); ctx.lineTo(S * 0.16, S * 0.5); ctx.lineTo(S * 0.22, S * 0.66); ctx.stroke(); }); break; }
    case 'blank': break;
    case 'attic': win((S - 110) / 2, S * 0.30, 110, S * 0.36, { leaves: 1, curtain: true, lintel: false }); break;
    case 'shop': {
      const plinth = 46, x = S * 0.05, y = S * 0.20, w = S * 0.90, h = S - y - plinth;
      fill(0, S - plinth, S, plinth, '#8f897c', MASK.none);
      deco(() => { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, S - plinth, S, 4); });
      fill(0, 0, S, y - 8, L.sign, MASK.none);                                     // bandeau d'enseigne
      deco(() => { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(S * 0.2, y * 0.35, S * 0.6, 10); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(S * 0.28, y * 0.35 + 22, S * 0.44, 6); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y - 14, S, 6); });
      fill(x, y, w, h, '#2f3033', MASK.none);
      const cols = 3, gw = (w - 16 - (cols - 1) * 10) / cols;
      for (let i = 0; i < cols; i++) {
        const gx = x + 8 + i * (gw + 10), gy = y + 8, gh = h - 16;
        fill(gx, gy, gw, gh, grad(gy, gy + gh, [[0, '#a9bccd'], [0.4, '#7a8a95'], [1, '#4a3f36']]), MASK.glass);
        deco(() => { ctx.fillStyle = 'rgba(255,214,150,0.22)'; ctx.fillRect(gx, gy + gh * 0.45, gw, gh * 0.55); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(gx + gw * 0.2, gy); ctx.lineTo(gx + gw * 0.6, gy); ctx.lineTo(gx + gw * 0.1, gy + gh * 0.7); ctx.lineTo(gx - gw * 0.2, gy + gh * 0.7); ctx.fill(); });
      }
      if (L.awning) deco(() => { for (let i = 0; i < 12; i++) { ctx.fillStyle = i & 1 ? '#f4efe4' : L.awning; ctx.beginPath(); const ax = x + i * w / 12; ctx.moveTo(ax, y - 4); ctx.lineTo(ax + w / 12, y - 4); ctx.lineTo(ax + w / 12 + 3, y + 46); ctx.lineTo(ax - 3, y + 46); ctx.fill(); }
        const g = ctx.createLinearGradient(0, y + 46, 0, y + 80); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y + 46, w, 34); });
      break;
    }
  }
}

// couches : [nom, spec]
const LAYERS = [
  { kind: 'shutter', col: '#43654d', seed: 1 }, { kind: 'shutter', col: '#62748c', seed: 2, curtain: true }, { kind: 'shutter', col: '#71503b', seed: 3 }, { kind: 'shutter', col: '#cfc5a9', seed: 4, curtain: true },
  { kind: 'plain', seed: 5, stone: true }, { kind: 'plain2', seed: 6, curtain: true }, { kind: 'small', seed: 7 },
  { kind: 'balcony', seed: 8, col: null }, { kind: 'balcony', seed: 9, col: '#43654d', curtain: true },
  { kind: 'wide', seed: 10 }, { kind: 'wide2', seed: 11 },
  { kind: 'blank', seed: 12 }, { kind: 'attic', seed: 13 },
  { kind: 'shop', seed: 14, sign: '#284637', awning: null }, { kind: 'shop', seed: 15, sign: '#5b2733', awning: '#b3362f' },
  { kind: 'shutter', col: '#7f8fa0', seed: 16 }, { kind: 'shutter', col: '#8f3a30', seed: 17, curtain: true }, { kind: 'shutter', col: '#e6e1d2', seed: 18 }, { kind: 'shutter', col: '#3b4a3a', seed: 19, curtain: true },
  { kind: 'arch', seed: 20, curtain: true }, { kind: 'tall', seed: 21, curtain: true }, { kind: 'triple', seed: 22 }, { kind: 'dark', seed: 23, curtain: true }, { kind: 'pipe', seed: 24 },
  { kind: 'balcony', seed: 25, col: '#7f8fa0', flowers: true }, { kind: 'balcony', seed: 26, col: null, flowers: true, curtain: true },
];

export function makeFacadeTextures(aniso = 16) {
  const n = LAYERS.length, col = new Uint8Array(S * S * 4 * n), aux = new Uint8Array(S * S * 4 * n);
  const c = cnv(), ctx = c.getContext('2d', { willReadFrequently: true });
  LAYERS.forEach((L, i) => {
    for (const [mode, dst] of [[0, col], [1, aux]]) {
      ctx.clearRect(0, 0, S, S); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (mode) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S); }
      drawLayer(ctx, mode, L);
      dst.set(ctx.getImageData(0, 0, S, S).data, i * S * S * 4);
    }
  });
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  return { color: mk(col, true), aux: mk(aux, false), layers: n };
}

// ---------------------------------------------------------------- tuiles (motif niveau de gris, teinté par sommet)
export function makeRoofTexture(aniso = 16) {
  const c = cnv(), g = c.getContext('2d'), rnd = mulberry(77);
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
  const rows = 8, th = S / rows, tw = S / 8;
  for (let r = 0; r < rows; r++) for (let i = 0; i < 9; i++) {
    const x = i * tw + (r & 1 ? tw / 2 : 0) - tw / 2, y = r * th, b = 150 + rnd() * 100 | 0;
    const gr = g.createLinearGradient(0, y, 0, y + th); gr.addColorStop(0, `rgb(${b + 18},${b + 18},${b + 18})`); gr.addColorStop(0.75, `rgb(${b},${b},${b})`); gr.addColorStop(1, `rgb(${b - 55},${b - 55},${b - 55})`);
    g.fillStyle = gr; g.fillRect(x + 2, y + 1, tw - 4, th - 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, 2.5, th);
    if (rnd() < 0.12) { g.fillStyle = 'rgba(70,90,50,0.35)'; g.fillRect(x + 4, y + th * 0.3, tw - 8, th * 0.5); }   // mousse
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}

// ---------------------------------------------------------------- bruit de sol pavable (R fin, G moyen, B large, A fissures)
export function makeNoiseTexture(aniso = 16) {
  const N = 512, data = new Uint8Array(N * N * 4), rnd = mulberry(4242);
  const lat = (p) => { const a = new Float32Array(p * p); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (a, p, x, y) => { const fx = x / N * p, fy = y / N * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = smooth(fx - ix), ty = smooth(fy - iy);
    const g = (i, j) => a[((j % p + p) % p) * p + ((i % p + p) % p)];
    return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty; };
  const A = [lat(256), lat(128), lat(64)], B = [lat(32), lat(16)], C = [lat(8), lat(4)], W = lat(512);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (y * N + x) * 4;
    const r = 0.5 * W[y * N + x] + 0.3 * sample(A[0], 256, x, y) + 0.2 * sample(A[1], 128, x, y);
    const g = 0.6 * sample(B[0], 32, x, y) + 0.4 * sample(B[1], 16, x, y);
    const b = 0.6 * sample(C[0], 8, x, y) + 0.4 * sample(C[1], 4, x, y);
    const cr = Math.abs(sample(A[2], 64, x, y) - 0.5) < 0.012 ? 1 : 0;
    data[k] = r * 255; data[k + 1] = g * 255; data[k + 2] = b * 255; data[k + 3] = cr * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso; t.needsUpdate = true; return t;
}
