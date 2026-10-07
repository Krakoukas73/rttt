import * as THREE from 'three';
import { chaikin } from './roads.js';

// Mobilier urbain issu d'OSM (data.street) : fontaines, statues/monuments, bacs à fleurs, abribus ; panneaux de limitation de vitesse ;
// flèches de direction, bandes et pistes cyclables peintes. Tout est fusionné en quelques maillages.
const WID = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6, 5: 3.4, 6: 6 };
const STONE = [0.62, 0.60, 0.56], STONE2 = [0.50, 0.48, 0.45], BRONZE = [0.30, 0.38, 0.32], WATER = [0.30, 0.52, 0.64], SOIL = [0.25, 0.18, 0.12], DARK = [0.20, 0.22, 0.25], GLASS = [0.62, 0.78, 0.86], POLE = [0.32, 0.34, 0.36];
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export function buildStreetDeco(data, terrain) {
  const group = new THREE.Group(), roads = data.roads || [];
  const hwOf = (r) => (r.w && r.k <= 6 ? r.w : WID[r.k] || 3) / 2;
  // ---- grille des chaussées (pour orienter et dégager le mobilier)
  const CS = 24, grid = new Map(), K = (i, j) => i * 100003 + j;
  roads.forEach((r, ri) => { if (r.k > 6 || r.p.length < 2) return; const h = hwOf(r);
    for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], sg = [x1, z1, x2, z2, h, ri];
      for (let cx = Math.floor((Math.min(x1, x2) - h - 4) / CS); cx <= Math.floor((Math.max(x1, x2) + h + 4) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - h - 4) / CS); cz <= Math.floor((Math.max(z1, z2) + h + 4) / CS); cz++) { const k = K(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(sg); } } });
  const near = (x, z) => { let b = null, bd = 1e9; for (const [x1, z1, x2, z2, h, ri] of grid.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) { const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), px = x1 + dx * t, pz = z1 + dz * t, d = Math.hypot(x - px, z - pz) - h; if (d < bd) { bd = d; const l = Math.sqrt(l2); b = { d, tx: dx / l, tz: dz / l, px, pz, ri, h }; } } return b; };

  // ---- constructeur de géométrie fusionnée
  const mk = () => ({ P: [], C: [], I: [], U: [] });
  const G = mk();
  const quad = (g, a, b, c, d, col) => { const k = g.P.length / 3; for (const q of [a, b, c, d]) { g.P.push(q[0], q[1], q[2]); g.C.push(col[0], col[1], col[2]); } g.I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  // prisme rectangulaire tourné de ang (rad) autour de y, centre (cx,cz)
  const box = (cx, cz, ang, sx, sz, y0, y1, col, g = G) => { const c = Math.cos(ang), s = Math.sin(ang), pt = (u, v, y) => [cx + c * u - s * v, y, cz + s * u + c * v], a = sx / 2, b = sz / 2;
    const L = [pt(-a, -b, y0), pt(a, -b, y0), pt(a, b, y0), pt(-a, b, y0)], U = [pt(-a, -b, y1), pt(a, -b, y1), pt(a, b, y1), pt(-a, b, y1)];
    quad(g, U[0], U[3], U[2], U[1], col); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(g, L[i], L[j], U[j], U[i], col.map((v) => v * (i & 1 ? 0.86 : 1))); } };
  // prisme régulier à n côtés, rayon r0 (bas) → r1 (haut)
  const prism = (cx, cz, r0, r1, y0, y1, col, n = 10, g = G) => { const ring = (r, y) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; });
    const L = ring(r0, y0), U = ring(r1, y1); const k = g.P.length / 3;
    for (const q of [...L, ...U]) { g.P.push(q[0], q[1], q[2]); g.C.push(col[0], col[1], col[2]); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; g.I.push(k + i, k + j, k + n + j, k + i, k + n + j, k + n + i); }
    for (let i = 1; i < n - 1; i++) g.I.push(k + n, k + n + i + 1, k + n + i);   // dessus
  };
  const gy = (x, z) => terrain.heightAt(x, z);
  const nObj = { fo: 0, sa: 0, pl: 0, sh: 0, sp: 0, ar: 0, bk: 0 };

  // ---- fontaines
  for (const f of data.street || []) if (f.t === 'fo') { const _s0 = G.P.length, y = gy(f.x, f.z), n = near(f.x, f.z); if (n && n.d < 2.5) continue;
    prism(f.x, f.z, 1.9, 1.85, y, y + 0.55, STONE, 12); prism(f.x, f.z, 1.65, 1.65, y + 0.35, y + 0.56, WATER, 12);
    prism(f.x, f.z, 0.30, 0.22, y, y + 1.5, STONE2, 8); prism(f.x, f.z, 0.95, 0.35, y + 1.05, y + 1.35, STONE, 12); prism(f.x, f.z, 0.85, 0.85, y + 1.28, y + 1.36, WATER, 12); prism(f.x, f.z, 0.12, 0.06, y + 1.4, y + 2.1, [0.75, 0.88, 0.95], 6);
    for (let i = _s0; i < G.P.length; i += 3) { G.P[i] = f.x + (G.P[i] - f.x) * 1.15; G.P[i + 1] = y + (G.P[i + 1] - y) * 1.15; G.P[i + 2] = f.z + (G.P[i + 2] - f.z) * 1.15; }   // +15 %
    nObj.fo++; }
  // ---- statues, monuments, croix, stèles
  for (const f of data.street || []) if (f.t === 'sa') { const _s0 = G.P.length, y = gy(f.x, f.z), n = near(f.x, f.z); if (n && n.d < 1.0) continue; const a = hash(f.x, f.z) * 6.28, k = f.k || 'sculpture';
    if (k === 'statue' || k === 'bust') { const H = k === 'bust' ? 1.2 : 1.6; box(f.x, f.z, a, 0.95, 0.95, y, y + H, STONE); box(f.x, f.z, a, 1.1, 1.1, y + H, y + H + 0.12, STONE2);
      if (k === 'statue') { box(f.x, f.z, a, 0.36, 0.28, y + H + 0.12, y + H + 0.95, BRONZE); box(f.x, f.z, a, 0.5, 0.3, y + H + 0.95, y + H + 1.6, BRONZE); box(f.x, f.z, a, 0.26, 0.26, y + H + 1.6, y + H + 1.9, BRONZE); box(f.x, f.z + 0.02, a + 0.6, 0.9, 0.12, y + H + 1.25, y + H + 1.4, BRONZE); }
      else prism(f.x, f.z, 0.3, 0.2, y + H + 0.12, y + H + 0.6, BRONZE, 8); }
    else if (k === 'wayside_cross' || k === 'cross') { box(f.x, f.z, a, 0.7, 0.7, y, y + 0.4, STONE2); box(f.x, f.z, a, 0.18, 0.18, y + 0.4, y + 2.7, STONE); box(f.x, f.z, a, 0.18, 0.9, y + 1.8, y + 2.05, STONE); }
    else if (k === 'stele' || k === 'plaque') box(f.x, f.z, a, 0.7, 0.18, y, y + 1.7, STONE);
    else if (k === 'monument' || k === 'obelisk') { box(f.x, f.z, a, 2.0, 2.0, y, y + 0.7, STONE2); prism(f.x, f.z, 0.7, 0.18, y + 0.7, y + 6.0, STONE, 4); }
    else { box(f.x, f.z, a, 0.8, 0.8, y, y + 0.7, STONE2); box(f.x, f.z, a + 0.4, 0.5, 0.5, y + 0.7, y + 1.5, [0.55, 0.45, 0.35]); box(f.x, f.z, a + 0.9, 0.42, 0.42, y + 1.5, y + 2.2, [0.55, 0.45, 0.35]); box(f.x, f.z, a + 1.5, 0.34, 0.34, y + 2.2, y + 2.7, [0.55, 0.45, 0.35]); }
    for (let i = _s0; i < G.P.length; i += 3) { G.P[i] = f.x + (G.P[i] - f.x) * 1.15; G.P[i + 1] = y + (G.P[i + 1] - y) * 1.15; G.P[i + 2] = f.z + (G.P[i + 2] - f.z) * 1.15; }   // +15 %
    nObj.sa++; }
  // ---- bacs à fleurs / jardinières
  for (const f of data.street || []) if (f.t === 'pl') { const y = gy(f.x, f.z), n = near(f.x, f.z); if (n && n.d < 0.3) continue; const a = n ? Math.atan2(n.tz, n.tx) : 0, h = hash(f.x, f.z);
    box(f.x, f.z, a, 1.5, 0.75, y, y + 0.55, STONE); box(f.x, f.z, a, 1.3, 0.55, y + 0.5, y + 0.6, SOIL);
    for (let i = 0; i < 5; i++) { const u = (i - 2) * 0.27, c = Math.cos(a), s = Math.sin(a), px = f.x + c * u, pz = f.z + s * u, hh = hash(px, pz); const col = hh < 0.3 ? [0.80, 0.18, 0.22] : hh < 0.55 ? [0.92, 0.78, 0.22] : hh < 0.75 ? [0.90, 0.55, 0.70] : [0.28, 0.55, 0.24]; prism(px, pz, 0.24, 0.14, y + 0.6, y + 0.6 + 0.35 + 0.2 * hash(pz, px), col, 6); }
    nObj.pl++; }
  // ---- abribus : arrêts OSM signalés couverts (h=1) et abris isolés (sh)
  { const seen = []; for (const f of data.furn || []) if (f.t === 'sh' || (f.t === 'bs' && f.h)) { if (seen.some((q) => Math.hypot(q[0] - f.x, q[1] - f.z) < 8)) continue; seen.push([f.x, f.z]);
      const n = near(f.x, f.z); if (!n) continue; const side = ((f.x - n.px) * -n.tz + (f.z - n.pz) * n.tx) >= 0 ? 1 : -1, off = n.h + 2.2, cx = n.px + -n.tz * side * off, cz = n.pz + n.tx * side * off; if (near(cx, cz).d < 1.2) continue;
      const a = Math.atan2(n.tz, n.tx), y = gy(cx, cz), c = Math.cos(a), s = Math.sin(a), nx = s * side, nz = -c * side;   // (nx,nz) : vers la route → l'ouverture est de ce côté (corrigé : l'abri était retourné à 180°)
      box(cx, cz, a, 3.4, 1.7, y + 2.45, y + 2.6, DARK);                                        // toit
      for (const e of [-1.55, 1.55]) box(cx + c * e, cz + s * e, a, 0.1, 0.1, y, y + 2.45, POLE);   // montants
      box(cx - nx * 0.75, cz - nz * 0.75, a, 3.2, 0.05, y + 0.15, y + 2.4, GLASS);                  // vitrage du fond
      box(cx - nx * 0.7, cz - nz * 0.7 + 0, a, 1.8, 0.35, y + 0.42, y + 0.5, [0.35, 0.25, 0.15]);   // banc
      box(cx + c * 1.9, cz + s * 1.9, a, 0.06, 0.6, y + 2.0, y + 2.9, [0.85, 0.60, 0.05]);           // panneau d'arrêt (jaune, comme les mâts de réseau)
      nObj.sh++; } }
  // (arceaux de stationnement vélo retirés à la demande : trop peu visibles à l'échelle de la ville pour le coût de génération/rendu)

  const mesh = (g, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.C, 3)); if (g.U.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.U, 2)); geo.setIndex(g.I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };

  // ---- panneaux de limitation de vitesse (chiffre dessiné sur atlas)
  { const SP = [30, 50, 70, 80, 90, 110, 130], cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c = cv.getContext('2d');
    SP.forEach((v, i) => { const cx = i * 64 + 32, cy = 64; c.fillStyle = '#c4161c'; c.beginPath(); c.arc(cx, cy, 30, 0, 6.3); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, 22, 0, 6.3); c.fill(); c.fillStyle = '#111'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(v), cx, cy + 1); });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const S = mk(), P2 = mk(); let last = new Map();
    roads.forEach((r, ri) => { if (r.k > 3 || !r.ms || r.p.length < 2 || r.rb || r.b) return; const idx = SP.indexOf(r.ms); if (idx < 0) return;
      for (const e of r.ow === 1 ? [0] : [0, 1]) { const n = r.p.length, a = e ? r.p[n - 1] : r.p[0], b = e ? r.p[n - 2] : r.p[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 25) continue;
        const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l, off = hwOf(r) + 1.0, back = 6, x = a[0] + ux * back + -uz * off, z = a[1] + uz * back + ux * off, y = gy(x, z);   // à droite du sens de circulation entrant
        const kk = Math.round(x / 40) + ',' + Math.round(z / 40); if (last.has(kk)) continue; last.set(kk, 1);
        const sn = near(x, z); if (sn && sn.d < 0.5 && sn.ri !== ri) continue;
        box(x, z, Math.atan2(uz, ux), 0.07, 0.07, y, y + 2.3, POLE, P2);
        // disque face au conducteur (normale -u) : quad vertical
        const nx = -uz, nz = ux, s = 0.32, ax = x - ux * 0.05, az = z - uz * 0.05, u0 = idx * 64 / 512, u1 = (idx * 64 + 64) / 512, k0 = S.P.length / 3;
        for (const [du, dy, uu, vv] of [[-s, 2.05, u0, 0.25], [s, 2.05, u1, 0.25], [s, 2.05 + 2 * s, u1, 0.75], [-s, 2.05 + 2 * s, u0, 0.75]]) { S.P.push(ax + nx * du, y + dy, az + nz * du); S.C.push(1, 1, 1); S.U.push(uu, vv); }
        S.I.push(k0, k0 + 2, k0 + 1, k0, k0 + 3, k0 + 2, k0, k0 + 1, k0 + 2, k0, k0 + 2, k0 + 3); nObj.sp++; } });
    if (S.P.length) { const m = mesh(S, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, alphaTest: 0.0 })); m.castShadow = false; group.add(m); }   // disque fin : ombre portée insignifiante, retirée
    if (P2.P.length) { const m = mesh(P2, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })); m.castShadow = false; group.add(m); }   // mât fin : idem
  }

  if (G.P.length) group.add(mesh(G, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide })));

  // ---- marquages peints : flèches de direction et bandes / pistes cyclables (ruban plaqué au sol, décalage de profondeur)
  const PT = mk(), PB = mk();   // PT : flèches blanches, PB : cyclable coloré
  const paintPoly = (g, pts, col) => { const k = g.P.length / 3; for (const [x, z, yo] of pts) { g.P.push(x, gy(x, z) + yo, z); g.C.push(col[0], col[1], col[2]); } for (let i = 1; i < pts.length - 1; i++) g.I.push(k, k + i + 1, k + i); };   // triangulation en éventail (polygones convexes ou en étoile)
  const arrow = (x, z, ux, uz, wLane, yo) => {   // flèche droite : hampe + pointe (3,2 m x 0,9 m)
    const nx = -uz, nz = ux, Lh = 2.2, Hd = 1.0, sw = 0.14, hw2 = 0.42, q = (a, b) => [x + ux * a + nx * b, z + uz * a + nz * b, yo];
    const stem = [q(-Lh / 2, -sw), q(Lh / 2 - Hd * 0.3, -sw), q(Lh / 2 - Hd * 0.3, sw), q(-Lh / 2, sw)], head = [q(Lh / 2 - Hd, -hw2), q(Lh / 2 + Hd * 0.6, 0), q(Lh / 2 - Hd, hw2)];
    for (const poly of [stem, head]) { const k = PT.P.length / 3; for (const [px, pz, yy] of poly) { PT.P.push(px, gy(px, pz) + yy, pz); PT.C.push(1, 1, 1); } for (let i = 1; i < poly.length - 1; i++) PT.I.push(k, k + i + 1, k + i); } };
  roads.forEach((r, ri) => { if (r.k > 4 || r.p.length < 2 || r.rb || r.b) return; const w = r.w && r.k <= 6 ? r.w : WID[r.k], nl = r.ln ? (r.ow === 1 ? r.ln : Math.ceil(r.ln / 2)) : (r.ow === 1 ? (r.k <= 2 ? 2 : 1) : 1);
    const pts = chaikin(r.p, 2), tot = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0); if (tot < 60) return;
    // flèches : à ~18 m de l'extrémité aval de chaque sens, une par voie (voies multiples ou sens unique)
    if (nl >= 2 || r.ow === 1) for (const e of r.ow === 1 ? [1] : [0, 1]) { if (r.ow === 1 && r.k >= 3 && nl < 2) continue;
      const n = pts.length, a = e ? pts[n - 1] : pts[0]; let d = 0, i = e ? n - 1 : 0; const dir = e ? -1 : 1; let ux = 0, uz = 0, px = a[0], pz = a[1];
      while (d < 18 && i + dir >= 0 && i + dir < n) { const b = pts[i + dir], l = Math.hypot(b[0] - px, b[1] - pz); if (d + l >= 18) { const t = (18 - d) / l; px += (b[0] - px) * t; pz += (b[1] - pz) * t; ux = (b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); uz = (b[1] - a[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); d = 18; break; } d += l; px = b[0]; pz = b[1]; i += dir; }
      if (d < 18) continue; const sdx = e ? 1 : -1;   // direction de circulation : vers l'extrémité e
      const bx = e ? pts[n - 2] : pts[1], t0 = e ? pts[n - 1] : pts[0]; let tx = (t0[0] - bx[0]) * (e ? 1 : 1), tz = (t0[1] - bx[1]); const tl = Math.hypot(tx, tz) || 1; tx = (e ? tx : -tx) / tl; tz = (e ? tz : -tz) / tl;   // sens de marche vers l'extrémité
      // direction locale : de la position (px,pz) vers l'extrémité
      const lx = a[0] - px, lz = a[1] - pz, ll = Math.hypot(lx, lz) || 1, fx = lx / ll, fz = lz / ll, rnx = -fz, rnz = fx;
      for (let q = 0; q < nl; q++) { const off = r.ow === 1 ? (q - (nl - 1) / 2) * 3.4 : (q + 0.5) * 3.4; arrow(px + rnx * off, pz + rnz * off, fx, fz, 3, 0.09 + 0.03 * (7 - r.k) + 0.035); nObj.ar++; } }
    // bandes / pistes cyclables : ruban vert foncé côté droit (r) et/ou gauche (l) du sens de digitalisation
    if (false && r.cl && r.cs) for (const sd of r.cs.split('')) { if (sd === 'b') continue; const sg = sd === 'r' ? 1 : -1, wl = r.cl === 't' ? 1.6 : 1.4, off0 = w / 2 - 0.15 - wl / 2 - (r.cl === 't' ? 0 : 0.05);
      const ring = [], ring2 = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; const nx = -tz * sg, nz = tx * sg; ring.push([pts[i][0] + nx * (off0 - wl / 2), pts[i][1] + nz * (off0 - wl / 2)]); ring2.push([pts[i][0] + nx * (off0 + wl / 2), pts[i][1] + nz * (off0 + wl / 2)]); }
      const yo = 0.09 + 0.03 * (7 - r.k) + 0.04; for (let i = 0; i < pts.length - 1; i++) { const k = PB.P.length / 3; for (const [x, z] of [ring[i], ring2[i], ring2[i + 1], ring[i + 1]]) { PB.P.push(x, gy(x, z) + yo, z); PB.C.push(0.18, 0.46, 0.34); } PB.I.push(k, k + 1, k + 2, k, k + 2, k + 3); } nObj.bk++; } });
  const decalMat = (color, f) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false });
  const paints = [];
  if (PT.P.length) { const m = mesh(PT, decalMat(0, -12)); m.castShadow = false; m.renderOrder = 11; group.add(m); paints.push(m); }
  if (PB.P.length) { const m = mesh(PB, decalMat(0, -13)); m.castShadow = false; m.renderOrder = 11; group.add(m); paints.push(m); }
  window.__deco = nObj;
  return { group, paints, setNight: (n) => { for (const m of paints) m.material.color.setScalar(1 - 0.75 * Math.min(1, n * 1.2)); } };
}
