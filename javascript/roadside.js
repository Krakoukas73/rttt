import * as THREE from 'three';
import { chaikin, jointWidths, taperW } from './roads.js';

// Trottoirs surélevés (bordure 15 cm). Les tronçons OSM d'une même rue sont d'abord chaînés (même nom, même classe, prolongement droit) pour obtenir de longs rubans continus ;
// un trottoir est posé du côté bâti (bâtiment à moins de ~18 m du trottoir), les petits trous sont comblés (≤ 30 m), les fragments < 9 m supprimés,
// et il n'est interrompu que devant les vraies voies qui débouchent (bateau) : chaque extrémité reçoit une tranche de fermeture.
const WID = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6, 5: 3.4, 6: 6 };
const LAY = { 5: 2, 6: 2, 4: 3, 3: 4, 2: 5, 1: 6, 0: 7 };
const SW = { 1: 2.2, 2: 2.0, 3: 1.8, 4: 1.6, 6: 2.0 };
const CURB = 0.15, STEP = 2.5, FILL = 20, MINRUN = 4, MINLEN = 14;   // FILL/MINRUN en échantillons de STEP mètres

export function buildSidewalks(data, terrain) {
  const group = new THREE.Group(); group.name = 'sidewalks';
  const roads = (data.roads || []).filter((r) => r.p && r.p.length >= 2 && r.k <= 6);
  const hwOf = (r) => (r.w && r.k <= 6 ? r.w : WID[r.k]) / 2;
  const JW = jointWidths(roads, (r) => (r.w && r.k <= 6 ? r.w : WID[r.k]));   // mêmes largeurs de raccord que la chaussée
  const CS = 40, sg = new Map(), K = (i, j) => i * 100003 + j;
  roads.forEach((r, ri) => { const h = hwOf(r) + 0.3;
    for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], s = [x1, z1, x2, z2, h, ri];
      for (let cx = Math.floor((Math.min(x1, x2) - h) / CS); cx <= Math.floor((Math.max(x1, x2) + h) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - h) / CS); cz <= Math.floor((Math.max(z1, z2) + h) / CS); cz++) { const k = K(cx, cz); let a = sg.get(k); if (!a) sg.set(k, a = []); a.push(s); } } });
  const onOther = (x, z, own) => { for (const [x1, z1, x2, z2, h, ri] of sg.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) { if (own.has(ri) || roads[ri].k === 5) continue;   // les accès/voies de service ne coupent pas le trottoir (abaissé)
   
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)); if (Math.hypot(x1 + dx * t - x, z1 + dz * t - z) < h) return true; } return false; };
  const BC = 18, bg = new Map();
  for (const b of data.buildings || []) for (const q of b.p) { const k = K(Math.floor(q[0] / BC), Math.floor(q[1] / BC)); let a = bg.get(k); if (!a) bg.set(k, a = []); a.push(q); }
  const urban = (x, z) => { const cx = Math.floor(x / BC), cz = Math.floor(z / BC); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of bg.get(K(cx + a, cz + b)) || []) if (Math.hypot(q[0] - x, q[1] - z) < 18) return true; return false; };
  // ---- chaînage des tronçons
  const cand = []; roads.forEach((r, ri) => { if (r.k !== 0 && r.k !== 5 && !r.rb && !r.b && SW[r.k]) cand.push(ri); });
  const ends = new Map(), ekey = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  for (const ri of cand) { const r = roads[ri], n = r.p.length; for (const e of [0, 1]) { const k = ekey(e ? r.p[n - 1] : r.p[0]); let a = ends.get(k); if (!a) ends.set(k, a = []); a.push([ri, e]); } }
  const link = new Map();   // "ri:e" -> "rj:f"
  const dirOut = (ri, e) => { const p = roads[ri].p, n = p.length, a = e ? p[n - 1] : p[0], b = e ? p[n - 2] : p[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  for (const list of ends.values()) { if (list.length < 2) continue; const pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const [a, ea] = list[i], [b, eb] = list[j]; if (a === b) continue; const ra = roads[a], rb = roads[b];
      if (Math.abs(ra.k - rb.k) > 1 || (ra.nm && rb.nm && ra.nm !== rb.nm)) continue; const da = dirOut(a, ea), db = dirOut(b, eb), d = da[0] * db[0] + da[1] * db[1]; if (d < -0.7) pairs.push([d, list[i], list[j]]); }
    pairs.sort((x, y) => x[0] - y[0]);
    for (const [, A, B] of pairs) { const ka = A[0] + ':' + A[1], kb = B[0] + ':' + B[1]; if (link.has(ka) || link.has(kb)) continue; link.set(ka, kb); link.set(kb, ka); } }
  const used = new Set(), chains = [];
  const walk = (ri, e0) => {   // part de l'extrémité libre e0 de ri, avance par l'autre extrémité
    const pts = [], hws = [], sws = [], ids = new Set(); let cur = ri, ent = e0;
    for (let guard = 0; guard < 400; guard++) { used.add(cur); ids.add(cur); const p = roads[cur].p, seq = ent === 0 ? p : p.slice().reverse();
      const rw = hwOf(roads[cur]) * 2, jw = JW.get(cur) || [null, null], w0 = ent === 0 ? jw[0] : jw[1], w1 = ent === 0 ? jw[1] : jw[0], cum = [0]; for (let i = 1; i < seq.length; i++) cum.push(cum[i - 1] + Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]));
      for (let i = pts.length ? 1 : 0; i < seq.length; i++) { pts.push(seq[i]); hws.push(taperW(rw, w0, w1, cum[i], cum[seq.length - 1]) / 2); sws.push(SW[roads[cur].k] || 1.8); }
      const out = ent === 0 ? 1 : 0, nx = link.get(cur + ':' + out); if (!nx) break; const [nj, ne] = nx.split(':').map(Number); if (used.has(nj)) break; cur = nj; ent = ne; }
    return { pts, hws, sws, ids, r: roads[ri] }; };
  for (const ri of cand) { if (used.has(ri)) continue; for (const e of [0, 1]) if (!link.has(ri + ':' + e)) { chains.push(walk(ri, e)); break; } }
  for (const ri of cand) if (!used.has(ri)) chains.push(walk(ri, 0));   // boucles fermées
  // ---- géométrie
  const P = [], C = [], I = [], UV = [], TS = 3.0;   // TS : côté (m) de la tuile de texture (5 x 5 dalles de 60 cm)
  const quad = (a, b, c, d, col, uv) => { const k = P.length / 3; [a, b, c, d].forEach((q, j) => { P.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); UV.push(uv[j][0], uv[j][1]); }); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const tri = (a, b, c, col, uv) => { const k = P.length / 3; [a, b, c].forEach((q, j) => { P.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); UV.push(uv[j][0], uv[j][1]); }); I.push(k, k + 1, k + 2); };
  const ENDS = [];   // extrémités de bandes (pour les raccords d'angle aux carrefours)
  let strips = 0, samples = 0;
  const CUR = [1.12, 1.11, 1.08], OUT = [0.6, 0.6, 0.58];   // teintes multipliées par la texture de dalles
  for (const ch of chains) {
    const r = ch.r, hw = hwOf(r), sw = SW[r.k], ly = 0.09 + 0.03 * (LAY[r.k] || 3), pts = chaikin(ch.pts, 2), S = [];
    for (let i = 0; i < pts.length - 1; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], l = Math.hypot(x2 - x1, z2 - z1) || 1, n = Math.max(1, Math.ceil(l / STEP));
      for (let k = 0; k < n; k++) S.push([x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, (x2 - x1) / l, (z2 - z1) / l]); }
    S.push([pts[pts.length - 1][0], pts[pts.length - 1][1], S[S.length - 1][2], S[S.length - 1][3]]);
    // largeur de chaussée et de trottoir par échantillon (interpolées le long de la chaîne, puis lissées sur ±5 échantillons) : plus de marche latérale entre tronçons
    const NS = S.length, sc = [0]; for (let i = 1; i < NS; i++) sc.push(sc[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    const ic = [0]; for (let i = 1; i < ch.pts.length; i++) ic.push(ic[i - 1] + Math.hypot(ch.pts[i][0] - ch.pts[i - 1][0], ch.pts[i][1] - ch.pts[i - 1][1]));
    const hwR = new Array(NS), swR = new Array(NS); { let j = 0; for (let i = 0; i < NS; i++) { const f = sc[i] / (sc[NS - 1] || 1) * ic[ic.length - 1]; while (j < ic.length - 2 && ic[j + 1] < f) j++; const t = Math.max(0, Math.min(1, (f - ic[j]) / ((ic[j + 1] - ic[j]) || 1)));
      hwR[i] = ch.hws[j] + (ch.hws[j + 1] - ch.hws[j]) * t; swR[i] = ch.sws[j] + (ch.sws[j + 1] - ch.sws[j]) * t; } }
    const smooth = (a) => a.map((_, i) => { let q = 0, c = 0; for (let k = Math.max(0, i - 5); k <= Math.min(NS - 1, i + 5); k++) { q += a[k]; c++; } return q / c; });
    const hwS = smooth(hwR), swS = smooth(swR);
    for (const sd of [1, -1]) {
      const N = S.length, ur = new Array(N), free = new Array(N);
      for (let i = 0; i < N; i++) { const [x, z, tx, tz] = S[i], nx = tz * sd, nz = -tx * sd, hw = hwS[i], sw = swS[i];
        ur[i] = urban(x + nx * (hw + 9), z + nz * (hw + 9));
        free[i] = !onOther(x + nx * (hw + 0.1), z + nz * (hw + 0.1), ch.ids) && !onOther(x + nx * (hw + sw * 0.5), z + nz * (hw + sw * 0.5), ch.ids) && !onOther(x + nx * (hw + sw), z + nz * (hw + sw), ch.ids); }
      // fermeture morphologique : trous ≤ FILL échantillons comblés entre deux zones bâties, puis fragments < MINRUN supprimés
      for (let i = 0; i < N;) { if (ur[i]) { i++; continue; } let j = i; while (j < N && !ur[j]) j++; if (i > 0 && j < N && j - i <= FILL) for (let k = i; k < j; k++) ur[k] = true; i = j; }
      for (let i = 0; i < N;) { if (!ur[i]) { i++; continue; } let j = i; while (j < N && ur[j]) j++; if (j - i < MINRUN) for (let k = i; k < j; k++) ur[k] = false; i = j; }
      let run = [];
      const flush = () => { if (run.length >= 2) { let L0 = 0; for (let i = 1; i < run.length; i++) L0 += Math.hypot(run[i].xi - run[i - 1].xi, run[i].zi - run[i - 1].zi); if (L0 < MINLEN) run = []; }
      if (run.length >= 2) { strips++;
          const yb = (x, z) => terrain.heightAt(x, z) + ly;
          const tone0 = 0.9 + 0.12 * ((strips * 2654435761 >>> 0) % 100) / 100;
          let su = 0; const ss = [0]; for (let i = 1; i < run.length; i++) { su += Math.hypot(run[i].xi - run[i - 1].xi, run[i].zi - run[i - 1].zi); ss.push(su); }   // abscisse le long du trottoir -> u de la texture
          const u0 = ((strips * 0.6180339) % 1) * 5;   // décalage aléatoire par bande : les dalles ne s'alignent pas d'un trottoir à l'autre
          for (let i = 0; i < run.length - 1; i++) { const a = run[i], b = run[i + 1], col = [tone0, tone0 * 0.985, tone0 * 0.95], ua = u0 + ss[i] / TS, ub = u0 + ss[i + 1] / TS, wa = a.sw / TS, wb = b.sw / TS;
            const ai = yb(a.xi, a.zi), bi = yb(b.xi, b.zi), ao = yb(a.xo, a.zo), bo = yb(b.xo, b.zo);
            quad([a.xi, ai, a.zi], [b.xi, bi, b.zi], [b.xi, bi + CURB, b.zi], [a.xi, ai + CURB, a.zi], CUR, [[ua, 0.3], [ub, 0.3], [ub, 0.35], [ua, 0.35]]);
            quad([a.xi, ai + CURB, a.zi], [b.xi, bi + CURB, b.zi], [b.xo, bo + CURB, b.zo], [a.xo, ao + CURB, a.zo], col, [[ua, 0], [ub, 0], [ub, wb], [ua, wa]]);
            quad([a.xo, ao + CURB, a.zo], [b.xo, bo + CURB, b.zo], [b.xo, bo - 0.1, b.zo], [a.xo, ao - 0.1, a.zo], OUT, [[ua, 0.5], [ub, 0.5], [ub, 0.54], [ua, 0.54]]); }
          for (const q of [run[0], run[run.length - 1]]) { const bi = yb(q.xi, q.zi), bo = yb(q.xo, q.zo); quad([q.xi, bi, q.zi], [q.xi, bi + CURB, q.zi], [q.xo, bo + CURB, q.zo], [q.xo, bo - 0.1, q.zo], CUR, [[0.2, 0.3], [0.2, 0.35], [0.3, 0.35], [0.3, 0.3]]); }   // tranche de fermeture
          if (run.length >= 3) for (const [q, q2, e, sgn] of [[run[0], run[1], 0, -1], [run[run.length - 1], run[run.length - 2], run.length - 1, 1]]) { const dx = q.xi - q2.xi, dz = q.zi - q2.zi, l = Math.hypot(dx, dz) || 1;
            ENDS.push({ ix: q.xi, iz: q.zi, ox: q.xo, oz: q.zo, dx: dx / l, dz: dz / l, u: u0 + ss[e] / TS, sgn, sw: q.sw, tone: tone0, id: strips, ly }); }
        } run = []; };
      for (let i = 0; i < N; i++) { const [x, z, tx, tz] = S[i], nx = tz * sd, nz = -tx * sd, hw = hwS[i], sw = swS[i];
        if (!(ur[i] && free[i])) { flush(); continue; }
        samples++; run.push({ xi: x + nx * hw, zi: z + nz * hw, xo: x + nx * (hw + sw), zo: z + nz * (hw + sw), sw }); }
      flush();
    }
  }
  // ---- raccords d'angle : deux bandes qui se rejoignent à un carrefour (rues sécantes) sont reliées par un vrai coin (bordure et façade prolongées jusqu'à leur intersection)
  { const cr = (ax, az, bx, bz) => ax * bz - az * bx, GC = 12, gr = new Map(), key = (x, z) => Math.floor(x / GC) * 100003 + Math.floor(z / GC);
    ENDS.forEach((e, i) => { const k = key(e.ix, e.iz); let a = gr.get(k); if (!a) gr.set(k, a = []); a.push(i); });
    const cand = [];
    ENDS.forEach((A, i) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of gr.get(key(A.ix + a * GC, A.iz + b * GC)) || []) { if (j <= i) continue; const B = ENDS[j]; if (A.id === B.id) continue;
      const den = cr(A.dx, A.dz, B.dx, B.dz); if (Math.abs(den) < 0.3) continue;
      const wx = B.ix - A.ix, wz = B.iz - A.iz, t = cr(wx, wz, B.dx, B.dz) / den, u = cr(wx, wz, A.dx, A.dz) / den;   // intersection des arêtes de bordure (côté chaussée)
      if (t < -1 || t > 3.5 || u < -1 || u > 3.5) continue;
      const ci = [A.ix + A.dx * t, A.iz + A.dz * t], w2x = B.ox - A.ox, w2z = B.oz - A.oz, t2 = cr(w2x, w2z, B.dx, B.dz) / den, u2 = cr(w2x, w2z, A.dx, A.dz) / den;   // ... et des arêtes côté façade
      if (t2 < -1 || t2 > 9 || u2 < -1 || u2 > 9) continue;
      const co = [A.ox + A.dx * t2, A.oz + A.dz * t2];
      if ((co[0] - ci[0]) * (A.ox - A.ix) + (co[1] - ci[1]) * (A.oz - A.iz) <= 0 || (co[0] - ci[0]) * (B.ox - B.ix) + (co[1] - ci[1]) * (B.oz - B.iz) <= 0) continue;   // le coin doit être du côté bâti des deux bandes
      if (Math.hypot(co[0] - ci[0], co[1] - ci[1]) > 7) continue;
      cand.push({ i, j, ci, co, sc: Math.abs(t) + Math.abs(u) + Math.abs(t2) * 0.3 + Math.abs(u2) * 0.3 }); } });
    cand.sort((x, y) => x.sc - y.sc); const usedE = new Set(); let corners = 0;
    for (const c of cand) { if (usedE.has(c.i) || usedE.has(c.j)) continue; usedE.add(c.i); usedE.add(c.j); const A = ENDS[c.i], B = ENDS[c.j];
      const yb = (x, z) => terrain.heightAt(x, z) + (A.ly + B.ly) / 2, col = [(A.tone + B.tone) / 2, (A.tone + B.tone) / 2 * 0.985, (A.tone + B.tone) / 2 * 0.95];
      const V = (x, z, dy) => [x, yb(x, z) + dy, z], nA = [-A.dz, A.dx]; const nn = (A.ox - A.ix) * nA[0] + (A.oz - A.iz) * nA[1] < 0 ? -1 : 1;
      const uvf = (x, z) => [A.u + A.sgn * ((x - A.ix) * A.dx + (z - A.iz) * A.dz) / TS, ((x - A.ix) * nA[0] + (z - A.iz) * nA[1]) * nn / TS];   // repère de la bande A : les dalles se prolongent
      const pts = [[A.ix, A.iz], c.ci, [B.ix, B.iz], [B.ox, B.oz], c.co, [A.ox, A.oz]], T = pts.map(([x, z]) => V(x, z, CURB)), uv = pts.map(([x, z]) => uvf(x, z));
      for (let k = 1; k < 5; k++) tri(T[1], T[k + 1 > 5 ? 0 : k + 1] , T[k + 2 > 5 ? (k + 2) % 6 : k + 2], col, [uv[1], uv[k + 1 > 5 ? 0 : k + 1], uv[k + 2 > 5 ? (k + 2) % 6 : k + 2]]);
      for (const [p, q] of [[0, 1], [1, 2]]) quad(V(pts[p][0], pts[p][1], 0), V(pts[q][0], pts[q][1], 0), V(pts[q][0], pts[q][1], CURB), V(pts[p][0], pts[p][1], CURB), CUR, [[0.1, 0.3], [0.3, 0.3], [0.3, 0.35], [0.1, 0.35]]);   // bordure sur les deux arêtes côté chaussée
      for (const [p, q] of [[3, 4], [4, 5]]) quad(V(pts[p][0], pts[p][1], CURB), V(pts[q][0], pts[q][1], CURB), V(pts[q][0], pts[q][1], -0.1), V(pts[p][0], pts[p][1], -0.1), OUT, [[0.1, 0.5], [0.3, 0.5], [0.3, 0.54], [0.1, 0.54]]);
      corners++; (window.__swCP || (window.__swCP = [])).push(c.ci); }
    window.__swCorners = corners; }
  if (P.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.setIndex(I); geo.computeVertexNormals();
    const tl = new THREE.TextureLoader(), tex = (f, srgb) => { const t = tl.load(new URL('../textures/' + f, import.meta.url).href + '?v=2'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };   // texture de dalles sans couture (tools/gen_trottoir.py)
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('trottoir.jpg', true), bumpMap: tex('trottoir_h.png', false), bumpScale: 1.2, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -16, polygonOffsetUnits: -16 })); m.frustumCulled = false; m.receiveShadow = true; group.add(m); }
  window.__sidewalks = { chains: chains.length, strips, samples, quads: I.length / 6 };
  return { group };
}
