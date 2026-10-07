import * as THREE from 'three';
import { chaikin, waterLevelAt } from './roads.js';

// Ponts : (1) « liftBridges » relève le tablier des ponts au-dessus du sol (terrain.heightAt est enveloppé : routes, véhicules, lampadaires suivent) ;
// (2) « buildBridges » ajoute dalle, corniches, parapets et piles sous le tablier.
// k=7 (chemins/passerelles piétonnes) : franchissement plus modeste, juste assez surélevé pour être lisible visuellement au-dessus de l'eau
const HC = { 0: 3.2, 1: 3.0, 2: 2.4, 3: 1.9, 4: 1.7, 5: 1.4, 6: 1.4, 7: 1.1 };
const WID = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6, 5: 3.4, 6: 6, 7: 1.7 };
const LAY = { 5: 2, 6: 2, 4: 3, 3: 4, 2: 5, 1: 6, 0: 7, 7: 1 };
const SLAB = 0.75, PARA = 0.95;
const sstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// un ponton/plateforme tagué man_made=pier dans OSM est PARFOIS une way FERMÉE (souvent avec area=yes explicite) :
// un petit ponton fixe en bois, une plateforme de baignade... une AIRE, pas un chemin. Le fil directeur de bridges.js
// (rampe entre 2 EXTRÉMITÉS, tablier linéaire) n'a aucun sens pour un anneau fermé (ses 2 "extrémités" sont le même
// point) - en le traitant comme les autres, le tablier suit le contour dans un sens puis semble revenir sur lui-même,
// avec un décalage perpendiculaire (largeur du tablier) qui se recoupe sur les segments proches/quasi-parallèles du
// même anneau : structure en nœud/tressée qui n'existe pas dans la réalité (signalée par capture). Détecté ici et
// exclu du pipeline linéaire (ponts/rampes) ; rendu séparément plus bas comme une plateforme plate (cf. buildBridges).
const isClosedRing = (p) => p.length > 3 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.5;

export function liftBridges(data, terrain) {
  const CS = 40, grid = new Map(), K = (i, j) => i * 100003 + j, BR = [];
  const cand = (data.roads || []).filter((r) => r.b && (r.k <= 6 || r.k === 7) && !r.rb && r.p && r.p.length >= 2 && !isClosedRing(r.p));
  const ends = []; for (const r of cand) { ends.push([r.p[0][0], r.p[0][1], r]); ends.push([r.p[r.p.length - 1][0], r.p[r.p.length - 1][1], r]); }
  const joined = (x, z, self) => ends.some((e) => e[2] !== self && Math.hypot(e[0] - x, e[1] - z) < 2);   // pont prolongé par un autre tronçon de pont : pas de rampe à ce bout
  let insideWater = () => false;   // réassignée plus bas si la ville a de l'eau ; utilisée aussi par le profil de hauteur (cf. plus bas)

  // Prolongement des tabliers trop courts qui finissent en pleine eau à une de leurs extrémités : le nœud OSM marquant la
  // fin du tronçon taggé bridge=yes tombe parfois en plein milieu du cours d'eau/plan d'eau (imprécision de numérisation,
  // fréquent sur les petites passerelles piétonnes) au lieu de la rive réelle - le tablier construit semblait alors flotter,
  // disjoint de la route/du chemin de chaque côté. Fix générique, toutes villes : toute extrémité NON reliée à un autre
  // tronçon de pont (vrai bout terminal, pas une simple coupure OSM du même pont) qui tombe dans un polygone d'eau
  // (natural=water) est prolongée dans le prolongement de son dernier segment jusqu'à dépasser la rive d'au moins 2 m,
  // plafonné à 60 m pour ne jamais s'emballer sur une donnée aberrante (grand lac, plan d'eau mal fermé...). Mutation
  // directe de r.p (référence partagée avec data.roads, exécutée AVANT buildRoads/buildTraffic dans main.js) : la
  // chaussée/le chemin réel et la circulation héritent automatiquement de la même géométrie corrigée - un seul point de
  // vérité pour la forme du franchissement, sans découplage possible entre tablier (bridges.js) et chaussée (roads.js).
  const hasAreaWater = (data.areas || []).some((ar) => ar.t === 'water');
  // cours d'eau linéaires (waterway=river/canal/stream, k=10/11 dans data.roads, rendus en ruban par roads.js/Ribbons) : un
  // canal comme le Canal Saint-Martin n'est PAS un polygone de data.areas mais une simple ligne avec une largeur de rendu
  // fixe - sans ce test, une extrémité de passerelle tombant dedans n'était jamais détectée comme "en pleine eau" et le
  // prolongement ci-dessous ne se déclenchait jamais pour ce type de cours d'eau (seuls les plans d'eau/rivières en polygone
  // natural=water étaient couverts). WW_HW reprend exactement les largeurs de rendu de CLS[10]/CLS[11] dans roads.js.
  const waterWays = (data.roads || []).filter((r) => r.k >= 10 && r.p && r.p.length >= 2);
  if (hasAreaWater || waterWays.length) {
    const pip = (x, z, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; return c; };
    const insideAreaWater = (x, z) => { for (const ar of data.areas || []) { if (ar.t !== 'water') continue;
      const rings = Array.isArray(ar.p[0][0]) ? ar.p : [ar.p]; let c = 0; for (const R of rings) if (pip(x, z, R)) c++; if (c % 2 === 1) return true; } return false; };
    const WW_HW = { 10: 11 / 2 + 1, 11: 2.6 / 2 + 1 };
    const nearWaterway = (x, z) => { for (const r of waterWays) { const hw = WW_HW[r.k] || 6.5;
      for (let i = 0; i < r.p.length - 1; i++) { const x1 = r.p[i][0], z1 = r.p[i][1], x2 = r.p[i + 1][0], z2 = r.p[i + 1][1], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1,
        t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), d = Math.hypot(x1 + dx * t - x, z1 + dz * t - z); if (d <= hw) return true; } } return false; };
    insideWater = (x, z) => insideAreaWater(x, z) || nearWaterway(x, z);
    for (const r of cand) {
      const p = r.p, n = p.length;
      const j0 = joined(p[0][0], p[0][1], r), j1 = joined(p[n - 1][0], p[n - 1][1], r);
      const grow = (i0, i1, alreadyJoined) => {
        if (alreadyJoined || !insideWater(p[i0][0], p[i0][1])) return;
        const dx0 = p[i0][0] - p[i1][0], dz0 = p[i0][1] - p[i1][1], l = Math.hypot(dx0, dz0) || 1, ux = dx0 / l, uz = dz0 / l;
        let x = p[i0][0], z = p[i0][1], d = 0;
        while (insideWater(x, z) && d < 60) { d += 2; x = p[i0][0] + ux * d; z = p[i0][1] + uz * d; }
        if (d > 0) { x += ux * 2; z += uz * 2; p[i0][0] = x; p[i0][1] = z; }   // 2 m de marge franche au-delà de la rive détectée
      };
      grow(0, 1, j0); grow(n - 1, n - 2, j1);
    }
  }

  for (const r of cand) {
    const p = r.p, cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    // seuil de longueur minimal volontairement très bas (juste de quoi écarter les tronçons quasi ponctuels/dégénérés) : un pont tagué
    // bridge=yes dans OSM est un pont réel quelle que soit sa longueur (petit pont de village sur un ruisseau, courte passerelle
    // piétonne...) - l'exclure faute d'atteindre un seuil arbitraire le laissait non modélisé et donc visuellement noyé/recouvert par l'eau
    const L = cum[cum.length - 1], minL = r.k === 7 ? 1 : 3; if (L < minL) continue;
    const w = r.w && r.k <= 7 ? r.w : WID[r.k];
    const j0 = joined(p[0][0], p[0][1], r), j1 = joined(p[p.length - 1][0], p[p.length - 1][1], r);
    // ponton/jetée (et plus généralement tout tablier dont un bout se termine réellement en pleine eau, sans jamais
    // toucher la rive) : cette extrémité ne doit PAS redescendre à hauteur 0 comme le bout d'une rampe de pont classique
    // (qui, lui, rejoint la chaussée au niveau du sol) - un ponton réel garde son tablier à hauteur constante jusqu'à son
    // bout flottant. Sans cette distinction, le profil en rampe (sstep vers 0 à toute extrémité non "joined") ramenait
    // systématiquement la pointe du ponton sous la surface de l'eau, quelle que soit sa position, une fois son extrémité
    // prolongée jusqu'au-dessus de l'eau par le correctif "grow" ci-dessus (c'était exactement le cas signalé).
    const w0 = j0 || insideWater(p[0][0], p[0][1]), w1 = j1 || insideWater(p[p.length - 1][0], p[p.length - 1][1]);
    const br = { r, p, cum, L, w, hw: w / 2 + 0.7, H: HC[r.k], R: Math.min(L * 0.35, 26), j0: w0, j1: w1 };
    BR.push(br);
    for (let i = 0; i < p.length - 1; i++) { const [x1, z1] = p[i], [x2, z2] = p[i + 1], h = br.hw + 0.5, sg = [x1, z1, x2, z2, br, i];
      for (let cx = Math.floor((Math.min(x1, x2) - h) / CS); cx <= Math.floor((Math.max(x1, x2) + h) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - h) / CS); cz <= Math.floor((Math.max(z1, z2) + h) / CS); cz++) { const k = K(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(sg); } }
  }
  const profile = (br, s) => { const a = br.j0 ? 1 : sstep(s / br.R), b = br.j1 ? 1 : sstep((br.L - s) / br.R); return Math.min(a, b); };
  const off = (x, z) => { let best = 0;
    for (const [x1, z1, x2, z2, br, i] of grid.get(K(Math.floor(x / CS), Math.floor(z / CS))) || []) {
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), d = Math.hypot(x1 + dx * t - x, z1 + dz * t - z);
      if (d > br.hw + 0.3) continue;
      const f = Math.min(1, (br.hw + 0.3 - d) / 0.6), o = br.H * profile(br, br.cum[i] + t * Math.sqrt(l2)) * f; if (o > best) best = o; }
    return best; };
  // vraie cause des pontons/tabliers encore signalés sous l'eau (secteur Port des Mirandelles, Bourget-du-Lac) : `off()`
  // ci-dessus n'ajoute qu'un dégagement FIXE (br.H, pensé pour un pont classique) au-dessus du relief brut local - or
  // le relief brut sous l'eau, en particulier au bout d'un ponton qui avance en pleine eau, peut être nettement plus
  // profond que la rive toute proche (fond du lac qui plonge), sans lien avec le vrai niveau d'eau. Le dégagement fixe
  // ne suffisait alors plus à faire émerger le tablier. Calé désormais, en plus du relief, sur le vrai niveau d'eau
  // (même algorithme exact que le rendu de l'eau lui-même, cf. waterLevelAt/roads.js) : jamais en dessous, avec une
  // faible marge de franc-bord - sans jamais inventer de valeur, seulement le niveau d'eau réellement calculé.
  const levelAt = waterLevelAt(data, terrain);
  terrain.waterLevelAt = levelAt;
  const base = terrain.heightAt; terrain.groundAt = base;
  const heightAt = (x, z) => { const h = base(x, z) + off(x, z), wl = levelAt(x, z); return wl !== null && wl + 0.12 > h ? wl + 0.12 : h; };
  if (BR.length) { terrain.heightAt = heightAt; terrain.bridgeOff = off; }
  window.__bridges = BR.length;
  return BR;
}

export function buildBridges(data, terrain, BR) {
  const group = new THREE.Group(); group.name = 'bridges';
  const P = [], C = [], I = [];
  const quad = (a, b, c, d, col) => { const k = P.length / 3; for (const q of [a, b, c, d]) { P.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); } I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const tri = (a, b, c, col) => { const k = P.length / 3; for (const q of [a, b, c]) { P.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); } I.push(k, k + 1, k + 2); };
  const box = (cx, cy, cz, tx, tz, sl, sw, y0, y1, col) => {   // boîte orientée : longueur sl le long de (tx,tz), largeur sw, de y0 à y1
    const nx = tz, nz = -tx, a = sl / 2, b = sw / 2, c = (u, v, y) => [cx + tx * u + nx * v, y, cz + tz * u + nz * v];
    const L = [c(-a, -b, y0), c(a, -b, y0), c(a, b, y0), c(-a, b, y0)], U = [c(-a, -b, y1), c(a, -b, y1), c(a, b, y1), c(-a, b, y1)];
    quad(U[0], U[1], U[2], U[3], col); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(L[i], L[j], U[j], U[i], col); } quad(L[3], L[2], L[1], L[0], col); };
  const CON = [0.66, 0.64, 0.60], DARK = [0.46, 0.45, 0.43], PARAC = [0.74, 0.72, 0.68];
  const g = terrain.groundAt || terrain.heightAt;
  for (const br of BR) {
    const pts = chaikin(br.p, 1), S = [], step = 3; let acc = 0;   // échantillons tous les ~3 m
    for (let i = 0; i < pts.length - 1; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], l = Math.hypot(x2 - x1, z2 - z1) || 1, n = Math.max(1, Math.ceil(l / step));
      for (let k = 0; k < n; k++) { const x = x1 + (x2 - x1) * k / n, z = z1 + (z2 - z1) * k / n; S.push({ x, z, tx: (x2 - x1) / l, tz: (z2 - z1) / l }); } }
    S.push({ ...S[S.length - 1], x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
    const ly = LAY[br.r.k] || 3, hw = br.w / 2;
    // profil le long du pont : distance cumulée projetée
    let cum = 0; const rows = S.map((s, i) => { if (i) cum += Math.hypot(s.x - S[i - 1].x, s.z - S[i - 1].z); return { ...s, s: cum }; });
    const Lr = cum || 1, k0 = Lr / br.L;
    const pf = (s) => { const q = s / k0; const a = br.j0 ? 1 : sstep(q / br.R), b = br.j1 ? 1 : sstep((br.L - q) / br.R); return Math.min(a, b); };
    const Ls = [], Rs = [];   // rails gauche/droite : positions à la hauteur de la chaussée
    const levelAt = terrain.waterLevelAt || (() => null);
    for (const r of rows) { r.nx = r.tz; r.nz = -r.tx; r.o = br.H * pf(r.s); r.h0 = g(r.x, r.z); r.h = r.h0 + r.o + 0.09 + 0.03 * ly;
      const wl = levelAt(r.x, r.z); if (wl !== null && wl + 0.12 > r.h) r.h = wl + 0.12; }
    const strip = (lat0, dy0, lat1, dy1, col, along = null) => { for (let i = 0; i < rows.length - 1; i++) { const a = rows[i], b = rows[i + 1]; if (a.o < 0.12 && b.o < 0.12) continue;
        const p = (r, lat, dy) => [r.x + r.nx * lat, r.h + dy(r), r.z + r.nz * lat]; quad(p(a, lat0, dy0), p(b, lat0, dy0), p(b, lat1, dy1), p(a, lat1, dy1), col); } };
    const fl = hw + 0.55;
    for (const sd of [1, -1]) {
      const e0 = sd * hw, e1 = sd * fl, pe = sd * (fl - 0.16);
      strip(e0, () => 0.10, e1, () => 0.10, CON);                                                    // trottoir/corniche
      strip(e1, () => 0.10, e1, () => PARA, PARAC);                                                   // parapet : face extérieure
      strip(pe, () => PARA, e1, () => PARA, PARAC);                                                   // parapet : dessus
      strip(pe, () => 0.10, pe, () => PARA, PARAC);                                                   // parapet : face intérieure
      // tranche de la dalle sous la corniche : de -SLAB au-dessus, ou jusqu'au sol dans les rampes
      for (let i = 0; i < rows.length - 1; i++) { const a = rows[i], b = rows[i + 1]; if (a.o < 0.12 && b.o < 0.12) continue;
        const bt = (r) => (r.o > SLAB ? r.h - SLAB : Math.min(r.h - SLAB, r.h0 - 0.3));
        const pa = (r, y) => [r.x + r.nx * e1, y, r.z + r.nz * e1]; quad(pa(a, bt(a)), pa(b, bt(b)), pa(b, b.h + 0.10), pa(a, a.h + 0.10), DARK); }
    }
    // dessous de la dalle
    for (let i = 0; i < rows.length - 1; i++) { const a = rows[i], b = rows[i + 1]; if (a.o < 0.12 && b.o < 0.12) continue;
      const q = (r, lat) => [r.x + r.nx * lat, r.h - SLAB, r.z + r.nz * lat]; quad(q(a, -fl), q(b, -fl), q(b, fl), q(a, fl), DARK); }
    // piles : toutes les ~18 m sur la partie franchement surélevée
    const nP = Math.max(0, Math.floor(br.L / 18)); for (let m = 1; m <= nP; m++) { const s = m * br.L / (nP + 1) * k0; let r = rows[0]; for (const q of rows) { if (q.s >= s) { r = q; break; } }
      if (r.o < 1) continue; const yb = r.h0 - 0.7, yt = r.h - SLAB, cw = Math.min(br.w * 0.85, br.w - 0.8);
      for (const sd of [-1, 1]) box(r.x + r.nx * sd * cw * 0.36, 0, r.z + r.nz * sd * cw * 0.36, r.tx, r.tz, 1.1, 1.1, yb, yt - 0.5, CON);
      box(r.x, 0, r.z, r.tx, r.tz, 1.5, cw + 1.2, yt - 0.5, yt, DARK); }
  }
  // plateformes de ponton (anneaux fermés, cf. isClosedRing/liftBridges plus haut) : rendues à part comme une simple
  // dalle plate suivant le contour réel de la way OSM (pas de rampe, pas de notion d'"extrémité" - l'anneau entier est
  // à hauteur constante), plutôt que comme un tablier linéaire qui produisait la structure en nœud signalée. Hauteur
  // calée sur la MÉDIANE du sol relevé sur son propre contour (même logique, robuste au bruit du relief sous l'eau,
  // que le niveau plat des lacs en roads.js) + une faible marge de franc-bord, jamais une valeur inventée.
  const median = (arr) => { const s = arr.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
  const WOOD = [0.56, 0.44, 0.30], WOODE = [0.42, 0.32, 0.21];
  const decks = (data.roads || []).filter((r) => r.k === 7 && r.b && r.p && r.p.length > 3 && isClosedRing(r.p));
  for (const r of decks) {
    const ring = r.p.slice(0, -1); if (ring.length < 3) continue;
    const ys = ring.map(([x, z]) => g(x, z)); const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const levelAt = terrain.waterLevelAt || (() => null), wl = levelAt(cx, cz);
    const y = Math.max(median(ys) + 0.18, wl !== null ? wl + 0.12 : -Infinity), yb = y - 0.10;
    const shape2d = ring.map(([x, z]) => new THREE.Vector2(x, z));
    let faces = THREE.ShapeUtils.triangulateShape(shape2d, []);
    // repli robuste : un contour numérisé à la main (petite plateforme, souvent quelques nœuds seulement) peut former un
    // polygone dégénéré/quasi auto-intersectant sur lequel la triangulation "ear clipping" échoue ou ne couvre qu'une
    // partie du contour (trous triangulaires visibles dans la dalle) - un éventail simple depuis le centroïde ne peut
    // jamais échouer de la même façon et couvre toujours l'intégralité du contour, quitte à être légèrement moins
    // exact sur un contour fortement concave (cas rare pour une petite plateforme).
    if (faces.length < ring.length - 2) { faces = []; for (let i = 1; i < ring.length - 1; i++) faces.push([0, i, i + 1]); }
    const top = (x, z) => [x, y, z];
    for (const [i, j, k] of faces) { const A = ring[i], B = ring[j], Cc = ring[k];
      const cw = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]);
      if (cw > 0) tri(top(...A), top(...B), top(...Cc), WOOD); else tri(top(...A), top(...Cc), top(...B), WOOD); }
    // fine bordure verticale (chant de la dalle) le long du contour, pour ne pas paraître infiniment fine vue de côté
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length];
      quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], WOODE); }
  }
  if (P.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide })); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; group.add(m); }
  return { group, count: BR.length, decks: decks.length };
}
