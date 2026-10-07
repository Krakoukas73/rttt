import * as THREE from 'three';
const rnd = (i) => { const x = Math.sin(i * 12.9898 + 7.3) * 43758.5453; return x - Math.floor(x); };

// ---- bruit de valeur 3D (pour bosseler les feuillages) ----
const h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const sm = (t) => t * t * (3 - 2 * t);
function vn(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
           l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}

// ---- construction de géométries d'arbres (indexées, normales lissées, couleur de sommet + drapeau feuillage) ----
function weld(g) {   // polyèdre non indexé -> indexé
  const p = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  return { pos, idx };
}
class Builder {
  constructor() { this.pos = []; this.col = []; this.leaf = []; this.idx = []; }
  add(pos, idx, col, leaf) {
    const base = this.pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) this.pos.push(pos[i], pos[i + 1], pos[i + 2]);
    for (let i = 0; i < col.length; i++) this.col.push(col[i]);
    for (let i = 0; i < pos.length / 3; i++) this.leaf.push(leaf);
    for (const i of idx) this.idx.push(base + i);
  }
  // masse de feuillage bosselée
  blob(cx, cy, cz, rx, ry, rz, detail, seed, bump = 0.30, dark = 0.0) {
    const { pos, idx } = weld(new THREE.IcosahedronGeometry(1, detail)), P = [], C = [];
    for (let i = 0; i < pos.length; i += 3) {
      const l = Math.hypot(pos[i], pos[i + 1], pos[i + 2]), dx = pos[i] / l, dy = pos[i + 1] / l, dz = pos[i + 2] / l;
      const b = 1 + bump * (vn(dx * 1.8 + seed, dy * 1.8 + seed * 0.7, dz * 1.8) - 0.5) * 2 + bump * 0.35 * (vn(dx * 5 + seed, dy * 5, dz * 5 - seed) - 0.5) * 2;
      P.push(cx + dx * rx * b, cy + dy * ry * b, cz + dz * rz * b);
      const shade = (0.58 + 0.42 * (dy * 0.5 + 0.5)) * (0.86 + 0.28 * vn(dx * 3 + seed, dy * 3, dz * 3)) * (1 - dark);
      C.push(shade, shade, shade);
    }
    this.add(P, idx, C, 1);
  }
  trunk(h, r0, r1, seg, colr = [0.36, 0.26, 0.18], x = 0, z = 0, lean = 0) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, 3, false); g.translate(x, h / 2, z);
    const p = g.attributes.position, pos = [], col = [];
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h, nz = 0.85 + 0.3 * vn(p.getX(i) * 4, p.getY(i) * 2, p.getZ(i) * 4);
      pos.push(p.getX(i) + lean * t * t, p.getY(i), p.getZ(i)); col.push(colr[0] * nz, colr[1] * nz, colr[2] * nz);
    }
    this.add(pos, Array.from(g.index.array), col, 0);
  }
  cone(cy, r, h, seg, seed, dark = 0) {
    const g = new THREE.ConeGeometry(r, h, seg, 2, true); g.translate(0, cy + h / 2, 0);
    const p = g.attributes.position, pos = [], col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + 0.16 * (vn(x * 1.3 + seed, y * 0.9, z * 1.3) - 0.5) * 2, sag = -0.16 * Math.hypot(x, z) * (r > 0 ? 1 : 0);
      pos.push(x * d, y + sag * ((y - cy) < h * 0.5 ? 1 : 0.2), z * d);
      const s = (0.55 + 0.5 * ((y - cy) / h)) * (0.85 + 0.3 * vn(x * 2 + seed, y * 2, z * 2)) * (1 - dark); col.push(s, s, s);
    }
    // cône ouvert : on referme le dessous
    this.add(pos, Array.from(g.index.array), col, 1);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leaf, 1));
    g.setIndex(this.idx); g.computeVertexNormals(); return g;
  }
}

const BARK = [0.38, 0.28, 0.20], BIRCH = [0.86, 0.85, 0.80], PINE = [0.46, 0.30, 0.20];
// lod 0 = proche (détaillé), 1 = intermédiaire, 2 = lointain
const SPECIES = {
  oak(lod) {
    const b = new Builder(), d = [2, 1, 1][lod], s = 11;   // détail réduit d'un cran (qualité arbres/buissons abaissée à la demande)
    b.trunk(3.4, 0.42, 0.26, lod < 2 ? 6 : 4, BARK);
    b.blob(0, 6.2, 0, 2.9, 2.6, 2.9, d, s);
    if (lod < 2) { b.blob(1.9, 5.5, 0.6, 1.9, 1.7, 1.9, d, s + 3); b.blob(-1.7, 5.7, -0.9, 1.9, 1.8, 1.9, d, s + 5); }
    if (lod < 1) { b.blob(0.3, 7.6, 1.5, 1.7, 1.5, 1.7, d, s + 7); b.blob(-0.6, 7.4, -1.6, 1.6, 1.4, 1.6, d, s + 9); b.blob(1.0, 4.4, -1.5, 1.4, 1.2, 1.4, d, s + 11, 0.3, 0.12); }
    return b.build();
  },
  plane(lod) {
    const b = new Builder(), d = [2, 1, 1][lod], s = 31;   // détail réduit d'un cran
    b.trunk(4.8, 0.36, 0.24, lod < 2 ? 6 : 4, [0.55, 0.50, 0.42]);
    b.blob(0, 8.0, 0, 2.5, 3.3, 2.5, d, s);
    if (lod < 2) { b.blob(1.2, 6.6, 0.4, 1.6, 1.8, 1.6, d, s + 2); b.blob(-1.1, 6.9, -0.6, 1.6, 1.7, 1.6, d, s + 4); }
    if (lod < 1) b.blob(0, 10.2, 0.2, 1.5, 1.6, 1.5, d, s + 6);
    return b.build();
  },
  poplar(lod) {
    const b = new Builder(), d = [2, 1, 1][lod], s = 51;
    b.trunk(2.4, 0.3, 0.2, lod < 2 ? 6 : 4, BARK);
    b.blob(0, 5.5, 0, 1.5, 3.0, 1.5, d, s, 0.22);
    if (lod < 2) { b.blob(0, 8.5, 0, 1.3, 2.8, 1.3, d, s + 2, 0.2); b.blob(0, 11.5, 0, 0.95, 2.4, 0.95, d, s + 4, 0.2); }
    return b.build();
  },
  spruce(lod) {
    const b = new Builder(), seg = [8, 6, 4][lod], n = [7, 5, 4][lod];   // détail réduit
    b.trunk(2.0, 0.3, 0.16, lod < 2 ? 6 : 4, [0.32, 0.22, 0.15]);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), r = 2.7 * (1 - t * 0.85), h = 11 / n * 1.7; b.cone(1.4 + t * 8.6, r, h, seg, 71 + i * 3, 0.10); }
    return b.build();
  },
  pine(lod) {
    const b = new Builder(), d = [2, 1, 1][lod], s = 91;
    b.trunk(7.2, 0.3, 0.17, lod < 2 ? 6 : 4, PINE, 0, 0, 0.6);
    b.blob(0.4, 8.6, 0, 2.5, 1.0, 2.3, d, s, 0.35, 0.12);
    if (lod < 2) { b.blob(-1.3, 7.2, 0.8, 1.7, 0.75, 1.6, d, s + 2, 0.35, 0.12); b.blob(1.5, 7.6, -0.9, 1.5, 0.7, 1.5, d, s + 4, 0.35, 0.12); }
    return b.build();
  },
  birch(lod) {
    const b = new Builder(), d = [2, 1, 1][lod], s = 121;
    b.trunk(4.6, 0.2, 0.12, lod < 2 ? 6 : 4, BIRCH, 0, 0, 0.35);
    b.blob(0.2, 6.6, 0, 1.7, 2.2, 1.7, d, s, 0.34);
    if (lod < 2) { b.blob(-0.9, 5.4, 0.6, 1.2, 1.2, 1.2, d, s + 2, 0.34); b.blob(0.9, 5.2, -0.6, 1.15, 1.2, 1.15, d, s + 4, 0.34); }
    return b.build();
  },
  bush(lod) {
    const b = new Builder(), d = [1, 1, 1][lod], s = 151;   // buissons très nombreux (dizaines de milliers d'instances) : détail réduit au minimum lisible
    b.blob(0, 0.75, 0, 1.15, 0.85, 1.15, d, s, 0.4);
    if (lod < 2) { b.blob(0.8, 0.55, 0.4, 0.8, 0.6, 0.8, d, s + 2, 0.4); b.blob(-0.7, 0.6, -0.5, 0.85, 0.65, 0.85, d, s + 4, 0.4); }
    return b.build();
  },
};
// teinte du feuillage : [h, dh, s, l, dl]
const TINT = { oak: [0.25, 0.04, 0.42, 0.34, 0.07], plane: [0.24, 0.03, 0.46, 0.40, 0.06], poplar: [0.21, 0.03, 0.52, 0.42, 0.06], spruce: [0.37, 0.03, 0.36, 0.22, 0.04],
  pine: [0.31, 0.03, 0.34, 0.26, 0.04], birch: [0.19, 0.03, 0.52, 0.48, 0.06], bush: [0.27, 0.05, 0.42, 0.34, 0.08] };
const SIZE = { oak: [0.85, 0.75], plane: [0.85, 0.5], poplar: [0.8, 0.6], spruce: [0.8, 0.9], pine: [0.85, 0.7], birch: [0.8, 0.5], bush: [0.7, 0.9] };

export function buildVegetation(data, terrain) {
  const spots = [];   // [x, z, espèce, graine]
  let id = 0;
  const pick = (table, u) => { let a = 0; for (const [k, w] of table) { a += w; if (u < a) return k; } return table[table.length - 1][0]; };
  const T_OSM = [['oak', 0.36], ['plane', 0.2], ['birch', 0.1], ['bush', 0.12], ['spruce', 0.1], ['poplar', 0.06], ['pine', 0.06]];
  const T_STREET = [['plane', 0.55], ['oak', 0.15], ['poplar', 0.1], ['birch', 0.1], ['bush', 0.1]];
  const T_GARDEN = [['oak', 0.2], ['birch', 0.12], ['bush', 0.4], ['plane', 0.08], ['spruce', 0.08], ['pine', 0.06], ['poplar', 0.06]];
  const GEN = { quercus: 'oak', tilia: 'plane', platanus: 'plane', aesculus: 'plane', acer: 'plane', fraxinus: 'oak', fagus: 'oak', ginkgo: 'birch', betula: 'birch', populus: 'poplar', salix: 'birch', carpinus: 'oak', prunus: 'birch', picea: 'spruce', abies: 'spruce', pinus: 'pine', cedrus: 'pine', cupressus: 'poplar', taxus: 'spruce' };
  const T_BR = [['oak', 0.4], ['plane', 0.32], ['birch', 0.12], ['bush', 0.06], ['poplar', 0.1]], T_NE = [['spruce', 0.65], ['pine', 0.35]];
  for (const t of (data.treesx || data.trees.map(([x, z]) => ({ x, z })))) {   // arbres OSM : essence / feuillage / hauteur / couronne quand ils sont renseignés
    const x = t.x ?? t[0], z = t.z ?? t[1]; let sp = t.g && GEN[t.g];
    if (!sp) sp = t.lt === 'n' ? pick(T_NE, rnd(id++)) : t.lt === 'b' ? pick(T_BR, rnd(id++)) : pick(T_OSM, rnd(id++));
    spots.push([x, z, sp, id, t.h || t.cr ? { h: t.h, cr: t.cr } : null]);
  }

  // --- masque "occupé" (bâtiments, routes) et "vert" (parcs, jardins) ---
  const M = 2732, RM = 4000, km = M / (2 * RM);   // RM doit couvrir le rayon max de génération d'arbres (foret RAD=3800, canopy IGN RAD=3900) : sinon les points au-dela de RM tombent hors du canevas d'exclusion eau/bati (at() renvoie false hors bornes) et ne sont JAMAIS filtres, meme s'ils sont en pleine mer (constate sur Ouessant : arbres flottant au large au-dela de l'ancien RM=3000, la ou l'ancienne resolution photo aerienne detecte a tort des champs de laminaires/algues comme un couvert arbore). M ajuste en proportion pour garder la meme resolution (~2.93 m/px) qu'avant.
  const mkc = () => { const c = document.createElement('canvas'); c.width = c.height = M; return c; };
  const cb = mkc(), gb = cb.getContext('2d', { willReadFrequently: true }), cg = mkc(), gg = cg.getContext('2d', { willReadFrequently: true });
  gb.fillStyle = gb.strokeStyle = '#fff'; gg.fillStyle = '#fff';
  const tr = (g, rings) => { g.beginPath(); for (const r of rings) { r.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, (x + RM) * km, (z + RM) * km)); g.closePath(); } };
  gb.lineJoin = 'round'; gb.lineWidth = 5 * km;
  for (const b of data.buildings) { if (Math.abs(b.p[0][0]) > RM || Math.abs(b.p[0][1]) > RM) continue; tr(gb, [b.p]); gb.fill(); gb.stroke(); }
  gb.lineCap = 'round';
  for (const r of data.roads || []) if (r.k <= 7 || r.k === 9) {   // voies ferrées incluses : jamais d'arbre sur les rails
    gb.lineWidth = (r.k === 9 ? 9 : ((r.w || (r.k <= 1 ? 10 : r.k <= 4 ? 6 : 3)) + 2.5)) * km; gb.beginPath();
    r.p.forEach(([x, z], i) => (i ? gb.lineTo : gb.moveTo).call(gb, (x + RM) * km, (z + RM) * km)); gb.stroke();
  }
  const GK = { grass: 0.55, sport: 0, cem: 0.5, res: 0.12, farm: 0.05 };
  const gArr = {};
  for (const t of Object.keys(GK)) { gg.clearRect(0, 0, M, M); gg.fillStyle = '#fff'; for (const a of data.areas || []) if (a.t === t) { tr(gg, a.p); gg.fill('evenodd'); } gArr[t] = gg.getImageData(0, 0, M, M).data; }
  // eau (rivières, ruisseaux, plans d'eau) : jamais d'arbre dedans
  const cw = mkc(), gw = cw.getContext('2d', { willReadFrequently: true });
  gw.fillStyle = gw.strokeStyle = '#fff'; gw.lineCap = gw.lineJoin = 'round';
  for (const r of data.roads || []) if (r.k >= 10 && r.p.length > 1) {
    gw.lineWidth = ((r.w || (r.k === 10 ? 11 : 2.6)) + 4) * km; gw.beginPath();
    r.p.forEach(([x, z], i) => (i ? gw.lineTo : gw.moveTo).call(gw, (x + RM) * km, (z + RM) * km)); gw.stroke();
  }
  for (const a of data.areas || []) if (a.t === 'water' || a.t === 'sea' || a.t === 'sport' || a.t === 'pool' || a.t === 'track') { tr(gw, a.p); gw.fill('evenodd'); gw.lineWidth = 4 * km; gw.stroke(); }
  const wArr = gw.getImageData(0, 0, M, M).data;
  const bArr = gb.getImageData(0, 0, M, M).data;
  const at = (arr, x, z) => { const i = Math.floor((x + RM) * km), j = Math.floor((z + RM) * km); return i >= 0 && j >= 0 && i < M && j < M && arr[(j * M + i) * 4 + 3] > 127; };
  const blocked = (x, z) => at(bArr, x, z);

  // --- forêts ---
  if ((data.areas || []).some((a) => a.t === 'forest')) {
    const RAD = 3800, STEP = 13, forest = [];
    for (let x = -RAD; x <= RAD; x += STEP) for (let z = -RAD; z <= RAD; z += STEP) {
      const jx = x + (rnd(id++) - 0.5) * STEP, jz = z + (rnd(id++) - 0.5) * STEP;
      if (jx * jx + jz * jz > RAD * RAD || !terrain.inForest(jx, jz)) continue;
      const e = terrain.absElev(jx, jz), conif = rnd(id++) < THREE.MathUtils.smoothstep(e, 500, 1000) * 0.85 + 0.15, u = rnd(id++);
      forest.push([jx, jz, conif ? (u < 0.72 ? 'spruce' : 'pine') : (u < 0.62 ? 'oak' : u < 0.82 ? 'birch' : u < 0.92 ? 'plane' : 'poplar'), id]);
    }
    for (let i = forest.length - 1; i > 0 && forest.length > 80000; i--) forest.splice(Math.floor(rnd(i) * forest.length), 1);
    spots.push(...forest);
  }
  // --- couvert arboré vu sur la photo IGN mais absent des données OSM ---
  if (terrain.canopy) {
    const RAD = 3900, STEP = 12; let nIgn = 0;
    for (let x = -RAD; x <= RAD; x += STEP) for (let z = -RAD; z <= RAD; z += STEP) {
      const jx = x + (rnd(id++) - 0.5) * STEP, jz = z + (rnd(id++) - 0.5) * STEP;
      if (jx * jx + jz * jz > RAD * RAD || terrain.inForest(jx, jz) || blocked(jx, jz)) continue;
      const cv = terrain.canopy(jx, jz); if (cv <= 0 || rnd(id++) > cv * 0.9) continue;
      const e = terrain.absElev(jx, jz), conif = rnd(id++) < THREE.MathUtils.smoothstep(e, 500, 1000) * 0.85 + 0.12, u = rnd(id++);
      spots.push([jx, jz, conif ? (u < 0.72 ? 'spruce' : 'pine') : (u < 0.55 ? 'oak' : u < 0.75 ? 'birch' : u < 0.9 ? 'plane' : 'poplar'), id]); nIgn++;
    }
    window.__ignTrees = nIgn;
  }
  // --- arbres d'alignement le long des voies ---
  const street = [];
  for (const r of data.roads || []) {
    if (r.k < 1 || r.k > 6 || r.p.length < 2) continue;
    const w = r.w || (r.k <= 1 ? 10.5 : r.k <= 3 ? 8 : r.k === 4 ? 5.6 : 4);
    let acc = rnd(id++) * 14, side = rnd(id++) < 0.5 ? 1 : -1;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], L = Math.hypot(x2 - x1, z2 - z1) || 1, nx = (z2 - z1) / L, nz = -(x2 - x1) / L;
      for (let d = 0; d < L; d += 1) {
        if (--acc > 0) continue; acc = 13 + rnd(id++) * 9; side = -side;
        if (rnd(id++) > (r.k <= 4 ? 0.5 : 0.28)) continue;
        const off = (w / 2 + 3.6) * side, t = d / L, x = x1 + (x2 - x1) * t + nx * off, z = z1 + (z2 - z1) * t + nz * off;
        if (blocked(x, z)) continue;
        street.push([x, z, pick(T_STREET, rnd(id++)), id]);
      }
    }
  }
  spots.push(...street);
  // buissons / haies en bordure des routes secondaires et résidentielles (à l'écart de la chaussée, hors bâti)
  { const verge = [];
    for (const r of data.roads || []) {
      if (r.k < 3 || r.k > 6 || r.p.length < 2) continue;
      const w = r.w || (r.k <= 3 ? 8 : r.k === 4 ? 5.6 : 4);
      let acc = rnd(id++) * 6;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], L = Math.hypot(x2 - x1, z2 - z1) || 1, nx = (z2 - z1) / L, nz = -(x2 - x1) / L;
        for (let d = 0; d < L; d += 1) {
          if (--acc > 0) continue; acc = 4 + rnd(id++) * 7;
          if (rnd(id++) > 0.45) continue;
          const side = rnd(id++) < 0.5 ? 1 : -1, off = (w / 2 + 2.1 + rnd(id++) * 1.2) * side, t = d / L, x = x1 + (x2 - x1) * t + nx * off, z = z1 + (z2 - z1) * t + nz * off;
          if (blocked(x, z)) continue;
          verge.push([x, z, 'bush', id]);
        }
      }
    }
    for (let i = verge.length - 1; i > 0 && verge.length > 40000; i--) verge.splice(Math.floor(rnd(i) * verge.length), 1);
    spots.push(...verge); window.__vergeBushes = verge.length; }
  // --- parcs et jardins ---
  const gardens = [], GS = 11;
  for (let x = -RM; x < RM; x += GS) for (let z = -RM; z < RM; z += GS) {
    const jx = x + rnd(id++) * GS, jz = z + rnd(id++) * GS;
    if (blocked(jx, jz) || terrain.inForest(jx, jz)) continue;
    let p = 0; for (const t of Object.keys(GK)) if (at(gArr[t], jx, jz)) { p = Math.max(p, GK[t]); }
    if (p > 0 && rnd(id++) < p) gardens.push([jx, jz, pick(T_GARDEN, rnd(id++)), id]);
  }
  for (let i = gardens.length - 1; i > 0 && gardens.length > 60000; i--) gardens.splice(Math.floor(rnd(i) * gardens.length), 1);
  spots.push(...gardens);
  // buissons supplémentaires (massifs, haies) dans les parcs, squares et cimetières : pas fin de 6 m, par petits groupes
  { const BS = 6, bushes = [], PB = { grass: 0.34, cem: 0.22 };
    for (let x = -RM; x < RM; x += BS) for (let z = -RM; z < RM; z += BS) {
      const jx = x + rnd(id++) * BS, jz = z + rnd(id++) * BS;
      if (blocked(jx, jz) || terrain.inForest(jx, jz)) continue;
      let p = 0; for (const t of ['grass', 'cem']) if (at(gArr[t], jx, jz)) p = Math.max(p, PB[t]);
      if (p <= 0 || rnd(id++) > p * 0.5) continue;
      const n = 1 + Math.floor(rnd(id++) * 3);
      for (let k = 0; k < n; k++) { const bx = jx + (rnd(id++) - 0.5) * 3.2, bz = jz + (rnd(id++) - 0.5) * 3.2; if (!blocked(bx, bz)) bushes.push([bx, bz, 'bush', id]); }
    }
    for (let i = bushes.length - 1; i > 0 && bushes.length > 50000; i--) bushes.splice(Math.floor(rnd(i) * bushes.length), 1);
    spots.push(...bushes); window.__parkBushes = bushes.length; }

  { let k = 0; for (let i = 0; i < spots.length; i++) if (!at(wArr, spots[i][0], spots[i][1])) spots[k++] = spots[i]; window.__wetRemoved = spots.length - k; spots.length = k; }
  // jamais d'arbre sur la chaussée : test précis de distance à l'axe des voies (le masque bitmap, trop grossier, en laissait passer)
  { const CS = 24, sg = new Map(), hw = (r) => r.k === 9 ? 4.5 : (r.w || [14, 10.5, 8.5, 7.2, 5.6, 3.5, 3.2, 2.4][r.k] || 3) / 2 + 1.3;
    for (const r of data.roads || []) { if ((r.k > 6 && r.k !== 9) || r.p.length < 2) continue; const h = hw(r);
      for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], sgm = [x1, z1, x2, z2, h];
        for (let cx = Math.floor((Math.min(x1, x2) - h) / CS); cx <= Math.floor((Math.max(x1, x2) + h) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - h) / CS); cz <= Math.floor((Math.max(z1, z2) + h) / CS); cz++) { const k = cx * 100003 + cz; let a = sg.get(k); if (!a) sg.set(k, a = []); a.push(sgm); } } }
    let k = 0; for (let i = 0; i < spots.length; i++) { const [x, z] = spots[i]; let bad = false;
      for (const [x1, z1, x2, z2, h] of sg.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)) || []) { const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), ex = x1 + dx * t - x, ez = z1 + dz * t - z; if (ex * ex + ez * ez < h * h) { bad = true; break; } }
      if (!bad) spots[k++] = spots[i]; }
    window.__roadTreesRemoved = spots.length - k; spots.length = k; }
  // --- matrices et couleurs pré-calculées par espèce ---
  const group = new THREE.Group(), by = {};
  for (const s of spots) (by[s[2]] = by[s[2]] || []).push(s);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3(), Pp = new THREE.Vector3(), C = new THREE.Color(), UP = THREE.Object3D.DEFAULT_UP;
  const T0 = 145, T1 = 552;   // -15 % à la demande (170/650 -> 145/552) : bascule vers un niveau de détail inférieur plus tôt
  const uFlatVeg = { value: 0 };   // "rendu maquette" : écrase la couleur du feuillage/écorce par un ton pâle façon papier (cf. setStyle)
  const mkMat = (lod) => { const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: terrain.NOISE }; sh.uniforms.uFlatVeg = uFlatVeg;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uNoise; uniform float uFlatVeg; varying vec3 vLP; varying float vLf; varying float vLD;
        vec2 hsL(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
        vec4 vorL(vec2 p){ vec2 ip = floor(p), fp = fract(p); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 h = hsL(ip + g); vec2 r = g + h - fp; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; id = ip + g; } else if (d < d2) d2 = d; }
          return vec4(sqrt(d1), sqrt(d2) - sqrt(d1), hsL(id + 7.3).x, 0.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { // fondu par tramage entre niveaux de détail : jamais d'apparition brutale
          float t0 = smoothstep(${(T0 * 0.9).toFixed(1)}, ${(T0 * 1.1).toFixed(1)}, vLD), t1 = smoothstep(${(T1 * 0.9).toFixed(1)}, ${(T1 * 1.1).toFixed(1)}, vLD);
          float h = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          ${lod === 0 ? 'if (h >= 1.0 - t0) discard;' : lod === 1 ? 'if (h < 1.0 - t0 || h >= 1.0 - t1) discard;' : 'if (h < 1.0 - t1) discard;'}
        }
        ${lod === 0 ? `
        float ln = 0.45 * texture2D(uNoise, vLP.xz * 0.55 + vLP.y * 0.21).r + 0.35 * texture2D(uNoise, vLP.zy * 0.95 + 0.3).r + 0.20 * texture2D(uNoise, vLP.xy * 2.1).r;
        diffuseColor.rgb *= mix(1.0, 0.55 + 0.95 * ln, vLf);
        { // feuillage : mosaïque de feuilles (cellules de Voronoï) à fort contraste ; écorce : sillons verticaux profonds - qualité
          // maximale réservée au LOD 0 (arbres proches, peu nombreux à l'écran à la fois) : LOD 1/2 utilisent une variante
          // allégée ci-dessous (moitié moins de textures/voronoï, à la demande - ces LOD couvrent l'immense majorité des
          // instances rendues à un instant donné, donc l'essentiel du coût de calcul par pixel).
          vec3 fol; { vec2 p1 = vLP.xz * 2.3 + vLP.y * vec2(1.15, 1.55), p2 = vLP.zy * 5.2 + vLP.x * 1.3;
            vec4 v1 = vorL(p1), v2 = vorL(p2);
            float t1 = 0.68 + 0.50 * v1.z, t2 = 0.83 + 0.28 * v2.z;
            float e1 = smoothstep(0.0, 0.55, v1.y), e2 = smoothstep(0.0, 0.42, v2.y);
            fol = diffuseColor.rgb * t1 * t2 * mix(0.78, 1.05, e1) * mix(0.90, 1.02, e2);
            fol = mix(fol, fol * vec3(1.16, 1.07, 0.62), step(0.82, v1.z) * 0.5);        // feuilles jaunies / éclaircies
            fol = mix(fol, fol * vec3(0.80, 0.97, 0.82), step(v1.z, 0.12) * 0.45); }        // feuilles sombres
          vec4 vb = vorL(vec2((vLP.x + vLP.z) * 9.0, vLP.y * 1.3)), vb2 = vorL(vec2((vLP.x - vLP.z) * 22.0, vLP.y * 3.0));
          vec3 bark = diffuseColor.rgb * (0.45 + 0.9 * vb.z) * mix(0.25, 1.1, smoothstep(0.0, 0.16, vb.y)) * (0.75 + 0.35 * vb2.z);
          float mo = texture2D(uNoise, vLP.xz * 4.0 + vLP.y * 1.3).b; bark = mix(bark, bark * vec3(0.55, 0.85, 0.4), smoothstep(0.62, 0.86, mo) * 0.55);
          diffuseColor.rgb = mix(bark, fol, smoothstep(0.3, 0.7, vLf));
        }` : `
        float ln = 0.55 * texture2D(uNoise, vLP.xz * 0.55 + vLP.y * 0.21).r + 0.45 * texture2D(uNoise, vLP.zy * 0.95 + 0.3).r;
        diffuseColor.rgb *= mix(1.0, 0.55 + 0.95 * ln, vLf);
        { // version allégée (LOD 1/2) : un seul octave de voronoï feuillage/écorce au lieu de deux, pas de texture de mousse
          vec3 fol; { vec2 p1 = vLP.xz * 2.3 + vLP.y * vec2(1.15, 1.55);
            vec4 v1 = vorL(p1);
            float t1 = 0.68 + 0.50 * v1.z, e1 = smoothstep(0.0, 0.55, v1.y);
            fol = diffuseColor.rgb * t1 * mix(0.78, 1.05, e1);
            fol = mix(fol, fol * vec3(1.16, 1.07, 0.62), step(0.82, v1.z) * 0.5);
            fol = mix(fol, fol * vec3(0.80, 0.97, 0.82), step(v1.z, 0.12) * 0.45); }
          vec4 vb = vorL(vec2((vLP.x + vLP.z) * 9.0, vLP.y * 1.3));
          vec3 bark = diffuseColor.rgb * (0.45 + 0.9 * vb.z) * mix(0.25, 1.1, smoothstep(0.0, 0.16, vb.y));
          diffuseColor.rgb = mix(bark, fol, smoothstep(0.3, 0.7, vLf));
        }`}
        // "rendu maquette" : feuillage/écorce pâles façon papier, un grain subtil (uNoise) plutôt qu'un aplat uniforme
        { // "rendu maquette" : chaque arbre = un pompon de papier légèrement différent (empreinte dérivée de sa propre
          // teinte d'origine vColor, déjà randomisée par arbre/essence), pas un aplat unique identique partout
          float bhV = fract(dot(vColor, vec3(12.9898, 78.233, 37.719)) * 43758.5453);
          vec3 paperV = mix(vec3(0.84, 0.88, 0.80), vec3(0.95, 0.94, 0.87), bhV);
          diffuseColor.rgb = mix(diffuseColor.rgb, paperV * (0.85 + 0.3 * texture2D(uNoise, vLP.xz * 0.6 + vLP.y * 0.2).r), uFlatVeg);
        }`);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLeaf; varying vec3 vLP; varying float vLf; varying float vLD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position; vLf = aLeaf;\n#ifdef USE_INSTANCING\nvLD = distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition);\n#else\nvLD = 0.0;\n#endif')
      .replace('#include <color_vertex>', `#if defined( USE_COLOR )
        vColor = color.rgb;
        #ifdef USE_INSTANCING_COLOR
          vColor *= mix(vec3(1.0), instanceColor.rgb, aLeaf);
        #endif
        #endif`);
  };
  mat.customProgramCacheKey = () => 'veg-lod' + lod;
  return mat; };
  const mats3 = [mkMat(0), mkMat(1), mkMat(2)];
  const LOD_D = [T0, T1];   // distances de bascule (avec zone de recouvrement ±20 %)
  const sets = [];
  for (const [name, list] of Object.entries(by)) {
    const n = list.length, mats = new Float32Array(n * 16), cols = new Float32Array(n * 3), xz = new Float32Array(n * 3);
    const [sz0, sz1] = SIZE[name], [h0, dh, sat, l0, dl] = TINT[name];
    list.forEach(([x, z, , g, ex], i) => {
      const r1 = rnd(g * 3 + 1), r2 = rnd(g * 3 + 2), r3 = rnd(g * 3 + 3), k = sz0 + r1 * sz1;
      // rotation horizontale aléatoire 0-360° (hash position + id : jamais deux arbres alignés identiques)
      Q.setFromAxisAngle(UP, (((Math.sin(x * 12.9898 + z * 78.233 + g * 0.618) * 43758.5453) % 1 + 1) % 1) * 6.2832);
      Pp.set(x, terrain.heightAt(x, z) - 0.15, z); Sc.set(k * (0.9 + r3 * 0.25), k * (0.85 + r1 * 0.35), k * (0.9 + r2 * 0.25));
      if (ex) { const kh = ex.h ? Math.max(0.45, Math.min(2.6, ex.h / 12)) / Math.max(0.5, Sc.y) : 1, kc = ex.cr ? Math.max(0.5, Math.min(2.4, ex.cr / 8)) / Math.max(0.5, Sc.x) : kh; Sc.x *= kc; Sc.z *= kc; Sc.y *= kh; }   // hauteur (m) et couronne (m) OSM
      M4.compose(Pp, Q, Sc); M4.toArray(mats, i * 16);
      const autumn = name !== 'spruce' && name !== 'pine' && name !== 'bush' && r3 > 0.94;
      C.setHSL(autumn ? 0.08 + r1 * 0.05 : h0 + (r2 - 0.5) * 2 * dh, autumn ? 0.6 : sat, l0 + (r3 - 0.5) * 2 * dl).toArray(cols, i * 3);
      xz[i * 3] = x; xz[i * 3 + 1] = z; xz[i * 3 + 2] = Pp.y;
    });
    const meshes = [0, 1, 2].map((lod) => {
      const m = new THREE.InstancedMesh(SPECIES[name](lod), mats3[lod], n); m.count = 0; m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      m.castShadow = lod < 2; m.receiveShadow = lod < 2; group.add(m); return m;
    });
    sets.push({ n, mats, cols, xz, meshes });
  }
  // affectation des instances au niveau de détail selon la distance à la caméra
  let lastX = 1e9, lastZ = 1e9, lastY = 1e9;
  const update = (cx, cz, cy = 0, force) => {
    // seuil relevé de 12 à 24 m : cette fonction parcourt TOUTES les instances (~12,6 ms mesurés sur 185 000 arbres à Chambéry) à
    // chaque appel - doubler la distance minimale entre 2 recalculs divise par ~2 la fréquence d'appel pendant un déplacement
    // continu de caméra (la cause principale des à-coups signalés), sans changement perceptible du niveau de détail affiché
    if (!force && Math.hypot(cx - lastX, cz - lastZ, cy - lastY) < 24) return; lastX = cx; lastZ = cz; lastY = cy;
    for (const S of sets) {
      const cnt = [0, 0, 0], cap = 7500 * 1e3;
      for (let i = 0; i < S.n; i++) {
        const d = Math.hypot(S.xz[i * 3] - cx, S.xz[i * 3 + 1] - cz, S.xz[i * 3 + 2] - cy);
        if (d > 7000) continue;
        for (let l = 0; l < 3; l++) {
          const lo = l ? LOD_D[l - 1] * 0.8 : 0, hi = l < 2 ? LOD_D[l] * 1.2 : 1e9;
          if (d < lo || d >= hi) continue;
          const m = S.meshes[l], k = cnt[l]++;
          m.instanceMatrix.array.set(S.mats.subarray(i * 16, i * 16 + 16), k * 16);
          m.instanceColor.array.set(S.cols.subarray(i * 3, i * 3 + 3), k * 3);
        }
      }
      S.meshes.forEach((m, l) => { m.count = cnt[l]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
    }
  };
  group.userData.update = update;
  return { group, count: spots.length, update, setStyle(flat) { uFlatVeg.value = flat ? 1 : 0; } };
}
