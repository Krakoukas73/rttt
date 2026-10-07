import * as THREE from 'three';

// Mobilier routier (OSM : feux, passages piétons, stops, arrêts de bus, abris) + marquages au sol (passages piétons, lignes d'arrêt, cédez-le-passage aux T).
// Deux groupes : « furn » (feux, panneaux, abris) et « marks » (peinture au sol).
const WID = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6, 5: 3.4, 6: 6 };
const LAY = { 5: 2, 6: 2, 4: 3, 3: 4, 2: 5, 1: 6, 0: 7 };
const hashN = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };

export function buildFurniture(data, terrain) {
  const furn = new THREE.Group(); furn.name = 'furniture';
  const marks = new THREE.Group(); marks.name = 'marks';
  const roads = (data.roads || []).filter((r) => r.p && r.p.length >= 2 && r.k <= 6 && !r.b);
  const hwOf = (r) => (r.w && r.k <= 6 ? r.w : WID[r.k]) / 2;
  const yr = (r) => 0.09 + 0.03 * (LAY[r.k] || 3);
  const CS = 30, grid = new Map(), K = (i, j) => i * 100003 + j;
  roads.forEach((r, ri) => { const h = hwOf(r) + 14; let cum = 0;
    for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], l = Math.hypot(x2 - x1, z2 - z1), sgm = [x1, z1, x2, z2, ri, i, cum, l]; cum += l;
      for (let cx = Math.floor((Math.min(x1, x2) - h) / CS); cx <= Math.floor((Math.max(x1, x2) + h) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - h) / CS); cz <= Math.floor((Math.max(z1, z2) + h) / CS); cz++) { const k = K(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(sgm); } }
    r._L = cum; });
  const nearest = (x, z, maxd, kmax = 6) => { let best = null;
    for (const [x1, z1, x2, z2, ri, i, cum, l] of grid.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) { const r = roads[ri]; if (r.k > kmax) continue;
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), qx = x1 + dx * t, qz = z1 + dz * t, d = Math.hypot(x - qx, z - qz);
      if (d < maxd && (!best || d < best.d)) best = { r, ri, x: qx, z: qz, d, tx: dx / (Math.sqrt(l2) || 1), tz: dz / (Math.sqrt(l2) || 1), s: cum + t * l, i, hw: hwOf(r) }; }
    return best; };
  // point hors de toute chaussée (marge m) : repoussé perpendiculairement au bord de la route la plus gênante ; null si impossible
  const clearSpot = (x, z, m = 0.6) => {
    for (let it = 0; it < 6; it++) { let worst = null, wd = 0;
      for (const [x1, z1, x2, z2, ri] of grid.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) { const r = roads[ri], hw = hwOf(r) + m;
        const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), qx = x1 + dx * t, qz = z1 + dz * t, d = Math.hypot(x - qx, z - qz);
        if (d < hw && hw - d > wd) { wd = hw - d; worst = [qx, qz, d, dx, dz, l2]; } }
      if (!worst) return [x, z];
      let ux, uz; if (worst[2] > 1e-3) { ux = (x - worst[0]) / worst[2]; uz = (z - worst[1]) / worst[2]; } else { const l = Math.sqrt(worst[5]); ux = -worst[4] / l; uz = worst[3] / l; }
      x += ux * (wd + 0.05); z += uz * (wd + 0.05); }
    return null; };
  // ---- peinture au sol
  const MP = [], MI = []; let markMat = null;
  const paint = (cx, cz, ux, uz, len, wid, along, lat, r) => {   // rectangle : centre + along*u + lat*n (n = droite de u) ; longueur len le long de u
    const nx = -uz, nz = ux, ox = cx + ux * along + nx * lat, oz = cz + uz * along + nz * lat, k = MP.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = ox + ux * len / 2 * a + nx * wid / 2 * b, z = oz + uz * len / 2 * a + nz * wid / 2 * b; MP.push(x, terrain.heightAt(x, z) + yr(r) + 0.02, z); }
    MI.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const onRoad = (x, z) => { for (const [x1, z1, x2, z2, ri] of grid.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) { const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
      if (Math.hypot(x1 + dx * t - x, z1 + dz * t - z) < hwOf(roads[ri]) + 0.15) return true; } return false; };
  const extent = (x, z, ux, uz, hw0) => {   // étendue latérale (sur n = (−uz, ux)) de la surface roulable autour du point : traverse séparateurs et chaussées jumelles (trous ≤ 2,5 m)
    const nx = -uz, nz = ux, ex = [0, 0];
    [-1, 1].forEach((sg, k) => { let last = 0, gap = 0; for (let d = 0.5; d < Math.max(hw0 * 2.4, 9); d += 0.5) { if (onRoad(x + nx * sg * d, z + nz * sg * d)) { last = d; gap = 0; } else if ((gap += 0.5) > 2.5) break; } ex[k] = Math.max(last, hw0) * sg; });
    return ex; };
  const placedZ = [], placedR = [];   // passages piétons déjà tracés (évite les superpositions)
  const zebra = (x, z, ux0, uz0, along, r, hw, cw = 3.2) => {
    let ux = ux0, uz = uz0;
    { // barres parallèles à la route locale (passage perpendiculaire à l'axe), sens conservé
      const q = nearest(x + ux0 * along, z + uz0 * along, 6, 4); if (!q) return false;
      let tx = q.tx, tz = q.tz; if (tx * ux0 + tz * uz0 < 0) { tx = -tx; tz = -tz; } ux = tx; uz = tz; hw = q.hw || hw; }
    const cx = x + ux * along, cz = z + uz * along; if (placedZ.some((q) => { const dd = Math.hypot(q[0] - cx, q[1] - cz), dt = Math.abs(q[2] * ux + q[3] * uz); return dd < 5 || (dd < 12 && dt > 0.7) || (dd < 14 && dt > 0.25 && dt <= 0.7); })) return false;   // pas deux passages parallèles à moins de 12 m, ni obliques l'un par rapport à l'autre à moins de 14 m
    const px = x + ux * along, pz = z + uz * along, ex = extent(px, pz, ux, uz, hw), lo = ex[0] + 0.3, hi = ex[1] - 0.3;   // d'un bord à l'autre de la chaussée
    if (hi - lo < 2.5) return false;
    { // le passage doit traverser toute la chaussée : route continue sur l'axe, et chaussée finie de part et d'autre
      for (let t = lo - 0.3; t <= hi + 0.3; t += 0.8) { const mx = px - uz * t, mz = pz + ux * t; if (!onRoad(mx, mz)) return false; }
      for (const t of [lo - 1.6, hi + 1.6]) if (onRoad(px - uz * t, pz + ux * t)) return false; }
    { // deux passages ne doivent jamais se croiser : test d'intersection de rectangles orientés (SAT), marge 0,8 m
      const mid0 = (lo + hi) / 2, rc = { x: px - uz * mid0, z: pz + ux * mid0, ax: [ux, uz], ay: [-uz, ux], hx: cw / 2 + 0.8, hy: (hi - lo) / 2 + 0.8 };
      const hit = (A, B) => { for (const ax of [A.ax, A.ay, B.ax, B.ay]) { const dx = B.x - A.x, dz = B.z - A.z, d = Math.abs(dx * ax[0] + dz * ax[1]);
          const pr = (R) => R.hx * Math.abs(R.ax[0] * ax[0] + R.ax[1] * ax[1]) + R.hy * Math.abs(R.ay[0] * ax[0] + R.ay[1] * ax[1]); if (d > pr(A) + pr(B)) return false; } return true; };
      if (placedR.some((q) => hit(rc, q))) return false; placedR.push(rc); placedZ.push([cx, cz, ux, uz]);
    }
    const n = Math.max(2, Math.floor((hi - lo + 0.5) / 1.0)), span = n * 1.0 - 0.5, mid = (lo + hi) / 2;   // barres de 0,5 m au pas de 1 m, centrées sur l'étendue
    for (let i = 0; i < n; i++) paint(x, z, ux, uz, cw, 0.5, along, mid - span / 2 + 0.25 + i * 1.0, r); return true; };
  // ---- structures
  const FP = [], FC = [], FI = [];
  const fq = (a, b, c, d, col) => { const k = FP.length / 3; for (const q of [a, b, c, d]) { FP.push(q[0], q[1], q[2]); FC.push(col[0], col[1], col[2]); } FI.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const fbox = (cx, cz, tx, tz, sl, sw, y0, y1, col, offN = 0) => { const nx = tz, nz = -tx, a = sl / 2, b = sw / 2, c = (u, v, y) => [cx + tx * u + nx * (v + offN), y, cz + tz * u + nz * (v + offN)];
    const L = [c(-a, -b, y0), c(a, -b, y0), c(a, b, y0), c(-a, b, y0)], U = [c(-a, -b, y1), c(a, -b, y1), c(a, b, y1), c(-a, b, y1)];
    fq(U[0], U[1], U[2], U[3], col); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; fq(L[i], L[j], U[j], U[i], col); } };
  const heads = [];   // lanternes : { x, y, z, q (0 rouge, 1 orange, 2 vert), g (axe), ph }
  const POLE = [0.32, 0.34, 0.36], HEAD = [0.05, 0.05, 0.06], SIGNB = [0.08, 0.30, 0.78], WHITE = [0.94, 0.94, 0.92], RED = [0.78, 0.07, 0.07], GLASSC = [0.66, 0.80, 0.88], DARKC = [0.20, 0.22, 0.25];
  let nZebra = 0, nTs = 0, nBs = 0, nSh = 0, nSt = 0, nGive = 0;
  const F = data.furn || [];
  const lampHead = (hx, hz, ux, uz, yc, g, ph) => {   // boîtier de feu tourné vers le conducteur (+u), 3 lanternes
    fbox(hx, hz, ux, uz, 0.30, 0.42, yc - 0.60, yc + 0.60, HEAD); fbox(hx + ux * 0.16, hz + uz * 0.16, ux, uz, 0.03, 0.62, yc - 0.72, yc + 0.72, [0.9, 0.9, 0.88]);   // boîtier + liseré blanc
    for (let q = 0; q < 3; q++) heads.push({ x: hx + ux * 0.22, z: hz + uz * 0.22, y: yc + 0.36 - q * 0.36, q, g, ph }); };
  // ---- feux tricolores : mât + potence au-dessus de la voie, plus un feu bas sur le mât
  const placedT = [];
  for (const f of F) if (f.t === 'ts') {
    const seen = new Set(), dirs = [];
    for (const [x1, z1, x2, z2, ri] of grid.get(K(Math.floor(f.x / CS), Math.floor(f.z / CS))) || []) { const r = roads[ri]; if (r.k > 4 || r.rb) continue;
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((f.x - x1) * dx + (f.z - z1) * dz) / l2)), qx = x1 + dx * t, qz = z1 + dz * t; if (Math.hypot(f.x - qx, f.z - qz) > 6) continue;
      const l = Math.sqrt(l2), ux = dx / l, uz = dz / l;
      for (const sg of [1, -1]) { const u = [ux * sg, uz * sg]; if (r.ow === 1 && sg === 1) continue;   // sens unique : seule la branche par où l'on arrive
        const key = ri + ':' + sg; if (seen.has(key)) continue; seen.add(key);
        if (!nearest(qx + u[0] * 8, qz + u[1] * 8, 3, 4)) continue;
        if (dirs.some((d) => d.ux * u[0] + d.uz * u[1] > 0.93 && Math.hypot(d.qx - qx, d.qz - qz) < 6)) continue;
        dirs.push({ ux: u[0], uz: u[1], qx, qz, r }); } }
    if (!dirs.length) continue; nTs++;
    const ph0 = hashN(f.x, f.z) * 32, hwMax = Math.max(...dirs.map((d) => hwOf(d.r)));
    for (const d of dirs) {   // droite du conducteur qui arrive (direction −u) : (uz, −ux)
      const rgx = d.uz, rgz = -d.ux, hw = hwOf(d.r), a = Math.atan2(d.uz, d.ux), g = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 0 : 1;
      const stop = hwMax + 3.4, cx = d.qx + d.ux * stop, cz = d.qz + d.uz * stop;   // au-delà de la largeur de la voie transversale
      if (placedT.some((q) => Math.hypot(q.x - cx, q.z - cz) < 9 || (q.ux * d.ux + q.uz * d.uz > 0.8 && Math.hypot(q.x - cx, q.z - cz) < 32))) continue;   // un seul feu par approche, jamais 2 feux voisins
      const P0 = clearSpot(cx + rgx * (hw + 0.9), cz + rgz * (hw + 0.9), 0.4); if (!P0) continue;
      placedT.push({ x: cx, z: cz, ux: d.ux, uz: d.uz });
      const [px, pz] = P0, gy = terrain.heightAt(px, pz), armL = Math.min(hw * 0.9, 5.0), H = 5.4;
      fbox(px, pz, d.ux, d.uz, 0.22, 0.22, gy, gy + H, POLE);                                                          // mât
      fbox(px, pz, d.ux, d.uz, 0.14, armL, gy + H - 0.25, gy + H - 0.05, POLE, -armL / 2 * 1);                        // potence vers la chaussée (côté gauche du conducteur = −rg)
      lampHead(px - rgx * armL * 0.85, pz - rgz * armL * 0.85, d.ux, d.uz, gy + H - 0.95, g, ph0);                      // feu suspendu au-dessus de la voie
      lampHead(px, pz, d.ux, d.uz, gy + 3.0, g, ph0);                                                                   // répétiteur bas sur le mât
      // marquages : ligne d'arrêt (moitié de voie du conducteur) et passage piéton
      paint(cx, cz, d.ux, d.uz, 0.5, hw - 0.5, 1.4, -((hw - 0.5) / 2 + 0.25), d.r);
      if (zebra(cx, cz, d.ux, d.uz, -1.3, d.r, hw, 3.2)) nZebra++;
    }
  }
  // ---- passages piétons isolés (crossing)
  for (const f of F) if (f.t === 'cr') { const n = nearest(f.x, f.z, 7, 4); if (!n || n.r.rb || n.s < 4 || n.s > n.r._L - 4) continue;
    if (!zebra(n.x, n.z, n.tx, n.tz, 0, n.r, n.hw, 3.2)) continue; nZebra++;
  }
  // ---- stops
  for (const f of F) if (false && f.t === 'st') { const n = nearest(f.x, f.z, 6, 4); if (!n || n.r._L < 12) continue;
    const toEnd = n.s < n.r._L / 2 ? -1 : 1, ux = -n.tx * toEnd, uz = -n.tz * toEnd;
    if (n.r.ow === 1 && toEnd === -1) continue;
    const rgx = uz, rgz = -ux, P0 = clearSpot(n.x + rgx * (n.hw + 0.9), n.z + rgz * (n.hw + 0.9), 0.4); if (!P0) continue; const gy = terrain.heightAt(P0[0], P0[1]);
    fbox(P0[0], P0[1], ux, uz, 0.1, 0.1, gy, gy + 2.5, POLE); fbox(P0[0], P0[1], ux, uz, 0.06, 0.78, gy + 2.5, gy + 3.28, RED); fbox(P0[0] + ux * 0.04, P0[1] + uz * 0.04, ux, uz, 0.03, 0.5, gy + 2.78, gy + 3.0, WHITE); nSt++;
    paint(n.x, n.z, ux, uz, 0.5, n.hw - 0.4, 0, -((n.hw - 0.4) / 2 + 0.2), n.r); }
  // ---- arrêts de bus (mât + panneau ; abri quand OSM l'indique) et abris isolés
  const placedB = [];
  for (const f of F) if (f.t === 'bs') { const n = nearest(f.x, f.z, 16, 6); if (!n) continue;
    if (placedB.some((q) => Math.hypot(q[0] - f.x, q[1] - f.z) < 9)) continue; placedB.push([f.x, f.z]);
    const lat = (f.x - n.x) * -n.tz + (f.z - n.z) * n.tx, sd = lat >= 0 ? 1 : -1, nx = -n.tz * sd, nz = n.tx * sd;
    if (false) {   // abri : toit, deux montants, panneau vitré au fond, banc, affiche
      const P0 = clearSpot(n.x + nx * (n.hw + 2.0), n.z + nz * (n.hw + 2.0), 0.3); if (!P0) continue; const [px, pz] = P0, gy = terrain.heightAt(px, pz), tx = -sd * n.tx, tz = -sd * n.tz;   // tangente choisie pour que la normale de fbox pointe à l'opposé de la route
      fbox(px, pz, tx, tz, 3.4, 1.9, gy + 2.45, gy + 2.6, DARKC);                                               // toit
      for (const e of [-1.55, 1.55]) fbox(px + tx * e, pz + tz * e, tx, tz, 0.12, 0.12, gy, gy + 2.45, POLE);   // montants
      fbox(px, pz, tx, tz, 3.2, 0.06, gy + 0.15, gy + 2.4, GLASSC, 0.8);                                         // vitrage du fond (côté opposé à la route)
      fbox(px, pz, tx, tz, 0.06, 1.6, gy + 0.15, gy + 2.4, GLASSC, 0);
      fbox(px, pz, tx, tz, 1.9, 0.38, gy + 0.42, gy + 0.5, [0.35, 0.25, 0.15], 0.35);                             // banc
      fbox(px, pz, tx, tz, 1.15, 0.04, gy + 0.9, gy + 2.15, [0.96, 0.96, 0.9], 0.72);                            // affiche
      if (f.t === 'bs') { fbox(px + tx * 1.55, pz + tz * 1.55, tx, tz, 0.07, 0.07, gy + 2.6, gy + 3.7, POLE); fbox(px + tx * 1.55, pz + tz * 1.55, tx, tz, 0.05, 0.62, gy + 3.0, gy + 3.7, SIGNB); }
      nSh++; }
    else { continue;   // poteaux d'arrêts de bus (panneau bleu) supprimés à la demande
      const P0 = clearSpot(n.x + nx * (n.hw + 0.9), n.z + nz * (n.hw + 0.9), 0.4); if (!P0) continue; const [px, pz] = P0, gy = terrain.heightAt(px, pz);
      fbox(px, pz, n.tx, n.tz, 0.09, 0.09, gy, gy + 3.4, POLE); fbox(px, pz, n.tx, n.tz, 0.06, 0.75, gy + 2.55, gy + 3.5, SIGNB); fbox(px, pz, n.tx, n.tz, 0.08, 0.44, gy + 2.95, gy + 3.28, WHITE); fbox(px, pz, n.tx, n.tz, 0.09, 0.3, gy + 2.7, gy + 2.86, SIGNB);
      fbox(px, pz, n.tx, n.tz, 0.06, 0.75, gy + 2.55, gy + 3.5, SIGNB); nBs++; } }
  // ---- cédez-le-passage aux T
  roads.forEach((r, ri) => { if (r.k < 3 || r.rb || r._L < 14) return;
    for (const e of [0, 1]) { if (r.ow === 1 && e === 0) continue;
      const pe = e === 0 ? r.p[0] : r.p[r.p.length - 1], pn = e === 0 ? r.p[1] : r.p[r.p.length - 2], l = Math.hypot(pn[0] - pe[0], pn[1] - pe[1]) || 1;
      const j = nearest(pe[0], pe[1], 2.0, r.k - 1); if (!j || j.ri === ri || j.r.rb) continue;
      const ux = (pn[0] - pe[0]) / l, uz = (pn[1] - pe[1]) / l, back = j.hw + 2.6;
      if (l < back + 1) continue; const cx = pe[0] + ux * back, cz = pe[1] + uz * back, hw = hwOf(r);
      /* trait cédez-le-passage supprimé */ nGive++; } });
  // ---- flèches directionnelles au sol (algorithme : à chaque carrefour, chaque approche reçoit des flèches par voie selon les sorties existantes gauche / tout droit / droite)
  let nArrow = 0;
  { const key = (q) => Math.round(q[0] * 5) + ',' + Math.round(q[1] * 5), nodes = new Map();
    roads.forEach((r, ri) => { if (r.k > 4 || r.rb || r.p.length < 2 || r._L < 14) return;
      for (const e of [0, 1]) { const n = r.p.length, a = e ? r.p[n - 1] : r.p[0], b = e ? r.p[n - 2] : r.p[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = key(a); let g = nodes.get(k); if (!g) nodes.set(k, g = []);
        g.push({ ri, r, e, a, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }); } });   // (dx,dz) : direction depuis le nœud le long de la voie
    const tri = (px, pz, ux, uz, len, hwid, r) => { const k = MP.length / 3, nx = -uz, nz = ux, y = yr(r) + 0.02;   // tête de flèche : triangle (base à p, pointe à p+u·len)
      const P = [[px + nx * hwid, pz + nz * hwid], [px - nx * hwid, pz - nz * hwid], [px + ux * len, pz + uz * len], [px + ux * len, pz + uz * len]]; for (const [x, z] of P) MP.push(x, terrain.heightAt(x, z) + y, z); MI.push(k, k + 1, k + 2); };
    const bar = (px, pz, ux, uz, len, wid, r) => paint(px, pz, ux, uz, len, wid, len / 2, 0, r);   // rectangle démarrant en p
    const arrow = (cx, cz, tx, tz, kind, r) => {   // (cx,cz) : centre de voie ; (tx,tz) : sens de marche ; kind : sous-ensemble de 'L', 'S', 'R'
      const rx = -tz, rz = tx, bx = cx - tx * 1.7, bz = cz - tz * 1.7, hasS = kind.includes('S');
      const side = (sg) => { const th = 0.85, ux = tx * Math.cos(th) + rx * sg * Math.sin(th), uz = tz * Math.cos(th) + rz * sg * Math.sin(th), sx = cx + tx * 0.2, sz = cz + tz * 0.2;
        bar(sx, sz, ux, uz, 0.95, 0.30, r); tri(sx + ux * 0.95, sz + uz * 0.95, ux, uz, 0.85, 0.5, r); };
      if (hasS) { bar(bx, bz, tx, tz, 2.3, 0.30, r); tri(cx + tx * 0.6, cz + tz * 0.6, tx, tz, 1.05, 0.52, r); } else bar(bx, bz, tx, tz, 1.9, 0.30, r);
      if (kind.includes('L')) side(-1); if (kind.includes('R')) side(1); nArrow++; };
    for (const g of nodes.values()) { if (g.length < 3) continue;
      const hwN = Math.max(...g.map((q) => hwOf(q.r))), dd = hwN + 10;
      for (const q of g) { const r = q.r; if (r.k > 3 && g.length < 3) continue;
        if (r.ow === 1 && q.e === 0) continue; if (r.ow === -1 && q.e === 1) continue;   // sens unique : on n'arrive que dans le bon sens
        if (r._L < dd + 6) continue;
        const tx = -q.dx, tz = -q.dz, rx = -tz, rz = tx;   // sens de marche vers le nœud
        let L = 0, S = 0, R = 0;
        for (const o of g) { if (o === q) continue; const r2 = o.r; if (r2.ow === 1 && o.e === 1) continue; if (r2.ow === -1 && o.e === 0) continue;   // sortie interdite (sens unique)
          const f = o.dx * tx + o.dz * tz, sd = o.dx * rx + o.dz * rz, ang = Math.atan2(sd, f); if (Math.abs(ang) > 2.6) continue; if (ang < -0.5) L = 1; else if (ang > 0.5) R = 1; else S = 1; }
        if (L + S + R < 2) continue;   // pas de choix : pas de flèche
        const w = r.w || (r.k <= 1 ? 10.5 : r.k <= 3 ? 8 : 5.6), nl = r.ow ? Math.max(1, r.ln || Math.floor(w / 3.4)) : Math.max(1, Math.min(4, Math.floor(w / 6.8 + 0.25)));
        const lanes = Array.from({ length: nl }, () => 'S');
        if (L) lanes[0] = 'L'; if (R) lanes[nl - 1] = lanes[nl - 1] === 'L' ? 'LR' : 'R';
        if (nl === 1) lanes[0] = (L ? 'L' : '') + (S ? 'S' : '') + (R ? 'R' : '');
        else if (nl === 2 && S && L && R) { lanes[0] = 'L'; lanes[1] = 'SR'; }
        else if (nl >= 2 && S && L && !R) lanes[0] = 'SL' ;
        const px = q.a[0] - tx * dd, pz = q.a[1] - tz * dd;   // point d'arrivée, dd avant le nœud
        lanes.forEach((kd, i) => { const lat = r.ow ? (i - (nl - 1) / 2) * 3.4 : (i + 0.5) * 3.4; if (r.ow === 0 || !r.ow) { if ((i + 0.5) * 3.4 > hwOf(r)) return; }
          arrow(px + rx * lat, pz + rz * lat, tx, tz, kd, r); }); }
    }
    window.__arrows = nArrow; }
  // ---- assemblage
  if (MP.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(MP, 3)); g.setIndex(MI); g.computeVertexNormals();
    markMat = new THREE.MeshBasicMaterial({ color: 0x9a9891, polygonOffset: true, polygonOffsetFactor: -14, polygonOffsetUnits: -14, depthWrite: false, side: THREE.DoubleSide, transparent: true, opacity: 0.62 });
    const m = new THREE.Mesh(g, markMat); m.renderOrder = 12; m.frustumCulled = false; marks.add(m); }
  if (FP.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(FP, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(FC, 3)); g.setIndex(FI); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide })); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; furn.add(m); }   // mâts/feux fins : ombre portée coûteuse et insignifiante, retirée
  let setPhase = () => {};
  if (heads.length) {
    const pos = new Float32Array(heads.length * 3), col = new Float32Array(heads.length * 3);
    heads.forEach((h, i) => { pos[i * 3] = h.x; pos[i * 3 + 1] = h.y; pos[i * 3 + 2] = h.z; });
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; { const c = cv.getContext('2d'), gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lamp = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.3, map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    lamp.frustumCulled = false; furn.add(lamp);
    const halo = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3.4, map: lamp.material.map, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));   // halo large : les feux se voient de loin
    halo.frustumCulled = false; furn.add(halo);
    const CR = [[1, 0.12, 0.06], [1, 0.6, 0.05], [0.12, 1, 0.3]]; let last = -1;
    setPhase = (t) => { const tk = Math.floor(t * 2); if (tk === last) return; last = tk;
      heads.forEach((h, i) => { const tt = (t + h.ph + h.g * 16) % 32, st = tt < 13 ? 2 : tt < 15 ? 1 : 0;   // 0 rouge, 1 orange, 2 vert
        const on = st === h.q ? 1 : 0.05, c = CR[h.q]; col[i * 3] = c[0] * on; col[i * 3 + 1] = c[1] * on; col[i * 3 + 2] = c[2] * on; });
      geo.attributes.color.needsUpdate = true; };
    setPhase(0);
  }
  window.__furn = { ts: nTs, zebra: nZebra, bs: nBs, sh: nSh, st: nSt, give: nGive, heads: heads.length / 3 };
  return { furn, marks, update: (clock) => setPhase(clock), setNight: (n) => { if (markMat) markMat.color.setScalar(0.62 - 0.48 * Math.min(1, n * 1.2)); }, count: nTs + nBs + nSh + nSt };
}
