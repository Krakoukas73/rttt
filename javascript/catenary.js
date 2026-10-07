import * as THREE from 'three';
import { chaikin } from './roads.js';

// Caténaire ferroviaire : poteaux espacés régulièrement (cadence réaliste, ~50 m) le long de chaque voie ferrée (k=9), avec
// une potence latérale qui rejoint l'axe de la voie et y accroche un fil de contact. Poteaux pleins simplifiés (pas de
// treillis détaillé, pour rester léger en triangles sur tout un réseau ferré). Le fil n'épouse plus le relief point par
// point (ce qui le faisait paraître tendu au ras du rail) : il est maintenant interpolé en ligne tendue entre 2 points
// d'accroche successifs (poteaux ou extrémités de voie) avec un fléchissement parabolique proportionnel à la portée -
// look "câble légèrement pendant" plutôt qu'un ruban raide. Rendu en croix (2 bandes perpendiculaires) pour rester
// lisible/épais sous tous les angles de vue sans passer par un tube rond coûteux en triangles.
const POLE_STEP = 50, POLE_H = 6.4, ARM_LEN = 2.3, WIRE_H = 5.7, POLE_W = 0.16;
const WIRE_THICK = 0.11, SAG_RATIO = 0.014, SAG_MIN = 0.15, SAG_MAX = 1.3;
const METAL = [0.42, 0.43, 0.45], WIRE_COL = [0.2, 0.2, 0.22];

export function buildCatenary(data, terrain) {
  const group = new THREE.Group(); group.name = 'catenary';
  const P = [], C = [], I = [];
  const quad = (a, b, c, d, col) => { const k = P.length / 3; for (const q of [a, b, c, d]) { P.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); } I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const box = (cx, cz, tx, tz, sl, sw, y0, y1, col) => { const nx = tz, nz = -tx, a = sl / 2, b = sw / 2, c = (u, v, y) => [cx + tx * u + nx * v, y, cz + tz * u + nz * v];
    const L = [c(-a, -b, y0), c(a, -b, y0), c(a, b, y0), c(-a, b, y0)], U = [c(-a, -b, y1), c(a, -b, y1), c(a, b, y1), c(-a, b, y1)];
    quad(U[0], U[1], U[2], U[3], col); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(L[i], L[j], U[j], U[i], col); } };
  // brin de fil épais entre 2 points 3D : croix de 2 bandes perpendiculaires (verticale + horizontale), visible/épaisse sous tout angle
  const wireSeg = (a, b) => { const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, h = WIRE_THICK / 2;
    quad([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], [b[0], b[1] - h, b[2]], [a[0], a[1] - h, a[2]], WIRE_COL);
    quad([a[0] + nx * h, a[1], a[2] + nz * h], [b[0] + nx * h, b[1], b[2] + nz * h], [b[0] - nx * h, b[1], b[2] - nz * h], [a[0] - nx * h, a[1], a[2] - nz * h], WIRE_COL); };
  const rails = (data.roads || []).filter((r) => r.k === 9 && r.p && r.p.length >= 2);
  let nPoles = 0, nWires = 0;
  for (const r of rails) {
    const pts = chaikin(r.p, 1), S = [], step = 6;
    for (let i = 0; i < pts.length - 1; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], l = Math.hypot(x2 - x1, z2 - z1) || 1, n = Math.max(1, Math.ceil(l / step));
      for (let k = 0; k < n; k++) S.push({ x: x1 + (x2 - x1) * k / n, z: z1 + (z2 - z1) * k / n, tx: (x2 - x1) / l, tz: (z2 - z1) / l }); }
    S.push({ ...S[S.length - 1], x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
    if (S.length < 2) continue;
    let cum = 0; const rows = S.map((s, i) => { if (i) cum += Math.hypot(s.x - S[i - 1].x, s.z - S[i - 1].z); return { ...s, s: cum }; });

    // points d'accroche du fil : poteaux tous les ~50 m + les 2 extrémités de la voie (portées franches entre appuis)
    const anchors = [0]; let nextPole = POLE_STEP;
    for (let i = 1; i < rows.length; i++) if (rows[i].s >= nextPole) { anchors.push(i); nextPole = rows[i].s + POLE_STEP; }
    if (anchors[anchors.length - 1] !== rows.length - 1) anchors.push(rows.length - 1);
    const attachY = rows.map((row) => terrain.heightAt(row.x, row.z) + WIRE_H);

    // fil : entre 2 points d'accroche successifs, la hauteur est interpolée en ligne tendue (pas rééchantillonnée sur le
    // relief comme avant) avec un fléchissement parabolique - portée qui pend légèrement, comme un vrai câble de caténaire
    for (let a = 0; a < anchors.length - 1; a++) { const i0 = anchors[a], i1 = anchors[a + 1], s0 = rows[i0].s, s1 = rows[i1].s, span = Math.max(1, s1 - s0);
      const y0 = attachY[i0], y1 = attachY[i1], sag = Math.min(SAG_MAX, Math.max(SAG_MIN, span * SAG_RATIO));
      let prev = [rows[i0].x, y0, rows[i0].z];
      for (let i = i0 + 1; i <= i1; i++) { const t = (rows[i].s - s0) / span, y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t), cur = [rows[i].x, y, rows[i].z];
        wireSeg(prev, cur); prev = cur; }
    }
    nWires++;
    // poteaux tous les ~50 m (potence latérale rejoignant l'axe)
    let nextPole2 = 0;
    for (const row of rows) { if (row.s < nextPole2) continue; nextPole2 = row.s + POLE_STEP;
      const nx = row.tz, nz = -row.tx, px = row.x + nx * ARM_LEN, pz = row.z + nz * ARM_LEN, gy = terrain.heightAt(px, pz);
      box(px, pz, 0, 1, POLE_W, POLE_W, gy, gy + POLE_H, METAL);   // mât vertical
      box((px + row.x) / 2, (pz + row.z) / 2, nx, nz, ARM_LEN, POLE_W * 0.7, gy + POLE_H - 0.35, gy + POLE_H - 0.35 + POLE_W * 0.7, METAL);   // potence horizontale vers l'axe
      nPoles++;
    }
  }
  if (P.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide })); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; group.add(m); }   // fils/poteaux fins : ombre portée coûteuse et insignifiante, retirée
  window.__catenary = { poles: nPoles, wires: nWires };
  return { group, poles: nPoles, wires: nWires };
}
