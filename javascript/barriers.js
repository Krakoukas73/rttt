import * as THREE from 'three';
import { chaikin } from './roads.js';

// Glissières de sécurité : demande explicite de restreindre aux seules autoroutes/VRU/périphériques à grande vitesse,
// PAS aux routes primaires ordinaires (qui portaient à tort des glissières jusqu'ici, k=0/1 sans distinction). On ne
// garde donc que k=0 (motorway, liens compris) et k=1 avec le tag OSM highway=trunk (r.tr) - une route primaire
// "normale" (k=1 sans r.tr) n'en a plus du tout. Sur les 2 extérieurs pour ces routes ; au centre en plus à double
// sens, pour séparer les 2 sens de circulation. Rendu en fines bandes métalliques continues (pas de poteaux individuels, pour rester léger en
// triangles sur tout un réseau routier) : double lisse (2 bandes horizontales empilées, plus haute/imposante qu'une glissière
// simple), dessus + 2 faces par bande, lisibles depuis les angles obliques comme depuis la verticale.
const HW = { 0: 14, 1: 10.5 };   // largeur (m) des classes concernées, reprise de CLS (roads.js) - dupliquée localement (cf. bridges.js:WID)
const LO_A = 0.30, HI_A = 0.48, LO_B = 0.62, HI_B = 0.88, THICK = 0.10, VERGE = 0.35;
const STEEL = [0.74, 0.74, 0.72], STEELC = [0.56, 0.56, 0.54];
const TAPER = 22;   // recul (m) de la glissière latérale de part et d'autre d'une bretelle/fourche, pour ne jamais couper en travers des voies au niveau du bec d'insertion

export function buildBarriers(data, terrain) {
  const group = new THREE.Group(); group.name = 'barriers';
  const P = [], C = [], I = [];
  const quad = (a, b, c, d, col) => { const k = P.length / 3; for (const q of [a, b, c, d]) { P.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); } I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const roads = (data.roads || []).filter((r) => (r.k === 0 || (r.k === 1 && r.tr)) && r.p && r.p.length >= 2 && !r.rb);
  // détection des jonctions/bretelles : un nœud (extrémité de tronçon) partagé par 3 tronçons qualifiants ou plus est une
  // vraie fourche (bretelle d'insertion/sortie), pas une simple coupure de tronçon OSM (qui n'en partage que 2, en ligne
  // droite) - la glissière latérale doit se raccourcir avant ces points pour ne jamais traverser le bec d'insertion en biais.
  // le comptage se fait sur TOUTES les routes carrossables proches (k<=6 : une bretelle d'accès/sortie n'est presque
  // jamais elle-même classée motorway/trunk - c'est justement une route de classe inférieure qui vient s'y raccorder),
  // pas seulement celles retenues pour le tracé des glissières (k=0/1) : en ne comptant que ces dernières, une vraie
  // fourche (bretelle d'insertion/sortie, giratoire de bifurcation...) où seule LA ROUTE PRINCIPALE porte une glissière
  // n'était jamais reconnue comme jonction (le nœud n'était jamais partagé par 3 tronçons "qualifiants") - la glissière
  // continuait alors tout droit en ligne raide à travers le bec d'insertion, au lieu de se raccourcir avant, d'où la
  // bande métallique qui semblait couper en diagonale à travers les voies signalée au niveau des bretelles.
  const junctionRoads = (data.roads || []).filter((r) => r.k <= 6 && r.p && r.p.length >= 2 && !r.rb);
  const NG = 2, nodeKey = (x, z) => Math.round(x / NG) + '_' + Math.round(z / NG);
  const nodeCount = new Map();
  for (const r of junctionRoads) for (const pt of [r.p[0], r.p[r.p.length - 1]]) { const k = nodeKey(pt[0], pt[1]); nodeCount.set(k, (nodeCount.get(k) || 0) + 1); }
  // détection des croisements de chaussées SANS pont : deux tronçons qui repartent d'un même nœud de fourche peuvent
  // recroiser leur tracé plus loin (fourche en S/boucle serrée), hors de portée du recul TAPER (qui ne mesure que la
  // distance au NŒUD PARTAGÉ le long de son propre axe). Dans ce cas l'"extérieur" perd son sens localement : la
  // glissière d'un tronçon peut se retrouver du côté de la chaussée de l'AUTRE tronçon, donc visuellement en travers
  // de la route entre les deux - c'est la bande diagonale au milieu des voies signalée par capture. Grille grossière
  // recensant, pour chaque tronçon qualifiant, la demi-largeur de chaussée occupée à intervalles réguliers ; sert
  // ensuite à couper la glissière de tout tronçon dont un point de son PROPRE axe tomberait dans le gabarit d'un autre
  // tronçon proche (donc sans place pour une glissière séparée entre les deux chaussées à cet endroit).
  const CG = 4, cellKey = (x, z) => Math.round(x / CG) + '_' + Math.round(z / CG);
  const roadCells = new Map();
  roads.forEach((r, ri) => { const hw = (r.w && r.k <= 6 ? r.w : HW[r.k]) / 2; const pts = chaikin(r.p, 1);
    for (let i = 0; i < pts.length - 1; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], l = Math.hypot(x2 - x1, z2 - z1) || 1, n = Math.max(1, Math.ceil(l / CG));
      for (let k = 0; k <= n; k++) { const x = x1 + (x2 - x1) * k / n, z = z1 + (z2 - z1) * k / n, ck = cellKey(x, z);
        if (!roadCells.has(ck)) roadCells.set(ck, []); roadCells.get(ck).push({ ri, x, z, hw }); } } });
  const nearOtherRoad = (x, z, ownRi) => { const cx = Math.round(x / CG), cz = Math.round(z / CG); let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const cell = roadCells.get((cx + dx) + '_' + (cz + dz)); if (!cell) continue;
      for (const c of cell) { if (c.ri === ownRi) continue; const d = Math.hypot(x - c.x, z - c.z) - c.hw; if (d < best) best = d; } }
    return best; };
  // pistes cyclables et voies piétonnes proches (demande explicite : la glissière est réservée aux voies rapides VRU/
  // autoroutes/nationales k=0/1, jamais à une piste cyclable ou un chemin piéton séparé qui longerait cette voie à
  // quelques mètres - un tel chemin est une way OSM distincte (k=6 piéton, k=7 footway/path/cycleway/steps hors pontons
  // b=1, k=8 chemin), physiquement proche mais qui ne doit jamais se retrouver visuellement coupée ou longée par la
  // bande métallique de la voie rapide voisine. Même mécanisme de grille de proximité que ci-dessus, marge nettement
  // plus large (4 m) qu'entre 2 chaussées motorisées : on préfère un court manque de glissière à un chemin piéton/
  // cycliste qui en porte une.
  const PATH_CLEAR = 4;
  const pathCells = new Map();
  (data.roads || []).filter((r) => (r.k === 6 || r.k === 8 || (r.k === 7 && !r.b)) && r.p && r.p.length >= 2).forEach((r) => {
    const hw = (r.w || 2.5) / 2, pts = chaikin(r.p, 1);
    for (let i = 0; i < pts.length - 1; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], l = Math.hypot(x2 - x1, z2 - z1) || 1, n = Math.max(1, Math.ceil(l / CG));
      for (let k = 0; k <= n; k++) { const x = x1 + (x2 - x1) * k / n, z = z1 + (z2 - z1) * k / n, ck = cellKey(x, z);
        if (!pathCells.has(ck)) pathCells.set(ck, []); pathCells.get(ck).push({ x, z, hw }); } } });
  const nearPath = (x, z) => { const cx = Math.round(x / CG), cz = Math.round(z / CG); let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const cell = pathCells.get((cx + dx) + '_' + (cz + dz)); if (!cell) continue;
      for (const c of cell) { const d = Math.hypot(x - c.x, z - c.z) - c.hw; if (d < best) best = d; } }
    return best; };
  // détection des ponts : on s'appuie sur le décalage de hauteur RÉEL appliqué par liftBridges (terrain.bridgeOff), pas
  // seulement sur le tag OSM bridge=yes du tronçon (r.b) - un pont peut être découpé en plusieurs tronçons OSM dont
  // certains ne portent pas le tag (jonction avec une bretelle d'accès, tronçon mal balisé...), et ce tronçon "non-pont"
  // se retrouve quand même physiquement élevé sur le tablier (terrain.heightAt étant globalement monkeypatché) : une
  // glissière calculée à plat pour lui se retrouve alors visuellement décalée en travers du tablier surélevé. On
  // suppose donc un pont partout où le sol est concrètement surélevé à cet endroit, quel que soit le tronçon porteur.
  const bridgeAt = terrain.bridgeOff;
  let nOuter = 0, nCenter = 0;
  roads.forEach((r, ri) => {
    const hw = (r.w && r.k <= 6 ? r.w : HW[r.k]) / 2;
    const pts = chaikin(r.p, 1), S = [], step = 3;
    for (let i = 0; i < pts.length - 1; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], l = Math.hypot(x2 - x1, z2 - z1) || 1, n = Math.max(1, Math.ceil(l / step));
      for (let k = 0; k < n; k++) S.push({ x: x1 + (x2 - x1) * k / n, z: z1 + (z2 - z1) * k / n, tx: (x2 - x1) / l, tz: (z2 - z1) / l }); }
    S.push({ ...S[S.length - 1], x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
    if (S.length < 2) return;
    // distance cumulée le long du tronçon rééchantillonné, pour raccourcir près d'une jonction repérée ci-dessus
    let cum = 0; const rows = S.map((s, i) => { if (i) cum += Math.hypot(s.x - S[i - 1].x, s.z - S[i - 1].z); return { x: s.x, z: s.z, nx: s.tz, nz: -s.tx, s: cum, br: bridgeAt ? bridgeAt(s.x, s.z) > 0.15 : false }; });
    const total = cum;
    const j0 = (nodeCount.get(nodeKey(r.p[0][0], r.p[0][1])) || 0) >= 3;
    const j1 = (nodeCount.get(nodeKey(r.p[r.p.length - 1][0], r.p[r.p.length - 1][1])) || 0) >= 3;
    const okRow = (row) => (!j0 || row.s >= TAPER) && (!j1 || total - row.s >= TAPER) && !row.br && nearOtherRoad(row.x, row.z, ri) > VERGE && nearPath(row.x, row.z) > PATH_CLEAR;   // ni bretelle proche, ni tablier de pont, ni chaussée d'un autre tronçon trop proche, ni piste cyclable/chemin piéton proche
    // hauteur du terrain rééchantillonnée à la position latérale réelle de chaque sommet (pas au centre de la voie) : sur un
    // talus/remblai (fréquent le long des VRU/autoroutes en déblai), le relief varie sensiblement sur quelques mètres de
    // large - caler tout le profil sur la seule hauteur de l'axe enterrait ou faisait flotter la glissière hors du talus.
    const strip = (lat0, dy0, lat1, dy1, col) => { for (let i = 0; i < rows.length - 1; i++) { const a = rows[i], b = rows[i + 1]; if (!okRow(a) || !okRow(b)) continue;
      const p = (q, lat, dy) => { const x = q.x + q.nx * lat, z = q.z + q.nz * lat; return [x, terrain.heightAt(x, z) + dy, z]; };
      quad(p(a, lat0, dy0), p(b, lat0, dy0), p(b, lat1, dy1), p(a, lat1, dy1), col); } };
    const band = (e, ei, loY, hiY) => { strip(Math.min(e, ei), hiY, Math.max(e, ei), hiY, STEEL); strip(e, loY, e, hiY, STEELC); strip(ei, loY, ei, hiY, STEELC); };
    const rail = (lat, inward) => { const e = lat, ei = lat - inward * THICK; band(e, ei, LO_A, HI_A); band(e, ei, LO_B, HI_B); };   // double lisse (2 bandes empilées)
    // les ponts (parapets déjà présents dans bridges.js) sont exclus au niveau de chaque sommet via okRow (row.br) ci-dessus,
    // pas ici en bloc sur tout le tronçon : ça couvre aussi bien un tronçon entièrement pont qu'un tronçon partiellement élevé
    for (const sd of [1, -1]) { rail(sd * (hw + VERGE), sd); nOuter++; }
    const wantsCenter = !r.ow && (r.k === 0 || (r.k === 1 && r.tr));
    if (wantsCenter) { rail(THICK / 2, 1); nCenter++; }   // une seule bande centrée sur l'axe (largeur THICK)
  });
  if (P.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I); geo.computeVertexNormals();
    // roughness/metalness alignés sur bridges.js (parapets) : sans carte d'environnement (pas d'IBL dans cette scène), un matériau
    // trop métallique (fort metalness) apparaît quasi noir hors du reflet spéculaire direct - invisible sur une bande aussi fine
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.12, side: THREE.DoubleSide })); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; group.add(m); }   // bandes fines (10 cm) : ombre portée coûteuse et insignifiante, retirée
  window.__barriers = { outer: nOuter, center: nCenter };
  return { group, outer: nOuter, center: nCenter };
}
