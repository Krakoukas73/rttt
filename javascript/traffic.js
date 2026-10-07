import * as THREE from 'three';
import { chaikin, MAX_CROSS_SLOPE } from './roads.js';
import { buildTrains } from './trains.js';

// ------------------------------------------------------------------ paramètres
const DENS = { 0: 1.9, 1: 1.1, 2: 0.95, 3: 0.85, 4: 0.6 };          // densité relative par classe de voie (moins sur les petites routes)
const VB = { 0: 22, 1: 14, 2: 12, 3: 10.5, 4: 8.5 };                // vitesse de croisière (m/s)
const LAYK = { 0: 7, 1: 6, 2: 5, 3: 4, 4: 3 };                      // niveau d'empilement des routes (voir roads.js)
const WK = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6 };
const rnd = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

// ------------------------------------------------------------------ modèles 3D (un seul maillage fusionné par modèle)
function makeModel(kind, L, W, H, arm = 0) {
  const P = [], N = [], C = [], T = [], I = [];
  const box = (cx, cy, cz, sx, sy, sz, tag, col) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const F = [[[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]], [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
      [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]], [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
      [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]], [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]]];
    for (const [n, vs] of F) {
      const b = P.length / 3;
      for (const v of vs) { P.push(cx + v[0], cy + v[1], cz + v[2]); N.push(...n); C.push(...col); T.push(tag); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  const WHITE = [1, 1, 1], DARK = [0.08, 0.09, 0.11], GLASS = [0.10, 0.14, 0.19], HUB = [0.55, 0.57, 0.6], PLATE = [0.92, 0.92, 0.86];
  const tbox = (cx, cy, cz, Lb, Lt, Wb, Wt, h, tag, col, sh = 0) => {   // volume effilé (pare-brise/lunette inclinés, flancs rentrants)
    const y0 = cy - h / 2, y1 = cy + h / 2, cen = [cx + sh / 2, cy, cz];
    const V = [[cx - Lb / 2, y0, cz - Wb / 2], [cx + Lb / 2, y0, cz - Wb / 2], [cx + Lb / 2, y0, cz + Wb / 2], [cx - Lb / 2, y0, cz + Wb / 2],
      [cx + sh - Lt / 2, y1, cz - Wt / 2], [cx + sh + Lt / 2, y1, cz - Wt / 2], [cx + sh + Lt / 2, y1, cz + Wt / 2], [cx + sh - Lt / 2, y1, cz + Wt / 2]];
    const quad = (a, b, c, d) => {
      const A = V[a], B = V[b], Cc = V[c], e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
      const m = [(A[0] + Cc[0]) / 2 - cen[0], (A[1] + Cc[1]) / 2 - cen[1], (A[2] + Cc[2]) / 2 - cen[2]], idx = [a, b, c, d];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) { idx.reverse(); n = n.map((x) => -x); }
      const b0 = P.length / 3; for (const k of idx) { P.push(...V[k]); N.push(...n); C.push(...col); T.push(tag); } I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    };
    quad(0, 1, 2, 3); quad(4, 5, 6, 7); quad(0, 1, 5, 4); quad(1, 2, 6, 5); quad(2, 3, 7, 6); quad(3, 0, 4, 7);
  };
  const cyl = (cx, cy, cz, r, wd, tag, col) => {   // roue ronde : cylindre d'axe z (14 pans, normales lissées), flancs plats
    const NS = 14, hz = wd / 2;
    for (let i = 0; i < NS; i++) {
      const a0 = i / NS * Math.PI * 2, a1 = (i + 1) / NS * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), b = P.length / 3;
      for (const [x, y, z, nx, ny] of [[c0, s0, -hz, c0, s0], [c1, s1, -hz, c1, s1], [c1, s1, hz, c1, s1], [c0, s0, hz, c0, s0]]) { P.push(cx + x * r, cy + y * r, cz + z); N.push(nx, ny, 0); C.push(...col); T.push(tag); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      for (const sgn of [-1, 1]) { const b2 = P.length / 3; for (const [x, y] of [[0, 0], [c0, s0], [c1, s1]]) { P.push(cx + x * r, cy + y * r, cz + sgn * hz); N.push(0, 0, sgn); C.push(...col); T.push(tag); } if (sgn > 0) I.push(b2, b2 + 1, b2 + 2); else I.push(b2, b2 + 2, b2 + 1); }
    }
  };
  const wheels = () => { for (const sx of [-0.32, 0.32]) for (const sz of [-1, 1]) { const zz = sz * (W / 2 - 0.12); cyl(sx * L, 0.36, zz, 0.36, 0.26, 1, DARK); cyl(sx * L, 0.36, zz + sz * 0.005, 0.2, 0.275, 1, HUB); box(sx * L, 0.7, sz * (W / 2 - 0.06), 0.86, 0.06, 0.4, 1, DARK); } };   // pneu, enjoliveur, passage de roue
  const details = (fx, rx, bw, by) => {   // pare-chocs, calandre, plaques, rétroviseurs
    box(fx, by, 0, 0.16, 0.24, bw * 0.98, 1, DARK); box(rx, by, 0, 0.16, 0.24, bw * 0.98, 1, DARK);
    box(fx + 0.02, by + 0.22, 0, 0.05, 0.16, bw * 0.5, 1, [0.16, 0.17, 0.2]);
    box(fx + 0.09, by + 0.02, 0, 0.02, 0.11, 0.42, 1, PLATE); box(rx - 0.09, by + 0.02, 0, 0.02, 0.11, 0.42, 1, PLATE);
  };
  const lamps = () => { for (const sz of [-1, 1]) { box(L / 2 - 0.04, 0.72, sz * W * 0.33, 0.12, 0.2, 0.32, 2, [1, 1, 0.9]); box(-L / 2 + 0.04, 0.78, sz * W * 0.36, 0.12, 0.2, 0.3, 3, [0.9, 0.05, 0.05]); } };
  const CFG = { sedan: [0.36, 0.46, -0.06], hatch: [0.36, 0.56, -0.12], suv: [0.46, 0.66, -0.05], wagon: [0.36, 0.74, -0.1], coupe: [0.42, 0.4, -0.08], mini: [0.4, 0.62, -0.1] };
  if (kind === 'bike' || kind === 'scoot') {   // cycliste / trottinette : pas de feux, pilote en veste (couleur d'instance)
    const SK = [0.85, 0.66, 0.52];
    if (kind === 'bike') {
      for (const sx of [-0.6, 0.6]) { cyl(sx, 0.33, 0, 0.33, 0.05, 1, DARK); }
      box(0.0, 0.58, 0, 1.0, 0.05, 0.05, 1, DARK); box(-0.2, 0.68, 0, 0.05, 0.42, 0.05, 1, DARK); box(0.42, 0.78, 0, 0.05, 0.62, 0.05, 1, DARK); box(0.42, 1.1, 0, 0.07, 0.05, 0.5, 1, DARK);
      box(-0.22, 0.92, 0, 0.26, 0.05, 0.12, 1, DARK);
      box(-0.02, 1.32, 0, 0.3, 0.6, 0.36, 0, WHITE);
      for (const sz of [-0.13, 0.13]) { box(0.08, 0.86, sz, 0.5, 0.14, 0.13, 1, DARK); if (Math.sign(sz) !== arm) box(0.28, 1.2, sz * 1.6, 0.5, 0.11, 0.1, 0, WHITE); }
      if (arm) { box(-0.02, 1.5, arm * 0.52, 0.1, 0.1, 0.66, 0, WHITE); box(-0.02, 1.5, arm * 0.9, 0.12, 0.12, 0.12, 1, [0.85, 0.66, 0.52]); }   // cycliste qui tourne : bras tendu du côté du virage
      box(0.1, 1.74, 0, 0.23, 0.24, 0.23, 1, SK); box(0.1, 1.87, 0, 0.27, 0.1, 0.27, 0, WHITE);
    } else {
      for (const sx of [-0.45, 0.45]) cyl(sx, 0.12, 0, 0.12, 0.05, 1, DARK);
      box(0.0, 0.17, 0, 0.8, 0.05, 0.16, 1, DARK); box(0.46, 0.65, 0, 0.05, 1.0, 0.05, 1, DARK); box(0.46, 1.12, 0, 0.06, 0.05, 0.42, 1, DARK);
      box(-0.1, 0.65, 0, 0.16, 0.9, 0.3, 1, DARK); box(-0.06, 1.36, 0, 0.24, 0.56, 0.34, 0, WHITE);
      box(0.2, 1.22, 0.2, 0.4, 0.1, 0.1, 0, WHITE); box(0.2, 1.22, -0.2, 0.4, 0.1, 0.1, 0, WHITE);
      box(-0.03, 1.8, 0, 0.22, 0.22, 0.22, 1, SK); box(-0.03, 1.92, 0, 0.25, 0.09, 0.25, 0, WHITE);
    }
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g1.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g1.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g1.setAttribute('aTag', new THREE.Float32BufferAttribute(T, 1));
    g1.setIndex(I); return g1;
  }
  if (kind === 'moto') {   // moto avec pilote : roues, moteur/réservoir (couleur de la moto), carénage, selle, pilote, casque, guidon
    const JK = [0.13, 0.14, 0.18];
    for (const sx of [-0.7, 0.72]) cyl(sx, 0.33, 0, 0.33, 0.16, 1, DARK);
    box(0.0, 0.6, 0, 1.05, 0.36, 0.34, 0, WHITE);
    box(0.6, 0.86, 0, 0.42, 0.52, 0.36, 0, WHITE);
    box(-0.42, 0.85, 0, 0.62, 0.1, 0.3, 1, DARK);
    box(-0.5, 0.7, 0, 0.5, 0.2, 0.3, 0, WHITE);
    box(-0.12, 1.2, 0, 0.36, 0.62, 0.44, 1, JK);
    box(0.3, 1.1, 0.27, 0.5, 0.14, 0.12, 1, JK); box(0.3, 1.1, -0.27, 0.5, 0.14, 0.12, 1, JK);
    box(0.02, 1.62, 0, 0.3, 0.3, 0.3, 0, WHITE);
    box(0.17, 1.62, 0, 0.06, 0.12, 0.26, 1, GLASS);
    box(0.62, 1.12, 0, 0.1, 0.06, 0.72, 1, DARK);
    box(L / 2 - 0.05, 0.85, 0, 0.1, 0.2, 0.2, 2, [1, 1, 0.9]);
    box(-L / 2 + 0.04, 0.85, 0, 0.1, 0.14, 0.24, 3, [0.9, 0.05, 0.05]);
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g0.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g0.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g0.setAttribute('aTag', new THREE.Float32BufferAttribute(T, 1));
    g0.setIndex(I); return g0;
  }
  if (CFG[kind]) {
    const [bhf, clf, cxf] = CFG[kind], bh = H * bhf; tbox(0, 0.28 + bh / 2, 0, L, L * 0.95, W, W * 0.965, bh, 0, WHITE);
    const cl = L * clf, cx = L * cxf, chh = H - 0.28 - bh - 0.04, rake = kind === 'suv' || kind === 'wagon' || kind === 'mini' ? 0.8 : 0.66;
    tbox(cx, 0.28 + bh + chh / 2, 0, cl, cl * rake, W * 0.9, W * 0.8, chh, 1, GLASS, kind === 'wagon' ? -cl * 0.04 : 0);
    tbox(cx, H - 0.05, 0, cl * rake * 1.02, cl * rake * 0.96, W * 0.82, W * 0.78, 0.09, 0, WHITE);
    for (const sz of [-1, 1]) box(cx + cl * 0.34, 0.28 + bh + 0.04, sz * (W / 2 + 0.05), 0.16, 0.11, 0.12, 0, WHITE);
    for (const sz of [-1, 1]) box(cx - cl * 0.06, 0.3 + bh * 0.6, sz * (W / 2 + 0.004), 0.02, bh * 0.55, 0.01 + 0.0, 1, [0.02, 0.02, 0.03]);
    if (kind === 'suv' || kind === 'wagon') for (const sz of [-1, 1]) box(cx, H - 0.015, sz * W * 0.29, cl * 0.92, 0.045, 0.045, 1, [0.05, 0.05, 0.06]);   // galerie de toit
    details(L / 2 - 0.08, -L / 2 + 0.08, W, 0.4);
  } else if (kind === 'pickup') {
    const bh = H * 0.4; box(0, 0.3 + bh / 2, 0, L, bh, W, 0, WHITE);
    box(L * 0.14, 0.3 + bh + (H - 0.3 - bh) / 2, 0, L * 0.34, H - 0.3 - bh, W * 0.92, 1, GLASS);
    box(L * 0.14, H - 0.02, 0, L * 0.3, 0.05, W * 0.86, 0, WHITE);
    box(-L * 0.27, 0.3 + bh + 0.02, 0, L * 0.42, 0.05, W * 0.86, 1, DARK);
    details(L / 2 - 0.08, -L / 2 + 0.08, W, 0.44);
  } else if (kind === 'delivery') {
    box(-L * 0.15, 0.32 + (H - 0.32) / 2, 0, L * 0.68, H - 0.32, W, 0, WHITE);
    box(L * 0.34, 0.32 + H * 0.3, 0, L * 0.28, H * 0.6, W * 0.98, 0, WHITE);
    box(L * 0.42, 0.32 + H * 0.42, 0, L * 0.12, H * 0.28, W * 0.9, 1, GLASS);
    for (const sz of [-1, 1]) box(L * 0.44, 0.32 + H * 0.44, sz * (W / 2 + 0.06), 0.16, 0.13, 0.14, 1, DARK);
  } else if (kind === 'van') {
    box(-L * 0.12, 0.3 + (H - 0.3) / 2, 0, L * 0.76, H - 0.3, W, 0, WHITE);
    box(L * 0.32, 0.3 + H * 0.24, 0, L * 0.36, H * 0.48, W * 0.98, 0, WHITE);
    box(L * 0.4, 0.3 + H * 0.5, 0, L * 0.2, H * 0.26, W * 0.9, 1, GLASS);
    for (const sz of [-1, 1]) box(L * 0.42, 0.3 + H * 0.52, sz * (W / 2 + 0.06), 0.16, 0.13, 0.14, 1, DARK);
  } else if (kind === 'bus') {
    box(0, 0.4 + (H - 0.4) / 2, 0, L, H - 0.4, W, 0, WHITE);
    box(0, H * 0.62, 0, L * 0.94, H * 0.3, W * 1.01, 1, GLASS);
    for (const sz of [-1, 1]) box(L * 0.46, 0.4 + H * 0.66, sz * (W / 2 + 0.07), 0.14, 0.16, 0.16, 1, DARK);
  } else if (kind === 'tractor') {
    const rr = Math.min(0.85, W * 0.42), rw = 0.5, fr = rr * 0.52, fw = 0.32;
    cyl(-L * 0.24, rr, -(W / 2 - 0.02), rr, rw, 1, DARK); cyl(-L * 0.24, rr, W / 2 - 0.02, rr, rw, 1, DARK);
    cyl(-L * 0.24, rr * 0.6, -(W / 2 - 0.02), rr * 0.58, rw + 0.02, 1, HUB); cyl(-L * 0.24, rr * 0.6, W / 2 - 0.02, rr * 0.58, rw + 0.02, 1, HUB);
    cyl(L * 0.34, fr, -(W / 2 - 0.36), fr, fw, 1, DARK); cyl(L * 0.34, fr, W / 2 - 0.36, fr, fw, 1, DARK);
    box(-L * 0.05, rr * 1.1 + 0.02, 0, L * 0.7, 0.32, W * 0.42, 0, [0.22, 0.23, 0.24]);   // châssis bas
    box(L * 0.24, rr * 1.1 + 0.5, 0, L * 0.32, 0.66, W * 0.58, 0, WHITE);   // capot moteur
    box(-L * 0.1, rr * 1.5, 0, L * 0.36, 1.05, W * 0.74, 0, WHITE);   // cabine
    box(-L * 0.1, rr * 1.55, 0, L * 0.3, 0.8, W * 0.62, 1, GLASS);   // vitrage cabine
    box(-L * 0.1, rr * 2.05, 0, L * 0.38, 0.08, W * 0.76, 0, WHITE);   // toit cabine
    box(L * 0.14, rr * 2.4, W * 0.28, 0.09, 1.15, 0.09, 1, DARK);   // pot d'échappement vertical
  } else if (kind === 'rv') {
    box(-L * 0.07, 0.35 + (H - 0.35) / 2, 0, L * 0.84, H - 0.35, W, 0, WHITE);   // caisse habitable
    box(L * 0.36, 0.35 + H * 0.32, 0, L * 0.2, H * 0.56, W * 0.97, 0, WHITE);   // cabine conducteur (base fourgon)
    box(L * 0.44, 0.35 + H * 0.48, 0, L * 0.05, H * 0.3, W * 0.86, 1, GLASS);   // pare-brise
    box(L * 0.28, H + 0.03, 0, L * 0.24, 0.3, W * 0.9, 0, WHITE);   // capucine (couchette avant en surplomb)
    for (const sz of [-1, 1]) box(-L * 0.1, 0.35 + H * 0.42, sz * (W / 2 + 0.006), L * 0.62, 0.13, 0.012, 1, [0.14, 0.15, 0.17]);   // bande décorative
    for (const sz of [-1, 1]) box(-L * 0.16, 0.35 + H * 0.66, sz * (W / 2 + 0.006), L * 0.46, H * 0.18, 0.012, 1, GLASS);   // bandeau de vitres latérales
    for (const sz of [-1, 1]) box(L * 0.42, 0.35 + H * 0.5, sz * (W / 2 + 0.06), 0.16, 0.13, 0.14, 1, DARK);   // rétroviseurs
  } else {   // camion
    box(L * 0.36, 0.5 + H * 0.36, 0, L * 0.26, H * 0.72, W, 0, WHITE);
    box(L * 0.46, 0.5 + H * 0.5, 0, L * 0.06, H * 0.28, W * 0.9, 1, GLASS);
    box(-L * 0.12, 0.6 + (H - 0.6) / 2, 0, L * 0.7, H - 0.6, W, 0, [0.86, 0.87, 0.88]);
    for (const sz of [-1, 1]) box(L * 0.4, 0.5 + H * 0.5, sz * (W / 2 + 0.08), 0.18, 0.15, 0.16, 1, DARK);
  }
  if (kind !== 'tractor') wheels();
  lamps();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aTag', new THREE.Float32BufferAttribute(T, 1));
  g.setIndex(I); return g;
}
const MODELS = [
  { kind: 'sedan', L: 4.8, W: 1.9, H: 1.5, w: 0.12 }, { kind: 'hatch', L: 4.2, W: 1.8, H: 1.5, w: 0.18 }, { kind: 'suv', L: 4.7, W: 1.95, H: 1.75, w: 0.16 },
  { kind: 'wagon', L: 4.9, W: 1.85, H: 1.5, w: 0.09 }, { kind: 'coupe', L: 4.5, W: 1.9, H: 1.32, w: 0.04 }, { kind: 'mini', L: 3.6, W: 1.7, H: 1.5, w: 0.07 },
  { kind: 'pickup', L: 5.3, W: 1.95, H: 1.8, w: 0.04 }, { kind: 'van', L: 5.9, W: 2.1, H: 2.3, w: 0.07 }, { kind: 'delivery', L: 6.4, W: 2.15, H: 2.9, w: 0.04 },
  { kind: 'truck', L: 10, W: 2.6, H: 3.6, w: 0.03 }, { kind: 'bus', L: 12, W: 2.65, H: 3.3, w: 0.02 },
  { kind: 'rv', L: 7.0, W: 2.3, H: 2.95, w: 0.018 }, { kind: 'tractor', L: 4.6, W: 2.2, H: 2.9, w: 0.012 },
  { kind: 'moto', L: 2.1, W: 0.75, H: 1.75, w: 0.1566 },
  { kind: 'bike', L: 1.75, W: 0.6, H: 1.95, w: 0.13, cyc: 1 }, { kind: 'scoot', L: 1.2, W: 0.5, H: 2.0, w: 0, cyc: 1 },
  { kind: 'bike', arm: -1, L: 1.75, W: 0.6, H: 1.95, w: 0, cyc: 1 }, { kind: 'bike', arm: 1, L: 1.75, W: 0.6, H: 1.95, w: 0, cyc: 1 },   // variantes d'affichage : bras gauche / droit tendu   // cyclistes et trottinettes : petites rues, bord droit
];
for (const m of MODELS) if (m.kind === 'truck' || m.kind === 'bus') { m.L *= 0.9; m.W *= 0.9; m.H *= 0.9; }   // véhicules longs : −10 %
for (const m of MODELS) if (!m.cyc && m.kind !== 'moto') { m.L *= 0.9; m.W *= 0.9; m.H *= 0.9; }   // véhicules à 4 roues ou plus (voitures, utilitaires, camions, bus) : gabarit et hitbox réduits de 10 % supplémentaires (motos/vélos non concernés)
const CAR_COL = ['#f2f2f0', '#f2f2f0', '#e8e8e6', '#dcdcd8', '#1b1c1f', '#26282c', '#101114', '#8a8d92', '#6d7075', '#b9bcc1', '#c9ccd0', '#b3252b', '#8c1c22', '#22406f', '#2f5f8a', '#1d2f4d', '#3f7fae', '#33513a', '#2e5a4c', '#c8b48a', '#e2d7c3', '#6b2a2a', '#5a4632', '#c96a1b', '#d8b62a', '#5b3a6e', '#7f9aa8', '#a3b5a0', '#1f4c4c', '#4a2545', '#8f9779', '#0f4c3a'];
const VAN_COL = ['#f2f2f0', '#f2f2f0', '#e8e8e6', '#d9d9d5', '#8a8d92', '#2f5f8a', '#b3252b', '#e8c22a', '#33513a', '#1b1c1f', '#5b3a6e', '#c96a1b'];
const MOTO_COL = ['#1b1c1f', '#b3252b', '#22406f', '#e8c22a', '#f2f2f0', '#2e7d5b', '#e06a1a', '#8a8d92', '#6b2a2a', '#3f7fae', '#4a2545', '#0f4c3a'];
const BUS_COL = ['#b3252b', '#2f5f8a', '#e8e8e6', '#2e7d5b', '#d8b62a', '#5b3a6e', '#c96a1b'], TRUCK_COL = ['#f2f2f0', '#f2f2f0', '#d9d9d5', '#2f5f8a', '#b3252b', '#e8c22a', '#2e7d5b', '#8a8d92', '#1f4c4c'];
const RV_COL = ['#f2f2f0', '#f2f2f0', '#ece6da', '#e8e8e6', '#d9d3c3', '#c9d6df'], TRACTOR_COL = ['#2e7d32', '#c62828', '#1565c0', '#f57f17', '#37474f'];

export function buildTraffic(data, terrain, maxVeh = 100000) {
  const RU = data.ru || 0;   // ruralité : véhicules lents (tracteurs, camping-cars) qui forment des pelotons, distances de suivi variables, freinages spontanés → bouchons plus fréquents
  // cols/sommets à proximité (natural=saddle/mountain_pass, déjà récupérés génériquement pour toute ville dans un rayon de 9 km autour du centre) :
  // en zone rurale, les cyclistes empruntent volontiers les routes de montagne qui y mènent (aucune donnée propre à une ville, ça vient de data.peaks)
  const COLS = (data.peaks || []).filter((p) => p.t === 1);
  const group = new THREE.Group();
  let trains = null; try { trains = buildTrains(data, terrain); group.add(trains.group); } catch (e) { console.error('trains', e); }
  // ---------------------------------------------------------------- réseau : voies rééchantillonnées tous les ~3 m
  const PKA = (data.shops || []).filter((q) => q.r <= 2 && /leclerc|carrefour|super ?u|intermarch|auchan|lidl|aldi|cora|g[ée]ant|hyper|casino|monoprix|netto|match/i.test(q.n) && !/station|city|express|contact|proxi|benetton|vivaldi|market/i.test(q.n)).map((q) => [q.x, q.z]);
  window.__pkAnchors = PKA.length;
  // chemins (k7) traversant un parc / jardin / bois : praticables à vélo (≥60 % des sommets dans une zone verte, ≥25 m)
  const GRN = []; for (const ar of data.areas || []) if (ar.t === 'grass' || ar.t === 'forest' || ar.t === 'scrub' || ar.t === 'cem') for (const ring of ar.p || []) { if (!ring || ring.length < 3 || !Array.isArray(ring[0])) continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of ring) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } GRN.push({ x0, x1, z0, z1, ring }); break; }
  const inGreen = (x, z) => { for (const g of GRN) { if (x < g.x0 || x > g.x1 || z < g.z0 || z > g.z1) continue; let c = false; const R = g.ring; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; if (c) return true; } return false; };
  const parkPath = (r) => { if (r.k !== 7 || r.b || r.p.length < 2) return false; let len = 0; for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]); if (len < 25) return false; let n = 0; for (const q of r.p) if (inGreen(q[0], q[1])) n++; return n >= 0.6 * r.p.length; };
  window.__parkPaths = 0;
  let ways = [], grid; const CELL = 6, gk = (a, b) => a * 100003 + b, flip = new Set();
  const dirAt = (w, i, d) => [w.TX[i] * d, w.TZ[i] * d];
  for (let pass = 0; pass < 1; pass++) {
  ways = []; let ri = -1;
  for (const r0 of data.roads || []) {
    ri++;
    let r = r0.k === 5 && (r0.b || /^pont\b/i.test(r0.nm || '')) ? { ...r0, k: 4 } : r0;   // ponts classés « service » (ex. ponts du canal Saint-Martin) : carrossables, traités comme des rues de quartier
    const bo = r0.k === 6 || (r0.k === 7 && (!!r0.cy || (r0._pp ??= parkPath(r0)) && ++window.__parkPaths > 0));
    const pk = !bo && r0.k === 5 && PKA.length > 0 && r0.p.some((q) => PKA.some((a) => (q[0] - a[0]) ** 2 + (q[1] - a[1]) ** 2 < 19600));   // voirie de service d'un grand centre commercial (à moins de 140 m d'une enseigne) : parking praticable, faible densité   // places/voies piétonnes et pistes cyclables : réseau réservé aux vélos
    if ((r.k > 4 && !bo && !pk) || r.p.length < 2) continue;
    if (bo) r = { ...r0, k: 4, w: r0.k === 6 ? 5 : 1.8, ms: 0, ln: 0, tr: 0, rb: false };
    else if (pk) r = { ...r0, k: 4, w: 4.4, ms: 0, ln: 0, tr: 0, rb: false, ow: 0 };
    let P0 = r.p; const ow = r.rb ? 1 : (r.ow || 0);
    if (ow === -1) P0 = P0.slice().reverse();
    if (r.rb && P0.length >= 3) {   // rond-point : circulation à droite = anti-horaire vu du ciel (virage à gauche en continu). Arc tourné à droite = géométrie inversée → on la retourne
      let T = 0; for (let i = 1; i < P0.length - 1; i++) { let d = Math.atan2(P0[i + 1][1] - P0[i][1], P0[i + 1][0] - P0[i][0]) - Math.atan2(P0[i][1] - P0[i - 1][1], P0[i][0] - P0[i - 1][0]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; T += d; }
      if (T > 0.35) P0 = P0.slice().reverse();
    }
    if (flip.has(ri)) P0 = P0.slice().reverse();
    const P = chaikin(P0, 2);
    let Lp = 0; const cl = [0]; for (let i = 1; i < P.length; i++) { Lp += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); cl.push(Lp); }
    if (Lp < (r.rb || r.k <= 4 ? 1 : 14)) continue;   // les petits tronçons (rond-points découpés en morceaux de 2 à 10 m…) doivent rester : sinon la chaîne est rompue et les véhicules font demi-tour
    const n = Math.max(3, Math.round(Lp / 3) + 1), ds = Lp / (n - 1), X = new Float32Array(n), Z = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++) {
      const t = i * ds; while (j < P.length - 2 && cl[j + 1] < t) j++;
      const f = (t - cl[j]) / ((cl[j + 1] - cl[j]) || 1); X[i] = P[j][0] + (P[j + 1][0] - P[j][0]) * f; Z[i] = P[j][1] + (P[j + 1][1] - P[j][1]) * f;
    }
    const TX = new Float32Array(n), TZ = new Float32Array(n), ang = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
      TX[i] = dx / l; TZ[i] = dz / l; ang[i] = Math.atan2(dz, dx);
    }
    let turn = 0; const VL = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      let d = ang[b] - ang[a]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const kap = Math.abs(d) / (Math.max(1, b - a) * ds); turn += Math.abs(d) / 4;
      VL[i] = Math.min(40, Math.max(3.5, Math.sqrt(2.3 / Math.max(kap, 1e-4))));
    }
    const closed = Math.hypot(X[0] - X[n - 1], Z[0] - Z[n - 1]) < 1;
    const rb = !!r.rb, oneway = rb || ow !== 0, vb = bo ? 4.6 : pk ? 3.8 : r.k === 0 ? 30.5 : r.tr ? 27 : Math.min(19.5, Math.max(2.5, r.ms ? r.ms / 3.6 * 1.08 : ({ 1: 15.5, 2: 12.5, 3: 9.5, 4: 6.5 })[r.k]));   // rond-point OSM (junction=roundabout) : sens unique, dans le sens de la géométrie
    const nl = rb ? 1 : Math.max(1, Math.min(4, r.ln ? (oneway ? r.ln : Math.ceil(r.ln / 2)) : oneway && r.k === 0 ? (Lp >= 150 && turn / Lp < 0.006 ? 3 : 2) : oneway && r.tr ? 2 : oneway && WK[r.k] ? Math.floor((r.w || WK[r.k]) / 3.4) : 1));   // voies par sens : autoroutes 3 (ou tag OSM lanes), voies rapides urbaines 2
    ways.push({ bo, pk, dm: pk ? 0.18 : undefined, lk: bo ? (r0.k === 6 ? 2 : 1) : pk ? 2 : undefined, nl, ri, rb, vb, fast: r.k === 0 || !!r.tr, br: !!r0.b, k: r.k, n, ds, L: Lp, X, Z, TX, TZ, VL, oneway, closed, hw: (r.w || WK[r.k] || 6) / 2, off: oneway ? 0 : Math.min(3.2, (r.w || WK[r.k]) * 0.25), exits: [], links: [[], []] });
  }
  // grille spatiale des échantillons
  grid = new Map();
  ways.forEach((w, wi) => { for (let i = 0; i < w.n; i++) { const k = gk(Math.floor(w.X[i] / CELL), Math.floor(w.Z[i] / CELL)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([wi, i]); } });
  // liaisons : bout de voie -> autre voie (extrémité ou milieu), et sorties depuis le milieu d'une voie
  ways.forEach((w, wi) => {
    for (const e of [0, 1]) {
      const si = e ? w.n - 1 : 0, sd = e ? 1 : -1, hv = dirAt(w, si, sd), best = new Map();
      const cx = Math.floor(w.X[si] / CELL), cz = Math.floor(w.Z[si] / CELL);
      for (const pass of [0, 1, 2, 3]) {
      if (pass > 0 && best.size) break;
      if (pass === 3 && !(w.oneway && e === 1)) break;   // raccord large : seulement pour les sens uniques sans suite (trou de données), jamais pour une vraie impasse
      const RD = [3.4, 7, 12, 25][pass], AN = [1.75, 1.3, 1.3, 1.9][pass], CR = [1, 2, 2, 5][pass];   // passe 3 : raccord des bouts de voie restés sans suite (trous dans les données OSM)
      for (let a = -CR; a <= CR; a++) for (let b = -CR; b <= CR; b++) for (const [w2i, i2] of grid.get(gk(cx + a, cz + b)) || []) {
        const w2 = ways[w2i], dist = Math.hypot(w2.X[i2] - w.X[si], w2.Z[i2] - w.Z[si]);
        if (dist > RD) continue;
        if (w2i === wi && (Math.abs(i2 - si) < 6 || (pass > 0 && !w.closed && !w.rb))) continue;   // jamais de raccord d'une voie sur elle-même en amont (boucle sans fin en bout de rue : file bloquée + demi-tours)
        const dirs = i2 === 0 ? [1] : i2 === w2.n - 1 ? [-1] : [1, -1];
        for (const d2 of dirs) {
          if (w2.oneway && d2 !== 1) continue;
          if (!w2.oneway && i2 !== 0 && i2 !== w2.n - 1 && (d2 < 0 ? i2 : w2.n - 1 - i2) * w2.ds < 8) continue;   // entrer dans une voie double sens à quelques mètres de son bout, en direction de ce bout : faux raccord (aller-retour infini entre deux voies au même carrefour, interblocage)
          const t2 = dirAt(w2, i2, d2), ca = hv[0] * t2[0] + hv[1] * t2[1], angle = Math.acos(Math.max(-1, Math.min(1, ca)));
          if (angle > (dist < 1.2 ? 2.75 : AN)) continue;   // nœud commun (vrai carrefour) : on accepte les virages serrés (Y aigus, T obtus jusqu'à ~155°) ; sinon la seule sortie légitime était rejetée
          const key = w2i + ':' + d2, old = best.get(key);
          if (!old || dist < old.dist) best.set(key, { w: w2i, i: i2, d: d2, angle, dist, k: w2.k });
        }
      }
      }
      for (const L of best.values()) {
        w.links[e].push(L);
        const w2 = ways[L.w];
        if (L.i !== 0 && L.i !== w2.n - 1) {          // sortie possible depuis le milieu de la voie cible, vers le bout e
          const away = e === 0 ? 1 : -1; if (w.oneway && away !== 1) continue;
          const th = dirAt(w2, L.i, L.d), ta = dirAt(w, si, away), ang2 = Math.acos(Math.max(-1, Math.min(1, th[0] * ta[0] + th[1] * ta[1])));
          if (ang2 < 1.6) w2.exits.push({ i: L.i, d: L.d, to: { w: wi, i: si, d: away, angle: ang2, k: w.k } });
        }
      }
    }
  });
  }
  // sorties depuis le MILIEU d'une voie (rond-points, carrefours en T) vers le début/la fin d'une autre voie qui part de là. L'ancienne méthode comparait le sens de sortie inversé et manquait la plupart des départs de rond-point (ronds-points « cassés » : aucune sortie, donc déclarés morts et évités). Ici le sens de la voie cible doit simplement être aligné avec le sens d'entrée dans la voie qui part.
  { let nx = 0;
    ways.forEach((w, wi) => {
      for (const e of [0, 1]) {
        const away = e ? -1 : 1; if (w.oneway && away !== 1) continue;
        const si = e ? w.n - 1 : 0, ta = dirAt(w, si, away), cx = Math.floor(w.X[si] / CELL), cz = Math.floor(w.Z[si] / CELL);
        for (const [RD, CR] of [[4.5, 1], [9, 2], [14, 3]]) {
          const best = new Map();
          for (let a = -CR; a <= CR; a++) for (let b = -CR; b <= CR; b++) for (const [w2i, i2] of grid.get(gk(cx + a, cz + b)) || []) {
            const w2 = ways[w2i]; if (w2i === wi || i2 === 0 || i2 === w2.n - 1) continue;
            const dist = Math.hypot(w2.X[i2] - w.X[si], w2.Z[i2] - w.Z[si]); if (dist > RD) continue;
            for (const d2 of w2.oneway ? [1] : [1, -1]) {
              const t2 = dirAt(w2, i2, d2), ang = Math.acos(Math.max(-1, Math.min(1, ta[0] * t2[0] + ta[1] * t2[1]))); if (ang > 1.35) continue;
              const key = w2i + ':' + d2, old = best.get(key); if (!old || dist < old.dist) best.set(key, { w2i, i2, d2, ang, dist });
            }
          }
          if (best.size) { for (const q of best.values()) { const w2 = ways[q.w2i]; if (!w2.exits.some((x) => x.to.w === wi && x.d === q.d2 && Math.abs(x.i - q.i2) < 4)) { w2.exits.push({ i: q.i2, d: q.d2, to: { w: wi, i: si, d: away, angle: q.ang, k: w.k } }); nx++; } } break; }
        }
      }
    });
    window.__exitsAdded = nx; }
  const propDead = () => { for (let it = 0; it < 6; it++) for (const w of ways) if (!w.dead && w.oneway && w.links[1].every((l) => ways[l.w].dead || (ways[l.w].dd && ways[l.w].dd[l.d]))) w.dead = true; };
  propDead();
  // ronds-points isolés ou sans entrée/sortie : jamais empruntés (sinon les véhicules tournent indéfiniment)
  { const comp = new Array(ways.length).fill(-1); let nc = 0; const cInfo = [];
    ways.forEach((w, wi) => { if (!w.rb || comp[wi] >= 0) return; const st = [wi]; comp[wi] = nc; const info = { ws: [], ent: false, ext: false, arms: new Set() }; cInfo.push(info);
      while (st.length) { const a = st.pop(); info.ws.push(a); for (const x of ways[a].exits) if (!ways[x.to.w].dead && !ways[x.to.w].rb) { info.ext = true; info.arms.add(x.to.w); }
        for (const e of [0, 1]) for (const l of ways[a].links[e]) { if (ways[l.w].rb) { if (comp[l.w] < 0) { comp[l.w] = nc; st.push(l.w); } } else if (e === 1 && !ways[l.w].dead) { info.ext = true; info.arms.add(l.w); } } }
      nc++; });
    ways.forEach((w) => { if (!w.rb) for (const e of [0, 1]) for (const l of w.links[e]) if (ways[l.w].rb && comp[l.w] >= 0) cInfo[comp[l.w]].ent = true; });
    cInfo.forEach((c, ci) => { const tl = c.ws.reduce((a, x) => a + ways[x].L, 0); for (const a of c.ws) { ways[a].rcL = tl; ways[a].rid = ci; } });
    let nd = 0; for (const c of cInfo) if (!(c.ent && c.ext && c.arms.size >= 1)) for (const a of c.ws) { ways[a].dead = true; nd++; } window.__rbDead = nd; }
  propDead();
  // îlots de voies (moins de 500 m reliés entre eux) : jamais utilisés, sinon les véhicules y tournent en boucle
  { const par = ways.map((_, i) => i); const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    ways.forEach((w, wi) => { for (const e of [0, 1]) for (const l of w.links[e]) par[f(wi)] = f(l.w); for (const ex of w.exits) par[f(wi)] = f(ex.to.w); });
    const len = new Map(); ways.forEach((w, wi) => { const r = f(wi); len.set(r, (len.get(r) || 0) + w.L); });
    let nd = 0; ways.forEach((w, wi) => { if (len.get(f(wi)) < 500) { w.dead = true; nd++; } }); window.__isl = nd; }
  propDead();
  // pièges orientés : petits groupes de voies dont on ne peut plus sortir (ex. mini-boucle rond-point → voie d'entrée → rond-point) : composantes fortement connexes « puits » courtes, jamais empruntées
  { const N = ways.length * 2, adj = Array.from({ length: N }, () => []), ok = new Array(N).fill(false), nid = (w, d) => w * 2 + (d > 0 ? 1 : 0);
    ways.forEach((w, wi) => { if (w.dead) return; for (const d of w.oneway ? [1] : [1, -1]) { const n = nid(wi, d); ok[n] = true;
      for (const l of w.links[d > 0 ? 1 : 0]) if (!ways[l.w].dead && !(ways[l.w].oneway && l.d !== 1)) adj[n].push(nid(l.w, l.d));
      for (const e of w.exits) if (e.d === d && !ways[e.to.w].dead && !(ways[e.to.w].oneway && e.to.d !== 1)) adj[n].push(nid(e.to.w, e.to.d)); } });
    const idx = new Array(N).fill(-1), low = new Array(N).fill(0), on = new Array(N).fill(false), comp = new Array(N).fill(-1), stk = []; let ix = 0, nc = 0;
    for (let r = 0; r < N; r++) { if (!ok[r] || idx[r] >= 0) continue;
      const cs = [[r, 0]]; idx[r] = low[r] = ix++; stk.push(r); on[r] = true;
      while (cs.length) { const fr = cs[cs.length - 1], n = fr[0];
        if (fr[1] < adj[n].length) { const m = adj[n][fr[1]++]; if (!ok[m]) continue; if (idx[m] < 0) { idx[m] = low[m] = ix++; stk.push(m); on[m] = true; cs.push([m, 0]); } else if (on[m]) low[n] = Math.min(low[n], idx[m]); }
        else { if (low[n] === idx[n]) { let m; do { m = stk.pop(); on[m] = false; comp[m] = nc; } while (m !== n); nc++; }
          cs.pop(); if (cs.length) { const p = cs[cs.length - 1][0]; low[p] = Math.min(low[p], low[n]); } } } }
    const sink = new Array(nc).fill(true), clen = new Array(nc).fill(0);
    for (let n = 0; n < N; n++) { if (!ok[n]) continue; clen[comp[n]] += ways[n >> 1].L; for (const m of adj[n]) if (ok[m] && comp[m] !== comp[n]) sink[comp[n]] = false; }
    let nd = 0; ways.forEach((w, wi) => { if (w.dead) return; const ds = w.oneway ? [1] : [1, -1], tr = ds.map((d) => sink[comp[nid(wi, d)]] && clen[comp[nid(wi, d)]] < 800); if (tr.every(Boolean)) { w.dead = true; nd++; } else if (tr.some(Boolean)) { w.dd = {}; ds.forEach((d, k) => { w.dd[d] = tr[k]; }); nd += 0.5; } });
    window.__trapDead = nd; }
  propDead();
  for (let it = 0; it < 6; it++) for (const w of ways) if (!w.dead && w.oneway && w.links[1].every((l) => ways[l.w].dead || (ways[l.w].dd && ways[l.w].dd[l.d]))) w.dead = true;
  // sens uniques sans issue (données incomplètes) : jamais empruntés, pour ne pas piéger de véhicules
  for (let it = 0; it < 4; it++) for (const w of ways) if (!w.dead && w.oneway && w.links[1].every((l) => ways[l.w].dead)) w.dead = true;
  // double sens : un sens de circulation dont toutes les suites sont mortes ou interdites est lui-même interdit (propagation) : sinon les véhicules s'y engouffrent, font demi-tour en boucle et s'entassent
  { let nd2 = 0; for (let it = 0; it < 14; it++) { let ch = false; for (const w of ways) { if (w.dead || w.oneway) continue; for (const d of [1, -1]) { if (w.dd && w.dd[d]) continue; const outs = w.links[d > 0 ? 1 : 0], bad = (l) => ways[l.w].dead || (ways[l.w].dd && ways[l.w].dd[l.d]);
        if (outs.length && outs.every(bad) && !w.exits.some((ex) => ex.d === d && !bad(ex.to))) { (w.dd = w.dd || {})[d] = true; ch = true; nd2++; } } } if (!ch) break; } window.__ddProp = nd2; }
  // impasses courtes (double sens dont un bout n'a aucune suite) : interdites aux bus/camions (et aux très courtes pour tous)
  for (const w of ways) { const al = (e) => w.links[e].some((l) => !ways[l.w].dead); w.stub = !w.oneway && (!al(0) || !al(1)); }
  // ---------------------------------------------------------------- véhicules
  const V = [];
  const MTOT = MODELS.reduce((q, m) => q + m.w, 0), pickModel = () => { let r = rnd() * MTOT, a = 0; for (const m of MODELS) { a += m.w; if (r < a) return m; } return MODELS[0]; };
  for (const w of ways) if (w.bo) { w.dead = false; w.dd = null; }   // le réseau vélo n'est pas soumis à l'élagage des impasses/îlots automobiles
  let totW = 0; const lanes = [];
  ways.forEach((w, wi) => { if (w.dead) return; for (const d of w.oneway ? [1] : [1, -1]) { if (w.dd && w.dd[d]) continue; lanes.push([wi, d]); totW += w.L * DENS[w.k] * (w.dm ?? 1) * w.nl * (w.rb ? 0.3 : 1) * (w.stub ? 0.3 : 1); } });
  const scale = maxVeh / Math.max(1, totW);
  const cum = []; { let a = 0; for (const [wi] of lanes) { a += ways[wi].L * DENS[ways[wi].k] * (ways[wi].dm ?? 1) * ways[wi].nl; cum.push(a); } }
  const cong = new Float32Array(ways.length); let congT = 0; const use = new Float32Array(ways.length); let useSum = 0, useT = 0, nLive = 0; ways.forEach((w) => { if (!w.dead) nLive++; });   // use : fréquentation récente de chaque tronçon (les véhicules préfèrent les tronçons peu fréquentés)   // véhicules/m par tronçon : sert à reporter le trafic sur les routes secondaires
  const laneKey = (w, d, ln) => (w * 2 + (d > 0 ? 1 : 0)) * 4 + (ln || 0);
  const lanesMap = new Map();
  const LW = 3.4, laneOff = (w, v) => w.off + (Math.min(v.ln || 0, w.nl - 1) - (w.nl - 1) / 2) * LW + (v.mi !== undefined && MODELS[v.mi].cyc && !w.bo ? 0.95 : 0);   // décalage latéral de la file (positif = à droite du sens de marche)
  const pickLn = (v, wn) => { if (MODELS[v.mi].cyc) { v.ln = wn.nl - 1; return; } if (wn.nl < 2) { v.ln = 0; return; } let best = 0, bs = 1e9; const cur = Math.min(v.ln || 0, wn.nl - 1); for (let q = 0; q < wn.nl; q++) { const a = lanesMap.get(laneKey(v.w, v.d, q)); const sc = (a ? a.length : 0) + Math.abs(q - cur) * 0.6 + rnd() * 0.5; if (sc < bs) { bs = sc; best = q; } } v.ln = best; };
  const chooseLink = (v) => {
    const w = ways[v.w]; let L = w.links[v.d > 0 ? 1 : 0].filter((l) => !ways[l.w].dead && !(ways[l.w].dd && ways[l.w].dd[l.d]));
    if (!L.length) return null;
    if (MODELS[v.mi].cyc) { const BO = L.filter((l) => ways[l.w].bo); if (BO.length && rnd() < 0.7) L = BO; else { const BK = L.filter((l) => ways[l.w].k >= 2 && !ways[l.w].fast); if (BK.length) L = BK; } }   // cyclistes : pistes cyclables et voies piétonnes en priorité, sinon petites rues
    else { L = L.filter((l) => !ways[l.w].bo); if (!ways[v.w].pk && L.some((l) => ways[l.w].pk)) { const NP = L.filter((l) => !ways[l.w].pk); if (NP.length && rnd() >= 0.10) L = NP; } }   // parkings de grandes surfaces : ~10 % des véhicules qui passent devant s'y engagent
    if (!L.length) return null;
    if (v.len >= 5) { const NS = L.filter((l) => !ways[l.w].stub); if (NS.length) L = NS; }   // véhicules moyens et gros (pick-up, camionnette, camion, bus) : jamais de cul-de-sac (demi-tour impossible)
    else if (!w.rb) { const SB = L.filter((l) => ways[l.w].stub && !ways[l.w].rb); if (SB.length && rnd() < (MODELS[v.mi].kind === 'moto' ? 0.20 : 0.085)) return SB[Math.floor(rnd() * SB.length) % SB.length]; }   // petits véhicules : plus volontiers dans les impasses/lotissements/voies privées qu'avant (8,5 % de chances par carrefour, contre 5 % à l'origine) ; motos (petites, vives) : 20 % (contre 15 %) - hausse mesurée pour rester cohérent et fluide, sans provoquer de bouchons
    { const F = L.filter((l) => { const t = ways[l.w]; return !(t.stub && (t.L < 20 || (v.len > 8 && t.L < 90))) && !(v.len > 8 && l.k >= 4) && !(t.rb && !w.rb && l.angle > 1.35); }); if (F.length) L = F; }   // bus et camions évitent les petites rues et impasses
    if (w.rb) {   // sur un rond-point : on reste dedans jusqu'à la sortie choisie, jamais de retour par la voie d'entrée
      const lap = (v.ring || 0) > 60, ringL = L.filter((l) => ways[l.w].rb), outL0 = L.filter((l) => !ways[l.w].rb && (lap || l.w !== v.from)), outL = outL0.filter((l) => !ways[l.w].links[l.d > 0 ? 1 : 0].some((q) => ways[q.w].rb)).length ? outL0.filter((l) => !ways[l.w].links[l.d > 0 ? 1 : 0].some((q) => ways[q.w].rb)) : outL0;   // jamais de sortie vers une voie qui redonne dans un rond-point (boucle)
     
      if (ringL.length && ((v.rbSkip > 0 && !lap) || !outL.length)) { v.rbSkip = Math.max(0, (v.rbSkip || 0) - 1); L = ringL; } else if (outL.length) L = outL;
    }
    const mean = useSum / Math.max(1, nLive);
    // vélos en zone rurale (RU) : nette préférence pour la suite qui rapproche du col le plus proche, quand il y en a un à portée
    // (même rayon que la récupération des sommets, 9 km) - générique à toute ville, sans effet si elle n'a ni relief ni col recensé
    let colTarget = null;
    if (MODELS[v.mi].cyc && COLS.length && RU > 0.15) { const jx = w.X[v.d > 0 ? w.n - 1 : 0], jz = w.Z[v.d > 0 ? w.n - 1 : 0];
      let bc = null, bd = 9000 * 9000; for (const p of COLS) { const d2 = (p.x - jx) ** 2 + (p.z - jz) ** 2; if (d2 < bd) { bd = d2; bc = p; } }
      if (bc) colTarget = { x: bc.x, z: bc.z, d: Math.sqrt(bd) }; }
    let tot = 0; const ws = L.map((l) => { const nov = 1 / (1 + 2.5 * use[l.w] / (mean + 0.05)) ** 1.5; let wt = (Math.cos(l.angle) + 1.6) * (l.angle < 0.3 ? 1.3 : 1) * (l.angle > 1.2 ? 0.5 : 1) * (ways[l.w].stub ? 0.45 : 1) * nov / (1 + Math.min(12, (cong[l.w] || 0) * 40)) * (l.k > w.k ? 1 + Math.min(3, (cong[v.w] || 0) * 40) : 1);   // impasse encore déclassée dans le choix pondéré général, mais moins qu'avant (0,45 au lieu de 0,3) : cohérent avec la préférence accrue ci-dessus, sans dominer le choix
      if (colTarget) { const wl = ways[l.w], ex = wl.X[l.d > 0 ? wl.n - 1 : 0], ez = wl.Z[l.d > 0 ? wl.n - 1 : 0]; wt *= Math.hypot(ex - colTarget.x, ez - colTarget.z) < colTarget.d ? 2.4 : 0.55; }
      tot += wt; return wt; });
    let r = rnd() * tot; for (let i = 0; i < L.length; i++) { r -= ws[i]; if (r <= 0) return L[i]; }
    return L[L.length - 1];
  };
  const vEndFor = (lk) => (!lk ? 3 : lk.angle < 0.25 ? 99 : Math.max(5, 15.5 - lk.angle * 6.5));
  const spg = new Map();   // positions de départ déjà prises (aucun véhicule ne naît sur un autre)
  for (const [wi, d] of lanes) {
    const w = ways[wi], c = w.L * DENS[w.k] * (w.dm ?? 1) * w.nl * scale * (w.rb ? 0 : 1) * (w.stub ? 0.3 : 1); let cnt = Math.floor(c) + (rnd() < c - Math.floor(c) ? 1 : 0);
    const used = [];
    for (let t = 0; t < cnt; t++) {
      const ln0 = w.nl > 1 ? Math.floor(rnd() * w.nl) : 0;
      let s = 0, ok = false; for (let a = 0; a < 6 && !ok; a++) { s = rnd() * w.L; ok = used.every((u) => u[1] !== ln0 || Math.abs(u[0] - s) > 7.5); }
      if (!ok) continue;
      if (w.nl < 2) { const si = Math.min(w.n - 1, Math.round(s / w.ds)), sx = w.X[si], sz = w.Z[si], kx = Math.floor(sx / 8), kz = Math.floor(sz / 8); let clash = false;
        for (let a = -1; a <= 1 && !clash; a++) for (let b = -1; b <= 1 && !clash; b++) for (const q of spg.get((kx + a) * 100003 + kz + b) || []) if (!(q[2] === wi && q[3] !== d) && Math.hypot(q[0] - sx, q[1] - sz) < 6.5) { clash = true; break; }   // le sens opposé de la même voie ne compte pas : sinon presque aucun véhicule ne naissait en sens inverse
        if (clash) continue; const kk = kx * 100003 + kz; let ar = spg.get(kk); if (!ar) spg.set(kk, ar = []); ar.push([sx, sz, wi, d]); }
      used.push([s, ln0]);
      let m = pickModel(); if (w.bo && !m.cyc) m = MODELS.find((q) => q.kind === 'bike'); if (m.cyc && (w.k < 2 || w.fast)) m = MODELS[0]; if ((m.L > 8 && (w.k >= 3 || w.L < 90)) || (m.L >= 5 && w.stub)) m = MODELS[rnd() < 0.6 ? 0 : 1]; if (m.kind === 'tractor' && (RU < 0.08 || w.fast || w.k < 2)) m = MODELS[rnd() < 0.6 ? 0 : 1]; const mi = MODELS.indexOf(m), pal = (m.kind === 'moto' || m.cyc) ? MOTO_COL : m.kind === 'bus' ? BUS_COL : m.kind === 'truck' ? TRUCK_COL : m.kind === 'rv' ? RV_COL : m.kind === 'tractor' ? TRACTOR_COL : (m.kind === 'van' || m.kind === 'delivery') ? VAN_COL : CAR_COL, sc = (0.95 + rnd() * 0.1) * (m.L >= 4.7 ? 0.9 : 1), cc = new THREE.Color(pal[Math.floor(rnd() * pal.length)]); cc.offsetHSL(0, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.1);
      const v = { w: wi, d, s, ln: ln0, v: w.vb * 0.6, lat: laneOff(w, { ln: ln0 }), mi, len: m.L * sc, sc, hc: rnd() < 0.55 ? 0 : 1, col: cc, f: (m.cyc ? 0.5 : m.kind === 'moto' ? 1.1 : m.kind === 'tractor' ? 0.42 : 1) * (w.fast ? 0.97 + rnd() * 0.2 : (RU > 0.05 && rnd() < 0.04 * RU ? 0.6 + rnd() * 0.15 : 0.98 + rnd() * 0.16)), hw: 1 + (rnd() - 0.3) * 0.9 * RU, link: null, cool: 0, x: 0, z: 0, y: 0, hx: 1, hz: 0, pitch: 0 };
      if (m.cyc) v.ln = w.nl - 1; v.link = chooseLink(v); V.push(v);
    }
  }
  // tri en 2 blocs, chacun mélangé en interne : d'abord tous les véhicules motorisés (voitures, utilitaires,
  // camions, bus, motos), puis tous les vélos/trottinettes - toujours dans cet ordre. Les boucles de rendu/simulation
  // continuent de parcourir V[0..nAct) comme un seul tableau (aucune ne change), mais ce découpage permet à
  // setCount()/setBoostedDefault() de doser indépendamment le contingent motorisé et le contingent vélo (à la
  // demande : la densité de véhicules doit pouvoir augmenter sans gonfler le nombre de cyclistes).
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
  const Vo = shuffle(V.filter((v) => !MODELS[v.mi].cyc)), Vb = shuffle(V.filter((v) => MODELS[v.mi].cyc));
  V.length = 0; V.push(...Vo, ...Vb);
  const nOtherPool = Vo.length, nBikePool = Vb.length, bikeShare = nBikePool / Math.max(1, V.length);
  let nAct = Math.min(V.length, Math.round(10000 * 0.8 * (1 - 0.6 * RU)));
  // ---------------------------------------------------------------- rendu : maillages instanciés + halos lumineux
  const uNight = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTag; varying float vTag; varying float vLD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTag = aTag; vLD = distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition);')
      .replace('#include <color_vertex>', `#if defined( USE_COLOR )
        vColor = color.rgb;
        #ifdef USE_INSTANCING_COLOR
          if (aTag < 0.5) vColor *= instanceColor.rgb;
        #endif
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vTag; varying float vLD;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float h = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (h >= 1.0 - smoothstep(2000.0, 2350.0, vLD)) discard; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vTag > 1.5 && vTag < 2.5) totalEmissiveRadiance += vec3(1.0, 0.95, 0.8) * (0.1 + 9.0 * uNight);
        else if (vTag > 2.5) totalEmissiveRadiance += vec3(1.0, 0.05, 0.02) * (0.15 + 6.0 * uNight);`);
  };
  mat.customProgramCacheKey = () => 'traffic';
  const BIKEARM = [MODELS.findIndex((m) => m.arm === -1), MODELS.findIndex((m) => m.arm === 1)];
  const cap = V.length + 8, meshes = MODELS.map((m) => {
    const im = new THREE.InstancedMesh(makeModel(m.kind, m.L, m.W, m.H, m.arm || 0), mat, cap);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; group.add(im); return im;
  });
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const beamGeo = (x0, x1, w0, w1, c0, c1) => { const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, -0.16, -w0, x0, -0.16, w0, x1, -0.16, w1, x1, -0.16, -w1], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([...c0, ...c0, ...c1, ...c1], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; };
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -24, polygonOffsetUnits: -24 });   // les faisceaux passent AU-DESSUS de la chaussée (sinon enfouis dans la route)
  const mkBeam = (geo, mt = beamMat) => { const im = new THREE.InstancedMesh(geo, mt, cap); im.renderOrder = 6; im.count = 0; im.frustumCulled = false; im.visible = false; group.add(im); return im; };
  const beamPair = (x0, x1, w0, w1, zc, spread, col) => {   // un faisceau par phare (2 cônes) : dégradé en longueur ET bords transparents (flou)
    const P = [], C = [], I = []; let o = 0; const rows = [0, 0.3, 0.65, 1], fr = [1, 0.62, 0.22, 0];
    for (const sg of [-1, 1]) {
      for (let r = 0; r < rows.length; r++) {
        const t = rows[r], x = x0 + (x1 - x0) * t, zc2 = sg * (zc + spread * t), w = (w0 + (w1 - w0) * t) * 1.5;
        for (const [dz, e] of [[-w, 0], [0, 1], [w, 0]]) { P.push(x, -0.16, zc2 + dz); const k = fr[r] * e; C.push(col[0] * k, col[1] * k, col[2] * k); }
      }
      for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < 2; c++) { const a0 = o + r * 3 + c; I.push(a0, a0 + 1, a0 + 4, a0, a0 + 4, a0 + 3); }
      o += rows.length * 3;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); return g;
  };
  const poolTex = (() => { const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);   // nappe de lumière : gaussienne qui s'élargit et s'éteint avec la distance, sans arête
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = x / (W - 1), l = (y / (H - 1) - 0.5) * 2, wd = 0.3 + 0.7 * Math.pow(u, 0.8), I = Math.pow(1 - u, 1.5) * Math.min(1, u / 0.05) * Math.exp(-(l / wd) * (l / wd) * 3.2), k = (y * W + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = Math.round(255 * I); im.data[k + 3] = 255; }
    g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const poolGeo = (x0, x1, w, offs = [0], dv = 0) => { const g = new THREE.BufferGeometry(), P = [], U = [], I = []; offs.forEach((zo, i) => { const sg = zo < 0 ? -1 : zo > 0 ? 1 : 0, k = P.length / 3;   // un faisceau par phare, légèrement divergent
      P.push(x0, -0.16, zo - w, x0, -0.16, zo + w, x1, -0.16, zo + w + sg * dv, x1, -0.16, zo - w + sg * dv); U.push(0, 0, 0, 1, 1, 1, 1, 0); I.push(k, k + 1, k + 2, k, k + 2, k + 3); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g; };
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(0.27, 0.24, 0.17), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -24, polygonOffsetUnits: -24 });
  const beamH = mkBeam(poolGeo(1.8, 17, 2.1, [-0.62, 0.62], 0.9), poolMat), beamT = mkBeam(beamPair(-2.3, -5.5, 0.14, 0.4, 0.62, 0.05, [0.03, 0.002, 0.001]));
  const beamHm = mkBeam(poolGeo(1.2, 12, 2.1), poolMat), beamTm = mkBeam(beamPair(-1.2, -3.6, 0.1, 0.28, 0, 0, [0.02, 0.001, 0.0005]));   // moto : un seul phare, un seul feu arrière
  const mkPts = (color, size, opa = 1, shareGeo) => {
    const geo = shareGeo || new THREE.BufferGeometry(); if (!shareGeo) { geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3 * 2), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3 * 2), 3)); }
    const m = new THREE.PointsMaterial({ size, map: glowTex, color: shareGeo ? color : 0xffffff, vertexColors: !shareGeo, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; p.visible = false; p.userData.opa = opa; group.add(p); return p;
  };
  const blkPts = mkPts(0, 0.95); blkPts.visible = true; blkPts.material.opacity = 1; blkPts.userData.opa = 1; const blkHalo = mkPts(0xffb81c, 3.6, 0.5, blkPts.geometry);   // halo nocturne des clignotants   // clignotants jaunes (visibles de jour comme de nuit)
  const brkPts = mkPts(0, 1.5), brkHalo = mkPts(0xff2a10, 4, 1, brkPts.geometry); brkPts.visible = brkHalo.visible = true; brkPts.material.opacity = 1; brkHalo.material.opacity = 0.2;   // feux stop (jour et nuit)
  const headPts = mkPts(0, 2.6), tailPts = mkPts(0, 2.2), headHalo = mkPts(0xffe9c0, 3.4, 0.3, headPts.geometry), tailHalo = mkPts(0xff1a08, 3, 0.12, tailPts.geometry);

  // ---------------------------------------------------------------- simulation
  const Sv = new THREE.Vector3(1, 1, 1), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YZX'), Pv = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
  const m0roll = (v) => v.roll || 0;
  const A_MAX = 3.2, B_DEC = 3.2, T_HW = 0.95;
  const TUNE = window.__tune || (window.__tune = { s0: 1.3, hb: 0.9, tr: 0.75 });   // leviers de fluidité : marge d'arrêt (m), échelle de l'emprise de collision, resserrage des virages (voitures/motos)
  let night = 0, rideV = null, rideSig = 0;   // rideSig : clignotant du véhicule dans lequel on est (-1 gauche, +1 droite, 2 warnings, 0 rien), lu par l'habitacle (main.js)
  const S0v = new THREE.Vector3(0, 0, 0);
  const prev0 = (v) => v.w;
  const rbOcc = new Array(4000).fill(0);   // véhicules par rond-point (capacité des mini-ronds)
  const rbNew = [];   // points d'entrée de rond-point utilisés pendant cette mise à jour
  const enter = (v, lk, keepSide) => {
    const prev = v.w, wn = ways[lk.w];
    if (ways[lk.w].rb && !ways[prev0(v)].rb && ways[lk.w].rid !== undefined) rbOcc[ways[lk.w].rid]++;
    if (ways[lk.w].rb && !ways[prev0(v)].rb) rbNew.push([ways[lk.w].X[lk.i], ways[lk.w].Z[lk.i]]);
    if (wn.rb && !ways[prev].rb) { const r = rnd(); v.rbSkip = (wn.rcL || 999) < 60 ? 0 : r < 0.6 ? 0 : r < 0.9 ? 1 : 2; v.from = prev; v.ring = 0; } else if (!wn.rb) { v.from = -1; v.rbSkip = 0; }
    v.pw = prev; v.w = lk.w; v.d = lk.d; v.s = lk.i * wn.ds; use[lk.w]++; useSum++; pickLn(v, wn); v.link = chooseLink(v); v.cool = wn.rb && ways[prev].rb ? 0 : (wn.rb ? 0.6 : 1.2); v.chg = true; v.yt = 0; v.boost = 4; if (!wn.stub) v.ut = 0;
  };
  const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), PW = new THREE.Matrix4(), SP = new THREE.Sphere(new THREE.Vector3(), 14);
  let fc = 0;
  let jamT = 0;
  const update = (dt, cam, camera) => {
    if (trains) trains.update(dt);
    if ((useT -= dt) <= 0) { useT = 2; for (let i = 0; i < use.length; i++) use[i] *= 0.985; useSum *= 0.985; }
    if ((congT -= dt) <= 0) { congT = 1; cong.fill(0); for (const v of V) cong[v.w]++; for (let i = 0; i < cong.length; i++) cong[i] /= Math.max(20, ways[i].L); }
    dt = Math.min(dt, 0.08); const dt0 = dt; fc++;
    if (camera) { camera.updateMatrixWorld(); PW.copy(camera.projectionMatrix); PW.elements[0] *= 0.5; PW.elements[5] *= 0.5; FR.setFromProjectionMatrix(PM.multiplyMatrices(PW, camera.matrixWorldInverse)); }   // champ élargi x2 : marge pour la distorsion et le tilt-shift
    const relocate = (v, near) => {
      let bestS = 1e9, bestC = null, bestN = 0;
      for (let t = 0; t < 40; t++) {
        const r = rnd() * cum[cum.length - 1]; let a = 0, b = cum.length - 1; while (a < b) { const m = (a + b) >> 1; if (cum[m] < r) a = m + 1; else b = m; }
        const ln = lanes[a], wz = ways[ln[0]], ss = rnd() * wz.L, ii = Math.min(wz.n - 1, Math.round(ss / wz.ds));
        const dc = Math.hypot(wz.X[ii] - cam.x, wz.Z[ii] - cam.z); if ((near ? dc > 250 && dc < 1300 && !inView(wz.X[ii], 280, wz.Z[ii]) : dc > 1200) && (v.len < 8 || wz.k < 4) && (!MODELS[v.mi].cyc || (wz.k >= 2 && !wz.fast)) && (MODELS[v.mi].cyc || !wz.bo) && wz.L >= (wz.bo ? 12 : 40) && !wz.stub) { const sc = use[ln[0]] + (cong[ln[0]] || 0) * 60; if (sc < bestS) { bestS = sc; bestC = [ln, ss]; } if (++bestN < 4) continue; break; }
      }
      if (bestC) { const ln = bestC[0], ss = bestC[1], wz = ways[ln[0]]; { use[ln[0]]++; useSum++; cong[ln[0]] += 1.5 / Math.max(20, wz.L); v.cr = null; v.ln = MODELS[v.mi].cyc ? wz.nl - 1 : rnd() * 4 | 0; v.w = ln[0]; v.d = ln[1]; v.s = ss; v.v = wz.vb * 0.6; v.lat = 0; v.dead = 0; v.ut = 0; v.ring = 0; v.from = -1; v.rbSkip = 0; v.link = chooseLink(v); v.px = undefined; v.ox = v.oz = 0; v.th = undefined; v.x = 1e9; return true; }
      }
      return false;
    };
    const inView = (x, y, z) => { if (!camera) return true; SP.center.set(x, y, z); return FR.intersectsSphere(SP); };
    lanesMap.clear();
    for (let vi = 0; vi < nAct; vi++) { const v = V[vi]; const k = laneKey(v.w, v.d, Math.min(v.ln || 0, ways[v.w].nl - 1)); let a = lanesMap.get(k); if (!a) lanesMap.set(k, a = []); v.p = v.d > 0 ? v.s : ways[v.w].L - v.s; a.push(v); }
    rbNew.length = 0;
    rbOcc.fill(0); for (let vi = 0; vi < nAct; vi++) { const u = V[vi]; if (u.x !== 1e9 && ways[u.w].rb && ways[u.w].rid !== undefined) rbOcc[ways[u.w].rid]++; }
    const rbHash = new Map();   // véhicules en rond-point (pour la priorité à l'entrée)
    for (let vi = 0; vi < nAct; vi++) { const u = V[vi]; if (u.x !== 1e9 && ways[u.w].rb) { const k = Math.floor(u.x / 8) * 100003 + Math.floor(u.z / 8); let a = rbHash.get(k); if (!a) rbHash.set(k, a = []); a.push(u); } }
    for (const a of lanesMap.values()) if (a.length > 1) a.sort((p, q) => p.p - q.p);
    for (const a of lanesMap.values()) for (let j = 0; j < a.length; j++) { let q = j + 1; while (q < a.length && a[q].ghost) q++; a[j].lead = q < a.length ? a[q] : null; }
    const relead = (a) => { for (let j = 0; j < a.length; j++) { let q = j + 1; while (q < a.length && a[q].ghost) q++; a[j].lead = q < a.length ? a[q] : null; } };
    for (let vi = 0; vi < nAct; vi++) {   // réduction du nombre de voies : les files supprimées se rabattent EN AMONT (changement de voie), sinon elles convergent en même temps au même point
      const v = V[vi]; v.lcm = false; if (!v.link || v.ov || v.ghost || v.x === 1e9) continue;
      const w = ways[v.w]; if (w.rb) continue; const tl = ways[v.link.w].nl, cur = Math.min(v.ln || 0, w.nl - 1); if (cur < tl) continue;
      const rem = v.d > 0 ? w.L - v.s : v.s; if (rem > (MODELS[v.mi].cyc ? 40 : 220)) continue;   // les vélos restent à droite de la voie de droite jusqu'à la toute fin
      v.lcm = true; v.lcw = (v.lcw || 0) + dt0;
      const ta = lanesMap.get(laneKey(v.w, v.d, cur - 1)) || [], relax = Math.min(3.2, v.lcw * 0.5); let ok = true;
      for (const u of ta) { if (u.ghost) continue; const d = u.p - v.p, hl = (u.len + v.len) / 2; if (d >= 0 ? d < hl + 1.6 - relax : -d < hl + 2 + Math.max(0, u.v - v.v) * 0.9 - relax) { ok = false; break; } }
      if (!ok) continue;
      const oa = lanesMap.get(laneKey(v.w, v.d, cur)); if (oa) { const ix = oa.indexOf(v); if (ix >= 0) oa.splice(ix, 1); relead(oa); }
      v.ln = cur - 1; v.lcw = 0; let na = lanesMap.get(laneKey(v.w, v.d, cur - 1)); if (!na) lanesMap.set(laneKey(v.w, v.d, cur - 1), na = []);
      na.push(v); na.sort((p, q) => p.p - q.p); relead(na);
    }
    if ((jamT = (jamT || 0) - dt0) <= 0) {   // source d'un bouchon : véhicule à l'arrêt >45 s dont rien ne justifie l'attente (rien d'arrêté devant lui) et qui bloque une file d'au moins 6 véhicules -> retiré
      jamT = 1; let nrm = 0;
      for (const a of lanesMap.values()) for (let j = a.length - 1; j >= 0 && nrm < 3; j--) {
        const v = a[j]; if ((v.wait || 0) < 45 || v.v > 0.6 || v.x === 1e9 || ways[v.w].rb) continue;
        const ld = v.lead, xu = v.xu; if ((ld && ld.v < 0.6 && ld.p - v.p < 12) || (xu && !xu.ghost && xu.v < 0.6)) continue;
        let cnt = 0, pp = v.p; for (let q = j - 1; q >= 0; q--) { const u = a[q]; if (u.v > 0.8 || pp - u.p > 14) break; cnt++; pp = u.p; }
        if (cnt >= 6) { v.stk = 0; v.wait = 0; if (relocate(v, true) || relocate(v)) nrm++; }
      }
      window.__jamRm = (window.__jamRm || 0) + nrm;
    }
    for (let vi = 0; vi < nAct; vi++) {
      const v = V[vi];
      dt = dt0;
      if (v.v < 1.5) v.stk = (v.stk || 0) + dt; else v.stk = Math.max(0, (v.stk || 0) - dt * 2);
      if (v.stk > 15 && v.x !== 1e9 && (fc + vi) % 10 === 0 && !inView(v.x, v.y, v.z)) { v.stk = 0; if (!relocate(v, true)) relocate(v); continue; }   // véhicule immobile depuis 12 s hors du champ (bouchon/interblocage) : réaffecté ailleurs
      if (v.x !== 1e9 && (fc + vi) % 30 === 0 && rnd() < 0.15 && Math.hypot(v.x - cam.x, v.z - cam.z) > 1500 && !inView(v.x, v.y, v.z) && !v.link?.rb && !ways[v.w].rb) relocate(v, true);   // redistribution hors du champ : les véhicules ne restent pas cantonnés à quelques axes
      if (v.tn > 0) {   // demi-tour en cours (cul-de-sac) : le véhicule ne pivote plus sur place pour être ensuite
        // téléporté sur la voie inverse - il suit un arc de cercle serré (rayon = son décalage de voie actuel, donc une
        // vraie « courbe de braquage ») qui relie exactement sa pose d'arrivée (position + cap) à la pose de départ sur
        // la voie inverse (position symétrique, cap opposé), avec un cap tangent en continu aux deux bouts : jamais de
        // saut. Géométrie : cercle de centre M (sur l'axe de la voie, à l'abscisse de fin de voie) et de rayon R = |lat|,
        // passant par le point d'arrivée A (tangente = cap d'arrivée u) et son symétrique B (tangente = -u) ; le
        // véhicule progresse le long de cet arc à une vitesse de manœuvre lente (accélération douce), comme un vrai
        // demi-tour à faible allure plutôt qu'un pivot instantané.
        v.dOk = false;
        if (!v.utc) {   // géométrie figée au premier pas, à partir de la pose exacte de fin de voie (connue depuis la frame précédente)
          const hx = v.hx, hz = v.hz, lat0 = v.lat, R = Math.max(0.6, Math.abs(lat0)), sg = lat0 < 0 ? -1 : 1;
          v.utc = { mx: v.px + lat0 * hz, mz: v.pz - lat0 * hx, ux: hx, uz: hz, enx: sg * hz, enz: -sg * hx, R, ang: -Math.PI / 2 };
        }
        const c = v.utc;
        v.v = Math.min(2.6, (v.v || 0) + 2.4 * dt);   // vitesse de manœuvre : accélération douce jusqu'à ~9 km/h, réaliste pour un demi-tour serré
        c.ang = Math.min(Math.PI / 2, c.ang + v.v * dt / c.R);
        const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
        v.x = c.mx + c.R * (sa * c.enx + ca * c.ux); v.z = c.mz + c.R * (sa * c.enz + ca * c.uz);
        v.hx = ca * c.enx - sa * c.ux; v.hz = ca * c.enz - sa * c.uz; v.th = Math.atan2(-v.hz, v.hx);
        v.y = terrain.heightAt(v.x, v.z) + 0.2;   // approximation le temps du virage : le calage 4 roues (pente/dévers) reprend au prochain passage normal
        v.px = v.x; v.pz = v.z;
        if (c.ang >= Math.PI / 2) { v.tn = 0; v.utc = null; v.d = -v.d; v.lat = -v.lat; v.link = chooseLink(v); v.chg = true; }
        continue;
      }
      if (v.x !== 1e9) {   // hors champ : gelé ; loin : simulé 1 image sur 3 (pas triplé)
        const ddx = v.x - cam.x, ddz = v.z - cam.z, d2 = ddx * ddx + ddz * ddz;
        if (d2 > 5.76e6) continue;
        if (d2 > 4.9e5) { if ((vi + fc) % 3) continue; dt = dt0 * 3; }
      }
      const w = ways[v.w], i = Math.min(w.n - 1, Math.max(0, Math.round(v.s / w.ds)));
      // vitesse souhaitée : croisière, virages (anticipés), bout de voie selon le virage suivant
      let v0 = w.vb * v.f;
      if (w.br && !MODELS[v.mi].cyc) v0 *= 0.72;   // ralenti sur les ponts/passerelles carrossables (vélos non concernés)
      for (let j = 0; j < 13; j++) { const idx = Math.min(w.n - 1, Math.max(0, i + v.d * j)); v0 = Math.min(v0, Math.sqrt(w.VL[idx] * w.VL[idx] + 2 * 2.8 * j * w.ds)); }
      const rem = v.d > 0 ? w.L - v.s : v.s;
      if (RU > 0.05) { if (v.tap > 0) { v.tap -= dt; v0 = Math.min(v0, Math.max(5, v.v * 0.7)); } else if (v.v > 7 && rnd() < dt * 0.002 * RU) v.tap = 1.5 + rnd() * 2.5; }   // freinage spontané : onde de bouchon
      v0 = Math.min(v0, Math.sqrt(vEndFor(v.link) ** 2 + 2 * 2.8 * Math.max(0, rem - 3)));
      if (v.lcm) v0 = Math.min(v0, Math.sqrt(2 * 2.8 * Math.max(0, rem - 9)) + 1.2);   // fin de file supprimée : on ne fonce pas dans le mur, on cherche une place
      if (v.ov) v0 = Math.min(v0 * 1.35, v0 + 6);   // moto en dépassement : elle accélère
      // véhicule de devant (même voie, ou début de la voie suivante)
      const canGh = (th) => (v.wait || 0) > th && ((v.wait || 0) > 45 || !inView(v.x, v.y, v.z));   // un véhicule ne traverse jamais un autre à l'écran (sauf vrai interblocage > 45 s)
      let gap = 1e9, dv = 0, lead = v.lead; v.xu = null;
      if (v.mo === undefined) v.mo = MODELS[v.mi].kind === 'moto';
      const lcx = !!(lead && MODELS[lead.mi].cyc && !MODELS[v.mi].cyc);   // véhicule à doubler = cycliste : motos et voitures le doublent facilement
      if (v.mo || v.ov || lcx) {   // motos : dépassent par la gauche les gros véhicules (camion, bus, utilitaire) qui les ralentissent, en accélérant
        if (v.ov) { const o = v.ovT; v.ovDur = (v.ovDur || 0) + dt; if (v.ovDur > 12) { v.ov = false; v.ovc = 6; }   // ça traîne trop (bouchon, trafic en face) : on renonce, on se replace derrière lui et on n'y retente pas avant un moment
          else if (!o || o.w !== v.w || o.d !== v.d || o.ghost || o.x === 1e9 || v.ghost || v.p - o.p > (o.len + v.len) / 2 + 6 + v.v * 0.8 || ((rem < 14 || w.rb) && v.p - o.p < -((o.len + v.len) / 2 + 1))) v.ov = false;   // on ne se rabat jamais tant qu'on est à hauteur du véhicule doublé
          else {
            if (lead && lead !== o && MODELS[lead.mi].cyc && lead.p - o.p < 40 && lead.p - o.p > -1) v.ovT = lead;   // un autre cycliste suit de près (peloton) : on prolonge le dépassement au lieu de se rabattre entre les deux
            else if (lead && lead !== v.ovT && lead.p - v.p > 10 + v.v * 0.7) lead = null;   // le véhicule encore devant celui-là est encore loin (largement la place de se rabattre entre les deux) : on ne freine pas pour lui tant qu'on n'a pas fini de doubler
            if (lead === v.ovT && Math.abs(v.lat - (v.ovT.lat - v.ovS)) < 0.45) lead = null;   // on n'avance à côté du véhicule qu'une fois décalé latéralement (sinon on le suit)
          }
        }
        else if (lead && !lead.ghost && !v.ghost && (w.nl === 1 || !v.ln || lcx) && !w.rb && (v.ovc = (v.ovc || 0) - dt) <= 0 && lead.p - v.p < 30 && lead.v < w.vb * v.f - 0.3 && rem > lead.p - v.p + lead.len + 15) {
          const k0 = MODELS[lead.mi].kind, lc = !!MODELS[lead.mi].cyc;
          if (lc ? w.VL[i] > 5 : (v.mo && MODELS[lead.mi].L >= 4.7 && k0 !== 'moto' && w.VL[i] > 8 && (!lead.lead || lead.lead.p - lead.p > 7))) {
            const sh = lc ? MODELS[lead.mi].W * lead.sc / 2 + (v.mo ? 0.55 : MODELS[v.mi].W * v.sc / 2 + 0.6) : MODELS[lead.mi].W * lead.sc / 2 + 0.85, room = laneOff(w, v) + w.hw - 0.3;
            let free = lc ? sh <= room + 1 : (sh <= room && sh > 1.2);
            if (free && !w.oneway && w.hw < 2.9 && !lc) free = false;   // route étroite à double sens : les gros véhicules ne se risquent pas sur la ligne centrale (les vélos, plus étroits, sont doublés par tous, voiture comprise, dès que la voie d'en face est libre)
            if (free && !v.mo && !w.oneway) { const z0 = v.s, z1 = v.s + v.d * (lead.p - v.p + lead.len + 35); for (let q = 0; q < 2 && free; q++) for (const u of lanesMap.get(laneKey(v.w, -v.d, q)) || []) if (u.s > Math.min(z0, z1) - 10 && u.s < Math.max(z0, z1) + 10) { free = false; break; } }   // voitures : pas de dépassement s'il y a un véhicule en face
            if (free) { v.ov = true; v.ovT = lead; v.ovS = sh; v.ovDur = 0; lead = null; } else v.ovc = lc ? 0.4 : 3;
          } else v.ovc = lc ? 0.4 : 3;
        }
      }
      if (lead && lead.ov && lead.ovT === v && Math.abs(lead.lat - v.lat) > 0.7) lead = null;   // le véhicule doublé ne freine pas pour celui qui le double (décalé latéralement) : il continue de rouler
      if (v.ghost) lead = null;      // véhicule bloqué trop longtemps : il passe (évite les blocages généralisés)
      if (lead) { gap = lead.p - v.p - (lead.len + v.len) * TUNE.hb / 2; dv = v.v - lead.v; if (gap < 0.3) { if (canGh(w.rb ? 1.5 : (lead.wait || 0) > 3 ? 2 : 5)) { gap = 1e9; dv = 0; } else gap = 0.3; } }   // véhicules imbriqués (file d'attente devant un rond-point : on ne traverse pas le véhicule qui cède) : en rond-point le suiveur freine à fond ; ailleurs on se croise plutôt que de se bloquer
      else if (v.link && rem < (v.link.angle < 0.4 ? 70 : 40)) {   // on suit le véhicule de la voie suivante, y compris dans un virage : on n'engage pas un véhicule dans une voie/file déjà pleine (sinon il s'empile sur les files d'attente courtes, notamment devant les ronds-points)
        const nl = lanesMap.get(laneKey(v.link.w, v.link.d, Math.min(v.ln || 0, ways[v.link.w].nl - 1))), s0 = v.link.i * ways[v.link.w].ds;
        if (nl && !v.ghost) for (const u of nl) { if (u.ghost) continue; const pr = v.link.d > 0 ? u.s - s0 : s0 - u.s; if (pr >= 0) { gap = rem + pr - (u.len + v.len) * TUNE.hb / 2; dv = v.v - u.v; if (gap < 0.3) { if (canGh((w.rb || ways[v.link.w].rb) ? 1.5 : 4)) { gap = 1e9; dv = 0; } else gap = 0.3; } v.xu = u; break; } }
      }
      if (w.rb && !v.ghost) {   // anneau : jamais rouler dans le véhicule qui est devant (même sur une autre voie)
        const kx = Math.floor(v.x / 8), kz = Math.floor(v.z / 8);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const u of rbHash.get((kx + a) * 100003 + kz + b) || []) {
          if (u === v || u.ghost) continue;
          const dx = u.x - v.x, dz = u.z - v.z, dd = Math.hypot(dx, dz);
          if (dd < (v.len + u.len) * 0.6 + 2 && dd > 0.01 && dx * v.hx + dz * v.hz > 0.5 * dd) { const g = Math.max(0.3, dd - (v.len + u.len) * TUNE.hb / 2); if (g < gap) { gap = g; dv = v.v - u.v; } }
        }
      }
      v.yl = false;
      if (v.link && rem < 28 && !w.rb && ways[v.link.w].rb && !v.ghost && (ways[v.link.w].rcL || 999) < 45) {   // mini-rond : on entre seulement s'il reste de la place (capacité ~1 véhicule / 11 m)
        const lw = ways[v.link.w];
        if (lw.rid !== undefined && rbOcc[lw.rid] >= Math.max(1, Math.floor(lw.rcL / 11))) { const g2 = Math.max(0.05, rem - 3.4 - v.len * 0.5); if (g2 < gap) { gap = g2; dv = v.v; } v.yl = true; }
      }
      if (v.link && rem < 28 && !w.rb && ways[v.link.w].rb && !v.ghost && (ways[v.link.w].rcL || 999) >= 45) {   // (mini-ronds < 45 m : simple carrefour ; véhicule qui attend depuis trop longtemps : il s'engage)   // priorité au rond-point : on cède à tout véhicule déjà dans l'anneau près du point d'entrée
        const lw = ways[v.link.w], ex = lw.X[v.link.i], ez = lw.Z[v.link.i], kx = Math.floor(ex / 8), kz = Math.floor(ez / 8);
        let busy = false, hard = false;
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const u of rbHash.get((kx + a) * 100003 + kz + b) || []) {
          if (u === v) continue;
          const dd = Math.hypot(u.x - ex, u.z - ez);
          if (dd < (u.len + v.len) * 0.5 + 1.5) hard = true;   // quelqu'un occupe déjà le point d'entrée : on n'entre jamais dessus
          else if (dd < 2.5 + (u.len + v.len) * 0.5 && (ex - u.x) * u.hx + (ez - u.z) * u.hz > -1.5) busy = true;
        }
        for (const p of rbNew) if (Math.hypot(p[0] - ex, p[1] - ez) < 6.5) hard = true;   // un autre véhicule vient d'entrer sur ce point pendant ce pas
        if (busy) v.yt = (v.yt || 0) + dt; else v.yt = 0;
        if (hard || (busy && v.yt < 3)) { const g2 = Math.max(0.05, rem - 3.4 - v.len * 0.5); if (g2 < gap) { gap = g2; dv = v.v; } v.yl = true; }
      }
      const am = v.boost > 0 ? A_MAX * 2.3 : A_MAX; if (v.boost > 0) v.boost -= dt;   // accélération franche pour s'insérer dans le trafic
      let acc = am * (1 - Math.pow(v.v / Math.max(1, v0), 4));
      if (gap < 1e8) { const sx = TUNE.s0 + Math.max(0, v.v * T_HW * (v.hw || 1) + v.v * dv / (2 * Math.sqrt(A_MAX * B_DEC))); acc -= A_MAX * (sx / Math.max(0.5, gap)) ** 2; }
      const bmax = gap < 1e8 && gap < 14 && dv > 0.5 ? -7 - Math.min(6, dv * 0.7) : -7;   // freinage d'urgence : l'écart se referme vite -> on freine plus fort qu'en roulage normal pour ne jamais percuter le véhicule de devant
      acc = Math.max(bmax, acc); v.v = Math.max(0, Math.min(v.v + acc * dt, w.vb * 1.2));
      if (lead && !v.ghost && !lead.ghost && gap < 4 && lead.x !== 1e9) v.v = Math.min(v.v, Math.max(0, lead.v) + Math.max(0, gap - 0.3) * 1.5);   // jamais plus vite que le véhicule de devant quand on lui colle : on ne le traverse pas
      if (acc < -0.8 || v.v < 0.4) v.bk = 0.45; else if (v.bk > 0) v.bk -= dt;   // feux stop : freinage, ralentissement ou arrêt (maintenus 0,45 s)
      v.wait = v.v < 0.7 ? (v.wait || 0) + dt : (v.v > 2 ? 0 : v.wait || 0); v.ghost = canGh(v.yl ? 8 : 3);
      const s0 = v.s; v.s += v.d * v.v * dt;
      { // contrainte dure : deux véhicules d'une même voie ne se chevauchent jamais (seules les motos, en changeant de voie, doublent)
        let room = 1e9, lv = 1e9;
        if (lead && !lead.ghost && !v.ghost && lead.x !== 1e9) { room = lead.p - v.p - (lead.len + v.len) / 2 - 0.25; lv = lead.v; }
        else if (!lead && !v.ov && v.xu && !v.xu.ghost && !v.ghost && v.link) { const u = v.xu, lw = ways[v.link.w], s0l = v.link.i * lw.ds, pr = v.link.d > 0 ? u.s - s0l : s0l - u.s, remq = v.d > 0 ? w.L - s0 : s0; room = remq + pr - (u.len + v.len) / 2 - 0.25; lv = u.v; }
        if (room < -0.3 && room > -12 && s0 + v.d * room > 0 && s0 + v.d * room < w.L && !inView(v.x, v.y, v.z)) { v.s = s0 + v.d * room; v.v = Math.min(v.v, lv); room = 0.01; }   // chevauchement déjà présent hors champ (insertion/réaffectation) : le suiveur recule
        else if (room < -0.3 && room > -12 && lv < 1 && v.v < 1 && s0 - v.d * 1.2 * dt > 0 && s0 - v.d * 1.2 * dt < w.L) { v.s = s0 - v.d * Math.min(-room, 1.2 * dt); v.v = 0; room = 0.01; }   // deux véhicules quasi arrêtés qui se chevauchent à l'écran : le suiveur recule doucement pour se dégager
        if (room < 1e8 && v.v * dt > room) { const mv = Math.max(0, room); v.s = s0 + v.d * mv; v.v = Math.min(v.v, lv, mv / Math.max(dt, 1e-3)); }
      } v.cool -= dt; if (w.rb) v.ring = (v.ring || 0) + v.v * dt;
      // sorties au milieu de la voie
      if (v.cool <= 0 && w.exits.length && v.v > 1) {
        const a = s0 / w.ds, b = v.s / w.ds, lo = Math.min(a, b), hi = Math.max(a, b);
        for (const ex of w.exits) if (ex.d === v.d && ex.i >= lo && ex.i < hi && !ways[ex.to.w].dead && !(ways[ex.to.w].dd && ways[ex.to.w].dd[ex.to.d]) && !(v.len >= 5 && ways[ex.to.w].stub) && (MODELS[v.mi].cyc || !ways[ex.to.w].bo)) {
          if (w.rb) {
            if (ex.to.rb || (ex.to.w === v.from && (v.ring || 0) <= 60) || (ways[ex.to.w].L < 60 && ways[ex.to.w].links[ex.to.d > 0 ? 1 : 0].some((q) => ways[q.w].rb))) continue;
            if ((v.ring || 0) <= 60 && (v.rbSkip = (v.rbSkip || 0) - 1) >= 0) continue;
          } else if (!(rnd() < (v.ut > 0 ? 0.9 : Math.min(0.85, (0.10 + 0.55 / (1 + 2.5 * use[ex.to.w] / (useSum / Math.max(1, nLive) + 0.05)) ** 1.5) * (ex.to.k <= w.k ? 1 : 0.8) / (1 + Math.min(6, (cong[ex.to.w] || 0) * 30)))))) continue;   // après un demi-tour en impasse, on prend la première sortie
          enter(v, ex.to); break;
        }
      }
      // fin de voie
      const w2 = ways[v.w];
      if (v.d > 0 ? v.s >= w2.L : v.s <= 0) {
        if (!v.link && !w2.oneway && (window.__ut = window.__ut || []).length < 300) window.__ut.push([w2.k, Math.round(w2.X[0]), Math.round(w2.Z[0]), Math.round(w2.L), v.d]);
        if (v.link) { const ov = v.d > 0 ? v.s - w2.L : -v.s; enter(v, v.link); v.s += v.d * Math.max(0, ov); }
        else if (w2.oneway) {   // impasse sur un sens unique : on attend, et on ne se téléporte qu'hors du champ de la caméra
          v.s = Math.max(0, Math.min(w2.L, v.s)); v.v = 0; v.dead = (v.dead || 0) + dt;
          if (v.dead > 12 && !inView(v.x, v.y, v.z)) relocate(v);
        }
        else if ((v.ut = (v.ut || 0) + 1) >= 3 && !inView(v.x, v.y, v.z) && relocate(v)) { /* cul-de-sac : trop d'allers-retours, replacé hors champ */ }
        else { v.tn = 1; v.v = 0; v.s = Math.max(0, Math.min(w2.L, v.s)); }   // cul-de-sac : pas de suite -> demi-tour en arc serré (géométrie posée au prochain pas, cf. plus haut)
      }
      // position : ligne de la voie + décalage latéral à droite du sens de marche (doux)
      const wc = ways[v.w], f = Math.max(0, Math.min(wc.n - 1.001, v.s / wc.ds)), i0 = f | 0, t = f - i0;
      const cx = wc.X[i0] + (wc.X[i0 + 1] - wc.X[i0]) * t, cz = wc.Z[i0] + (wc.Z[i0 + 1] - wc.Z[i0]) * t;
      let hx = (wc.TX[i0] + (wc.TX[i0 + 1] - wc.TX[i0]) * t) * v.d, hz = (wc.TZ[i0] + (wc.TZ[i0 + 1] - wc.TZ[i0]) * t) * v.d; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      const tgt = v.ov ? Math.max(-(wc.hw - 0.4), (v.ovT.w === v.w ? v.ovT.lat : laneOff(wc, v)) - v.ovS) : laneOff(wc, v), dl = tgt - v.lat; v.lat += Math.max(-dt * 2.6, Math.min(dt * 2.6, dl));
      const rx = cx - hz * v.lat, rz = cz + hx * v.lat;
      // virage en courbe de Bézier : à chaque changement de voie, le véhicule quitte sa pose actuelle (position + cap) et rejoint la voie suivante, cap tangent, sans saut
      if (v.chg && v.px !== undefined && v.th !== undefined) {
        v.cr = null;
        if (!(wc.rb && ways[v.pw] && ways[v.pw].rb)) {
        const th1 = Math.atan2(-hz, hx); let df = th1 - v.th; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
        const at = (dn) => { const s1 = Math.max(0, Math.min(wc.L, v.s + v.d * dn)), g1 = Math.max(0, Math.min(wc.n - 1.001, s1 / wc.ds)), j = g1 | 0, jt = g1 - j;
          let ux = (wc.TX[j] + (wc.TX[j + 1] - wc.TX[j]) * jt) * v.d, uz = (wc.TZ[j] + (wc.TZ[j + 1] - wc.TZ[j]) * jt) * v.d; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
          return { s1, ux, uz, x: wc.X[j] + (wc.X[j + 1] - wc.X[j]) * jt - uz * wc.off, z: wc.Z[j] + (wc.Z[j + 1] - wc.Z[j]) * jt + ux * wc.off }; };
        let dn = Math.min(22, Math.max(8, 5 + Math.abs(df) * 7)) * (v.len < 6 ? TUNE.tr : 1), P = at(dn);
        const ch0 = Math.hypot(P.x - v.px, P.z - v.pz); if (ch0 > dn) { dn = Math.min(30, ch0 * 1.05); P = at(dn); }
        const da = Math.abs(P.s1 - v.s), ch = Math.hypot(P.x - v.px, P.z - v.pz);
        const exRb = !wc.rb && ways[v.pw] && ways[v.pw].rb;   // sortie de rond-point : toujours une courbe qui rejoint la voie de droite (sinon glissement tardif depuis l'axe)
        if ((Math.abs(df) > 0.14 || (exRb && ch > 0.6)) && da > 2.5 && ch > (exRb ? 0.6 : 2)) {
          const k = Math.max(2, ch * 0.5); let aa = [v.px + Math.cos(v.th) * k, v.pz - Math.sin(v.th) * k], bb = [P.x - P.ux * k, P.z - P.uz * k];
          if (Math.abs(df) > 0.35) { // vrai virage : poignées tirées vers le point de croisement des deux lignes de voie -> la courbe reste dans l'angle (voie de droite), sans large débord vers l'extérieur
            const h0x = Math.cos(v.th), h0z = -Math.sin(v.th), Dx = P.x - v.px, Dz = P.z - v.pz, den = h0x * P.uz - h0z * P.ux;
            if (Math.abs(den) > 0.2) { const t = (Dx * P.uz - Dz * P.ux) / den, sg = (h0x * Dz - h0z * Dx) / den, lim = ch * 1.3;
              if (t > 0.3 && sg > 0.3) { const tt = Math.min(t, lim) * 0.62, ss2 = Math.min(sg, lim) * 0.62; aa = [v.px + h0x * tt, v.pz + h0z * tt]; bb = [P.x - P.ux * ss2, P.z - P.uz * ss2]; } } }
          v.cr = { x0: v.px, z0: v.pz, a: aa, b: bb, x1: P.x, z1: P.z, sE: v.s, dn: da, u: 0, len: ch * (1.05 + Math.abs(df) * 0.16), s1: P.s1 };
        }
        }
      }
      let crOn = false, crTh = 0;
      if (v.cr) {
        const c = v.cr; c.u += v.v * dt / c.len; const u = c.u;
        if (u >= 1) { v.s = c.s1; v.cr = null; }
        else {
          const m = 1 - u, b0 = m * m * m, b1 = 3 * m * m * u, b2 = 3 * m * u * u, b3 = u * u * u;
          v.x = b0 * c.x0 + b1 * c.a[0] + b2 * c.b[0] + b3 * c.x1; v.z = b0 * c.z0 + b1 * c.a[1] + b2 * c.b[1] + b3 * c.z1;
          const d0 = 3 * m * m, d1 = 6 * m * u, d2 = 3 * u * u, ddx = d0 * (c.a[0] - c.x0) + d1 * (c.b[0] - c.a[0]) + d2 * (c.x1 - c.b[0]), ddz = d0 * (c.a[1] - c.z0) + d1 * (c.b[1] - c.a[1]) + d2 * (c.z1 - c.b[1]);
          crTh = Math.atan2(-ddz, ddx); crOn = true; v.s = c.sE + v.d * Math.min(1, u) * c.dn; v.ox = v.oz = 0; v.lat = laneOff(wc, v);
        }
      }
      if (crOn) { /* position déjà fixée par la courbe */ }
      else {
        if (v.px === undefined) { v.ox = v.oz = 0; } else if (v.chg) { v.ox = v.px - rx; v.oz = v.pz - rz; }
        const dec = Math.exp(-dt * 2.0); v.ox *= dec; v.oz *= dec;
        v.x = rx + v.ox; v.z = rz + v.oz;
      }
      v.chg = false;
      // assiette : hauteur du terrain sous les 4 roues -> tangage et roulis (pente en travers), le véhicule repose sur le plan des 4 roues
      const m0 = MODELS[v.mi], wl = m0.L * v.sc * 0.3, wwd = m0.W * v.sc * 0.4;
      // hauteur sous chaque roue : calée sur la MÊME chaussée aplatie que celle dessinée par roads.js (Ribbons.add).
      // Le plafonnement du dévers (MAX_CROSS_SLOPE) s'applique PAR RAPPORT À L'AXE RÉEL DE LA VOIE (comme dans
      // Ribbons.add), pas par rapport à la position du véhicule : sur une route à plusieurs voies, la voie suivie
      // est déjà décalée de l'axe de v.lat (1 à 3 m), et sur un col de montagne très pentu en travers, le relief
      // brut y descend bien plus vite que le ruban aplati - les roues (surtout vélos/piétons près du bord, où le
      // décalage total à l'axe est le plus grand) se retrouvaient enterrées de plusieurs dizaines de cm, voire
      // plus d'1 m (seule la tête du cycliste émergeait). axisAt(a) = point de l'axe réel de la voie à l'abscisse
      // longitudinale (v.s + v.d·a) ; b = décalage latéral propre de la roue (par rapport au centre du véhicule) ;
      // le décalage total par rapport à l'axe est (v.lat + b), même convention que Ribbons.add.
      const axisAt = (a) => {
        const s1 = Math.max(0, Math.min(wc.L, v.s + v.d * a)), g1 = Math.max(0, Math.min(wc.n - 1.001, s1 / wc.ds)), j1 = g1 | 0, jt1 = g1 - j1;
        let tx1 = (wc.TX[j1] + (wc.TX[j1 + 1] - wc.TX[j1]) * jt1) * v.d, tz1 = (wc.TZ[j1] + (wc.TZ[j1 + 1] - wc.TZ[j1]) * jt1) * v.d; const tl1 = Math.hypot(tx1, tz1) || 1; tx1 /= tl1; tz1 /= tl1;
        return { x: wc.X[j1] + (wc.X[j1 + 1] - wc.X[j1]) * jt1, z: wc.Z[j1] + (wc.Z[j1 + 1] - wc.Z[j1]) * jt1, tx: tx1, tz: tz1 };
      };
      const hgt4 = (a, b) => {
        const ax = axisAt(a), cH = terrain.heightAt(ax.x, ax.z), lat = v.lat + b, maxD = Math.abs(lat) * MAX_CROSS_SLOPE;
        const x = ax.x - ax.tz * lat, z = ax.z + ax.tx * lat, raw = terrain.heightAt(x, z);
        return cH + Math.max(-maxD, Math.min(maxD, raw - cH));
      };
      const hFP = hgt4(wl, wwd), hFM = hgt4(wl, -wwd), hRP = hgt4(-wl, wwd), hRM = hgt4(-wl, -wwd), hAt = Math.max((hFP + hFM + hRP + hRM) / 4 + 0.5 * (Math.max(hFP, hFM, hRP, hRM) - Math.min(hFP, hFM, hRP, hRM)) * 0.5, Math.max(hFP, hFM, hRP, hRM) - 0.06, hgt4(0, 0));   // ruban routier interpolé entre sommets : jamais sous la roue la plus haute (véhicules enterrés)
      v.y = hAt + 0.17 + 0.03 * (wc.lk ?? LAYK[wc.k]);   // pose sur le ruban de route (0,09 + 0,03·couche, cf. roads.js) + 4 cm ; avant : +0,42 (véhicules qui flottaient de ~33 cm) et hauteur prise au seul centre (roues enterrées en dévers)
      const krr = Math.min(1, dt * 12); v.pitch += (Math.atan2((hFP + hFM) / 2 - (hRP + hRM) / 2, 2 * wl) - v.pitch) * krr;
      v.roll = (v.roll || 0) + (-Math.atan2((hFP + hRP) / 2 - (hFM + hRM) / 2, 2 * wwd) - (v.roll || 0)) * krr;
      // cap : tangente de la voie un peu en avant du véhicule (il suit la route), lissée et limitée en vitesse de rotation
      const tan2 = (off) => { const la = Math.max(0, Math.min(wc.n - 1.001, (v.s + v.d * v.len * off) / wc.ds)), li = la | 0, lt = la - li; return [(wc.TX[li] + (wc.TX[li + 1] - wc.TX[li]) * lt) * v.d, (wc.TZ[li] + (wc.TZ[li + 1] - wc.TZ[li]) * lt) * v.d]; };
      const ta = tan2(0.3), tb = tan2(1.0), tc = tan2(1.8), tx = ta[0] + tb[0] * 1.5 + tc[0], tz = ta[1] + tb[1] * 1.5 + tc[1];   // moyenne de tangentes prises en avant : rotation continue
      const th = crOn ? crTh : Math.atan2(-tz, tx);
      if (v.th === undefined) v.th = th;
      let dth = th - v.th; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
      const my = (crOn ? 4.5 : Math.max(0.6, v.v / 3.5)) * dt; v.th += Math.max(-my, Math.min(my, dth * Math.min(1, dt * 6))); v.hx = Math.cos(v.th); v.hz = -Math.sin(v.th);
      // pose d'affichage : les ROUES (essieux avant/arrière à ±0,32·L) suivent la trajectoire ; le corps est placé au milieu des deux essieux, cap = direction essieu arrière → avant
      { const aw = v.len * 0.32, wox = crOn ? 0 : v.x - rx, woz = crOn ? 0 : v.z - rz;
        const wp = (o) => {
          if (crOn) { const c = v.cr, uu = c.u + o / c.len;
            if (uu < 0) { const h = Math.hypot(c.a[0] - c.x0, c.a[1] - c.z0) || 1; return [c.x0 + (c.a[0] - c.x0) / h * uu * c.len, c.z0 + (c.a[1] - c.z0) / h * uu * c.len]; }
            if (uu > 1) { const h = Math.hypot(c.x1 - c.b[0], c.z1 - c.b[1]) || 1; return [c.x1 + (c.x1 - c.b[0]) / h * (uu - 1) * c.len, c.z1 + (c.z1 - c.b[1]) / h * (uu - 1) * c.len]; }
            const m = 1 - uu, b0 = m * m * m, b1 = 3 * m * m * uu, b2 = 3 * m * uu * uu, b3 = uu * uu * uu;
            return [b0 * c.x0 + b1 * c.a[0] + b2 * c.b[0] + b3 * c.x1, b0 * c.z0 + b1 * c.a[1] + b2 * c.b[1] + b3 * c.z1]; }
          const s0 = v.s + v.d * o, sc2 = Math.max(0, Math.min(wc.L, s0)), ex = v.d * (s0 - sc2), g = Math.max(0, Math.min(wc.n - 1.001, sc2 / wc.ds)), j = g | 0, jt = g - j;
          let tx2 = (wc.TX[j] + (wc.TX[j + 1] - wc.TX[j]) * jt) * v.d, tz2 = (wc.TZ[j] + (wc.TZ[j + 1] - wc.TZ[j]) * jt) * v.d; const tl = Math.hypot(tx2, tz2) || 1; tx2 /= tl; tz2 /= tl;
          const px2 = wc.X[j] + (wc.X[j + 1] - wc.X[j]) * jt, pz2 = wc.Z[j] + (wc.Z[j + 1] - wc.Z[j]) * jt;
          return [px2 - tz2 * v.lat + wox + tx2 * ex, pz2 + tx2 * v.lat + woz + tz2 * ex]; };
        const pf = wp(aw), pr = wp(-aw);
        if (isFinite(pf[0] + pr[0] + pf[1] + pr[1]) && Math.hypot(pf[0] - pr[0], pf[1] - pr[1]) > 0.3) { v.dX = (pf[0] + pr[0]) / 2; v.dZ = (pf[1] + pr[1]) / 2; v.dth = Math.atan2(-(pf[1] - pr[1]), pf[0] - pr[0]); v.dOk = true; } else v.dOk = false; }
      v.px = v.x; v.pz = v.z;
    }
    // affichage : uniquement les véhicules proches de la caméra
    const cnt = MODELS.map(() => 0); let np = 0, nb = 0, nbm = 0; const hcol = headPts.geometry.attributes.color.array, tcol = tailPts.geometry.attributes.color.array; const hp = headPts.geometry.attributes.position.array, tp2 = tailPts.geometry.attributes.position.array;
    const cx = cam.x, cy = cam.y, cz = cam.z, LD = 0.2;   // les halos (sprites) sont abaissés de 30 cm : à hauteur exacte ils semblaient flotter au-dessus des phares du modèle
    const kp = brkPts.geometry.attributes.position.array, kc = brkPts.geometry.attributes.color.array; let nq = 0;
    const bp = blkPts.geometry.attributes.position.array, bc = blkPts.geometry.attributes.color.array; let nk = 0;
    const blinkOn = (performance.now() % 700) < 400;   // ~1,4 Hz
    { const HAZ_VB = 11, HAZ_MIN = 4;   // « voies assez rapides à très rapides » (>= ~40 km/h) ; file d'au moins 4 véhicules à l'arrêt pour parler de bouchon
      for (const a of lanesMap.values()) { if (!a.length) continue; const wz = ways[a[0].w];
        if (wz.vb < HAZ_VB || wz.rb) { for (const v of a) v.haz = false; continue; }
        let i = 0; while (i < a.length) { if (a[i].v >= 2) { a[i].haz = false; i++; continue; }
          let j = i; while (j < a.length && a[j].v < 2) { a[j].haz = false; j++; }
          if (j - i >= HAZ_MIN) for (let k = i; k < i + 3; k++) a[k].haz = true; i = j; } } }   // a est trié par p croissant (v.d) : les indices bas = queue de file (véhicules les plus en arrière)
    const sAng = (w0, a, l) => { const b = dirAt(ways[l.w], l.i, l.d), cr = a[0] * b[1] - a[1] * b[0]; return cr > 0 ? l.angle : -l.angle; };   // angle signé du virage (+ = droite)
    const turnSide = (v) => { const lk = v.link; if (!lk) return 0; if (v._lk !== lk) { v._lk = lk; v._ts = 0; const w0 = ways[v.w];
      if (lk.angle > 0.45 && !w0.rb && !ways[lk.w].rb) {   // on ne clignote que si le conducteur a un vrai choix : au moins 2 directions distinctes possibles à ce carrefour
        const a = dirAt(w0, v.d > 0 ? w0.n - 1 : 0, v.d), alts = [];
        for (const l of w0.links[v.d > 0 ? 1 : 0]) { if (ways[l.w].dead || (ways[l.w].dd && ways[l.w].dd[l.d])) continue; const g = sAng(w0, a, l); if (!alts.some((q) => Math.abs(q - g) < 0.35)) alts.push(g); }
        if (alts.length >= 2) v._ts = sAng(w0, a, lk) > 0 ? 1 : -1; } } return v._ts; };
    for (let vi = 0; vi < nAct; vi++) {
      const v = V[vi];
      if (Math.hypot(v.x - cx, v.y - cy, v.z - cz) > 2400) continue;
      const X = v.dOk ? v.dX : v.x, Z = v.dOk ? v.dZ : v.z, TH = v.dOk ? v.dth : v.th, HX = v.dOk ? Math.cos(TH) : v.hx, HZ = v.dOk ? -Math.sin(TH) : v.hz;
      if (v === rideV) rideSig = v.haz ? 2 : v.ov ? -1 : (v.link && !v.ghost ? (() => { const wq = ways[v.w], rm = v.d > 0 ? wq.L - v.s : v.s; return rm < 35 ? turnSide(v) : 0; })() : 0);
      if (blinkOn && v !== rideV && !v.isTrain && !MODELS[v.mi].cyc && nk < blkPts.geometry.attributes.position.count - 2 && Math.hypot(X - cx, Z - cz) < 700) {   // clignotants : virage à venir ou dépassement (moto, à gauche), ou warnings (bouchon) sur les 4 coins
        if (v.haz) { const mq = MODELS[v.mi], hl2 = v.len / 2 + 0.03, lat = mq.kind === 'moto' ? 0.22 : mq.W * v.sc * 0.5 * 0.86;
          for (const sd2 of [1, -1]) { const ox = -HZ * lat * sd2, oz = HX * lat * sd2;
            for (const e of [1, -1]) { if (nk >= blkPts.geometry.attributes.position.count - 2) break;
              bp[nk * 3] = X + HX * hl2 * e + ox; bp[nk * 3 + 1] = v.y + (e > 0 ? (mq.kind === 'moto' ? 0.86 : 0.72) : 0.78) * v.sc - LD;
              bp[nk * 3 + 2] = Z + HZ * hl2 * e + oz; bc[nk * 3] = 1; bc[nk * 3 + 1] = 0.74; bc[nk * 3 + 2] = 0.08; nk++; } }
        } else {
        let sd = 0; if (v.ov) sd = -1; else if (v.link && !v.ghost) { const wq = ways[v.w], rm = v.d > 0 ? wq.L - v.s : v.s; if (rm < 35) sd = turnSide(v); }
        if (sd) { const mq = MODELS[v.mi], hl2 = v.len / 2 + 0.03, lat = mq.kind === 'moto' ? 0.22 : mq.W * v.sc * 0.5 * 0.86, ox = -HZ * lat * sd, oz = HX * lat * sd;
          for (const e of [1, -1]) { bp[nk * 3] = X + HX * hl2 * e + ox; bp[nk * 3 + 1] = v.y + (e > 0 ? (mq.kind === 'moto' ? 0.86 : 0.72) : 0.78) * v.sc - LD;   // hauteur réelle des feux du modèle x échelle du véhicule
            bp[nk * 3 + 2] = Z + HZ * hl2 * e + oz; bc[nk * 3] = 1; bc[nk * 3 + 1] = 0.74; bc[nk * 3 + 2] = 0.08; nk++; } }
        }
      }
      if (v.bk > 0 && v !== rideV && !v.isTrain && !MODELS[v.mi].cyc && nq < brkPts.geometry.attributes.position.count - 2 && Math.hypot(X - cx, Z - cz) < 700) {
        const mq = MODELS[v.mi], hl3 = v.len / 2 + 0.03, mo = mq.kind === 'moto', ws2 = mq.W * v.sc * 0.36;
        for (const sg of mo ? [0] : [-1, 1]) { kp[nq * 3] = X - HX * hl3 - HZ * ws2 * sg; kp[nq * 3 + 1] = v.y + 0.78 * v.sc - LD; kp[nq * 3 + 2] = Z - HZ * hl3 + HX * ws2 * sg; kc[nq * 3] = 1; kc[nq * 3 + 1] = 0.1; kc[nq * 3 + 2] = 0.05; nq++; }
      }
      let mIx = v.mi; if (MODELS[v.mi].kind === 'bike' && !MODELS[v.mi].arm && v.link && !v.ghost) { const wq = ways[v.w], rm = v.d > 0 ? wq.L - v.s : v.s; if (rm < 30) { const sg = turnSide(v); if (sg) mIx = BIKEARM[sg > 0 ? 1 : 0]; } }   // bras tendu avant le virage (à défaut de clignotant)
      const im = meshes[mIx], k = cnt[mIx]++;
      E.set(m0roll(v), TH, v.pitch, 'YZX'); Q.setFromEuler(E); Pv.set(X, v.y, Z); Sv.set(v.sc, v.sc, v.sc); M4.compose(Pv, Q, v === rideV ? S0v : Sv); M4.toArray(im.instanceMatrix.array, k * 16);
      im.instanceColor.array[k * 3] = v.col.r; im.instanceColor.array[k * 3 + 1] = v.col.g; im.instanceColor.array[k * 3 + 2] = v.col.b;
      if (night > 0.03 && v !== rideV) {
        const hl = v.len / 2 + 0.1, ws = MODELS[v.mi].W * v.sc * 0.33, px = -HZ * ws, pz = HX * ws, hr = v.hc ? 0.86 : 1, hb = v.hc ? 1 : 0.8;
        const cyc = !!MODELS[v.mi].cyc, moto = MODELS[v.mi].kind === 'moto' || cyc, dim = cyc ? 0.4 : 1;   // vélo : un petit phare et un feu arrière, moyennement lumineux, sans faisceau au sol
        for (const sg of moto ? [0] : [-1, 1]) {
          hp[np * 3] = X + HX * hl + px * sg; hp[np * 3 + 1] = v.y + (cyc ? 1.0 : moto ? 0.86 : 0.72) * v.sc - LD; hp[np * 3 + 2] = Z + HZ * hl + pz * sg;
          tp2[np * 3] = X - HX * hl + px * sg; tp2[np * 3 + 1] = v.y + (cyc ? 0.85 : 0.78) * v.sc - LD; tp2[np * 3 + 2] = Z - HZ * hl + pz * sg;
          hcol[np * 3] = hr * dim; hcol[np * 3 + 1] = 0.95 * dim; hcol[np * 3 + 2] = hb * dim; tcol[np * 3] = 0.15 * (cyc ? 1.0 : 1); tcol[np * 3 + 1] = 0.017; tcol[np * 3 + 2] = 0.01; np++;
        }
        if (Math.hypot(X - cx, Z - cz) < 700) {   // faisceaux au sol
          M4.compose(Pv, Q, Sv); if (cyc) { /* pas de faisceau au sol */ } else if (moto) { M4.toArray(beamHm.instanceMatrix.array, nbm * 16); M4.toArray(beamTm.instanceMatrix.array, nbm * 16); nbm++; } else { M4.toArray(beamH.instanceMatrix.array, nb * 16); M4.toArray(beamT.instanceMatrix.array, nb * 16); nb++; }
        }
      }
    }
    meshes.forEach((im, m) => { im.count = cnt[m]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
    beamH.count = beamT.count = nb; beamH.instanceMatrix.needsUpdate = beamT.instanceMatrix.needsUpdate = true;
    beamHm.count = beamTm.count = nbm; beamHm.instanceMatrix.needsUpdate = beamTm.instanceMatrix.needsUpdate = true;
    for (const g of [headPts.geometry, tailPts.geometry]) { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    headPts.geometry.setDrawRange(0, np); tailPts.geometry.setDrawRange(0, np);
    brkPts.geometry.attributes.position.needsUpdate = true; brkPts.geometry.attributes.color.needsUpdate = true; brkPts.geometry.setDrawRange(0, nq);
    blkPts.geometry.attributes.position.needsUpdate = true; blkPts.geometry.attributes.color.needsUpdate = true; blkPts.geometry.setDrawRange(0, nk);
  };
  // ---- visite virtuelle : sélection d'un véhicule sous la souris, caméra embarquée
  const pick = (o, d, maxD = 700) => {
    let best = null, bt = 1e9;
    for (let vi = 0; vi < nAct; vi++) { const v = V[vi]; if (v.x === 1e9 || (!v.x && !v.z)) continue;
      const rx = v.x - o.x, ry = v.y + 0.8 - o.y, rz = v.z - o.z, t = rx * d.x + ry * d.y + rz * d.z; if (t < 1 || t > maxD) continue;
      const px = rx - d.x * t, py = ry - d.y * t, pz = rz - d.z * t, tol = Math.max(1.4, t * 0.011, v.len * 0.45);
      if (px * px + py * py + pz * pz < tol * tol && t < bt) { bt = t; best = v; } }
    if (trains) { const q = trains.pick(o, d, maxD); if (q && q.t < bt) best = q.p; }   // locomotives
    return best;
  };
  const setRide = (v) => { rideV = v && !v.isTrain ? v : null; if (trains) trains.setRide(v && v.isTrain ? v : null); };
  const eye = (v) => v.isTrain ? 2.9 : MODELS[v.mi].H * v.sc * (MODELS[v.mi].kind === 'moto' ? 0.8 : 0.76);
  // répartit un total (véhicules + vélos, réduction rurale déjà appliquée par l'appelant ou ci-dessous) entre les
  // deux contingents en conservant la proportion d'origine du mélange généré (comportement inchangé par rapport à
  // l'ancien tirage homogène sur tableau unique - juste recalculé à partir des 2 blocs au lieu d'un seul cutoff).
  const applySplit = (nOther, nBike) => { nAct = Math.min(nOtherPool, Math.max(0, Math.round(nOther))) + Math.min(nBikePool, Math.max(0, Math.round(nBike))); return nAct; };
  const setCount = (n) => { const total = Math.max(0, Math.round(n * 0.8 * (1 - 0.6 * RU)));  /* rural : moins de voitures */ return applySplit(total * (1 - bikeShare), total * bikeShare); };
  // réglage par défaut au chargement d'une ville (main.js) : contingent motorisé multiplié par otherBoost (12 % à
  // la demande), contingent vélo laissé à sa proportion d'origine, inchangé - jamais utilisé par le curseur manuel.
  const setBoostedDefault = (n, otherBoost) => { const total = Math.max(0, Math.round(n * 0.8 * (1 - 0.6 * RU))); return applySplit(total * (1 - bikeShare) * otherBoost, total * bikeShare); };
  const setNight = (n) => { if (trains) trains.setNight(n); night = n; uNight.value = n; blkPts.material.size = 0.95 + 0.85 * n; brkHalo.material.opacity = 0.18 + 0.5 * n; brkPts.material.size = 1.3 + 0.7 * n; for (const p of [headPts, tailPts, headHalo, tailHalo, blkHalo]) { p.material.opacity = Math.min(1, n * 1.1) * (p.userData.opa || 1); p.visible = n > 0.03; } beamMat.opacity = poolMat.opacity = Math.min(1, n * 1.1); beamH.visible = beamT.visible = beamHm.visible = beamTm.visible = n > 0.03; };
  return { trains, pick, setRide, eye, signal: () => rideSig, models: MODELS, _V: V, _ways: ways, group, update, setNight, setCount, setBoostedDefault, total: V.length, count: V.length, dbg: (rbo) => V.filter((v) => v.v < 0.2 && (!rbo || ways[v.w].rb)).slice(0, 12).map((v) => { const w = ways[v.w]; return { k: w.k, one: w.oneway, cl: w.closed, L: Math.round(w.L), s: Math.round(v.s), d: v.d, xu: v.xu ? { v: +v.xu.v.toFixed(1), g: v.xu.ghost, w: v.xu.wait | 0, same: v.xu.w === v.w, lw: v.link.w, uw: v.xu.w, ud: v.xu.d, ld: v.link.d, us: Math.round(v.xu.s), ls: Math.round(v.link.i * ways[v.link.w].ds), ulead: v.xu.lead ? [Math.round(v.xu.lead.p - v.xu.p), +v.xu.lead.v.toFixed(1)] : null } : null, wait: v.wait | 0, yl: v.yl ? 1 : 0, gh: v.ghost ? 1 : 0, id: v.w, rg: v.ring | 0, fr: v.from, rb: ways[v.w].rb ? 1 : 0, vv: +v.v.toFixed(2), link: v.link ? [v.link.w, v.link.d, Math.round(v.link.angle * 57)] : null, lead: v.lead ? [Math.round(v.lead.p - v.p), +v.lead.v.toFixed(1), v.lead.w === v.w] : null, nl: [w.links[0].length, w.links[1].length] }; }), stats: () => ({ avg: V.reduce((a, v) => a + v.v, 0) / V.length, stuck: V.filter((v) => v.v < 0.2).length, rbStuck: V.filter((v) => v.v < 0.2 && ways[v.w].rb).length, rbVeh: V.filter((v) => ways[v.w].rb).length, nrb: ways.filter((w) => w.rb).length, nOne: ways.filter((w) => w.oneway).length, ways: ways.length, links: ways.reduce((a, w) => a + w.links[0].length + w.links[1].length, 0), exits: ways.reduce((a, w) => a + w.exits.length, 0), noLink: ways.filter((w) => !w.links[0].length && !w.links[1].length).length }) };
}
