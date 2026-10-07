import * as THREE from 'three';
import { makeNoiseTexture } from './textures.js';

const M_LAT = 110540;
const mLon = (lat0) => 111320 * Math.cos(lat0 * Math.PI / 180);
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ Relief (tuiles Terrarium)
function loadImage(src, cors) {
  return new Promise((res, rej) => {
    const im = new Image(); if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => rej(new Error(src)); im.src = src;
  });
}

// Retourne une fonction elev(x, z) en mètres absolus (NN) ou null si le relief est indisponible.
export async function loadDem(data) {
  const d = data.dem; if (!d) return null;
  const [lat0, lon0] = data.center;
  const nx = d.x1 - d.x0 + 1, ny = d.y1 - d.y0 + 1;
  const cv = document.createElement('canvas'); cv.width = nx * 256; cv.height = ny * 256;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let x = d.x0; x <= d.x1; x++) for (let y = d.y0; y <= d.y1; y++) {
    jobs.push(loadImage(`data/${data.cp || '73000'}/relief/${d.z}/${x}/${y}.png`, false)
      .catch(() => loadImage(`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${d.z}/${x}/${y}.png`, true))
      .then((im) => g.drawImage(im, (x - d.x0) * 256, (y - d.y0) * 256)));
  }
  try { await Promise.all(jobs); } catch (e) { console.warn('Relief indisponible', e); return null; }
  const px = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
  const E = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) E[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  const scale = 2 ** d.z * 256, ml = mLon(lat0);
  return (x, z) => {
    const lat = lat0 - z / M_LAT, lon = lon0 + x / ml;
    const wx = (lon + 180) / 360 * scale - d.x0 * 256;
    const s = Math.tan(lat * Math.PI / 180), wy = (1 - Math.asinh(s) / Math.PI) / 2 * scale - d.y0 * 256;
    const fx = Math.min(W - 1.001, Math.max(0, wx - 0.5)), fy = Math.min(H - 1.001, Math.max(0, wy - 0.5));
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * W + ix;
    return (E[i] * (1 - tx) + E[i + 1] * tx) * (1 - ty) + (E[i + W] * (1 - tx) + E[i + W + 1] * tx) * ty;
  };
}

// ------------------------------------------------------------------ Terrain
const AREA_COL = { forest: '#4f6b3f', grass: '#9fb072', scrub: '#8b9463', farm: '#c2c084', cem: '#8fa07a', urban: '#b4b0a6',
  sport: '#6ea04c', track: '#b3563c', pool: '#4db4d4', rock: '#8d897e', res: '#b3b697', water: '#5c8fae' };
const AREA_ORDER = ['res', 'urban', 'farm', 'grass', 'scrub', 'rock', 'cem', 'sport', 'track', 'pool', 'forest', 'water'];

// Nettoyage des altitudes aberrantes (tuiles de relief Terrarium) : le radar source (SRTM) ne réfléchit pas
// correctement sur l'eau, et occasionnellement sur d'autres surfaces (glitch de tuile) - un petit groupe de cases
// de la grille peut alors se retrouver à une altitude à des centaines de mètres du voisinage immédiat (ex.
// constaté sur l'Isère à Montmélian : plusieurs cases à +917 m au milieu d'une plaine à -49 m), sans aucune
// transition progressive puisque ce n'est pas un vrai relief mais une valeur de tuile corrompue/manquante. Très
// visible sur une nappe d'eau plate (échantillonnée très densément par le rendu de l'eau) sous forme de murs
// verticaux, mais fausse aussi le terrain/les routes/bâtiments à cet endroit. Détection générique (toute ville,
// tout type de surface, pas seulement l'eau) : on ne corrige QUE les cases isolées dont les 8 voisines
// s'accordent nettement mieux entre elles qu'avec la case elle-même - un vrai à-pic (falaise réelle, cols de
// montagne) a des voisines qui NE sont PAS d'accord entre elles (certaines hautes, certaines basses) et n'est
// jamais touché ; seule une case dont l'écart au voisinage dépasse de loin la variation naturelle DU voisinage
// lui-même est considérée aberrante. Plusieurs passes successives pour rattraper les petits amas de 2-3 cases
// contiguës (la case centrale d'un amas, entourée d'autres cases aberrantes à la 1re passe, est nettoyée une fois
// ses voisines corrigées par la passe précédente).
function despikeH(H, N) {
  // écart-type robuste du voisinage (écart absolu médian, MAD) plutôt que l'étendue brute (min/max) : dans un amas
  // de 2-3 cases aberrantes contiguës, certaines des 8 voisines d'une case en bordure de l'amas sont ELLES-MÊMES
  // aberrantes - l'étendue min/max du voisinage est alors déjà énorme (contaminée par ces voisines), ce qui
  // masquait complètement l'anomalie (cas réel observé : condition jamais déclenchée). La MAD reste fiable tant
  // qu'au plus 3 des 8 voisines sont aberrantes (majorité saine), quelle que soit l'ampleur de l'aberration.
  for (let pass = 0; pass < 4; pass++) {
    const out = H.slice(); let changed = 0;
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      const nb = [H[k - 1], H[k + 1], H[k - N], H[k + N], H[k - N - 1], H[k - N + 1], H[k + N - 1], H[k + N + 1]];
      const s = nb.slice().sort((a, b) => a - b), med = (s[3] + s[4]) / 2;
      const ad = nb.map((v) => Math.abs(v - med)).sort((a, b) => a - b), mad = (ad[3] + ad[4]) / 2;
      const dev = Math.abs(H[k] - med);
      if (dev > 50 && dev > mad * 4 + 10) { out[k] = med; changed++; }
    }
    H = out; if (!changed) break;
  }
  return H;
}

export function buildTerrain(data, elev) {
  const R = data.demRadius || 9000, N = 721, step = (2 * R) / (N - 1);
  const hOff = elev ? Math.round(elev(0, 0)) : 0;
  let H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = elev ? elev(-R + i * step, -R + j * step) - hOff : 0;
  if (elev) H = despikeH(H, N);

  const heightAt = (x, z) => {
    const fx = Math.min(N - 1.001, Math.max(0, (x + R) / step)), fz = Math.min(N - 1.001, Math.max(0, (z + R) / step));
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * N + i;
    return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + N] * (1 - tx) + H[k + N + 1] * tx) * tz;
  };
  const normalAt = (x, z, out = new THREE.Vector3()) => {
    const e = 6, dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  };

  // maillage
  const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 3; pos[k] = -R + i * step; pos[k + 1] = H[j * N + i]; pos[k + 2] = -R + j * step;
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6); let q = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array;
  // couleurs de base : altitude + pente (les zones OSM sont peintes par-dessus dans le shader)
  const c = new THREE.Color(), grass = new THREE.Color('#8f9f68'), wood = new THREE.Color('#5a744a'),
        alp = new THREE.Color('#a4ab7c'), rock = new THREE.Color('#8b877c'), snow = new THREE.Color('#e8ebee');
  for (let v = 0; v < N * N; v++) {
    const e = pos[v * 3 + 1] + hOff, ny = nrm[v * 3 + 1], n = hash2(v % N, (v / N) | 0);
    c.copy(grass);
    c.lerp(wood, THREE.MathUtils.smoothstep(e, 420, 620) * (1 - THREE.MathUtils.smoothstep(e, 1500, 1800)) * 0.9);
    c.lerp(alp, THREE.MathUtils.smoothstep(e, 1500, 1900));
    c.lerp(rock, THREE.MathUtils.smoothstep(1 - ny, 0.28, 0.5) * 0.9);
    c.lerp(snow, THREE.MathUtils.smoothstep(e, 2300, 2700) * THREE.MathUtils.smoothstep(ny, 0.5, 0.8));
    c.multiplyScalar(0.94 + 0.12 * n);
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // texture des zones OSM (forêts, parcs, eau, quartiers…)
  const S = 4096, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'); const k = S / (2 * R);
  const mask = document.createElement('canvas'); mask.width = mask.height = 2048;   // masque forêt (8 m/px)
  const mg = mask.getContext('2d', { willReadFrequently: true }); mg.fillStyle = '#fff'; const km = 2048 / (2 * R);
  const trace = (ctx, rings, s) => { ctx.beginPath(); for (const r of rings) { r.forEach(([x, z], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x + R) * s, (z + R) * s)); ctx.closePath(); } };
  const areas = data.areas || [];
  for (const t of AREA_ORDER) {
    g.fillStyle = AREA_COL[t];
    for (const a of areas) if (a.t === t) { trace(g, a.p, k); g.fill('evenodd'); if (t === 'forest') { trace(mg, a.p, km); mg.fill('evenodd'); } }
  }
  g.fillStyle = '#a19d92';   // sol sous/autour des bâtiments
  g.strokeStyle = '#a19d92'; g.lineWidth = 5 * k; g.lineJoin = 'round';
  for (const b of data.buildings) { trace(g, [b.p], k); g.fill(); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 16;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;

  // masque dédié aux seuls bâtiments (même tracé, sans les autres zones) : permet de réafficher leur liseré
  // par-dessus la photo aérienne, qui sinon le recouvre entièrement (cf. shader plus bas, uBldG/uBldL)
  const bcv = document.createElement('canvas'); bcv.width = bcv.height = S;
  const bg = bcv.getContext('2d'); bg.fillStyle = '#fff'; bg.strokeStyle = '#fff'; bg.lineWidth = 5 * k; bg.lineJoin = 'round';
  for (const b of data.buildings) { trace(bg, [b.p], k); bg.fill(); bg.stroke(); }
  const bldTex = new THREE.CanvasTexture(bcv); bldTex.flipY = false; bldTex.anisotropy = 16;
  bldTex.generateMipmaps = true; bldTex.minFilter = THREE.LinearMipmapLinearFilter;

  // --- zone locale haute résolution (0,6 m/pixel) redessinée quand la caméra s'éloigne ---
  const LS = 1400, LN = 2048, lc = document.createElement('canvas'); lc.width = lc.height = LN;
  const lg = lc.getContext('2d'); const locTex = new THREE.CanvasTexture(lc);
  locTex.colorSpace = THREE.SRGBColorSpace; locTex.flipY = false; locTex.anisotropy = 16; locTex.generateMipmaps = true; locTex.minFilter = THREE.LinearMipmapLinearFilter;
  const blc = document.createElement('canvas'); blc.width = blc.height = LN;   // même principe que bcv/bldTex, en version locale haute résolution
  const blg = blc.getContext('2d'); const bldLocTex = new THREE.CanvasTexture(blc);
  bldLocTex.flipY = false; bldLocTex.anisotropy = 16; bldLocTex.generateMipmaps = true; bldLocTex.minFilter = THREE.LinearMipmapLinearFilter;
  for (const a of areas) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const r of a.p) for (const [x, z] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } a.bb = [x0, z0, x1, z1]; }
  const uLoc = { value: new THREE.Vector3(0, 0, 0) }; let lcx = 1e9, lcz = 1e9;
  const refreshLocal = (cx, cz) => {
    refreshOrtho(cx, cz);
    lcx = cx; lcz = cz; lg.clearRect(0, 0, LN, LN);
    const sc = LN / LS, ox = cx - LS / 2, oz = cz - LS / 2, m = 40;
    const tr = (ctx, rings) => { ctx.beginPath(); for (const r of rings) { r.forEach(([x, z], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - ox) * sc, (z - oz) * sc)); ctx.closePath(); } };
    for (const t of AREA_ORDER) {
      lg.fillStyle = AREA_COL[t];
      for (const a of areas) if (a.t === t && a.bb[2] > ox - m && a.bb[0] < ox + LS + m && a.bb[3] > oz - m && a.bb[1] < oz + LS + m) { tr(lg, a.p); lg.fill('evenodd'); }
    }
    lg.strokeStyle = 'rgba(255,255,255,0.9)'; lg.lineWidth = 0.3 * sc; lg.lineJoin = 'round';   // lignes blanches des terrains
    for (const a of areas) if (a.t === 'sport' && a.bb[2] > ox && a.bb[0] < ox + LS && a.bb[3] > oz && a.bb[1] < oz + LS) { tr(lg, a.p); lg.stroke(); }
    lg.fillStyle = '#a19d92'; lg.strokeStyle = '#a19d92'; lg.lineWidth = 5 * sc; lg.lineJoin = 'round';
    blg.clearRect(0, 0, LN, LN); blg.fillStyle = '#fff'; blg.strokeStyle = '#fff'; blg.lineWidth = 5 * sc; blg.lineJoin = 'round';
    for (const b of data.buildings) {
      const q = b.p[0]; if (q[0] < ox - m || q[0] > ox + LS + m || q[1] < oz - m || q[1] > oz + LS + m) continue;
      tr(lg, [b.p]); lg.fill(); lg.stroke(); tr(blg, [b.p]); blg.fill(); blg.stroke();
    }
    locTex.needsUpdate = true; bldLocTex.needsUpdate = true; uLoc.value.set(cx, cz, LS);
  };
  const NOISE = makeNoiseTexture(16);
  // --- orthophoto IGN : tuiles z16 dessinées dans une grande texture centrée sur la ville ---
  const RO = 4000, OS = 4096, oc = document.createElement('canvas'); oc.width = oc.height = OS;
  const og = oc.getContext('2d'); const orthoTex = new THREE.CanvasTexture(oc);
  orthoTex.colorSpace = THREE.SRGBColorSpace; orthoTex.flipY = false; orthoTex.anisotropy = 16; orthoTex.generateMipmaps = true; orthoTex.minFilter = THREE.LinearMipmapLinearFilter;
  const uOrthoOn = { value: 0 }; let orthoOK = false, orthoWant = true; let orthoRes; const orthoReady = new Promise((r) => { orthoRes = r; });
  if (data.ortho && data.center) {
    const o = data.ortho, [lat0, lon0] = data.center, nT = 2 ** o.z, cl = Math.cos(lat0 * Math.PI / 180);
    const lonOf = (x) => x / nT * 360 - 180, latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / nT))) * 180 / Math.PI;
    const toPx = (lon, lat) => [((lon - lon0) * 111320 * cl + RO) / (2 * RO) * OS, ((-(lat - lat0) * 110540) + RO) / (2 * RO) * OS];
    let pend = 0;
    for (let x = o.x0; x <= o.x1; x++) for (let y = o.y0; y <= o.y1; y++) {
      pend++;
      const im = new Image();
      im.onload = () => {
        const a = toPx(lonOf(x), latOf(y)), b = toPx(lonOf(x + 1), latOf(y + 1));
        og.drawImage(im, a[0] - 0.5, a[1] - 0.5, b[0] - a[0] + 1, b[1] - a[1] + 1);
        orthoOK = true; const done = --pend === 0; if (done) orthoRes(); if (done || pend % 40 === 0) { orthoTex.needsUpdate = true; uOrthoOn.value = orthoWant ? 1 : 0; }
      };
      im.onerror = () => { if (--pend === 0) { orthoRes(); orthoTex.needsUpdate = true; uOrthoOn.value = orthoWant && orthoOK ? 1 : 0; } };
      im.src = `data/${data.cp || '73000'}/orthophoto/${o.z}/${x}/${y}.jpg`;
    }
  }
  // couvert arboré déduit de la photo (vert sombre = feuillage) : sert à planter des arbres là où l'image en montre
  let od = null;
  const canopy = (x, z) => {
    if (!orthoOK) return 0;
    if (!od) od = og.getImageData(0, 0, OS, OS).data;
    const i = Math.floor((x + RO) / (2 * RO) * OS), j = Math.floor((z + RO) / (2 * RO) * OS);
    if (i < 1 || j < 1 || i >= OS - 1 || j >= OS - 1) return 0;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = ((j + dj) * OS + i + di) * 4; if (od[k + 3] < 200) return 0; r += od[k]; g += od[k + 1]; b += od[k + 2]; n++; }
    r /= n; g /= n; b /= n; const L = 0.3 * r + 0.59 * g + 0.11 * b;
    if (g < r + 5 || g < b - 16) return 0;
    return L < 80 ? 1 : L < 98 ? (98 - L) / 18 : 0;
  };
  // --- orthophoto fine (z17) autour de la caméra, chargée à la demande par tile.php ---
  const HZ = 19, HS = 640, HN = 4096, hc = document.createElement('canvas'); hc.width = hc.height = HN;
  const hg = hc.getContext('2d'), hTex = new THREE.CanvasTexture(hc);
  hTex.colorSpace = THREE.SRGBColorSpace; hTex.flipY = false; hTex.anisotropy = 16; hTex.generateMipmaps = true; hTex.minFilter = THREE.LinearMipmapLinearFilter;
  const uOh = { value: new THREE.Vector3(0, 0, 0) }, tileCache = new Map(); let hTok = 0, hcx = 1e9, hcz = 1e9;
  const refreshOrtho = (cx, cz) => {
    if (!data.center || !data.ortho) return;
    const tok = ++hTok, [lat0, lon0] = data.center, nT = 2 ** HZ, cl = Math.cos(lat0 * Math.PI / 180);
    const lon = (x) => x / nT * 360 - 180, lat = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / nT))) * 180 / Math.PI;
    const wx = (lo) => (lo - lon0) * 111320 * cl, wz = (la) => -(la - lat0) * 110540;
    const tx = (X) => Math.floor((X / (111320 * cl) + lon0 + 180) / 360 * nT);
    const ty = (Z) => { const l = (lat0 - Z / 110540) * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * nT); };
    const x0 = tx(cx - HS / 2), x1 = tx(cx + HS / 2), y0 = ty(cz - HS / 2), y1 = ty(cz + HS / 2), sc = HN / HS, ox = cx - HS / 2, oz = cz - HS / 2;
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = x + '/' + y;
      let p = tileCache.get(key);
      if (!p) { p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `tile.php?cp=${data.cp || '73000'}&z=${HZ}&x=${x}&y=${y}`; }); tileCache.set(key, p); if (tileCache.size > 900) tileCache.delete(tileCache.keys().next().value); }
      jobs.push(p.then((im) => ({ im, x, y })));
    }
    Promise.all(jobs).then((L) => {
      if (tok !== hTok) return;
      hg.clearRect(0, 0, HN, HN);
      for (const { im, x, y } of L) if (im) {
        const ax = (wx(lon(x)) - ox) * sc, az = (wz(lat(y)) - oz) * sc, bx = (wx(lon(x + 1)) - ox) * sc, bz = (wz(lat(y + 1)) - oz) * sc;
        hg.drawImage(im, ax - 0.5, az - 0.5, bx - ax + 1, bz - az + 1);
      }
      hTex.needsUpdate = true; uOh.value.set(cx, cz, HS); hcx = cx; hcz = cz;
    });
  };
  const setOrtho = (on) => { orthoWant = on; uOrthoOn.value = on && orthoOK ? 1 : 0; };

  const ORU = { uOrtho: { value: orthoTex }, uOrthoOn, uOh, uOhT: { value: hTex }, uRO: { value: RO } };
  const uFlat = { value: 0 };   // "rendu maquette" : écrase la couleur du sol par un ton pâle façon papier (cf. setStyle ci-dessous)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAreas = { value: tex }; sh.uniforms.uR = { value: R };
    sh.uniforms.uLocal = { value: locTex }; sh.uniforms.uLoc = uLoc; sh.uniforms.uNoise = { value: NOISE }; Object.assign(sh.uniforms, ORU);
    sh.uniforms.uBldG = { value: bldTex }; sh.uniforms.uBldL = { value: bldLocTex }; sh.uniforms.uFlat = uFlat;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uAreas; uniform sampler2D uLocal; uniform sampler2D uNoise; uniform sampler2D uOrtho; uniform float uOrthoOn; uniform vec3 uOh; uniform sampler2D uOhT; uniform float uRO; uniform sampler2D uBldG; uniform sampler2D uBldL; uniform float uFlat;\nuniform float uR; uniform vec3 uLoc;\nvarying vec2 vXZ;')
      .replace('#include <color_fragment>', `
        vec4 ar = texture2D(uAreas, (vXZ + uR) / (2.0 * uR));
        vec2 luv = (vXZ - uLoc.xy) / uLoc.z + 0.5;
        float lin = step(abs(luv.x - 0.5), 0.47) * step(abs(luv.y - 0.5), 0.47) * step(1.0, uLoc.z);
        if (lin > 0.5) ar = texture2D(uLocal, luv);
        diffuseColor.rgb = mix(vColor, ar.rgb, ar.a * 0.92);
        // relief de matière : bruits pavables à 3 échelles (les mipmaps les fondent au loin)
        vec4 n1 = texture2D(uNoise, vXZ / 2.1), n2 = texture2D(uNoise, vXZ / 9.0 + 0.37), n3 = texture2D(uNoise, vXZ / 47.0 + 0.71);
        float gv = 0.62 + 0.55 * (0.45 * n1.r + 0.35 * n2.g + 0.20 * n3.b);
        float urb = smoothstep(0.55, 0.75, dot(ar.rgb, vec3(0.33)) );             // zones minérales (fond clair) vs végétales
        diffuseColor.rgb *= mix(gv, 0.80 + 0.35 * n1.g * n2.r + 0.08 * n3.b, urb * ar.a);
        diffuseColor.rgb *= 1.0 - 0.25 * n1.a * urb * ar.a;
        vec2 ouv = (vXZ + uRO) / (2.0 * uRO);
        vec4 oc = texture2D(uOrtho, ouv);
        float om = oc.a * uOrthoOn * step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
        vec3 photo = oc.rgb / max(oc.a, 0.001);
        if (uOh.z > 1.0) {
          vec2 huv = (vXZ - uOh.xy) / uOh.z + 0.5;
          vec2 e = min(huv, 1.0 - huv);
          float hw = smoothstep(0.0, 0.06, min(e.x, e.y));
          vec4 hc = texture2D(uOhT, huv);
          float ha = hc.a * hw;
          photo = mix(photo, hc.rgb / max(hc.a, 0.001), ha);
          om = max(om, ha * uOrthoOn);
        }
        float pl = dot(photo, vec3(0.299, 0.587, 0.114));
        photo = mix(vec3(pl), photo, 0.8) * vec3(1.04, 1.0, 0.92) * 0.78 * (0.85 + 0.3 * (0.5 * n1.r + 0.5 * n2.g));
        photo = clamp(photo, 0.0, 0.62);
        diffuseColor.rgb = mix(diffuseColor.rgb, photo, om * 0.9);
        // liseré des bâtiments : recouvert par la photo aérienne ci-dessus, on le redessine donc par-dessus (proportionnellement
        // à om, donc sans rien changer quand la photo est désactivée) pour garder les bâtiments lisibles sur fond de photo
        float bld = mix(texture2D(uBldG, (vXZ + uR) / (2.0 * uR)).a, texture2D(uBldL, luv).a, lin);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.631, 0.616, 0.573), bld * om * 0.65);
        // "rendu maquette" : sol pâle façon papier/carton. PAS un aplat uniforme (ça fait "rendu 3D", pas "fait main") :
        // grandes plaques de teinte légèrement différente (n3, bruit à grande échelle déjà calculé ci-dessus, ~47 m)
        // façon panneaux de carton assemblés, + le grain fin (gv) déjà calculé pour la texture de surface.
        vec3 paperG = mix(vec3(0.90, 0.88, 0.80), vec3(0.97, 0.94, 0.87), n3.g);
        diffuseColor.rgb = mix(diffuseColor.rgb, paperG * gv, uFlat);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  // masque forêt -> échantillonneur
  const md = mg.getImageData(0, 0, 2048, 2048).data;
  const inForest = (x, z) => {
    const i = Math.floor((x + R) * km), j = Math.floor((z + R) * km);
    return i >= 0 && j >= 0 && i < 2048 && j < 2048 && md[(j * 2048 + i) * 4] > 127;
  };
  return { orthoPixel: (x, z) => { if (!od) od = og.getImageData(0, 0, OS, OS).data; const i = Math.floor((x + RO) / (2 * RO) * OS), j = Math.floor((z + RO) / (2 * RO) * OS), k = (j * OS + i) * 4; return [od[k], od[k + 1], od[k + 2], od[k + 3]]; }, canopy, orthoReady, orthoU: ORU, setOrtho, mesh, heightAt, normalAt, hOff, R, inForest, refreshLocal, localCenter: () => [lcx, lcz], NOISE, hasRelief: !!elev, absElev: (x, z) => heightAt(x, z) + hOff, setStyle(flat) { uFlat.value = flat ? 1 : 0; } };
}
