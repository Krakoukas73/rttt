import * as THREE from 'three';
import { makeFacadeTextures, makeRoofTexture } from './textures.js';

const rnd = (i) => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
// façades réalistes : surtout blancs cassés et gris, quelquefois pastel très léger ; les couleurs vives restent exceptionnelles (ACCENT, ~3 %)
const FACADES = ['#f0ede5', '#f0ede5', '#ebe7dc', '#ebe7dc', '#f4f2ec', '#e4e0d6', '#e4e0d6', '#dcd9d0', '#d5d2ca', '#d5d2ca', '#cbc8c0', '#c2bfb8', '#e8e2d2', '#e2dccb', '#ddd7c6', '#e6e0cf',
  '#dfe6ea', '#e3e7e6', '#e8dfe0', '#dfe5d9', '#eadfca', '#d9dde0'];
const ACCENT = ['#d8a26a', '#a9bfcf', '#c98d78', '#9db597', '#d9c27a', '#b9a3b8', '#b5583f', '#5f7a93', '#c9a227'];
const ROOFS = ['#5b6068', '#565b63', '#646870', '#4d525a', '#a3583b', '#9a5238', '#b5674a', '#6d5648', '#5e5f5b'];
const NAMED = { white: '#f2efe6', grey: '#a8a8a4', gray: '#a8a8a4', red: '#a4472f', brown: '#7a5a44', beige: '#dccfae', yellow: '#e0c976', orange: '#d38a4c',
  green: '#7d9a6b', blue: '#6d86a0', black: '#3d3d3f', pink: '#d9aaa0', cream: '#efe3c4', tan: '#c9b189' };
const FLAT_T = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'cabin', 'greenhouse', 'service', 'industrial', 'warehouse', 'retail', 'commercial',
  'supermarket', 'hangar', 'kiosk', 'container', 'parking', 'stable', 'barn', 'farm_auxiliary', 'sports_hall', 'office', 'hospital', 'school', 'university', 'public', 'train_station', 'transportation']);
const LOW_T = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'cabin', 'greenhouse', 'kiosk', 'container', 'service', 'stable', 'farm_auxiliary']);

function parseColor(s, fallback) {
  if (!s) return fallback;
  s = String(s).toLowerCase().trim();
  if (NAMED[s]) return new THREE.Color(NAMED[s]);
  if (/^#[0-9a-f]{6}$/.test(s) || /^#[0-9a-f]{3}$/.test(s)) return new THREE.Color(s);
  return fallback;
}

// rectangle englobant orienté (angle minimisant l'aire)
function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x1, z2 - z1); if (L < 0.5) continue;
    const ax = (x2 - x1) / L, az = (z2 - z1) / L; let s0 = 1e9, s1 = -1e9, t0 = 1e9, t1 = -1e9;
    for (const [x, z] of pts) { const s = x * ax + z * az, t = -x * az + z * ax; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const area = (s1 - s0) * (t1 - t0);
    if (!best || area < best.area) best = { area, ax, az, s0, s1, t0, t1 };
  }
  return best;
}

// ---- dégagement des chaussées : les emprises OSM de bâtiments débordent parfois sur la route (largeur estimée, décalage de tracé).
// Chaque sommet situé dans la chaussée (demi-largeur + 0,25 m) est repoussé perpendiculairement au bord. La règle ne dépend que de la position du sommet :
// deux bâtiments mitoyens qui partagent un sommet le déplacent de la même façon (pas de trou entre eux). Un bâtiment dont l'aire tombe sous 35 % est retiré.
const CLR_W = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6, 5: 3.4, 6: 6 };
function clearRoads(data) {
  const CS = 40, grid = new Map(), K = (i, j) => i * 100003 + j, segs = [];
  for (const r of data.roads || []) { if (r.k > 6 || r.b || !r.p || r.p.length < 2) continue; const hw = (r.w && r.k <= 6 ? r.w : CLR_W[r.k]) / 2 + 0.25;
    for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], sg = [x1, z1, x2, z2, hw];
      for (let cx = Math.floor((Math.min(x1, x2) - hw) / CS); cx <= Math.floor((Math.max(x1, x2) + hw) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - hw) / CS); cz <= Math.floor((Math.max(z1, z2) + hw) / CS); cz++) { const k = K(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(sg); } segs.push(sg); } }
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length]; a += x1 * z2 - x2 * z1; } return a / 2; };
  const push = (x, z) => {   // renvoie le point repoussé hors de toute chaussée proche
    for (let it = 0; it < 3; it++) { let moved = false;
      for (const [x1, z1, x2, z2, hw] of grid.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) {
        const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), qx = x1 + dx * t, qz = z1 + dz * t, d = Math.hypot(x - qx, z - qz);
        if (d < hw) { let ux, uz; if (d > 1e-3) { ux = (x - qx) / d; uz = (z - qz) / d; } else { const l = Math.sqrt(l2); ux = -dz / l; uz = dx / l; } x = qx + ux * (hw + 0.02); z = qz + uz * (hw + 0.02); moved = true; } }
      if (!moved) break; }
    return [x, z]; };
  let fixed = 0, dropped = 0, verts = 0; const out = [];
  for (const b of data.buildings || []) {
    if (!b.p || b.p.length < 3) { out.push(b); continue; }
    let hit = false; const np = b.p.map((q) => { const r = push(q[0], q[1]); if (r[0] !== q[0] || r[1] !== q[1]) { hit = true; verts++; return r; } return q; });
    if (!hit) { out.push(b); continue; }
    const a0 = Math.abs(area(b.p)), a1 = area(np);
    if (a0 > 1 && (Math.abs(a1) < a0 * 0.35 || a1 * area(b.p) < 0)) { dropped++; continue; }
    fixed++; out.push({ ...b, p: np });
  }
  data.buildings = out; window.__bclear = { fixed, dropped, verts, total: out.length };
}

export function buildBuildings(data, terrain) {
  const group = new THREE.Group();
  const uniforms = { uNight: { value: 0 }, uLights: { value: 1 }, uClock: { value: 20 }, uDrive: { value: 0 }, uTime: { value: 0 } };

  try { clearRoads(data); } catch (e) { console.error('clearRoads', e); }
  // ---- pré-traitement + densité locale (pour deviner les hauteurs) ----
  const B = [];
  for (const b of data.buildings) {
    const pts = [];
    for (const p of b.p) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.4) pts.push(p); }
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.4) pts.pop();
    if (pts.length < 3) continue;
    let A = 0, cx = 0, cz = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; const f = x1 * z2 - x2 * z1; A += f; cx += (x1 + x2) * f; cz += (z1 + z2) * f; }
    if (Math.abs(A) < 6) continue;
    const holes = (b.hh || []).map(h => h.map(q => [q[0], q[1]])).filter(h => h.length >= 3);
    B.push({ ...b, src: b, holes, pts, A, area: Math.abs(A) / 2, cx: cx / (3 * A), cz: cz / (3 * A) });
  }
  // églises : bâtiments OSM « church/chapel/cathedral », ou bâtiment portant (ou le plus proche d')un lieu de culte nommé dans les données
  const CH_RX = /(^|\s)(é|e)glise|chapelle|cath[ée]drale|basilique|coll[ée]giale|temple/i;
  for (const b of B) if (b.t === 'church' || b.t === 'cathedral' || b.t === 'chapel') b.isChurch = true;
  const inPoly = (x, z, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  for (const q of data.shops || []) if (q.r <= 2 && CH_RX.test(q.n)) {
    let best = null, bd = 1e9;
    for (const b of B) { if (Math.abs(b.cx - q.x) > 45 || Math.abs(b.cz - q.z) > 45 || b.area < 60) continue; const d = inPoly(q.x, q.z, b.pts) ? -1e3 + b.area : Math.hypot(b.cx - q.x, b.cz - q.z); if (d < bd && (d < 0 || d < 28)) { bd = d; best = b; } }
    if (best) best.isChurch = true;
  }
  // châteaux : bâtiment OSM « castle/fort » (cf. lib/osm.php), + tous les bâtiments proches d'un lieu nommé « château » (un château est
  // souvent un ensemble de plusieurs corps de bâtiment accolés en cour - un seul way porte parfois le tag historic=castle, les ailes/communs
  // voisins restent building=yes et hériteraient sinon d'une façade industrielle quelconque, incohérente avec le reste de l'édifice)
  const CA_RX = /^(le\s+)?(ch[aâ]teau|donjon|forteresse)\b/i;   // ancré en début de nom : exclut "Parking du Château", "Tabac du Château", "Auto-École du Château"... (le château n'est qu'une référence de quartier dans ces noms-là)
  for (const q of data.shops || []) if (CA_RX.test(q.n || '')) {
    for (const b of B) { if (Math.abs(b.cx - q.x) > 38 || Math.abs(b.cz - q.z) > 38 || b.area < 60) continue;
      if (inPoly(q.x, q.z, b.pts) || Math.hypot(b.cx - q.x, b.cz - q.z) < 38) b.isCastle = true; }
  }
  for (const b of B) if (b.isChurch || b.t === 'castle' || b.isCastle) b.isStone = true;   // édifices en pierre de taille : église ET château - texture de façade particulière et cohérente avec le bâtiment, cf. wt forcé dans le shader (sty===4)
  { // commerces (OSM) : le bâtiment qui les porte reçoit une devanture
    const BCK = 40, hg = new Map(), K2 = (i, j) => i * 100003 + j;
    B.forEach((b, i) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      b.bb2 = [x0 - 5, z0 - 5, x1 + 5, z1 + 5]; for (let cx = Math.floor(x0 / BCK); cx <= Math.floor(x1 / BCK); cx++) for (let cz = Math.floor(z0 / BCK); cz <= Math.floor(z1 / BCK); cz++) { const k = K2(cx, cz); let a = hg.get(k); if (!a) hg.set(k, a = []); a.push(i); } });
    for (const q of data.shops || []) { if (q.r > 2) continue; let best = null, bd = 6;
      for (const i of hg.get(K2(Math.floor(q.x / BCK), Math.floor(q.z / BCK))) || []) { const b = B[i], bb = b.bb2; if (q.x < bb[0] || q.x > bb[2] || q.z < bb[1] || q.z > bb[3]) continue;
        if (inPoly(q.x, q.z, b.pts)) { best = b; bd = -1; break; }
        for (let e = 0; e < b.pts.length; e++) { const a = b.pts[e], c = b.pts[(e + 1) % b.pts.length], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((q.x - a[0]) * dx + (q.z - a[1]) * dz) / l2)), d = Math.hypot(a[0] + dx * t - q.x, a[1] + dz * t - q.z); if (d < bd) { bd = d; best = b; } } }
      if (best) best.hasShop = true; }
  }
  const RU = data.ru || 0;
  const CELL = 60, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (const b of B) { const k = key(Math.floor(b.cx / CELL), Math.floor(b.cz / CELL)); grid.set(k, (grid.get(k) || 0) + 1); }
  const density = (b) => { let n = 0; const i = Math.floor(b.cx / CELL), j = Math.floor(b.cz / CELL);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) n += grid.get(key(i + a, j + c)) || 0; return n; };

  // ---- tampons géométriques ----
  const W = { p: [], n: [], uv: [], c: [], info: [], idx: [], edge: [] };
  const R = { p: [], n: [], c: [], idx: [] };
  const lamps = [];
  const col = new THREE.Color(), tmp = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  let wv = 0, rv = 0;

  const pushRoofTri = (A, Bp, C, colr, forceUp) => {
    a3.set(Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]); b3.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
    tmp.crossVectors(a3, b3); const l = tmp.length(); if (l < 1e-4) return; tmp.divideScalar(l);
    if (forceUp && tmp.y < 0) { tmp.negate(); [Bp, C] = [C, Bp]; }
    for (const P of [A, Bp, C]) { R.p.push(P[0], P[1], P[2]); R.n.push(tmp.x, tmp.y, tmp.z); R.c.push(colr.r, colr.g, colr.b); }
    R.idx.push(rv, rv + 1, rv + 2); rv += 3;
  };
  const pushBox = (x, y, z, w, h, d, colr, ux = 1, uz = 0) => {   // cheminée, lucarne : boîte orientée (axe u = (ux,uz))
    const y1 = y + h, a = w / 2, e = d / 2, P = (u, v, yy) => [x + ux * u - uz * v, yy, z + uz * u + ux * v];
    const q = (a1, b, c, e1) => { pushRoofTri(a1, b, c, colr, false); pushRoofTri(a1, c, e1, colr, false); };
    q(P(-a, e, y), P(a, e, y), P(a, e, y1), P(-a, e, y1)); q(P(a, -e, y), P(-a, -e, y), P(-a, -e, y1), P(a, -e, y1));
    q(P(-a, -e, y), P(-a, e, y), P(-a, e, y1), P(-a, -e, y1)); q(P(a, e, y), P(a, -e, y), P(a, -e, y1), P(a, e, y1));
    q(P(-a, e, y1), P(a, e, y1), P(a, -e, y1), P(-a, -e, y1));
  };

  const EG = new Map();                        // grille d'arêtes de murs déjà créées
  const inside = (A, E, tol) => {              // A est-elle portée par E (même sens, colinéaires) ?
    if (A.nx * E.nx + A.nz * E.nz < 0.8) return false;
    const ux = (E.x2 - E.x1) / E.L, uz = (E.z2 - E.z1) / E.L;
    for (const [px, pz] of [[A.x1, A.z1], [A.x2, A.z2]]) {
      const qx = px - E.x1, qz = pz - E.z1, t = qx * ux + qz * uz, d = Math.abs(qx * uz - qz * ux);
      if (d > tol || t < -tol || t > E.L + tol) return false;
    }
    return true;
  };
  let nb = 0;
  for (const [bi, b] of B.entries()) {
    const pts = b.pts, n = pts.length, area = b.area, t = b.t || '';
    const ground = pts.map(([x, z]) => terrain.heightAt(x, z));
    const rings = [{ pts, ground, A: b.A }];
    for (const h of b.holes) { let a2 = 0; for (let i = 0; i < h.length; i++) { const [x1, z1] = h[i], [x2, z2] = h[(i + 1) % h.length]; a2 += x1 * z2 - x2 * z1; } rings.push({ pts: h, ground: h.map(([x, z]) => terrain.heightAt(x, z)), A: -a2 }); }
    const gMax = Math.max(...ground), gMin = Math.min(...ground);
    const base = gMax - Math.min(1, (gMax - gMin) * 0.15);        // niveau du rez-de-chaussée
    const r0 = rnd(bi + 1), r1 = rnd(bi + 17), r2 = rnd(bi + 41), r3 = rnd(bi + 73);
    const dens = density(b);
    const lowD = RU > 0.4 || dens <= 12;   // milieu rural ou faible densité locale : bâtiments sans donnée de hauteur plus bas (rarement plus de 2 étages)

    // --- toit ---
    const flatType = FLAT_T.has(t) || area > 700;
    const ob = obb(pts);
    const bw = ob ? Math.min(ob.s1 - ob.s0, ob.t1 - ob.t0) : 0;
    const compact = ob ? area / ob.area : 0;
    const rshape = b.r || '';
    let pitched = !!ob && n <= 14 && compact > 0.8 && bw >= 3.5 && area >= 22 && !(LOW_T.has(t) && r0 < 0.6);
    if (rshape === 'flat' || b.holes.length) pitched = false;
    else if (flatType && !rshape) pitched = false;
    if (b.isStone) pitched = pitched || (compact > 0.6 && !!ob);
    const hip = rshape ? /hip|pyram/.test(rshape) : (r1 < 0.55);
    const pyramid = /pyram/.test(rshape);
    const pitch = THREE.MathUtils.degToRad(rshape ? 32 : 30 + r2 * 12);
    let ridgeH = 0;
    if (pitched) { ridgeH = Math.min((bw / 2) * Math.tan(pitch), 6.5); if (b.rh) ridgeH = b.rh; if (ridgeH < 0.8) pitched = false; }

    // --- hauteur des murs ---
    let wallH;
    if (b.h) wallH = Math.max(2.6, b.h - (pitched ? ridgeH * 0.9 : 0));
    else if (b.l) wallH = b.l * 3.0 + 0.3;
    else if (LOW_T.has(t)) wallH = 2.7 + r0 * 0.6;
    else if (b.isStone) wallH = (b.isChurch && (t === 'chapel' || area < 120)) ? 6.5 : 10.5 + r0 * 2.5;
    else if (t === 'house' || t === 'detached' || t === 'semidetached_house' || t === 'terrace' || t === 'residential') wallH = lowD ? (r0 < 0.4 ? 3.3 : r0 > 0.93 ? 3.1 * 3 : 3.1 * 2 + 0.3) : r0 < 0.3 ? 3.1 * 3 : 3.1 * 2 + 0.3;
    else if (t === 'apartments' || t === 'dormitory') wallH = lowD ? 3.0 * (2 + (r0 < 0.25 ? 1 : 0)) + 0.3 : 3.0 * (4 + Math.floor(r0 * 3)) + 0.3;   // faible densité : R+1, rarement R+2
    else if (t === 'industrial' || t === 'warehouse' || t === 'retail' || t === 'commercial' || t === 'supermarket') wallH = 6.5 + r0 * 3;
    else if (area < 35) wallH = 2.9;
    else if (area < 80) wallH = 3.1 * 2 + 0.2;
    else if (RU > 0.4 && t !== 'apartments' && !FLAT_T.has(t)) { const fl = r0 < 0.42 ? 1 : 2; wallH = fl * 3.05 + 0.3; }   // campagne : maisons individuelles de 1 à 2 niveaux
    else if (lowD) wallH = (r0 < 0.45 ? 1 : r0 > 0.93 ? 3 : 2) * 3.05 + 0.3;   // sans donnée de hauteur, en zone rurale ou peu dense : 1 à 2 niveaux, rarement 3
    else { const fl = dens > 22 ? 4 + (r0 < 0.45 ? 1 : 0) + (r0 > 0.9 ? 1 : 0) : dens > 12 ? 3 + (r0 < 0.3 ? 1 : 0) : 2 + (r0 < 0.3 ? 1 : 0) + (area > 320 ? 1 : 0); wallH = fl * 3.05 + 0.3; }
    const nF = Math.max(1, Math.round(wallH / 3.1)), floorH = wallH / nF;
    if (b.src) { b.src.gBase = base; b.src.fH = floorH; b.src.nF = nF; }   // lu par signs.js : enseignes calées sur l'inter-étage
    const yTop = base + wallH;

    // --- couleurs / style ---
    const rAcc = Math.sin(r0 * 9127.3 + r3 * 331.7) * 43758.5453, accent = (rAcc - Math.floor(rAcc)) < 0.03;
    const wallC = parseColor(b.c, new THREE.Color(accent ? ACCENT[Math.floor(r2 * 5.99)] : FACADES[Math.floor(r0 * FACADES.length)]));
    if (b.c) { const l = wallC.r * 0.3 + wallC.g * 0.59 + wallC.b * 0.11; wallC.setRGB(wallC.r + (l - wallC.r) * 0.3, wallC.g + (l - wallC.g) * 0.3, wallC.b + (l - wallC.b) * 0.3); }   // couleurs OSM conservées mais adoucies (30 % vers le gris)
    wallC.offsetHSL(0, (r2 - 0.5) * 0.06, (r3 - 0.5) * 0.06);
    if (b.isStone) wallC.set('#c7bda0').offsetHSL(0, 0, (r3 - 0.5) * 0.06);   // pierre claire uniforme : écrase la couleur OSM/palette aléatoire pour une façade cohérente avec le bâtiment
    const roofC = parseColor(b.rc, new THREE.Color(ROOFS[Math.floor(r1 * ROOFS.length)]));
    roofC.offsetHSL(0, 0, (r3 - 0.5) * 0.06);
    const industrial = FLAT_T.has(t) && !LOW_T.has(t) && t !== 'office' && t !== 'school' && t !== 'public';
    let style = industrial ? 2 : (r2 < 0.55 ? 0 : r2 < 0.85 ? 1 : 2);
    if (LOW_T.has(t)) style = 3;
    if (((dens > 14 && r3 < 0.28) || b.hasShop) && !industrial && nF > 1 && !LOW_T.has(t)) style += 10;   // rez-de-chaussée commerçant
    if (b.isStone) style = 4;   // église/château : pierre de taille forcée (cf. shader), prioritaire sur tout le reste
    else if (b.hasShop && area > 1500 && !LOW_T.has(t)) style = 5;   // grande surface/centre commercial : façade vitrage + bandeaux métalliques
    const seed = Math.round((r0 * 500 + bi % 7) * 16) / 16;
    // largeur d'une travée (m). Les styles 3/4/5 (annexes basses, pierre de taille, grande surface) valaient 100 : un mur de 60 m n'avait alors
    // qu'UNE colonne, donc l'UV horizontal allait de 0 à 1 sur toute sa longueur alors que l'UV vertical compte 1 par étage (3 m) - tous les motifs
    // de façade (patine, lierre, coulures, vitrage, appareillage de pierre...) étaient étirés x20 à l'horizontale, d'autant plus que le mur était long.
    // Travée métrique (3,2 m) à la place : cnt = round(len / pitchW) adapte la maille à la longueur exacte du mur (pas de maille tronquée en bout).
    const pitchW = style % 10 === 0 ? 2.9 : style % 10 === 1 ? 3.2 : style % 10 === 2 ? 3.8 : 3.2;

    // --- murs ---
    const parapet = pitched ? 0 : 0.45;
    for (const R of rings) { const pts = R.pts, n = pts.length, ground = R.ground;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n], dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      let nx = dz / len, nz = -dx / len; if (R.A < 0) { nx = -nx; nz = -nz; }
      const cnt = len < 2.4 ? 0 : Math.max(1, Math.round(len / pitchW));
      const stl = cnt === 0 ? 3 : style;
      // variété entre les façades d'UN MÊME bâtiment : l'UV horizontal repart de 0 à chaque pan de mur, donc sans cet
      // écart propre à l'arête, hv (choix de la texture de fenêtre) ne dépendait que de (colonne, étage) + seed du bâtiment,
      // et les 4 façades d'un bâtiment rectangulaire affichaient EXACTEMENT le même motif de fenêtres, colonne par colonne,
      // étage par étage (le "toujours les mêmes fenêtres aux mêmes endroits" signalé). eSeed varie par arête (indice i +
      // position + r0 du bâtiment), quantifié sur 16 niveaux comme seed, pour rester stable (pas de scintillement).
      const erH = Math.sin(i * 37.219 + x1 * 0.071 + z1 * 0.053 + r0 * 911.7) * 43758.5453, eSeed = Math.round((erH - Math.floor(erH)) * 16) / 16;
      const g1 = ground[i] - 1.2, g2 = ground[(i + 1) % n] - 1.2, yt = yTop + parapet;
      const V = [[x1, g1, z1, 0, g1], [x2, g2, z2, cnt || 1, g2], [x2, yt, z2, cnt || 1, yt], [x1, yt, z1, 0, yt]];
      const cw = (-dz) * nx + dx * nz;
      const eps = Math.min(0.35, 0.003 * (yt - Math.min(g1, g2)) + 0.03 * r3);   // décale légèrement les murs superposés (bâtiments imbriqués) : supprime le z-fighting
      {
        const A = { x1, z1, x2, z2, nx, nz, L: len, top: yt, ib: -1, alive: true };
        const keys = [], st = Math.max(1, Math.ceil(len / 6));
        for (let k = 0; k <= st; k++) { const kk = Math.floor((x1 + dx * k / st) / 6) * 100003 + Math.floor((z1 + dz * k / st) / 6); if (!keys.includes(kk)) keys.push(kk); }
        let skip = false;
        const seen = new Set();
        for (const kk of keys) {
          for (const E of EG.get(kk) || []) {
            if (!E.alive || seen.has(E)) continue; seen.add(E);
            if (inside(A, E, 0.4) && E.top >= yt - 0.01) { skip = true; break; }
            if (inside(E, A, 0.4) && yt > E.top) { E.alive = false; if (E.ib >= 0) for (let q = 0; q < 6; q++) W.idx[E.ib + q] = 0; }
          }
          if (skip) break;
        }
        if (skip) continue;
        A.ib = W.idx.length;
        for (const kk of keys) { if (!EG.has(kk)) EG.set(kk, []); EG.get(kk).push(A); }
      }
      for (const v of V) {
        W.p.push(v[0] + nx * eps, v[1], v[2] + nz * eps); W.n.push(nx, 0, nz); W.uv.push(v[3], (v[4] - base) / floorH);
        W.c.push(wallC.r, wallC.g, wallC.b); W.info.push(seed, stl, nF, 0);   // 4e composante réservée à l'AO de socle (cf. plus bas) - eSeed passe par son propre attribut aEdge, pas par ce canal
        W.edge.push(eSeed);
      }
      // aG : hauteur au-dessus du sol local
      const o = W.info.length - 16;
      W.info[o + 3] = -1.2; W.info[o + 7] = -1.2; W.info[o + 11] = yt - ground[(i + 1) % n]; W.info[o + 15] = yt - ground[i];
      W.idx.push(...(cw > 0 ? [wv, wv + 1, wv + 2, wv, wv + 2, wv + 3] : [wv, wv + 2, wv + 1, wv, wv + 3, wv + 2])); wv += 4;
    } }

    // --- toit ---
    if (pitched) {
      const { ax, az, s0, s1, t0, t1 } = ob;
      const HLs = (s1 - s0) / 2, HLt = (t1 - t0) / 2, sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
      const alongS = HLs >= HLt, HL = Math.max(HLs, HLt), HW = Math.min(HLs, HLt);
      const rh = pyramid ? 0 : (hip ? Math.max(0, HL - HW) : HL);
      const over = 0.35, slope = ridgeH / (HW + over), yE = yTop - slope * over, yR = yTop + ridgeH;
      const toW = (s, tt) => [s * ax - tt * az, tt * ax + s * az];      // repère OBB -> monde
      const Bp = [], Rp = [];
      for (const [x, z] of pts) {
        const s = x * ax + z * az, tt = -x * az + z * ax;
        const ds = s - sc, dt = tt - tc;
        const so = s + (Math.abs(ds) > 0.5 ? Math.sign(ds) * over : 0), to = tt + (Math.abs(dt) > 0.5 ? Math.sign(dt) * over : 0);
        const [bx, bz] = toW(so, to); Bp.push([bx, yE, bz]);
        // point de faîtage
        const along = alongS ? s : tt, ac = alongS ? sc : tc, cl = Math.min(ac + rh, Math.max(ac - rh, along));
        const [rx, rz] = alongS ? toW(cl, tc) : toW(sc, cl);
        Rp.push([rx, yR, rz]);
      }
      const wallCol = wallC.clone();
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, A = Bp[i], B2 = Bp[j], Ri = Rp[i], Rj = Rp[j];
        const same = Math.hypot(Ri[0] - Rj[0], Ri[2] - Rj[2]) < 0.05;
        const check = (P, Q, S) => {   // fronton vertical -> couleur du mur
          a3.set(Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]); b3.set(S[0] - P[0], S[1] - P[1], S[2] - P[2]); tmp.crossVectors(a3, b3).normalize();
          return Math.abs(tmp.y) < 0.15;
        };
        const gab = same && check(A, B2, Ri);
        const c = gab ? wallCol : roofC;
        if (gab) {   // orientation vers l'extérieur
          const mx = (A[0] + B2[0] + Ri[0]) / 3 - b.cx, mz = (A[2] + B2[2] + Ri[2]) / 3 - b.cz;
          a3.set(B2[0] - A[0], B2[1] - A[1], B2[2] - A[2]); b3.set(Ri[0] - A[0], Ri[1] - A[1], Ri[2] - A[2]); tmp.crossVectors(a3, b3);
          if (tmp.x * mx + tmp.z * mz < 0) pushRoofTri(A, Ri, B2, c, false); else pushRoofTri(A, B2, Ri, c, false);
        } else if (same) pushRoofTri(A, B2, Ri, c, true);
        else { pushRoofTri(A, B2, Rj, c, true); pushRoofTri(A, Rj, Ri, c, true); }
      }
      // lucarnes : sur les deux pans d'un long toit à deux pans / en croupe, espacées de ~3,4 m
      if (ridgeH >= 1.6 && HL >= 3.6 && HW >= 2.3 && area >= 55 && r2 < 0.62 && !pyramid) {
        const half = hip ? rh : HL - 1.7, span = half * 2, cnt = Math.floor(span / 3.4);
        const rax = alongS ? ax : -az, raz = alongS ? az : ax, lax = alongS ? -az : ax, laz = alongS ? ax : az;   // axes monde : faîtage, transversal
        const ac0 = alongS ? sc : tc;
        for (let k = 0; k < cnt; k++) for (const sg of [1, -1]) {
          const hk = Math.abs(Math.sin((b.cx * 12.9898 + b.cz * 78.233 + k * 37.7 + sg * 11.3))) ; if (hk > 0.78) continue;
          const al = ac0 - span / 2 + (k + 0.5) * span / cnt, lat = sg * HW * 0.52;
          const [wx, wz] = alongS ? toW(al, tc + lat) : toW(tc + lat, al);   // NB : toW(s, t)
          const [px, pz] = alongS ? [wx, wz] : toW(sc + lat, al);
          const cxp = alongS ? wx : px, czp = alongS ? wz : pz, ySurf = yR - (yR - yE) * (Math.abs(lat) / (HW + over));
          const ox = lax * sg, oz = laz * sg;
          pushBox(cxp, ySurf - 0.75, czp, 1.1, 1.75, 1.15, wallC, rax, raz);                                        // joues + façade
          pushBox(cxp + ox * 0.59, ySurf - 0.05, czp + oz * 0.59, 0.62, 0.72, 0.05, new THREE.Color('#1d232b'), rax, raz);   // vitre
          pushBox(cxp + ox * 0.05, ySurf + 0.98, czp + oz * 0.05, 1.5, 0.13, 1.6, roofC.clone().multiplyScalar(0.8), rax, raz);   // couverture
        }
      }
      // cheminée
      if (r3 < 0.6) { const sx = alongS ? sc + (r2 - 0.5) * rh * 1.2 : sc, sz = alongS ? tc : tc + (r2 - 0.5) * rh * 1.2;
        const [cxp, czp] = toW(alongS ? sx : sc, alongS ? tc : sz); pushBox(cxp, yR - ridgeH * 0.55, czp, 0.7, ridgeH * 0.55 + 1.3, 0.7, new THREE.Color('#8a5b49')); }
    } else {
      // toit plat
      try {
        const cont = pts.map(([x, z]) => new THREE.Vector2(x, z));
        const hv = b.holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z))), all = cont.concat(...hv);
        const rc = roofC.clone().multiplyScalar(0.75);
        for (const [a, c1, c2] of THREE.ShapeUtils.triangulateShape(cont, hv)) {
          const yy = yTop + 0.3;
          pushRoofTri([all[a].x, yy, all[a].y], [all[c1].x, yy, all[c1].y], [all[c2].x, yy, all[c2].y], rc, true);
        }
      } catch (e) { /* contour dégénéré */ }
      if (b.holes.length) { /* pas d'accessoire au centre d'une cour */ } else if (r3 < 0.3 && area > 40) pushBox(b.cx, yTop + 0.3, b.cz, 0.8, 1.6, 0.8, new THREE.Color('#8a5b49'));
      else if (r3 > 0.85 && area > 120) pushBox(b.cx + 2, yTop + 0.3, b.cz, 3.5, 2.2, 3, new THREE.Color('#8d8f92'));   // machinerie
    }
    if (b.isChurch) {   // clocher (tour + flèche pyramidale) et croix
      const small = area < 120, tw = Math.min(small ? 3.0 : 4.6, Math.max(2.4, (bw || 6) * 0.55)), th = (small ? 4 : 7) + r0 * 2, sh = tw * (small ? 2.0 : 2.4);
      let tx = b.cx, tz = b.cz;
      if (ob) { const HLs = (ob.s1 - ob.s0) / 2, HLt = (ob.t1 - ob.t0) / 2, sc = (ob.s0 + ob.s1) / 2, tc = (ob.t0 + ob.t1) / 2, e = tw / 2 + 0.3;
        const [s, tt] = HLs >= HLt ? [ob.s1 - e, tc] : [sc, ob.t1 - e]; tx = s * ob.ax - tt * ob.az; tz = tt * ob.ax + s * ob.az; }
      const stone = new THREE.Color('#d8cfba').offsetHSL(0, 0, (r3 - 0.5) * 0.05), slate = new THREE.Color('#4a4f57'), gold = new THREE.Color('#e6d9a8');
      const y0 = yTop - 2.5, y1 = yTop + th;
      pushBox(tx, y0, tz, tw, y1 - y0, tw, stone);
      pushBox(tx, y1 - 0.9, tz, tw * 0.55, 0.9, tw * 1.02, new THREE.Color('#2b2d31'));   // baies du beffroi
      pushBox(tx, y1 - 0.9, tz, tw * 1.02, 0.9, tw * 0.55, new THREE.Color('#2b2d31'));
      const q = tw / 2 + 0.25, apex = [tx, y1 + sh, tz], cs = [[tx - q, y1, tz - q], [tx + q, y1, tz - q], [tx + q, y1, tz + q], [tx - q, y1, tz + q]];
      for (let k = 0; k < 4; k++) pushRoofTri(cs[k], cs[(k + 1) % 4], apex, slate, false);
      pushBox(tx, y1 + sh, tz, 0.22, 2.4, 0.22, gold); pushBox(tx, y1 + sh + 1.4, tz, 1.3, 0.22, 0.22, gold);   // croix
    }
    // éclairage public devant certaines façades
    if (bi % 4 === 0 && lamps.length < 9000) {
      const [x1, z1] = pts[0], [x2, z2] = pts[1], L = Math.hypot(x2 - x1, z2 - z1) || 1, s = b.A < 0 ? -1 : 1;
      const lx = (x1 + x2) / 2 + s * (z2 - z1) / L * 5, lz = (z1 + z2) / 2 - s * (x2 - x1) / L * 5;
      lamps.push(lx, terrain.heightAt(lx, lz) + 5.5, lz);
    }
    nb++;
  }

  // ---- géométries ----
  const geoOf = (T, withUv) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(T.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(T.c, 3));
    if (withUv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(T.uv, 2)); g.setAttribute('aInfo', new THREE.Float32BufferAttribute(T.info, 4)); }
    if (T.edge) g.setAttribute('aEdge', new THREE.Float32BufferAttribute(T.edge, 1));   // variété par façade (cf. eSeed) : canal séparé, aInfo.w est déjà pris par l'AO de socle
    g.setIndex(new THREE.BufferAttribute((T.p.length / 3 > 65000 ? new Uint32Array(T.idx) : new Uint16Array(T.idx)), 1));
    return g;
  };
  // texture « patine » sans raccord (tuilable) : R = grandes taches et coulures, G = fissures, B = efflorescences / salissures claires
  const makeGrime = () => {
    const S = 512; let sd = 90210; const rn = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const RES = 2, mkc = () => { const c = document.createElement('canvas'); c.width = c.height = S * RES; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, S * RES, S * RES); x.scale(RES, RES); return [c, x]; };   // dessin en coordonnées 512, résolution 1024
    const wrap = (fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); };
    const [cR, xR] = mkc(), [cG, xG] = mkc(), [cB, xB] = mkc();
    for (let i = 0; i < 80; i++) { const x = rn() * S, y = rn() * S, r = 18 + rn() * 80, a = 0.10 + rn() * 0.3, ry = r * (0.6 + rn() * 1.4);   // taches d'humidité
      wrap((dx, dy) => { xR.save(); xR.translate(x + dx, y + dy); xR.scale(1, ry / r); const g = xR.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); xR.fillStyle = g; xR.beginPath(); xR.arc(0, 0, r, 0, 6.2832); xR.fill(); xR.restore(); }); }
    for (let i = 0; i < 46; i++) { const x = rn() * S, y = rn() * S, w = 3 + rn() * 9, l = 70 + rn() * 190, a = 0.18 + rn() * 0.35;   // coulures verticales
      wrap((dx, dy) => { const g = xR.createLinearGradient(0, y + dy, 0, y + dy + l); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); xR.fillStyle = g; xR.fillRect(x + dx - w / 2, y + dy, w, l); }); }
    for (let i = 0; i < 16; i++) { let x = rn() * S, y = rn() * S, an = rn() < 0.6 ? 1.57 + (rn() - 0.5) * 0.9 : rn() * 3.14; const pts = [[x, y]], n = 7 + (rn() * 9 | 0);   // fissures
      for (let k = 0; k < n; k++) { an += (rn() - 0.5) * 1.1; const l = 8 + rn() * 20; x += Math.cos(an) * l; y += Math.sin(an) * l; pts.push([x, y]); }
      const lw = 1.8 + rn() * 2.2;
      wrap((dx, dy) => { xG.strokeStyle = 'rgba(255,255,255,0.95)'; xG.lineWidth = lw; xG.lineJoin = 'round'; xG.beginPath(); pts.forEach(([px, py], k) => k ? xG.lineTo(px + dx, py + dy) : xG.moveTo(px + dx, py + dy)); xG.stroke();
        if (n > 10) { const [bx, by] = pts[3]; xG.lineWidth = lw * 0.7; xG.beginPath(); xG.moveTo(bx + dx, by + dy); xG.lineTo(bx + dx + 14 * Math.cos(an + 1.2), by + dy + 14 * Math.sin(an + 1.2)); xG.lineTo(bx + dx + 26 * Math.cos(an + 1.0), by + dy + 30 * Math.sin(an + 1.0)); xG.stroke(); } }); }
    for (let i = 0; i < 60; i++) { const x = rn() * S, y = rn() * S, r = 6 + rn() * 34, a = 0.15 + rn() * 0.4;   // salissures claires / efflorescences irrégulières
      wrap((dx, dy) => { for (let k = 0; k < 5; k++) { const ox = (rn() - 0.5) * r, oy = (rn() - 0.5) * r, rr = r * (0.3 + rn() * 0.5); const g = xB.createRadialGradient(x + dx + ox, y + dy + oy, 0, x + dx + ox, y + dy + oy, rr); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); xB.fillStyle = g; xB.beginPath(); xB.arc(x + dx + ox, y + dy + oy, rr, 0, 6.2832); xB.fill(); } }); }
    const W = S * RES, out = document.createElement('canvas'); out.width = out.height = W; const xo = out.getContext('2d'), od = xo.createImageData(W, W);
    const dR = xR.getImageData(0, 0, W, W).data, dG = xG.getImageData(0, 0, W, W).data, dB = xB.getImageData(0, 0, W, W).data;
    for (let i = 0; i < W * W; i++) { od.data[i * 4] = dR[i * 4]; od.data[i * 4 + 1] = dG[i * 4]; od.data[i * 4 + 2] = dB[i * 4]; od.data[i * 4 + 3] = 255; }
    xo.putImageData(od, 0, 0);
    const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
  };
  const GRIME = makeGrime();
  // 2e texture tuilable : R = lierre grimpant (feuillage), G = fuites d'eau / coulures longues, B = enduits refaits / plaques (par bâtiment, activés au hasard)
  const makeGrime2 = () => {
    const S = 512; let sd = 424242; const rn = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const RES = 2, mkc = () => { const c = document.createElement('canvas'); c.width = c.height = S * RES; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, S * RES, S * RES); x.scale(RES, RES); return [c, x]; };   // dessin en coordonnées 512, résolution 1024
    const wrap = (fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); };
    const [cR, xR] = mkc(), [cG, xG] = mkc(), [cB, xB] = mkc();
    for (let i = 0; i < 16; i++) {   // lierre : tiges montantes ramifiées + feuilles
      let x = rn() * S, y = S * (0.55 + rn() * 0.45), an = -1.57 + (rn() - 0.5) * 0.6; const pts = [[x, y]];
      for (let k = 0; k < 26; k++) { an += (rn() - 0.5) * 0.9; an += (-1.57 - an) * 0.12; const l = 8 + rn() * 12; x += Math.cos(an) * l; y += Math.sin(an) * l; pts.push([x, y]); }
      wrap((dx, dy) => { xR.strokeStyle = 'rgba(255,255,255,0.55)'; xR.lineWidth = 1.6; xR.beginPath(); pts.forEach(([px, py], k) => k ? xR.lineTo(px + dx, py + dy) : xR.moveTo(px + dx, py + dy)); xR.stroke(); });
      pts.forEach(([px, py], k) => { const n = 5 + (rn() * 5 | 0), spread = 10 + k * 0.5;
        for (let q = 0; q < n; q++) { const lx = px + (rn() - 0.5) * spread * 2, ly = py + (rn() - 0.5) * spread * 2, lr = 3 + rn() * 5.5, la = 0.55 + rn() * 0.45, rot = rn() * 6.28;
          wrap((dx, dy) => { xR.save(); xR.translate(lx + dx, ly + dy); xR.rotate(rot); xR.fillStyle = `rgba(255,255,255,${la})`; xR.beginPath(); xR.ellipse(0, 0, lr, lr * 0.62, 0, 0, 6.2832); xR.fill(); xR.restore(); }); } });
    }
    for (let i = 0; i < 26; i++) { const x = rn() * S, y = rn() * S, w = 1.5 + rn() * 4.5, l = 140 + rn() * 300, a = 0.4 + rn() * 0.5, sw = (rn() - 0.5) * 22;   // fuites : filet sinueux qui s'élargit en bas
      wrap((dx, dy) => { const gr = xG.createLinearGradient(0, y + dy, 0, y + dy + l); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.75, `rgba(255,255,255,${a * 0.6})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); xG.strokeStyle = gr; xG.lineWidth = w; xG.lineCap = 'round'; xG.beginPath(); xG.moveTo(x + dx, y + dy); xG.bezierCurveTo(x + dx + sw, y + dy + l * 0.33, x + dx - sw, y + dy + l * 0.66, x + dx + sw * 0.3, y + dy + l); xG.stroke();
        const r = w * 3.2, g2 = xG.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); g2.addColorStop(0, `rgba(255,255,255,${a * 0.8})`); g2.addColorStop(1, 'rgba(255,255,255,0)'); xG.fillStyle = g2; xG.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); }); }
    for (let i = 0; i < 30; i++) { const x = rn() * S, y = rn() * S, w = 26 + rn() * 100, h = 22 + rn() * 80, a = 0.35 + rn() * 0.6;   // plaques d'enduit / reprises / peinture écaillée : bords irréguliers
      const pts = []; const n = 12; for (let k = 0; k < n; k++) { const t = k / n * 6.2832, e = 0.8 + rn() * 0.35; pts.push([Math.cos(t) * w * 0.5 * e * (Math.abs(Math.cos(t)) > 0.5 ? 1.15 : 1), Math.sin(t) * h * 0.5 * e]); }
      wrap((dx, dy) => { xB.fillStyle = `rgba(255,255,255,${a})`; xB.beginPath(); pts.forEach(([px, py], k) => k ? xB.lineTo(x + dx + px, y + dy + py) : xB.moveTo(x + dx + px, y + dy + py)); xB.closePath(); xB.fill(); xB.strokeStyle = 'rgba(255,255,255,0.15)'; xB.lineWidth = 3; xB.stroke(); }); }
    const W = S * RES, out = document.createElement('canvas'); out.width = out.height = W; const xo = out.getContext('2d'), od = xo.createImageData(W, W);
    const dR = xR.getImageData(0, 0, W, W).data, dG = xG.getImageData(0, 0, W, W).data, dB = xB.getImageData(0, 0, W, W).data;
    for (let i = 0; i < W * W; i++) { od.data[i * 4] = dR[i * 4]; od.data[i * 4 + 1] = dG[i * 4]; od.data[i * 4 + 2] = dB[i * 4]; od.data[i * 4 + 3] = 255; }
    xo.putImageData(od, 0, 0);
    const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
  };
  const GRIME2 = makeGrime2();
  const FAC = makeFacadeTextures(4), ROOFT = makeRoofTexture(4);   // anisotropie 16 -> 4 (à la demande) : identique au reste du fichier (orthophoto/toiture locales, déjà à 4), coûteux en bande passante texture sur les vues obliques très fréquentes dans ce jeu (des centaines de façades à l'écran), gain surtout sensible à distance/angle rasant sans perte visible de face
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  wallMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uniforms.uNight; sh.uniforms.uLights = uniforms.uLights; sh.uniforms.uClock = uniforms.uClock; sh.uniforms.uDrive = uniforms.uDrive; sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uFacade = { value: FAC.color }; sh.uniforms.uFacadeAux = { value: FAC.aux }; sh.uniforms.uGrime = { value: GRIME }; sh.uniforms.uGrime2 = { value: GRIME2 }; sh.uniforms.uNoise = { value: terrain.NOISE };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nattribute float aEdge;\nvarying vec4 vInfo;\nvarying float vEdge;\nvarying vec2 vWUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo; vEdge = aEdge; vWUv = uv;');
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n// biais de profondeur propre à chaque bâtiment : les murs superposés ne se disputent plus le même pixel (z-fighting)\ngl_Position.z -= fract(sin(aInfo.x * 12.9898) * 43758.5453) * 0.25 * 3.0 / max(gl_Position.w, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uFacade; uniform sampler2DArray uFacadeAux; uniform sampler2D uGrime; uniform sampler2D uGrime2; uniform sampler2D uNoise;
        uniform float uNight; uniform float uLights; uniform float uClock; uniform float uDrive; uniform float uTime;
        varying vec4 vInfo; varying float vEdge; varying vec2 vWUv;
        float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // les attributs constants sont arrondis : l'interpolation introduit un bruit de 1e-6 qui faisait basculer les seuils pixel par pixel
        float sInt = floor(vInfo.y + 0.5); float sty = mod(sInt, 10.0); float shop = step(9.5, sInt);
        vec2 cell = floor(vWUv); vec2 fc = fract(vWUv); float nF = floor(vInfo.z + 0.5); float seed = floor(vInfo.x * 16.0 + 0.5) / 16.0; float eSeed = floor(vEdge * 16.0 + 0.5) / 16.0;   // variété entre les façades d'un même bâtiment - attribut séparé (aEdge) : vInfo.w est déjà l'AO de socle (cf. plus bas), le réutiliser cassait les deux effets
        float floorOk = step(0.0, cell.y) * step(cell.y, nF - 1.0);
        float isShop = shop * step(cell.y, 0.5) * floorOk;
        float hv = h21(cell + seed * 1.7 + eSeed * 7.3);
        float layer = 11.0;
        if (floorOk > 0.5) {
          if (isShop > 0.5) layer = 13.0 + floor(hv * 1.999);
          else if (sty < 0.5) { float q = floor(hv * 7.999); layer = q < 3.5 ? q : q + 11.0; }
          else if (sty < 1.5) {
            if (hv < 0.2) { float q = floor(hv * 19.999); layer = q < 0.5 ? 7.0 : q < 1.5 ? 8.0 : q < 2.5 ? 24.0 : 25.0; }
            else { float j = floor((hv - 0.2) / 0.8 * 7.999); layer = j < 2.5 ? 4.0 + j : j < 3.5 ? 19.0 : j < 4.5 ? 20.0 : j < 5.5 ? 21.0 : j < 6.5 ? 22.0 : 5.0; }
          }
          else if (sty < 2.5) layer = 9.0 + floor(hv * 1.999);
          else layer = hv < 0.05 ? 12.0 : hv < 0.13 ? 23.0 : 11.0;   // annexes / pierre / grande surface : travées de 3,2 m désormais, donc surtout du mur plein (lucarne 5 %, tuyau 8 %)
          if (isShop < 0.5 && layer < 10.5 || (layer > 18.5 && layer < 22.5 || layer > 14.5 && layer < 18.5)) { float hb = h21(cell * 1.71 + seed * 5.3 + eSeed * 6.1 + 3.1); if (hb < 0.417) layer = hb < 0.06 ? 23.0 : 11.0; }   // ~28 % de fenêtres en moins (pan de mur plein) : deux paliers de -15 % demandés successivement
        }
        vec2 gdx = dFdx(vWUv), gdy = dFdy(vWUv);
        vec4 tc = textureGrad(uFacade, vec3(fc, layer), gdx, gdy);
        vec4 ta = textureGrad(uFacadeAux, vec3(fc, layer), gdx, gdy);
        vec3 wallC = diffuseColor.rgb * mix(0.66, 1.0, step(0.5, vInfo.w));
        diffuseColor.rgb = tc.rgb * mix(vec3(1.0), wallC, ta.g);
        { // matière du mur propre à chaque bâtiment : crépi (défaut), brique, pierre appareillée, bardage bois, béton en panneaux
          float wt = h21(vec2(seed * 3.7, 1.3)), rowN, tone; vec3 wcol = vec3(0.0); float on = 0.0;
          vec2 P = vWUv; float fwp = max(length(gdx), length(gdy));   // empreinte d'un pixel en unités d'uv : sert à effacer les motifs plus fins que le pixel (moiré / scintillement)
          float aB = 1.0 - smoothstep(0.12, 0.42, fwp * 41.0), aS = 1.0 - smoothstep(0.12, 0.42, fwp * 6.2), aC = 1.0 - smoothstep(0.12, 0.42, fwp * 15.0), aG = 1.0 - smoothstep(0.10, 0.35, fwp * 96.0), aG2 = 1.0 - smoothstep(0.10, 0.35, fwp * 15.0), aP = 1.0 - smoothstep(0.02, 0.10, fwp);
          if (sty > 3.5 && sty < 4.5) {   // grand appareil de pierre de taille forcé : église/château - blocs irréguliers, joints creusés marqués, calcaire doré (pas de hasard ici)
            float rowH = 0.62 + 0.10 * h21(vec2(seed, 31.4)); vec2 rp = vec2(P.x, P.y / rowH); float row = floor(rp.y);
            float rowSeed = h21(vec2(row, seed * 2.3)), colW = 0.95 + 0.55 * rowSeed;   // largeur de bloc variable par assise (jamais un motif répétitif identique)
            vec2 cp = vec2(rp.x / colW + rowSeed * 7.0 + 0.5 * mod(row, 2.0), rp.y); vec2 f = fract(cp), bi = floor(cp);
            float jx = mix(0.10, 0.07, aS), jy = mix(0.14, 0.09, aS);   // joint de mortier large et creusé (pas un simple bardage)
            float m = mix(0.82, smoothstep(0.0, jy, f.y) * smoothstep(0.0, jx, f.x) * smoothstep(0.0, jy, 1.0 - f.y) * smoothstep(0.0, jx, 1.0 - f.x), aS);
            float bh = h21(bi + seed * 3.7);   // teinte variable bloc à bloc : un calcaire réel n'est jamais parfaitement uniforme
            tone = mix(0.96, 0.76 + 0.4 * bh, aS);
            vec3 mortar = vec3(0.30, 0.28, 0.24), stoneC = mix(vec3(0.78, 0.68, 0.48), vec3(0.68, 0.63, 0.52), bh) * tone;   // calcaire doré/chaud, typique église-château, jamais gris béton
            wcol = mix(mortar, stoneC, m);
            wcol *= 1.0 - mix(0.0, 0.22, aS) * (1.0 - smoothstep(0.0, jy * 2.0, f.y));   // ombre portée en pied de bloc : relief d'appareillage, pas une surface plate
            on = 1.0;
          } else if (sty > 4.5 && sty < 5.5) {   // vitrage + bandeaux métalliques forcés : grande surface/centre commercial - façade cohérente avec le type de bâtiment
            vec2 f = fract(vec2(P.x * 2.1, P.y * 2.8)); float m = smoothstep(0.0, 0.05, f.x) * smoothstep(0.0, 0.05, 1.0 - f.x) * smoothstep(0.0, 0.06, f.y) * smoothstep(0.0, 0.06, 1.0 - f.y);
            vec3 glass = mix(vec3(0.17, 0.24, 0.29), vec3(0.28, 0.38, 0.44), h21(floor(vec2(P.x * 2.1, P.y * 2.8)) + seed));
            wcol = mix(vec3(0.52, 0.51, 0.48), glass, m); on = 1.0;
          } else if (wt > 0.62 && wt < 0.69) {   // brique (plus rare)
            vec2 bp = vec2(P.x * 15.0, P.y * 41.0); float row = floor(bp.y); bp.x += 0.5 * mod(row, 2.0); vec2 f = fract(bp), bi = floor(bp);
            float m = mix(0.82, smoothstep(0.0, 0.16, f.y) * smoothstep(0.0, 0.06, f.x) * smoothstep(0.0, 0.16, 1.0 - f.y), aB);
            tone = mix(0.97, 0.72 + 0.5 * h21(bi + seed), aB); vec3 bc = mix(vec3(0.50, 0.32, 0.27), vec3(0.62, 0.45, 0.36), h21(vec2(seed, 4.1))) * tone;   // brique adoucie
            wcol = mix(vec3(0.62, 0.60, 0.55), bc, m); on = 1.0;
          } else if (wt >= 0.69 && wt < 0.91) {   // pierre de taille
            vec2 bp = vec2(P.x * 3.4, P.y * 6.2); float row = floor(bp.y); bp.x += 0.5 * mod(row, 2.0); vec2 f = fract(bp), bi = floor(bp);
            float m = mix(0.9, smoothstep(0.0, 0.05, f.y) * smoothstep(0.0, 0.03, f.x) * smoothstep(0.0, 0.05, 1.0 - f.y), aS);
            tone = mix(0.97, 0.82 + 0.3 * h21(bi + seed * 2.0), aS); wcol = mix(vec3(0.42, 0.40, 0.37), mix(vec3(0.80, 0.78, 0.73), vec3(0.72, 0.70, 0.66), h21(vec2(seed, 6.6))) * tone, m); on = 1.0;   // pierre grise / blanche
          } else if (wt >= 0.91 && wt < 0.96) {   // bardage horizontal
            float r = P.y * 15.0; float f = fract(r); float m = mix(0.9, smoothstep(0.0, 0.10, f), aC);
            tone = mix(0.95, 0.8 + 0.35 * h21(vec2(floor(r), seed)), aC); wcol = mix(vec3(0.16, 0.12, 0.09), mix(vec3(0.48, 0.42, 0.36), vec3(0.42, 0.47, 0.50), step(0.5, h21(vec2(seed, 9.3)))) * tone, m); on = 1.0;
          } else if (wt >= 0.96) {   // béton en panneaux
            vec2 f = fract(vec2(P.x * 0.9, P.y * 0.55)); float m = mix(0.97, smoothstep(0.0, 0.012, min(f.x, f.y)) * smoothstep(0.0, 0.012, 1.0 - f.y), aP);
            wcol = mix(vec3(0.38), vec3(0.72, 0.72, 0.70) * (0.92 + 0.16 * h21(floor(vec2(P.x * 0.9, P.y * 0.55)) + seed)), m); on = 1.0;
          }
          // grain léger commun à tous : le fond de façade n'est plus uni
          float g = mix(0.06, h21(floor(P * vec2(64.0, 96.0)) + seed) * 0.12, aG) + mix(0.05, h21(floor(P * vec2(11.0, 15.0)) + seed * 1.3) * 0.10, aG2);
          diffuseColor.rgb = mix(diffuseColor.rgb, wcol * mix(vec3(1.0), wallC, 0.25), on * ta.g * (1.0 - isShop * 0.6));
          diffuseColor.rgb *= mix(1.0, 0.9 + g, ta.g);
          { // patine individuelle par bâtiment (texture tuilable en surimpression, décalée selon la graine) : taches, coulures, fissures, salissures
            vec2 o1 = vec2(h21(vec2(seed, 7.7)), h21(vec2(seed, 8.8))), o2 = vec2(h21(vec2(seed, 2.2)), h21(vec2(seed, 3.3)));
            vec3 g1 = textureGrad(uGrime, P * 0.085 + o1, gdx * 0.25, gdy * 0.25).rgb, g2 = textureGrad(uGrime, P.yx * vec2(0.33, 0.30) + o2, gdx * 0.25, gdy * 0.25).rgb, g3 = textureGrad(uGrime, P * 0.21 + o2 * 1.7, gdx * 0.25, gdy * 0.25).rgb;
            float isStoneSty = step(3.5, sty) * step(sty, 4.5);   // église/château : façade pierre dédiée, pas de patine générique (lierre/coulures pensés pour du crépi/brique d'immeuble, pas pour un monument)
            float wm = ta.g * (1.0 - isShop * 0.7) * mix(1.0, 0.2, isStoneSty), hp = h21(vec2(seed, 5.5)), amt = 0.28 + 0.95 * hp * sqrt(hp);   // patine très variable : la plupart des façades restent propres
            float dV = length(vViewPosition), hC = h21(vec2(seed, 12.1)), hI = h21(vec2(seed, 13.3)), hL = h21(vec2(seed, 14.7)), hR = h21(vec2(seed, 15.9)), hM = h21(vec2(seed, 16.6));
            float stn = clamp(g1.r * 1.15 + g3.r * 0.5 * (1.0 - g1.r), 0.0, 1.0), crk = max(g2.g, g3.g * 0.8) * (1.0 - smoothstep(90.0, 300.0, dV)) * (hC < 0.15 ? 1.0 : 0.0) * smoothstep(0.42, 0.72, textureGrad(uGrime2, P * 0.045 + o1.yx, gdx * 0.25, gdy * 0.25).b + 0.25 * g1.r);   // fissures localisées (jamais sur toute la façade)   // fissures : ~1 bâtiment sur 5
            diffuseColor.rgb *= 1.0 - wm * (0.78 * stn * amt);
            { // même grain d'enrobé que les routes (bruit partagé, 2 échantillons) : gravillon fin de près, marbrures de loin
              vec4 gn = textureGrad(uNoise, P * 2.7 + o1, gdx * 0.25, gdy * 0.25), gm = textureGrad(uNoise, P * 1.15 + o2.yx, gdx * 0.25, gdy * 0.25), gl2 = textureGrad(uNoise, P * 0.45 + o2, gdx * 0.25, gdy * 0.25);
              float nf = 1.0 - smoothstep(70.0, 260.0, dV), nfar = 1.0 - smoothstep(200.0, 600.0, dV);
              diffuseColor.rgb *= 1.0 + wm * ((gn.r - 0.5) * 0.55 * nf + (gn.g - 0.5) * 0.45 * nf + (gm.g - 0.5) * 0.55 * nf + (gl2.g - 0.5) * 0.70 * nfar + (gl2.b - 0.5) * 0.50 * nfar);   // amplitude nettement lisible
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.26, 0.23, 0.21), wm * smoothstep(0.10, 0.5, crk) * 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.77, 0.70), wm * g1.b * 0.34 * amt);
            vec3 t1 = textureGrad(uGrime2, P * vec2(0.20, 0.17) + o2, gdx * 0.25, gdy * 0.25).rgb, t2 = textureGrad(uGrime2, P * vec2(0.34, 0.11) + o1 * 1.3, gdx * 0.25, gdy * 0.25).rgb, t3 = textureGrad(uGrime2, P * vec2(0.13, 0.15) + o1.yx, gdx * 0.25, gdy * 0.25).rgb;
            if (hL < 0.26) {   // fuite d'eau / coulures longues (parfois rouillées)
              float lk = clamp(t2.g * 1.2, 0.0, 1.0) * (0.55 + 0.45 * smoothstep(0.0, 2.5, P.y));
              vec3 lc = hM < 0.3 ? vec3(0.72, 0.50, 0.34) : vec3(0.56, 0.58, 0.58);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * lc * vec3(0.72), wm * smoothstep(0.08, 0.5, lk) * 0.95);
            }
            if (hL >= 0.26 && hL < 0.36) {   // coulures claires (salpêtre / calcaire) sous les débords
              float lk2 = clamp(t2.g * 1.3, 0.0, 1.0) * smoothstep(0.0, 1.5, P.y);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.79, 0.72), wm * smoothstep(0.08, 0.5, lk2) * 0.65);
            }
            if (hL < 0.26 && hC > 0.5) {   // 2e passe de coulures décalée : les fuites ne se répètent pas à l'identique
              float lk3 = clamp(textureGrad(uGrime2, P * vec2(0.27, 0.09) + o2.yx, gdx * 0.25, gdy * 0.25).g * 1.2, 0.0, 1.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.64, 0.62), wm * smoothstep(0.08, 0.5, lk3) * 0.75);
            }
            if (hR < 0.20) {   // enduit refait / plaques / peinture écaillée
              float pt = t3.b, pw = hM < 0.5 ? 1.0 : -1.0;
              diffuseColor.rgb = mix(diffuseColor.rgb, pw > 0.0 ? diffuseColor.rgb * 0.62 + vec3(0.30, 0.28, 0.24) * 0.5 : diffuseColor.rgb * vec3(0.72, 0.68, 0.64), wm * smoothstep(0.35, 0.7, pt) * 0.75);
            }
            if (hI < 0.29 && isStoneSty < 0.5) {   // lierre / vigne vierge grimpant depuis le pied du mur (parfois rougi à l'automne) - jamais sur église/château (cf. isStoneSty)
              float lim = 1.3 + 4.0 * h21(vec2(seed, 17.4)), edge = smoothstep(lim, lim - 1.6, P.y + (t1.r - 0.5) * 1.6);
              float iv = smoothstep(0.30, 0.65, t1.r) * edge * step(0.5, floorOk + step(P.y, 0.0));
              vec3 lc = h21(vec2(seed, 18.8)) < 0.25 ? vec3(0.48, 0.14, 0.08) : vec3(0.12, 0.26, 0.08) + 0.08 * t1.g;
              lc *= 0.7 + 0.6 * h21(floor(P * 6.0) + seed);
              diffuseColor.rgb = mix(diffuseColor.rgb, lc, wm * iv * 0.95);
            }
            if (floorOk > 0.5 && isShop < 0.5 && dV < 190.0) {   // équipements et accidents de façade : climatiseurs (+ coulure), VMC, paraboles, trous d'enduit
              float d2 = 1.0 - smoothstep(70.0, 190.0, dV);
              float hasWin = max(step(0.5, textureGrad(uFacadeAux, vec3(0.5, 0.5, layer), gdx, gdy).r), max(step(0.5, textureGrad(uFacadeAux, vec3(0.5, 0.38, layer), gdx, gdy).r), step(0.5, textureGrad(uFacadeAux, vec3(0.5, 0.65, layer), gdx, gdy).r)));   // la case contient une fenêtre : condition logique des accessoires
              vec2 ch = vec2(h21(cell * 1.71 + seed * 3.7 + eSeed * 4.9 + 2.3), h21(cell * 2.93 + seed * 5.1 + eSeed * 6.7 + 7.7)); float hb = h21(cell * 0.87 + seed * 9.1 + eSeed * 8.3 + 3.1);
              if (ch.x < 0.09 && hasWin > 0.5) {   // groupe de climatisation extérieur, grille de ventilateur, trace de condensat en dessous
                vec2 q = (fc - vec2(0.17, 0.22)) / vec2(0.13, 0.085); float bx = step(abs(q.x), 1.0) * step(abs(q.y), 1.0), fan = smoothstep(0.62, 0.5, length(vec2(q.x * 0.85, q.y * 1.5)));
                vec3 ac = mix(vec3(0.84, 0.84, 0.81), vec3(0.20, 0.21, 0.23), fan * 0.9) * (0.92 + 0.08 * q.y);
                diffuseColor.rgb = mix(diffuseColor.rgb, ac, bx * wm * d2);
                float dr = step(abs(fc.x - 0.15), 0.022) * step(fc.y, 0.135) * (0.35 + 0.65 * (1.0 - fc.y / 0.135));
                diffuseColor.rgb *= 1.0 - wm * dr * 0.55 * d2 * (1.0 - bx);
              }
              if (ch.y < 0.09 && hasWin > 0.5) {   // bouche de VMC / extraction : disque sombre cerclé de clair
                float l = length((fc - vec2(0.84, 0.80)) * vec2(1.0, 1.0));
                vec3 vm = mix(vec3(0.16), vec3(0.72, 0.71, 0.68), smoothstep(0.036, 0.05, l));
                diffuseColor.rgb = mix(diffuseColor.rgb, vm, wm * smoothstep(0.062, 0.05, l) * d2);
                diffuseColor.rgb *= 1.0 - 0.35 * wm * smoothstep(0.0, 0.25, fc.y * 0.0 + smoothstep(0.80, 0.55, fc.y) * step(abs(fc.x - 0.84), 0.05)) * d2;
              }
              if (h21(vec2(seed, 21.1)) < 0.62) {   // tuyau de plomberie : descend du haut de la façade (sous le toit) jusqu'au sol, avec décrochements à angle droit et ramifications
                float Q = P.x + seed * 40.0, pc = floor(Q / 6.0), xp = pc * 6.0 + 0.4 + 5.2 * h21(vec2(pc, seed * 3.0));
                if (h21(vec2(pc, seed)) < 0.72 && P.y >= 0.0 && P.y < nF - 0.04) {
                  float jog = h21(vec2(pc, seed * 11.0)) < 0.6 ? (h21(vec2(pc, seed * 13.0)) - 0.5) * 1.8 : 0.0, yb = 0.8 + max(nF - 1.6, 0.0) * h21(vec2(pc, seed * 17.0)), yc = 0.5 + max(nF - 1.0, 0.0) * h21(vec2(pc, seed * 19.0)), sg = h21(vec2(pc, seed * 23.0)) < 0.5 ? -1.0 : 1.0;
                  float xv = P.y > yb ? xp : xp + jog;                                  // colonne haute / basse (décrochement à angle droit à yb)
                  float wv = 0.078, we = 0.054;                                        // ×1,5 par rapport à la version précédente
                  float pp = smoothstep(wv, wv - 0.018, abs(Q - xv));
                  float hz = smoothstep(wv, wv - 0.018, abs(P.y - yb)) * step(min(xp, xp + jog) - wv, Q) * step(Q, max(xp, xp + jog) + wv) * step(0.001, abs(jog));
                  float br = smoothstep(wv * 0.9, wv * 0.6, abs(P.y - yc)) * step(xv, Q) * step(Q, xv + 0.55) * (sg > 0.0 ? 1.0 : 0.0) + smoothstep(wv * 0.9, wv * 0.6, abs(P.y - yc)) * step(xv - 0.55, Q) * step(Q, xv) * (sg < 0.0 ? 1.0 : 0.0);   // ramification horizontale
                  br *= step(0.55, h21(vec2(pc, seed * 29.0)));
                  float m = max(pp, max(hz, br));
                  vec3 pcU = h21(vec2(pc, seed * 5.0)) < 0.5 ? vec3(0.58, 0.34, 0.20) : vec3(0.42, 0.44, 0.46);
                  float cl = smoothstep(0.13, 0.09, abs(Q - xv)) * step(0.92, fract(P.y * 2.0)) * step(0.5, P.y);   // colliers de fixation
                  float sh = 0.75 + 0.45 * smoothstep(0.0, 0.05, abs(Q - xv) - 0.02) * 0.0 + 0.30 * smoothstep(0.02, -0.03, Q - xv);
                  diffuseColor.rgb = mix(diffuseColor.rgb, pcU * sh, wm * m * d2);
                  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12), wm * cl * d2 * 0.8);
                }
              }
              if (hb >= 0.085 && hb < 0.17 && hasWin > 0.5) {   // linge qui sèche : fil + vêtements colorés
                float uu = clamp((fc.x - 0.18) / 0.64, 0.0, 0.999), gx = floor(uu * 5.0), gf = fract(uu * 5.0), gh = h21(vec2(gx, cell.x * 3.1 + cell.y * 7.7 + seed));
                float len = 0.10 + 0.14 * h21(vec2(gh, gx)), inG = step(0.14, gf) * step(gf, 0.86) * step(gh, 0.68) * step(0.18, fc.x) * step(fc.x, 0.82) * step(fc.y, 0.56) * step(0.56 - len, fc.y);
                vec3 gc = 0.55 + 0.45 * cos(6.2832 * (gh * 1.7 + vec3(0.0, 0.33, 0.67)));
                float cord = smoothstep(0.012, 0.004, abs(fc.y - 0.56)) * step(0.16, fc.x) * step(fc.x, 0.84);
                diffuseColor.rgb = mix(diffuseColor.rgb, gc, inG * d2); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1), cord * 0.6 * d2 * (1.0 - inG));
              }
              if (h21(vec2(seed, 22.2)) < 0.30 && h21(vec2(cell.y, seed * 2.0)) < 0.5) {   // fils électriques / téléphoniques qui pendent d'un point à l'autre de la façade
                float t = fract((P.x + seed * 9.0) / 4.0), wy = 0.94 - 0.24 * 4.0 * t * (1.0 - t);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06), smoothstep(0.011, 0.004, abs(fc.y - wy)) * d2 * 0.9);
              }
              if (hb < 0.035 && hasWin > 0.5) {   // antenne parabolique : disque clair, centre sombre, bras
                vec2 q = fc - vec2(0.80, 0.32); float l = length(q);
                vec3 pd = mix(vec3(0.80, 0.80, 0.78), vec3(0.32, 0.32, 0.34), smoothstep(0.03, 0.0, l));
                diffuseColor.rgb = mix(diffuseColor.rgb, pd, wm * smoothstep(0.075, 0.065, l) * d2);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2), wm * step(abs(q.x + q.y * 0.5), 0.008) * step(l, 0.11) * step(0.075, l) * d2);
              } else if (hb >= 0.035 && hb < 0.085) {   // enduit tombé : trou irrégulier laissant voir la brique / le support
                float nb = textureGrad(uGrime2, fc * 0.45 + vec2(seed * 3.1, seed * 1.7), gdx * 0.25, gdy * 0.25).b * 0.5 + textureGrad(uGrime, fc * 0.8 + vec2(seed), gdx * 0.25, gdy * 0.25).b * 0.3;
                float l = length((fc - vec2(0.5, 0.30)) * vec2(1.0, 1.4)) - nb * 0.10;
                vec3 hole = mix(vec3(0.55, 0.30, 0.22), vec3(0.24, 0.20, 0.18), smoothstep(0.05, 0.13, 0.16 - l));
                diffuseColor.rgb = mix(diffuseColor.rgb, hole * (0.8 + 0.5 * h21(floor(fc * 14.0) + seed)), wm * smoothstep(0.17, 0.14, l) * d2);
              }
            }
            if (hM < 0.25) {   // mousse / humidité ascendante au pied du mur
              float mo = smoothstep(0.9, 0.0, P.y + (g1.r - 0.5) * 0.8) * (0.5 + 0.5 * g3.r);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.70, 0.55), wm * mo * 0.7);
            }
          }
          // coulures d'humidité sous corniche et au pied des murs
          diffuseColor.rgb *= 1.0 - 0.14 * ta.g * smoothstep(0.55, 1.0, fract(P.y)) * h21(vec2(floor(P.x * 5.0), floor(P.y) + seed));
        }
        float wCov = 0.0; vec3 wTint = vec3(1.0);
        { // diversité des fenêtres : volets fermés / entrebaillés, stores plus ou moins baissés, rideaux, jardinières (par fenêtre, au hasard, à courte distance)
          float dW = length(vViewPosition);
          if (floorOk > 0.5 && isShop < 0.5 && dW < 230.0) {
            float hw = h21(cell * 1.37 + seed * 6.1 + 0.7), hf = h21(cell * 2.11 + seed * 4.3 + 1.9), hc = h21(cell * 0.73 + seed * 2.9 + 5.5);
            float fwq = max(length(gdx), length(gdy));
            if (ta.r > 0.5 && hw < 0.52) {
              float au = 0.0, ad = 0.0, al = 0.0, ar = 0.0;
              for (int i = 1; i <= 8; i++) { float o = float(i) * 0.05;
                au += step(0.5, textureGrad(uFacadeAux, vec3(fc + vec2(0.0, o), layer), gdx, gdy).r); ad += step(0.5, textureGrad(uFacadeAux, vec3(fc - vec2(0.0, o), layer), gdx, gdy).r);
                al += step(0.5, textureGrad(uFacadeAux, vec3(fc - vec2(o, 0.0), layer), gdx, gdy).r); ar += step(0.5, textureGrad(uFacadeAux, vec3(fc + vec2(o, 0.0), layer), gdx, gdy).r); }
              float pt = au / (au + ad + 0.001), px = al / (al + ar + 0.001);
              float slat = mix(0.85, 0.65 + 0.35 * step(0.5, fract(fc.y * 34.0)), 1.0 - smoothstep(0.1, 0.4, fwq * 34.0));
              vec3 shC = hc < 0.2 ? vec3(0.22, 0.34, 0.30) : hc < 0.4 ? vec3(0.28, 0.36, 0.52) : hc < 0.6 ? vec3(0.55, 0.50, 0.44) : hc < 0.8 ? vec3(0.42, 0.20, 0.17) : vec3(0.80, 0.78, 0.72);
              float a = 0.0; vec3 fab = vec3(0.0);
              if (hw < 0.10) { a = 1.0; fab = shC * slat; }                                                    // volet fermé
              else if (hw < 0.17) { a = step(0.52, px); fab = shC * slat; }                                    // volet entrebaillé (un battant fermé)
              else if (hw < 0.31) { float cv = 0.12 + 0.85 * hf; a = step(pt, cv); fab = mix(vec3(0.86, 0.82, 0.72), vec3(0.62, 0.64, 0.66), step(0.5, hc)) * (0.86 + 0.14 * step(0.5, fract(pt * 26.0 + 0.2))); }   // store baissé plus ou moins
              else { float fold = 0.78 + 0.22 * sin(fc.x * 90.0 + hc * 6.0); float dr = step(px, 0.27) + step(0.73, px); a = max(0.55, dr); fab = mix(vec3(0.90, 0.88, 0.82), hc < 0.35 ? vec3(0.66, 0.24, 0.22) : hc < 0.7 ? vec3(0.28, 0.40, 0.55) : vec3(0.72, 0.62, 0.40), min(dr, 1.0)) * fold; }   // voilage + rideaux
              diffuseColor.rgb = mix(diffuseColor.rgb, fab, a * 0.92); wCov = a; wTint = clamp(fab * 1.6, 0.0, 1.0);
            } else if (ta.r < 0.5 && ta.g > 0.3 && hf < 0.16) {   // jardinière sous la fenêtre : bande fleurie juste sous la vitre
              float g1 = step(0.5, textureGrad(uFacadeAux, vec3(fc + vec2(0.0, 0.06), layer), gdx, gdy).r), g2 = step(0.5, textureGrad(uFacadeAux, vec3(fc + vec2(0.0, 0.12), layer), gdx, gdy).r);
              if (max(g1, g2) > 0.5) { vec2 fp = floor(fc * vec2(70.0, 45.0)); float hh = h21(fp + seed), fl = step(0.72, hh);
                vec3 flc = hh > 0.93 ? vec3(0.95, 0.94, 0.90) : hh > 0.86 ? vec3(0.92, 0.72, 0.16) : hh > 0.79 ? vec3(0.85, 0.22, 0.30) : vec3(0.85, 0.35, 0.55);
                vec3 leaf = vec3(0.14, 0.30, 0.10) * (0.7 + 0.6 * h21(fp * 1.7));
                diffuseColor.rgb = mix(vec3(0.30, 0.20, 0.13), mix(leaf, flc, fl), g2 > 0.5 ? 0.95 : 0.55); }
            }
          }
        }
        diffuseColor.rgb *= mix(0.60, 1.0, smoothstep(-0.5, 5.0, vInfo.w));   // occlusion près du sol`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float pLit = mix(0.42, 0.85, isShop);
        // les fenêtres s'allument et s'éteignent au fil de la nuit : ~14 % changent toutes les 1,5 h (fondu), moins d'allumées tard dans la nuit
        float hh = uClock < 12.0 ? uClock + 24.0 : uClock;
        // creux nocturne centré sur 4h (hh = 28 dans ce repère 12h-36h) : un seul sommet, décroissance continue de part et d'autre plutôt
        // qu'un plateau à valeur constante (ancien trapèze 2h30-5h) - la réduction est donc la plus forte pile à 4h et redescend en
        // douceur, sans palier, en couvrant largement le créneau 3h-5h demandé (à 3h/5h, encore ~2/3 de l'effet max).
        float bump4 = 1.0 - smoothstep(0.0, 2.6, abs(hh - 28.0));
        pLit *= 1.0 - 0.95 * bump4;   // jusqu'à ~95 % de fenêtres éteintes au cœur de la nuit
        // chaque fenêtre a son propre rythme (période 10-45 s réelles, déphasage individuel) : elle tire au sort son état à chaque période,
        // avec un fondu de 2,5 s. Horloge réelle : continue même quand l'heure du jour est en pause. Seule la densité (pLit) dépend de l'heure.
        float P = mix(10.0, 45.0, h21(cell + seed * 2.3 + 4.1)), ph = h21(cell + seed * 4.7 + 1.3) * P;
        float tt = mod(uTime, 20000.0) + ph, sl = floor(tt / P), fr = tt - sl * P;
        float base = h21(cell + seed + 9.0); vec2 c3 = cell + seed * 3.1;
        float r0 = h21(c3 + sl * 7.31) < 0.52 ? h21(c3 + sl * 3.9 + 50.0) : base, r1 = h21(c3 + (sl + 1.0) * 7.31) < 0.52 ? h21(c3 + (sl + 1.0) * 3.9 + 50.0) : base;   // 52 % de chances de changer d'état à chaque période (davantage de variations individuelles, à la demande)
        float lit = mix(step(1.0 - pLit, r0), step(1.0 - pLit, r1), smoothstep(P - 2.0, P, fr));
        // allumage / extinction progressifs et individuels : chaque fenêtre a son seuil sur uDrive (crépuscule -> nuit, aube -> jour), seuils différents le soir et le matin
        float tw = h21(cell + seed * 1.9 + 6.7), tm = h21(cell + seed * 2.9 + 3.1);
        float thr = 0.03 + mix(0.85, 0.5, isShop) * (uClock < 12.0 ? tm : tw);
        float onLv = smoothstep(thr, thr + 0.12, uDrive);
        // teinte : 3 nuances (ampoule chaude courante / halogène blanc chaud / éclairage plus froid type LED-écran)
        // au lieu de 2, pour des fenêtres moins uniformes d'un bâtiment à l'autre
        float hc = h21(cell + seed + 2.0);
        vec3 lightC = hc < 0.58 ? vec3(1.0, 0.70, 0.34) : hc < 0.86 ? vec3(1.0, 0.92, 0.72) : vec3(0.78, 0.86, 1.0);
        // luminosité individuelle par fenêtre : le hash ne dépendait QUE de cell (position relative dans la façade),
        // pas de seed (bâtiment) - deux bâtiments avec la même grille de fenêtres affichaient donc exactement les
        // mêmes fenêtres plus/moins lumineuses aux mêmes endroits (motif répété visible sur toute une rue). Ajout de
        // seed pour une variation vraiment propre à chaque fenêtre de chaque bâtiment, et plage élargie (0,55-1,35
        // au lieu de 0,7-1,3) pour un rendu plus random/naturel, moins de fenêtres à l'éclat quasi identique.
        totalEmissiveRadiance += mix(lightC, lightC * wTint, wCov) * lit * onLv * ta.r * (1.0 - 0.45 * wCov) * mix(0.6, 1.0, uNight) * uLights * 1.5 * (0.55 + 0.8 * h21(cell + seed * 3.7 + 1.7));`);
  };
  const walls = new THREE.Mesh(geoOf(W, true), wallMat);
  walls.castShadow = walls.receiveShadow = true; walls.frustumCulled = false;

  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  roofMat.onBeforeCompile = (sh) => {
    sh.uniforms.uRoofTex = { value: ROOFT }; if (terrain.orthoU) Object.assign(sh.uniforms, terrain.orthoU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform sampler2D uRoofTex; uniform sampler2D uOrtho; uniform float uOrthoOn; uniform vec3 uOh; uniform sampler2D uOhT; uniform float uRO;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wn = normalize(cross(dFdx(vWP), dFdy(vWP)));
        vec3 aw = pow(abs(wn), vec3(4.0)); aw /= (aw.x + aw.y + aw.z + 1e-4);
        vec3 rt = aw.y * texture2D(uRoofTex, vWP.xz / 3.2).rgb + aw.x * texture2D(uRoofTex, vWP.zy / 3.2).rgb + aw.z * texture2D(uRoofTex, vWP.xy / 3.2).rgb;
        diffuseColor.rgb *= rt * 1.3;
        vec3 vc0 = diffuseColor.rgb;
        { // photo aérienne IGN sur les toits (faces tournées vers le haut)
          vec2 ouv = (vWP.xz + uRO) / (2.0 * uRO);
          vec4 oc = texture2D(uOrtho, ouv);
          float om = oc.a * uOrthoOn * step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
          vec3 photo = oc.rgb / max(oc.a, 0.001);
          if (uOh.z > 1.0) {
            vec2 huv = (vWP.xz - uOh.xy) / uOh.z + 0.5; vec2 e = min(huv, 1.0 - huv);
            vec4 hc = texture2D(uOhT, huv); float ha = hc.a * smoothstep(0.0, 0.06, min(e.x, e.y));
            photo = mix(photo, hc.rgb / max(hc.a, 0.001), ha); om = max(om, ha * uOrthoOn);
          }
          float pl = dot(photo, vec3(0.299, 0.587, 0.114));
          photo = clamp(mix(vec3(pl), photo, 0.85) * vec3(1.04, 1.0, 0.92) * 0.8, 0.0, 0.66);
          diffuseColor.rgb = mix(diffuseColor.rgb, photo, om * smoothstep(0.6, 0.85, aw.y) * 0.85);
        }
        { // variété des toitures : zinc / ardoise à joints debout (sens de la pente), patchs de mousse et de patine à grande échelle (1 seul échantillon de plus)
          float dR = length(vViewPosition), sat = max(vc0.r, max(vc0.g, vc0.b)) - min(vc0.r, min(vc0.g, vc0.b));
          float grey = 1.0 - smoothstep(0.05, 0.16, sat), nr = 1.0 - smoothstep(120.0, 380.0, dR);
          vec2 sd = wn.xz; float sl = length(sd); vec2 dir = sl > 0.05 ? sd / sl : vec2(1.0, 0.0);
          float across = dot(vWP.xz, vec2(-dir.y, dir.x)) / 0.62, sm = abs(fract(across) - 0.5), fw = fwidth(across), fade = (1.0 - smoothstep(0.12, 0.35, fw)) * nr;
          float seam = 0.0;   // joints supprimés : provoquaient un moiré de lignes fines sur tous les toits
                    
          float l2 = dot(texture2D(uRoofTex, vWP.xz / 19.0 + 0.37).rgb, vec3(0.333));
          float mo = smoothstep(0.66, 0.90, l2) * aw.y * nr;
          diffuseColor.rgb *= 0.88 + 0.28 * l2 * nr + (1.0 - nr) * 0.12;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.92, 0.70), mo * 0.5);
        }`);
  };
  const roofs = new THREE.Mesh(geoOf(R, false), roofMat);
  roofs.castShadow = roofs.receiveShadow = true; roofs.frustumCulled = false;
  group.add(walls, roofs);

  // "Rendu maquette" : matériaux plats et clairs, sans la texture de façade procédurale (fenêtres, commerces,
  // grime...), pour un rendu épuré façon plan-masse d'architecte - cf. setStyle() ci-dessous. Volontairement PAS
  // un blanc uniforme à 100 % identique partout (ça fait "rendu 3D", pas "maquette en papier découpée à la main) :
  // chaque bâtiment reçoit sa propre teinte de blanc (comme des feuilles de papier différentes), un grain de surface
  // et une rugosité légèrement différente, plus une touche de lumière sur les arêtes (le papier qui accroche la lumière).
  const wallFlat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  wallFlat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: terrain.NOISE };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec4 vInfoFl;\nvarying vec2 vWUvFl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfoFl = aInfo; vWUvFl = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; varying vec4 vInfoFl; varying vec2 vWUvFl;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bh = fract(sin(vInfoFl.x * 12.9898) * 43758.5453);   // même empreinte par bâtiment que le rendu détaillé (aInfo.x)
        vec3 paper = mix(vec3(0.90, 0.87, 0.79), vec3(0.98, 0.96, 0.89), bh);
        vec4 gr = texture2D(uNoise, vWUvFl * vec2(6.0, 2.0) + bh * 11.0);
        diffuseColor.rgb = paper * (0.90 + 0.18 * gr.r);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (bh - 0.5) * 0.3, 0.55, 1.0);`)
      .replace('#include <opaque_fragment>', `{ float frE = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5); outgoingLight += frE * 0.05; }
        #include <opaque_fragment>`);
  };
  const roofFlat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true, side: THREE.DoubleSide });
  roofFlat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: terrain.NOISE };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPFlat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPFlat = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; varying vec3 vWPFlat;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bh = fract(dot(vColor, vec3(12.9898, 78.233, 37.719)) * 43758.5453);   // empreinte par toit (dérivée de sa teinte d'origine, jamais affichée telle quelle)
        vec3 paper = mix(vec3(0.88, 0.85, 0.76), vec3(0.96, 0.93, 0.86), bh);
        vec4 gr = texture2D(uNoise, vWPFlat.xz * 1.6 + bh * 11.0);
        diffuseColor.rgb = paper * (0.90 + 0.18 * gr.r);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (bh - 0.5) * 0.3, 0.55, 1.0);`)
      .replace('#include <opaque_fragment>', `{ float frE = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5); outgoingLight += frE * 0.05; }
        #include <opaque_fragment>`);
  };

  return {
    group, count: nb, lamps: new Float32Array(lamps),
    setNight(night, on, drive) { uniforms.uNight.value = night; uniforms.uLights.value = on ? 1 : 0; uniforms.uDrive.value = drive === undefined ? night : drive; },
    setClock(h) { uniforms.uClock.value = h; },
    setTime(t) { uniforms.uTime.value = t; },
    setStyle(flat) { walls.material = flat ? wallFlat : wallMat; roofs.material = flat ? roofFlat : roofMat; },
  };
}
