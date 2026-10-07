import * as THREE from 'three';

// classe -> [largeur (m), couleur, décalage y, trottoir]
const CLS = {
  0: [14, '#5d5d61', 0.10, true], 1: [10.5, '#5d5d61', 0.10, true], 2: [8.5, '#5d5d61', 0.10, true],
  3: [7.2, '#5d5d61', 0.10, true], 4: [5.6, '#5d5d61', 0.10, true], 5: [3.4, '#6f6e6b', 0.09, false],
  6: [6, '#6f6e6b', 0.11, false], 7: [1.7, '#a99f86', 0.12, false], 8: [3, '#8f7f60', 0.09, false],
  9: [3.4, '#5c5750', 0.13, false], 10: [11, '#4d7f9c', 0.14, false], 11: [2.6, '#5487a3', 0.14, false],
};

// Dévers (pente transversale) : une route/un chemin reste globalement plat en travers (seule une pente LONGITUDINALE,
// dans le sens du tracé, est réaliste - cf. Ribbons.add ci-dessous, qui aplatit désormais chaque bord au-delà de
// MAX_CROSS_SLOPE par rapport à l'axe). L'écart avec le relief réel ainsi "rattrapé" est comblé par un talus (remblai/
// déblai) plutôt que laissé comme un vide ou une marche : cf. le paramètre `talus` de Ribbons.add.
export const MAX_CROSS_SLOPE = 0.10;      // pente transversale max tolérée (10 %) avant aplatissement - exporté : traffic.js s'en sert pour caler la hauteur des roues sur la MÊME chaussée aplatie (sinon, sur une route de montagne très pentue en travers, les roues restent calées sur le relief brut et 'flottent'/s'enfoncent visiblement par rapport au ruban de route réellement dessiné)
const TALUS_RUN = 0.5;             // pente du talus lui-même (remblai/déblai, ~2:1), qui comble l'écart aplati
const TALUS_COLOR_DOWN = new THREE.Color('#6b7a45');  // remblai (terrain réel plus bas) : versant herbeux - seul cas dessiné (cf. Ribbons.add : le déblai, terre nue, était systématiquement raté visuellement et a été retiré)

export function chaikin(pts, it) {
  let P = pts;
  const closed = P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.5;
  for (let k = 0; k < it; k++) {
    const Q = [], n = P.length;
    if (!closed) Q.push(P[0]);
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.5) { Q.push(a); continue; }
      Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) Q.push(P[n - 1]); else Q.push(Q[0]);
    P = Q;
  }
  return P;
}
function extend(P, d) {
  if (P.length < 2) return P;
  const a = P[0], b = P[1], y = P[P.length - 1], z = P[P.length - 2];
  if (Math.hypot(a[0] - y[0], a[1] - y[1]) < 0.5) return P;
  const l0 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, l1 = Math.hypot(y[0] - z[0], y[1] - z[1]) || 1;
  return [[a[0] + (a[0] - b[0]) / l0 * d, a[1] + (a[1] - b[1]) / l0 * d], ...P, [y[0] + (y[0] - z[0]) / l1 * d, y[1] + (y[1] - z[1]) / l1 * d]];
}

// largeur au point d'abscisse s d'un tronçon de longueur L : raccord progressif (sur ≤ 30 m) vers la largeur moyenne imposée aux extrémités jointives
export function taperW(w, w0, w1, s, L) {
  const T = Math.min(30, L * 0.5), sm = (t) => t * t * (3 - 2 * t); let r = w;
  if (w0 != null && s < T) r = w0 + (r - w0) * sm(Math.max(0, s) / T);
  if (w1 != null && L - s < T) r = w1 + (r - w1) * sm(Math.max(0, L - s) / T);
  return r;
}
// tronçons OSM jointifs de même rue (classes voisines, prolongement quasi droit) : la largeur au joint est la moyenne des deux, plus de marche entre tronçons
export function jointWidths(roads, wOf) {
  const ends = new Map(), key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2), out = new Map();
  roads.forEach((r, ri) => { if (!r.p || r.p.length < 2 || r.k > 4 || r.rb) return; for (const e of [0, 1]) { const k = key(e ? r.p[r.p.length - 1] : r.p[0]); let a = ends.get(k); if (!a) ends.set(k, a = []); a.push([ri, e]); } });
  const dirOut = (ri, e) => { const p = roads[ri].p, n = p.length, a = e ? p[n - 1] : p[0], b = e ? p[n - 2] : p[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  for (const list of ends.values()) { if (list.length < 2) continue; const used = new Set(), pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const [a, ea] = list[i], [b, eb] = list[j]; if (a === b) continue; if (Math.abs(roads[a].k - roads[b].k) > 1) continue;
      const da = dirOut(a, ea), db = dirOut(b, eb), d = da[0] * db[0] + da[1] * db[1]; if (d < -0.5) pairs.push([d, list[i], list[j]]); }
    pairs.sort((x, y) => x[0] - y[0]);
    for (const [, A, B] of pairs) { if (used.has(A[0] + ':' + A[1]) || used.has(B[0] + ':' + B[1])) continue; used.add(A[0] + ':' + A[1]); used.add(B[0] + ':' + B[1]);
      const wm = (wOf(roads[A[0]]) + wOf(roads[B[0]])) / 2; for (const [ri, e] of [A, B]) { let o = out.get(ri); if (!o) out.set(ri, o = [null, null]); o[e] = wm; } } }
  return out;
}

class Ribbons {
  constructor() { this.p = []; this.c = []; this.n = []; this.i = []; this.u = []; this.acc = 0; }
  add(pts, width, y0, color, terrain, mark = 0, ext = true, we = null, talus = null) {
    // rééchantillonnage tous les <= 9 m
    const P = [];
    pts = chaikin(pts, 2); if (ext) pts = extend(pts, width * 0.45);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(L / 9));
      for (let k = 0; k < n; k++) P.push([x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n]);
    }
    P.push(pts[pts.length - 1]);
    const m = P.length; if (m < 2) return;
    const cl = [0]; for (let i = 1; i < m; i++) cl.push(cl[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const base = this.p.length / 3, nv = new THREE.Vector3(); let dist = this.acc;
    const prevT = { 1: null, '-1': null };   // dernier point (bord aplati, pied de talus) de chaque côté, pour prolonger le ruban de talus d'un sommet au suivant
    for (let i = 0; i < m; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(m - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      // miter limité - uniquement du côté EXTÉRIEUR (convexe) du virage : élargir aussi le côté intérieur
      // (concave) fait replier ce bord sur lui-même dans les virages serrés (épingles), un croisement d'autant plus
      // visible que le talus prolonge encore ce bord vers l'extérieur (bandes qui empiètent sur la chaussée voisine,
      // ou lignes très longues et fines qui traversent tout le décor - cf. CONDUITE.MD). Le côté intérieur garde la
      // largeur nominale (biseau plutôt que pointe), ce qui est la façon standard d'éviter l'auto-intersection.
      let mit = 1, turn = 0;
      if (i > 0 && i < m - 1) {
        const dx1 = P[i][0] - P[i - 1][0], dz1 = P[i][1] - P[i - 1][1], dx2 = P[i + 1][0] - P[i][0], dz2 = P[i + 1][1] - P[i][1];
        const l1 = Math.hypot(dx1, dz1) || 1, l2 = Math.hypot(dx2, dz2) || 1;
        const cs = (dx1 * dx2 + dz1 * dz2) / (l1 * l2); mit = Math.min(1.35, 1 / Math.max(0.75, Math.sqrt((1 + cs) / 2)));
        turn = (dx1 * dz2 - dz1 * dx2) / (l1 * l2);
      }
      const hw = (we ? taperW(width, we[0], we[1], cl[i], cl[m - 1]) : width) / 2;
      if (i > 0) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      // hauteur de l'axe (référence) et écart maximal toléré de chaque bord par rapport à l'axe (dévers plafonné à
      // MAX_CROSS_SLOPE) : une route/un chemin reste plat en travers, seule une pente dans le sens du tracé (déjà
      // portée par cH d'un sommet au suivant) est physiquement réaliste pour un véhicule.
      const cH = terrain.heightAt(P[i][0], P[i][1]), maxD = hw * MAX_CROSS_SLOPE;
      for (const s of [1, -1]) {
        const mitS = turn * s < 0 ? 1 : mit, nx = tz * hw * mitS, nz = -tx * hw * mitS;
        const x = P[i][0] + nx * s, z = P[i][1] + nz * s;
        const raw = terrain.heightAt(x, z), h = cH + Math.max(-maxD, Math.min(maxD, raw - cH));
        this.u.push(s, dist, mark ? 0.10 / hw : 0);
        this.p.push(x, h + y0, z);
        terrain.normalAt(x, z, nv); this.n.push(nv.x, nv.y, nv.z);
        this.c.push(color.r, color.g, color.b);
        if (talus) {
          // talus : comble l'écart entre le bord aplati (h) et le relief réel (raw) sur une distance latérale
          // proportionnelle à cet écart (pente du talus lui-même TALUS_RUN, ~2:1) - nul (largeur 0, triangle
          // dégénéré) là où le dévers d'origine était déjà dans la tolérance.
          // portée du talus plafonnée en proportion de la largeur de la voie elle-même (mini 4 m, jusqu'à 14 m sur une grande route) : un sentier étroit (1,7 m) n'a pas besoin - et n'a surtout pas l'air réaliste avec - un
          // talus aussi large qu'une route à 2 voies ; ça limite aussi le risque qu'il rejoigne une autre branche de la route toute proche (ex. lacet de montagne).
          const pux = tz, puz = -tx, excess = raw - h, run = Math.min(Math.max(4, width * 1.2), 14, Math.abs(excess) / TALUS_RUN);
          const ox = x + pux * s * run, oz = z + puz * s * run, oh = terrain.heightAt(ox, oz);
          const cur = { in: [x, h, z], out: [ox, oh, oz], up: excess >= 0 };
          const prev = prevT[s];
          // seul le remblai (versant herbeux, terrain réel plus bas que le bord aplati) est dessiné : le déblai
          // (terre nue, terrain réel plus haut) était systématiquement raté visuellement (cf. retour utilisateur)
          // et est purement et simplement omis ici plutôt que masqué autrement - le relief réel, qui remonte déjà
          // naturellement à cet endroit, reste visible tel quel à la place.
          if (prev && !prev.up && !cur.up) {
            const tb = talus.p.length / 3;
            for (const [px, py, pz] of [prev.in, prev.out, cur.in, cur.out]) {
              talus.u.push(0, 0, 0); talus.p.push(px, py, pz);
              terrain.normalAt(px, pz, nv); talus.n.push(nv.x, nv.y, nv.z);
              talus.c.push(TALUS_COLOR_DOWN.r, TALUS_COLOR_DOWN.g, TALUS_COLOR_DOWN.b);
            }
            if (s > 0) talus.i.push(tb, tb + 2, tb + 1, tb + 1, tb + 2, tb + 3);
            else talus.i.push(tb, tb + 1, tb + 2, tb + 1, tb + 3, tb + 2);
          }
          prevT[s] = cur;
        }
      }
      if (i < m - 1) { const k = base + i * 2; this.i.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    this.acc = dist + 50;
  }
  tri(outer, holes, y0, color, terrain) {   // polygone quelconque avec trous (plans d'eau, fleuves) : triangulation earcut, faces vers le haut
    // rééchantillonnage des anneaux tous les <= 8 m avant triangulation : sans ça, un grand triangle plat (sommets OSM parfois espacés de 50 m+)
    // interpole sa hauteur linéairement entre 2 coins, ce qui peut repasser au-dessus d'une route/voie ferrée qui le traverse en son milieu
    // même quand chaque coin, pris isolément, respecte la marge de sécurité (cf. waterTerrain plus haut) - la subdivision densifie le maillage
    // pour que le calage sur le point bas du voisinage s'applique partout dans le polygone, pas seulement à ses sommets d'origine
    const resample = (R) => { const O = []; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; O.push(a);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 8); for (let k = 1; k < n; k++) O.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } return O; };
    outer = resample(outer); holes = holes.map(resample);
    const V = [...outer, ...holes.flat()], nv = new THREE.Vector3(), base = this.p.length / 3;
    const faces = THREE.ShapeUtils.triangulateShape(outer.map((q) => new THREE.Vector2(q[0], q[1])), holes.map((h) => h.map((q) => new THREE.Vector2(q[0], q[1]))));
    // earcut (algorithme de David Eberly : chaque trou est "ponte\u0301" au contour exte\u0301rieur par une are\u0302te trouve\u0301e via comparaison flottante stricte, sans marge adapte\u0301e a\u0300 l'e\u0301chelle me\u0301trique de la sce\u0300ne) peut, quand le contour d'un trou passe tre\u0300s pre\u0300s du bord exte\u0301rieur ou d'un autre trou (ce qui est justement le cas ici : clipToShore ramène volontairement les extre\u0301mite\u0301s d'un franchissement pile en bordure de rive pour garantir la couverture), souder par erreur un triangle-e\u0301clat le long de cette are\u0302te de pontage \u2014 un triangle dont les 3 sommets appartiennent bien au contour retenu par earcut mais dont l'inte\u0301rieur empie\u0300te sur un trou (observe\u0301 sur le terrain : rail immerge\u0301 malgre\u0301 un trou correctement calcule\u0301 et confine\u0301 dans le plan d'eau). Filet de se\u0301curite\u0301 ge\u0301ne\u0301rique, valable pour n'importe quelle ville : par construction, un triangle de remplissage LE\u0301GITIME d'un polygone-a\u0300-trous ne peut jamais avoir son centre de gravite\u0301 a\u0300 l'inte\u0301rieur d'un trou \u2014 on rejette donc tout triangle dont c'est le cas, sans toucher a\u0300 la forme des trous eux-me\u0302mes (calcule\u0301e plus haut, immuable ici).
    const inHole = (x, z) => holes.some((h) => { let c = false; for (let a = 0, b = h.length - 1; a < h.length; b = a++) if ((h[a][1] > z) !== (h[b][1] > z) && x < (h[b][0] - h[a][0]) * (z - h[a][1]) / (h[b][1] - h[a][1]) + h[a][0]) c = !c; return c; });
    const facesF = faces.filter(([i, j, k]) => { const A = V[i], B = V[j], C = V[k]; return !inHole((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3); });
    for (const [x, z] of V) { this.u.push(0, 0, 0); this.p.push(x, terrain.heightAt(x, z) + y0, z); terrain.normalAt(x, z, nv); this.n.push(nv.x, nv.y, nv.z); this.c.push(color.r, color.g, color.b); }
    for (const [i, j, k] of facesF) { const A = V[i], B = V[j], C = V[k]; if ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) > 0) this.i.push(base + i, base + k, base + j); else this.i.push(base + i, base + j, base + k); }
  }
  poly(P, y0, color, terrain) {   // polygone convexe (éventail depuis le centre), sans marquage : recouvre les lignes aux jonctions
    const nv = new THREE.Vector3(), base = this.p.length / 3; let cx = 0, cz = 0; for (const q of P) { cx += q[0]; cz += q[1]; } cx /= P.length; cz /= P.length;
    // aRu (0, 0, 0) partout, identique pour tous les sommets : dans le shader de chaussée (mk() dans roads.js), le motif
    // procédural de « reprise/plaque » d'enrobé lit une texture de bruit à une coordonnée dérivée de vRu.y (constante ici)
    // -> un échantillon de bruit UNIQUE, donc un assombrissement UNIFORME sur tout le disque/rectangle de jonction, avec un
    // bord net exactement sur le contour du polygone (le "rond/rectangle trop gros et trop opaque" signalé). Fix générique
    // (tout carrefour, toutes villes) : vRu.y varie désormais avec la position réelle du sommet, comme sur une vraie chaussée
    // construite par add() - le motif redevient une variation naturelle de texture au lieu d'un aplat uniforme à bord net.
    // vRu.x = -9 : marqueur "polygone de jonction" (hors de la plage [-1,1] qu'un vrai ruban interpole entre ses 2 bords) - repéré
    // dans le shader (mk() ci-dessous) pour désactiver les motifs d'usure pensés pour varier sur la LONGUEUR d'une vraie route
    // (plaque de reprise, tranchée rebouchée : cf. commentaire détaillé là-bas) et qui, sur un petit polygone isolé où vRu.y
    // varie à peine, retombent tous sur le MÊME tirage aléatoire et teignent alors tout le polygone d'un aplat sombre à bord
    // net - le "rond/rectangle plaqué on ne sait pourquoi" signalé, un carrefour sur ~8 selon le tirage de bruit.
    for (const [x, z] of [[cx, cz], ...P]) { this.u.push(-9, x * 0.7 + z * 0.4, 0); this.p.push(x, terrain.heightAt(x, z) + y0, z); terrain.normalAt(x, z, nv); this.n.push(nv.x, nv.y, nv.z); this.c.push(color.r, color.g, color.b); }
    let A = 0; for (let i = 0; i < P.length; i++) { const q = P[i], r = P[(i + 1) % P.length]; A += q[0] * r[1] - r[0] * q[1]; }   // face visible vers le haut
    for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; if (A > 0) this.i.push(base, base + 1 + j, base + 1 + i); else this.i.push(base, base + 1 + i, base + 1 + j); }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aRu', new THREE.Float32BufferAttribute(this.u, 3));
    g.setIndex(this.i);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; return m;
  }
}

// ---- niveau d'eau interrogeable indépendamment, AVANT que buildRoads ne construise l'eau elle-même (bridges.js
// appelle ceci depuis liftBridges, qui s'exécute avant buildRoads dans main.js) : sert à caler la hauteur des
// tabliers de ponts/pontons sur le vrai niveau d'eau plutôt que sur le relief brut du fond, non fiable sous l'eau
// (cf. commentaires détaillés dans buildRoads plus bas - même diagnostic, même algorithme exact : ratio isopérimétrique
// pour choisir niveau constant/lissé, seule l'UTILISATION diffère ici). Sans ce calage, un ponton dont le bout
// réellement en pleine eau garde une hauteur de tablier FIXE au-dessus du fond (br.H, pensé comme un simple
// dégagement de pont classique) pouvait rester sous la surface si le fond réel à cet endroit précis (lit du lac,
// données de relief plus profondes que la rive toute proche utilisée ailleurs pour la médiane) est nettement plus
// bas que le niveau d'eau réel du plan d'eau - déjà, par construction, indépendant du bruit du relief sous l'eau.
// Retourne une fonction (x,z) => niveau d'eau si le point tombe dans un polygone natural=water, sinon null (auquel
// cas l'appelant garde le relief brut, comportement inchangé pour tout ce qui n'est pas au-dessus d'un plan d'eau).
export function waterLevelAt(data, terrain) {
  const areas = (data.areas || []).filter((ar) => ar.t === 'water');
  if (!areas.length) return () => null;
  const pip = (x, z, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; return c; };
  const area = (R) => { let A = 0; for (let i = 0; i < R.length; i++) { const q = R[i], r = R[(i + 1) % R.length]; A += q[0] * r[1] - r[0] * q[1]; } return Math.abs(A) / 2; };
  const perim = (R) => { let Pm = 0; for (let i = 0; i < R.length; i++) { const q = R[i], r = R[(i + 1) % R.length]; Pm += Math.hypot(r[0] - q[0], r[1] - q[1]); } return Pm; };
  const median = (arr) => { const s = arr.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
  // niveau LOCAL lissé, appelé ici pour un point QUELCONQUE (ex. terrain.heightAt() appelé par bridges.js à
  // n'importe quelle coordonnée, pas forcément un sommet de berge) : repli sur les sommets les PLUS PROCHES en
  // distance réelle, jamais sur la totalité du polygone. Bug réel observé (Isère, Montmélian) : un long cours
  // d'eau cartographié en surface peut courir sur des dizaines de km, largement hors du carré ±R du terrain
  // chargé localement - ses sommets lointains, hors zone, sont alors écrêtés au bord du maillage de relief
  // (valeur qui n'a plus rien à voir avec le terrain réel à cet endroit). Sans ce repli par distance, un point
  // interrogé loin de tout sommet proche (aucun sommet dans `radius`, simple lacune locale d'échantillonnage)
  // retombait sur la médiane de TOUT le polygone - majoritairement composée de ces valeurs de bord aberrantes
  // sur un long tracé - et renvoyait un « niveau d'eau » à des centaines de mètres du relief réel, d'où des
  // murs verticaux au raccord avec le sol dès que ce niveau (utilisé comme plancher minimal par bridges.js).
  const localLevel = (R, radius) => { const pts = R.map(([x, z]) => [x, z, terrain.heightAt(x, z)]);
    return (x, z) => { const near = pts.filter(([px, pz]) => Math.hypot(px - x, pz - z) <= radius);
      if (near.length) return median(near.map((p) => p[2]));
      const byDist = pts.map((p) => [p[2], Math.hypot(p[0] - x, p[1] - z)]).sort((a, b) => a[1] - b[1]);
      return median(byDist.slice(0, 3).map((p) => p[0])); }; };
  const polys = [];
  for (const ar of areas) {
    const rings = (ar.p || []).map((R) => R.length > 1 && R[0][0] === R[R.length - 1][0] && R[0][1] === R[R.length - 1][1] ? R.slice(0, -1) : R).filter((R) => R.length >= 3);
    for (const R of rings) {
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of R) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
      const A = area(R), P = perim(R), shape = A > 1 ? P / Math.sqrt(A) : 0;
      const levelAt = shape < 15 ? (() => median(R.map(([x, z]) => terrain.heightAt(x, z)))) : localLevel(R, 70);
      const constLevel = shape < 15 ? levelAt() : null;
      polys.push({ R, box: [x0, z0, x1, z1], levelAt: constLevel !== null ? () => constLevel : levelAt });
    }
  }
  return (x, z) => { for (const p of polys) { const [x0, z0, x1, z1] = p.box; if (x < x0 || x > x1 || z < z0 || z > z1) continue; if (pip(x, z, p.R)) return p.levelAt(x, z); } return null; };
}

// buildRoads est async et rend la main au navigateur à intervalles réguliers (voir `yield_()` ci-dessous) : sans
// cela, toute cette construction (des milliers de segments de route, jonctions, polygones d'eau à trouer/trianguler)
// s'exécute en un seul bloc JS ininterrompu qui peut dépasser 5 à 10 s sur une grosse ville (mesuré : jusqu'à 10 s
// pour Chambéry) - largement au-delà du délai qui déclenche le message « la page ne répond pas » de Chrome, quelle
// que soit la puissance de la machine, puisque rien ne dépend du CPU ici : un seul appel synchrone reste un seul
// appel synchrone. Chaque `await yield_()` redonne la main à la boucle d'événements (i.e. au navigateur) le temps
// d'un tick, sans changer le résultat final ni son ordre de construction.
// Matériau d'eau générique (vagues + reflet du ciel par effet de Fresnel), indépendant du pipeline routier de mk()
// ci-dessous (qui suppose l'attribut aRu propre aux rubans de chaussée) - réutilisable sur N'IMPORTE QUELLE géométrie
// (ex. le plan de crue de la montée des eaux dans main.js), avec le même langage visuel que les lacs/rivières.
export function buildWaterMaterial(terrain, { opacity = 0.85, transparent = true, color = 0x5c8fae } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.05, transparent, opacity });
  const WU = { uT: { value: 0 }, uSkyC: { value: new THREE.Color(0.5, 0.65, 0.9) } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: terrain.NOISE }; Object.assign(sh.uniforms, WU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZw = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform float uT; uniform vec3 uSkyC; varying vec2 vXZw;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { // anti-aliasing du reflet spéculaire : une houle bien filtrée (cf. plus bas) ne suffit pas à elle seule -
          // un lobe spéculaire étroit (roughness faible) reste hypersensible à la moindre variation de normale
          // résiduelle, et scintille (mouchetis/"moiré") dès que l'empreinte au sol d'un pixel dépasse la longueur
          // d'onde de la houle sans que l'amplitude soit encore totalement coupée (zone de transition). On élargit
          // donc aussi le lobe lui-même (roughness -> 1) dans cette même zone : c'est la vraie correction physique
          // (cf. Toksvig/LEAN mapping), pas un simple pansement sur l'amplitude. Flagrant sur un grand plan d'eau
          // (lac du Bourget) où la quasi-totalité de la surface visible reste dans cette zone de transition, quelle
          // que soit la distance de la caméra - un petit lac ou un plan d'eau proche n'y entre presque jamais.
          vec2 fq = vXZw; float fw = max(length(dFdx(fq)), length(dFdy(fq)));
          float specAA = smoothstep(0.12, 1.6, fw);
          roughnessFactor = mix(roughnessFactor, 1.0, specAA * 0.92); }
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 q = vXZw; float t = uT;
          vec2 w1 = (texture2D(uNoise, q * 0.011 + vec2(0.13, 0.71) + t * 0.010).rg - 0.5) * 55.0;
          // repliement/moiré sur l'eau vu de loin ou en incidence rasante (horizon) : la seule distance caméra ne le détecte pas
          // (un angle rasant agrandit l'empreinte au sol d'un pixel sans éloigner la caméra) - on mesure directement cette empreinte
          // (fwidth de la position monde) et on éteint chaque octave de houle dès qu'elle approche sa longueur d'onde (critère de Nyquist).
          vec2 gdxQ = dFdx(q), gdyQ = dFdy(q); float fwQ = max(length(gdxQ), length(gdyQ));
          float fA = 1.0 - smoothstep(0.5, 1.8, fwQ * 6.1), fB = 1.0 - smoothstep(0.5, 1.8, fwQ * 2.6), fC = 1.0 - smoothstep(0.5, 1.8, fwQ * 0.85);
          vec2 w2 = (texture2D(uNoise, q * 0.07 - vec2(0.4, 0.2) + t * 0.023).rg - 0.5) * 9.0 * fB;
          vec2 qw = q + w1 + w2;
          vec2 g = vec2(sin(qw.x * 0.9 + t * 1.3 + sin(qw.y * 0.5 + t * 0.7)), cos(qw.y * 0.8 - t * 1.1 + sin(qw.x * 0.6 - t * 0.5))) * 0.5 * fC
                 + vec2(sin(qw.x * 2.3 + qw.y * 1.7 + t * 2.1), cos(qw.y * 2.9 - qw.x * 1.3 + t * 1.8)) * 0.3 * fB
                 + vec2(sin(qw.x * 6.1 - t * 3.0), cos(qw.y * 5.3 + t * 2.6)) * 0.12 * fA;
          normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.16); }`)
      .replace('#include <opaque_fragment>', `{ float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
          // véritable cause de l'"éventail" radiant sur les grandes nappes d'eau (lac du Bourget, plan d'inondation) :
          // ce n'était NI la houle, NI la géométrie, NI un défaut de précision flottante des sin/cos (pistes
          // explorées et invalidées ci-dessus) mais CETTE ligne - normalize(outgoingLight + 0.001) normalise la
          // couleur déjà ombrée comme si c'était un vecteur 3D : dès que la surface reçoit peu de lumière (cas
          // typique d'une eau immense, loin de toute source, ou de nuit), outgoingLight tend vers 0 et cette
          // normalisation devient numériquement instable (on normalise un vecteur quasi nul) - la moindre variation
          // infinitésimale de outgoingLight part dans une direction totalement différente une fois normalisée, ce qui
          // fait exploser le dot() qui suit en un bruit à haute fréquence, visible comme des bandes radiant depuis la
          // direction du reflet (confirmé en isolant chaque bloc de code injecté en direct dans le navigateur).
          // Remplacé par une simple luminance (stable même proche de 0, jamais de normalize() d'un vecteur quasi nul).
          float br = clamp(dot(outgoingLight, vec3(0.3333)) * 2.0, 0.0, 1.0);
          outgoingLight = mix(outgoingLight, uSkyC * (0.55 + 0.45 * br), clamp(0.12 + fr * 0.75, 0.0, 0.85)); }
        #include <opaque_fragment>`);
  };
  return { material: m, uniforms: WU };
}

export async function buildRoads(data, terrain) {
  const yield_ = () => new Promise((r) => setTimeout(r));
  const group = new THREE.Group();
  const roads = data.roads || [];
  // pistes cyclables/piétonnes (k=6 zone piétonne, k=7 trottoir/chemin/piste/escaliers, k=8 chemin de terre) : calque
  // dédié EN DESSOUS de toute la voirie carrossable (0-5), pour qu'une piste qui longe/traverse une route reste
  // visuellement sous la chaussée (comme dans la réalité) plutôt que peinte par-dessus le marquage au sol. Le
  // disque/té de jonction carrossable (cf. plus bas) continue donc de recouvrir les pistes à son aplomb - c'est
  // désormais voulu - mais sans plus jamais "tronquer" une piste avant ce point : les pistes ont leur PROPRE
  // disque/té de jonction (mêmes règles, cf. plus bas), qui referme proprement chaque embranchement piéton/cycliste
  // et chaque raccord à une route, au lieu de compter sur le simple prolongement générique de Ribbons.add.
  const LAY = { 10: 0, 11: 0, 9: 1, 6: 2, 7: 2, 8: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 7, 0: 8 };
  const layers = Array.from({ length: 9 }, () => new Ribbons());
  const curb = new Ribbons(), water = new Ribbons(), talus = new Ribbons(), lamps = [];
  const col = {}; for (const k in CLS) col[k] = new THREE.Color(CLS[k][1]);
  const ck = (k, cy) => (cy ? col[0] : col[k]);   // piste cyclable (k=7, cy=1) : goudron gris des routes, pas le beige "chemin de terre" des footway/path/steps/bridleway
  const JW = jointWidths(roads, (r) => (r.w && r.k <= 6 ? r.w : (CLS[r.k] || [6])[0]));
  // hauteur de l'eau : toujours un petit peu au-dessus de SON PROPRE terrain local (sinon elle repasse sous le maillage du terrain
  // et des pans entiers de la surface disparaissent selon le relief/l'angle de vue), mais si une route ou une voie ferrée passe
  // à proximité, elle se cale juste en dessous de la hauteur RÉELLE de cette route à cet endroit précis (pas un minimum générique
  // du relief) - donc jamais au-dessus d'un rail/route voisin, sans jamais non plus s'enfoncer sous son propre sol.
  const WGS = 22, wGrid = new Map(), wgk = (i, j) => i * 100003 + j;
  for (const r of roads) { const cl = CLS[r.k]; if (!cl || !r.p || r.p.length < 2 || r.k >= 10) continue;
    const hw = (r.w && r.k <= 6 ? r.w : cl[0]) / 2 + 1, yOff = 0.09 + 0.03 * (LAY[r.k] ?? 2);
    for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1];
      for (let cx = Math.floor((Math.min(x1, x2) - hw) / WGS); cx <= Math.floor((Math.max(x1, x2) + hw) / WGS); cx++)
        for (let cz = Math.floor((Math.min(z1, z2) - hw) / WGS); cz <= Math.floor((Math.max(z1, z2) + hw) / WGS); cz++) {
          const k = wgk(cx, cz); let a = wGrid.get(k); if (!a) wGrid.set(k, a = []); a.push([x1, z1, x2, z2, hw, yOff]); } }
  }
  // clampWater : abaisse localement le niveau d'eau (jamais ne le relève) juste en dessous d'un tablier/rail/route
  // proche, pour qu'il ne recouvre jamais un pont/ponton voisin. Le précédent `return Math.max(h, floor)` annulait
  // intégralement ce mécanisme (h ne peut que descendre depuis floor par les min() ci-dessus, donc max(h, floor)
  // redonnait TOUJOURS floor) : le clampage près des ponts/pontons n'avait donc jamais d'effet réel, en dépit du
  // commentaire d'intention - cause racine, plus fondamentale que le seul écart de largeur de trou déjà corrigé,
  // des passerelles/pontons signalés encore partiellement sous l'eau. Corrigé en renvoyant simplement h.
  const clampWater = (base, x, z) => {
    let h = base + 0.03;
    const cx = Math.floor(x / WGS), cz = Math.floor(z / WGS);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const cell = wGrid.get(wgk(cx + dx, cz + dz)); if (!cell) continue;
      for (const [x1, z1, x2, z2, hw, yOff] of cell) {
        const dxs = x2 - x1, dzs = z2 - z1, l2 = dxs * dxs + dzs * dzs || 1;
        const t = Math.max(0, Math.min(1, ((x - x1) * dxs + (z - z1) * dzs) / l2)), px = x1 + dxs * t, pz = z1 + dzs * t, d = Math.hypot(px - x, pz - z);
        if (d > hw + 2) continue;
        h = Math.min(h, terrain.heightAt(px, pz) + yOff - 0.05);
      }
    }
    return h;
  };
  const median = (arr) => { const s = arr.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
  // niveau LOCAL lissé (médiane glissante des points de berge dans un rayon donné) : contrairement au niveau global
  // constant ci-dessous (un seul niveau pour tout le polygone), suit la pente réelle d'un plan d'eau qui perd de
  // l'altitude sur sa longueur (rivière/canal cartographié comme SURFACE, pas comme simple ligne) tout en restant
  // localement plat en travers. Repli par distance réelle (3 sommets les plus proches), jamais sur la totalité du
  // polygone : le point interrogé n'est pas toujours un sommet de R lui-même - le maillage du ruban d'eau (Ribbons)
  // rééchantillonne les bords du polygone tous les ~8 m, ajoutant des points INTERMÉDIAIRES qui n'existent pas dans
  // R quand deux sommets d'origine sont plus espacés que `radius`. Sans ce repli par distance, un tel point retombait
  // sur la médiane de TOUT le polygone - qui peut courir sur des dizaines de km, largement hors du carré ±R du
  // terrain chargé, ses sommets lointains étant alors écrêtés au bord du maillage de relief (valeur aberrante) - d'où
  // les murs d'eau verticaux constatés (Isère, Montmélian).
  const localLevel = (R, radius) => { const pts = R.map(([x, z]) => [x, z, terrain.heightAt(x, z)]);
    return (x, z) => { const near = pts.filter(([px, pz]) => Math.hypot(px - x, pz - z) <= radius);
      if (near.length) return median(near.map((p) => p[2]));
      const byDist = pts.map((p) => [p[2], Math.hypot(p[0] - x, p[1] - z)]).sort((a, b) => a[1] - b[1]);
      return median(byDist.slice(0, 3).map((p) => p[0])); }; };
  const waterTerrain = {   // cours d'eau linéaires (rivières, canaux, ruisseaux) : suit le relief local le long du tracé, pente naturelle légitime
    heightAt: (x, z) => clampWater(terrain.heightAt(x, z), x, z),
    // normale de l'eau : à dessein PAS terrain.normalAt(x,z,v). Vérifié en direct (lac du Bourget-du-Lac) : le relief réel
    // sous un plan d'eau n'est pas fiable à l'endroit exact du polygone d'eau (résolution des tuiles de relief, écarts
    // avec le tracé vectoriel de la rive) - certains points strictement à l'intérieur du lac renvoyaient une pente de
    // vrai flanc de colline (normale inclinée à plus de 20°) au lieu du fond plat attendu, ce qui, une fois mélangé à la
    // réflexion du ciel (Fresnel) dans le shader de l'eau, produisait exactement les stries/bandes sombres signalées -
    // un artefact de shading, pas un trou de géométrie ni un problème de tampon de profondeur. L'eau est par nature une
    // surface plane (le clapot est déjà simulé séparément par le shader via la distorsion de normale sur le bruit) ; sa
    // normale de base doit donc toujours pointer vers le haut, jamais suivre le relief du fond.
    normalAt: (x, z, v) => v.set(0, 1, 0),
  };
  // plans d'eau (lacs, étangs - polygones, contrairement aux cours d'eau linéaires ci-dessus) : le fond réel n'est PAS
  // plat au sens du relief brut (mêmes tuiles de relief non fiables sous l'eau que ci-dessus), donc suivre `terrain.heightAt`
  // sommet par sommet comme pour une rivière fait aussi onduler la SURFACE de l'eau elle-même selon ce relief bruité -
  // en surface, ces bosses/creux erronés rapprochent localement l'eau (semi-transparente, décalage de polygone) du maillage
  // du terrain sous-jacent (drapé de photo aérienne près des routes), d'où le land qui "perce" par endroits (plaques
  // troubles couleur photo aérienne au lieu du bleu de l'eau, stries dépendant de l'angle) - un vrai lac est par nature
  // un plan unique et plat. Fix générique (toute ville, tout plan d'eau, sans altitude codée en dur) : un niveau constant
  // par polygone, la médiane du relief échantillonné sur son propre contour (rive) - robuste aux quelques points de rive
  // eux-mêmes aberrants, sans jamais inventer de valeur.
  const lakeWaterTerrain = (level) => ({   // `level` : un nombre (plan d'eau flottant, niveau constant) OU une fonction (x,z)=>niveau (niveau local lissé)
    heightAt: (x, z) => clampWater(typeof level === 'function' ? level(x, z) : level, x, z),
    normalAt: (x, z, v) => v.set(0, 1, 0),
  });
  for (let ri = 0; ri < roads.length; ri++) {
    if (ri && ri % 300 === 0) await yield_();   // ~2000-3000 tronçons dans une grosse ville : rendre la main de temps en temps
    const r = roads[ri], we = JW.get(ri), cl = CLS[r.k]; if (!cl || r.p.length < 2) continue;
    const w = r.w && r.k <= 6 ? r.w : cl[0];
    if (r.k >= 10) { water.add(r.p, w, 0.03, col[r.k], waterTerrain); continue; }
    let Lr = 0, turn = 0;
    for (let i = 1; i < r.p.length; i++) { Lr += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      if (i > 1) { const a = Math.atan2(r.p[i - 1][1] - r.p[i - 2][1], r.p[i - 1][0] - r.p[i - 2][0]), b2 = Math.atan2(r.p[i][1] - r.p[i - 1][1], r.p[i][0] - r.p[i - 1][0]); let d = b2 - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += Math.abs(d); } }
    const curvy = turn > 0.9 && Lr < 160;     // arc de rond-point : pas de prolongement ni de marquage
    if (cl[3]) curb.add(r.p, w + 2.6, 0.06, new THREE.Color('#b9b5aa'), terrain, 0, false, we && [we[0] == null ? null : we[0] + 2.6, we[1] == null ? null : we[1] + 2.6], talus);
    const ly = LAY[r.k] ?? 2;
    // piste cyclable (r.cy) : ligne pointillée centrale elle aussi, comme une route normale (demande explicite) - on
    // contourne donc le seuil de largeur "w >= 4.5" (pensé pour des chaussées, pas pour une piste de ~1,7 m) qui l'aurait sinon exclue.
    layers[ly].add(r.p, w, 0.09 + 0.03 * ly, ck(r.k, r.cy), terrain, (r.cy || (r.k >= 0 && r.k <= 4 && w >= 4.5)) && !curvy && Lr > 30 && !(r.ow && (r.ln || Math.floor(w / 3.4)) < 2) ? 1 : 0, !curvy, we, talus);   // pas de tiret central sur un sens unique à une seule voie
    // éclairage public
    if (r.k >= 1 && r.k <= 4 || r.k === 6) {
      let acc = 20, side = 1;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], L = Math.hypot(x2 - x1, z2 - z1) || 1;
        for (let d = 0; d < L; d += 1) { if (--acc > 0) continue; acc = 38;
          const t = d / L, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, off = (w / 2 + 1.4) * side; side = -side;
          lamps.push(x + (z2 - z1) / L * off, 0, z - (x2 - x1) / L * off); }
      }
    }
  }
  await yield_();
  // ---- jonctions : le carrefour est un vrai polygone continu (même couleur, sans lignes) posé sur les rubans, au lieu de bouts de rubans qui s'entrecoupent
  { const hwR = (r) => (r.w && r.k <= 6 ? r.w : CLS[r.k][0]) / 2, drv = (r) => r.k <= 5 && !r.rb && !r.b && r.p.length >= 2 && CLS[r.k];
    const pth = (r) => r.k >= 6 && r.k <= 8 && !r.rb && !r.b && r.p.length >= 2 && CLS[r.k];
    const nodesD = new Map(), nodesP = new Map(), key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2), CS = 30, grid = new Map(), gk = (i, j) => i * 100003 + j;
    roads.forEach((r, ri) => { const isP = pth(r); if (!drv(r) && !isP) return; const dest = isP ? nodesP : nodesD;
      for (const e of [0, 1]) { const n = r.p.length, a = e ? r.p[n - 1] : r.p[0], b = e ? r.p[n - 2] : r.p[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = key(a); let g = dest.get(k); if (!g) dest.set(k, g = []); g.push({ ri, pt: a, u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], hw: hwR(r), k: r.k, cy: r.cy, ly: LAY[r.k] ?? 2 }); }
      for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1];
        for (let cx = Math.floor((Math.min(x1, x2) - 3) / CS); cx <= Math.floor((Math.max(x1, x2) + 3) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - 3) / CS); cz <= Math.floor((Math.max(z1, z2) + 3) / CS); cz++) { const k = gk(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([x1, z1, x2, z2, ri, isP]); } } });
    const col0 = col[3]; let nD = 0, nT = 0, JP = null;
    const dy = (ly) => 0.09 + 0.03 * ly + 0.02;
    // disques/tés de jonction pour un jeu de nœuds donné (voirie carrossable OU pistes) ; `roadOnly` reproduit le
    // comportement d'origine pour la voirie carrossable (le raccord d'une route ne s'accroche jamais à une piste
    // piétonne/cyclable voisine) alors qu'une piste, elle, peut se raccorder aussi bien à une autre piste qu'à une route -
    // c'est ce qui referme proprement chaque embranchement/raccord de piste SANS jamais toucher au rendu de la voirie.
    const junctions = (nodes, roadOnly) => { for (const g of nodes.values()) {
      if (g.length >= 3) {
        // une route coupée en deux tronçons OSM au même nœud (ex. changement de nom de rue, pont) n'est PAS un
        // carrefour avec elle-même : ses deux moitiés repartent dans des directions quasi opposées avec une largeur
        // quasi identique. Sans cette exclusion, la moindre allée/chemin qui se greffe là (3e membre du groupe)
        // héritait à tort d'un disque aussi large que cette route traversante, bien plus gros que nécessaire pour
        // raccorder une simple allée - d'où des ronds disproportionnés aux endroits les plus anodins.
        const through = new Set(); const deg = new Array(g.length).fill(0); let pairs = 0;
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
          const a = g[i], b = g[j], dot = a.u[0] * b.u[0] + a.u[1] * b.u[1], rw = Math.max(a.hw, b.hw) / Math.min(a.hw, b.hw);
          if (dot < -0.7 && rw < 1.3) { through.add(i); through.add(j); deg[i]++; deg[j]++; pairs++; }
        }
        const sig = g.filter((_, i) => !through.has(i));
        // groupe entièrement exclu (sig vide) : deux cas bien différents se cachent derrière, qu'il faut distinguer
        // via la STRUCTURE de l'appariement "through", pas juste son existence :
        // - un VRAI carrefour de plusieurs routes qui se croisent (ex. 2 routes en croix) s'apparie PARFAITEMENT :
        //   chaque membre exclu a exactement UN partenaire opposé (pairs == g.length/2, degré 1 partout) -> on garde
        //   le comportement d'origine (disque sur tout le groupe), un vrai carrefour a besoin de ce raccord.
        // - une route qui continue en se scindant en plusieurs branches côte à côte SANS aucune voie transversale
        //   (ex. une chaussée qui se sépare en 2 à l'approche d'un terre-plein central) a au moins un membre
        //   apparié avec PLUSIEURS autres (degré >= 2 - mathématiquement inévitable dès que le groupe a un nombre
        //   impair de membres, comme ici à 3) : ce n'est pas un carrefour du tout, juste un prolongement de la même
        //   route. Les rubans (déjà prolongés via extend() dans Ribbons.add) suffisent à eux seuls à assurer la
        //   continuité visuelle ; y plaquer un disque de la largeur de la route entière est disproportionné et sans
        //   objet - exactement le "rond trop gros, on ne sait pas pourquoi" signalé par l'utilisateur à un endroit
        //   qui n'est même pas un croisement.
        const cleanCrossing = pairs === g.length / 2 && deg.every((d) => d === 1);
        const gR = sig.length ? sig : (cleanCrossing ? g : null);
        if (!gR) continue;
        const ly = Math.max(...g.map((q) => q.ly)), c = g[0].pt, P = [];
        const Rfull = Math.max(...gR.map((q) => q.hw)) * 1.08 + 0.3;
        // un embranchement à angles serrés (route qui se divise en 2 chaussées côte à côte, largeurs différentes
        // -> pas détecté comme "même route" par l'exclusion ci-dessus, qui exige des largeurs proches) ne couvre
        // qu'un arc limité autour du nœud. Un disque plein, lui, rend dans TOUTES les directions, y compris le
        // grand secteur côté terre-plein/accotement où aucune route ne vient - d'où le débordement net sur
        // l'accotement signalé ("rond trop gros"), même avec un rayon par ailleurs correctement dimensionné. On
        // repère le plus grand secteur angulaire sans route raccordée ; s'il est franc (plus de ~160°, donc les
        // routes sont toutes groupées sur un arc restreint - jamais le cas d'un carrefour normal en croix/T, où
        // les branches se répartissent sur tout le tour), on y resserre progressivement le rayon vers un minimum
        // au lieu de garder le plein rayon dans le vide. Les carrefours ordinaires (branches bien réparties, pas
        // de grand secteur vide) gardent le disque plein inchangé.
        const angs = gR.map((q) => Math.atan2(-q.u[1], -q.u[0])).sort((a, b) => a - b);
        let gapStart = angs[0], gapSize = 0;
        for (let i = 0; i < angs.length; i++) {
          const a1 = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI, gap = a1 - angs[i];
          if (gap > gapSize) { gapSize = gap; gapStart = angs[i]; }
        }
        const gapEnd = gapStart + gapSize, gapMid = gapStart + gapSize / 2, rMin = Math.min(...gR.map((q) => q.hw)) * 0.5 + 0.3;
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * Math.PI * 2;
          let aa = a; while (aa < gapStart) aa += 2 * Math.PI; while (aa >= gapStart + 2 * Math.PI) aa -= 2 * Math.PI;
          let r = Rfull;
          if (gapSize > 2.79 && aa > gapStart && aa < gapEnd) { const t = Math.abs(aa - gapMid) / (gapSize / 2); r = rMin + (Rfull - rMin) * t * t; }
          P.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
        }
        { const w0 = gR.reduce((m, q) => (q.hw > m.hw ? q : m)); layers[ly].poly(P, dy(ly), ck(w0.k, w0.cy), terrain); } nD++; (JP || (JP = [])).push([c[0], c[1]]); continue; }
      for (const q of g) {   // extrémité posée sur une autre voie (T) : le rectangle couvre l'embouchure (ligne de bord de la voie principale)
        let best = null, bd = 2.2;
        for (const [x1, z1, x2, z2, rj, isP] of grid.get(gk(Math.floor(q.pt[0] / CS), Math.floor(q.pt[1] / CS))) || []) { if (rj === q.ri || g.some((o) => o.ri === rj)) continue; if (roadOnly && isP) continue;
          const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((q.pt[0] - x1) * dx + (q.pt[1] - z1) * dz) / l2)), d = Math.hypot(x1 + dx * t - q.pt[0], z1 + dz * t - q.pt[1]);
          if (d < bd) { bd = d; best = { rj, m: [dx / Math.sqrt(l2), dz / Math.sqrt(l2)] }; } }
        if (!best) continue;
        const rj = roads[best.rj], hM = hwR(rj), rawSn = Math.abs(q.u[0] * best.m[1] - q.u[1] * best.m[0]);
        // route coupée en plusieurs tronçons OSM (changement de nom, pont...) dont un bout tombe, par simple hasard de
        // l'arrondi du maillage, tout près d'un AUTRE de ses propres tronçons plutôt que de partager exactement son nœud
        // (cf. l'exclusion analogue dans la branche "rond-point" ci-dessus, même diagnostic) : vu de cet algorithme, ça
        // ressemble à une route qui en croise une autre presque tangentiellement (sinus minuscule), et la formule
        // hM/sn (pensée pour un VRAI raccord en biseau, ex. bretelle d'autoroute) explosait alors en un rectangle
        // interminable (jusqu'à 18 m de long) plaqué en plein milieu de la chaussée, pour une route qui ne fait que se
        // prolonger. Si les deux tronçons sont quasi colinéaires (tangentiel) ET de largeur comparable, ce n'est pas un
        // VRAI raccord en T à camoufler : on saute ce patch plutôt que d'en forcer un disproportionné.
        if (rawSn < 0.5 && Math.max(hM, q.hw) / Math.min(hM, q.hw) < 1.3) continue;
        // plancher du sinus remonté de 0.4 à 0.6 (~37°) : au-delà de l'exclusion ci-dessus (routes quasi
       // colinéaires), quelques rares croisements à angle très rasant restaient étirés jusqu'à 14-18 m de long
       // (validé sur les données réelles de Chambéry : ça ramène les 67 patchs de plus de 10 m à seulement 3,
       // sans quasiment toucher la médiane des autres - cf. notes de session).
        const sn = Math.max(0.6, rawSn), L = hM / sn + 0.9, w = q.hw, nx = -q.u[1], nz = q.u[0], ly = Math.max(q.ly, LAY[rj.k] ?? 2);
        const E = q.pt, P = [[-0.4, -w], [L, -w], [L, w], [-0.4, w]].map(([a, b]) => [E[0] + q.u[0] * a + nx * b, E[1] + q.u[1] * a + nz * b]);
        layers[ly].poly(P, dy(ly), hM > q.hw ? ck(rj.k, rj.cy) : ck(q.k, q.cy), terrain); nT++; }
    } };
    junctions(nodesD, true); junctions(nodesP, false);
    window.__junc = { discs: nD, tees: nT, pts: JP }; }
  const mk = (f, extra, photo = true, wear = true) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f, ...extra });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNoise = { value: terrain.NOISE }; if (photo && terrain.orthoU) Object.assign(sh.uniforms, terrain.orthoU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRu; varying vec3 vRu; varying vec2 vXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRu = aRu; vXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; varying vec3 vRu; varying vec2 vXZ;' + (photo && terrain.orthoU ? 'uniform sampler2D uOrtho; uniform float uOrthoOn; uniform vec3 uOh; uniform sampler2D uOhT; uniform float uRO;' : ''))
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec4 n1 = texture2D(uNoise, vXZ / 1.3), n2 = texture2D(uNoise, vXZ / 5.5 + 0.2), n3 = texture2D(uNoise, vXZ / 23.0);
          diffuseColor.rgb *= 0.70 + 0.55 * (0.5 * n1.r + 0.3 * n2.g + 0.2 * n3.b) - 0.18 * n1.a;
          ${photo && terrain.orthoU ? `{ // photo aérienne IGN à 35 % sur la chaussée
            vec2 ouv = (vXZ + uRO) / (2.0 * uRO);
            vec4 oc = texture2D(uOrtho, ouv);
            float om = oc.a * uOrthoOn * step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
            vec3 photo = oc.rgb / max(oc.a, 0.001);
            if (uOh.z > 1.0) {
              vec2 huv = (vXZ - uOh.xy) / uOh.z + 0.5; vec2 e = min(huv, 1.0 - huv);
              vec4 hc = texture2D(uOhT, huv); float ha = hc.a * smoothstep(0.0, 0.06, min(e.x, e.y));
              photo = mix(photo, hc.rgb / max(hc.a, 0.001), ha); om = max(om, ha * uOrthoOn);
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, clamp(photo * 0.8, 0.0, 0.66), om * 0.35);
          }` : ''}
          ${wear ? `
          { // enrobé procédural (près de la caméra seulement) : grain, traces de roues, plaques de reprise, fissures, taches d'huile
            float dv = length(vViewPosition), nf = 1.0 - smoothstep(70.0, 230.0, dv), nf2 = 1.0 - smoothstep(130.0, 420.0, dv), al = abs(vRu.x), cl = floor(vRu.y / 9.0);
            vec4 hc = texture2D(uNoise, vec2(cl * 0.1371 + 0.11, cl * 0.0731 + vRu.x * 0.0)), g1 = texture2D(uNoise, vXZ / 1.1 + 0.5), g0 = texture2D(uNoise, vXZ / 4.0 + 0.2);
            diffuseColor.rgb *= 1.0 + (g1.r - 0.5) * 0.16 * nf + (g1.g - 0.5) * 0.16 * nf + (g0.g - 0.5) * 0.35 * nf2 + (g0.b - 0.5) * 0.25 * nf2;   // gravillons
            float tr = smoothstep(0.20, 0.0, abs(al - 0.30)) + smoothstep(0.20, 0.0, abs(al - 0.72));   // ornières : deux bandes plus lisses / plus sombres
            diffuseColor.rgb *= 1.0 - 0.24 * tr * nf2 * (0.5 + n2.g);
            float isJct = step(vRu.x, -4.5);   // polygone de jonction (cf. Ribbons.poly ci-dessus) : vRu.y n'y varie quasiment pas sur sa petite surface, donc pas de "plaque"/"tranchée" (pensées pour une variation le long d'une vraie route) qui teindrait tout le polygone d'un seul bloc
            // sur une route LARGE (motorway/primary...), "al" reste normalisé entre 0 (axe) et 1 (bord) quelle que soit la largeur
            // réelle : une "plaque de reprise" qui couvre jusqu'à 85 % de ce ratio (cf. seuil 0.7*hc.b ci-dessous) occupe donc,
            // en mètres réels, une surface bien plus grande sur une route large que sur une rue étroite - jusqu'à ~12 m de large
            // sur une 2x1 voie, bien au-delà d'une vraie reprise d'enrobé (quelques m²) et très visible (retour utilisateur :
            // rectangle sombre à bord net "qu'on ne sait pas pourquoi"). Plutôt que recalculer une taille absolue (demanderait
            // de faire remonter la largeur réelle jusqu'au shader, non disponible aujourd'hui), on atténue l'assombrissement
            // lui-même (0.60/0.50 -> 0.80/0.75, soit ~20-25 % au lieu de ~38-45 %) : la variation de texture reste perceptible
            // de près mais ne lit plus comme un aplat opaque plaqué sur la chaussée.
            float pb = (1.0 - isJct) * step(0.72, hc.g) * step(al, 0.15 + 0.7 * hc.b) * step(mod(vRu.y, 9.0), 1.5 + 6.0 * hc.r);   // plaque de reprise : rectangle plus sombre et plus lisse
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.80, pb * nf2 * 0.95);
            float tn = (1.0 - isJct) * step(0.90, hc.a) * (1.0 - smoothstep(0.03, 0.09, abs(fract(vRu.y / 9.0) - 0.5)));   // tranchée transversale rebouchée
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.75, tn * nf2 * 0.9 * step(0.0001, abs(vRu.z) + 1.0));
            float ck = 1.0 - smoothstep(0.0, 0.28, abs(texture2D(uNoise, vXZ / 6.0 + 0.3).g - 0.5)); ck *= smoothstep(0.42, 0.7, n3.b) * nf2;   // reprises et salissures : taches larges, très douces (plus de contours)
            diffuseColor.rgb *= 1.0 - 0.10 * ck;
            float oil = smoothstep(0.55, 0.85, n2.r * n1.b * 1.6 + (n3.g - 0.5) * 0.3) * (1.0 - smoothstep(0.0, 0.5, abs(al - 0.3))); diffuseColor.rgb *= 1.0 - 0.45 * oil * nf2;   // taches d'huile dans les traces
          }
` : ''}
          float au = abs(vRu.x), lu = vRu.z;
          float cen = (1.0 - smoothstep(lu * 0.7, lu * 1.4, au)) * step(mod(vRu.y, 9.0), 4.0);
          // "ed" place un marquage de rive à au = 1 - 4.5*lu : pensé pour une largeur de ROUTE (lu = 0.10/hw y reste
          // petit, le marquage tombe donc bien près du bord réel, au proche de 1). Sur une piste cyclable, bien plus
          // étroite (hw ~0.85m), lu grossit d'autant (jusqu'à ~0.12) et 4.5*lu pousse ce marquage à mi-chemin du
          // centre au lieu du bord - il se superpose alors à la ligne centrale "cen" et donne un bloc épais et flou
          // au milieu de la piste au lieu d'un simple trait fin (retour utilisateur : "traits trop épais"). On
          // désactive ce marquage de rive sur les voies étroites (lu > 0.05, soit hw < 2m - jamais une chaussée) :
          // une piste cyclable garde seulement le tiret central, comme une vraie piste peinte, sans fausse "rive".
          float isNarrow = step(0.05, lu);
          float ed = (1.0 - isNarrow) * (1.0 - smoothstep(lu * 0.7, lu * 1.4, abs(au - (1.0 - 4.5 * lu))));
          float ln = max(cen, ed) * step(0.0001, lu) * (1.0 - smoothstep(50.0, 200.0, length(vViewPosition)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.79, 0.74), ln * 0.9);`);
    };
    return m;
  };
  // photo aérienne masquée sur TOUTE la voirie à la demande (chaussées, bordures/trottoirs, et par construction tout ce
  // qui partage le même pipeline de calque layers[]/curb - voies ferrées k=9, pontons/passerelles k=7, ponts, pistes
  // cyclables k=6, voies piétonnes k=6/7/8 : rien ne les distingue d'une route normale une fois dans layers[], donc les
  // exclure toutes ensemble ici, au niveau du matériau partagé, plutôt que d'essayer d'exclure chaque classe une par une.
  const land = new THREE.Group(); land.add(curb.mesh(mk(-2, {}, false)));
  layers.forEach((L, i) => { if (L.i.length) { const m = L.mesh(mk(-3 - i, {}, false)); m.renderOrder = 1 + i; land.add(m); } });
  // talus (remblai/déblai) comblant l'écart entre chaque bord de voirie aplati (cf. MAX_CROSS_SLOPE dans Ribbons.add)
  // et le relief réel : passe par mk() pour hériter du drapé photo aérienne (aRu poussé à (0,0,0) par add(), donc
  // sans le motif procédural d'enrobé - non pertinent sur de la terre/herbe et dépendant d'un aRu réel - d'où
  // wear=false) ; recto-verso (side DoubleSide) pour rester visible quel que soit le sens de la pente, sans
  // dépendre du sens de triangulation choisi côté par côté dans add().
  if (talus.i.length) {
    const tm = mk(-2, { roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }, true, false);   // remblai (versant herbeux) : opacité réduite de 20 % à la demande
    const tmesh = talus.mesh(tm); tmesh.receiveShadow = true; tmesh.castShadow = false; land.add(tmesh);
  }
  await yield_();
  // surfaces d'eau OSM (fleuves, plans d'eau : polygones riverbank / natural=water) : la vraie largeur, pas seulement l'axe du cours d'eau
  { const pip = (x, z, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; return c; };
    const area = (R) => { let A = 0; for (let i = 0; i < R.length; i++) { const q = R[i], r = R[(i + 1) % R.length]; A += q[0] * r[1] - r[0] * q[1]; } return Math.abs(A) / 2; };
    const perim = (R) => { let Pm = 0; for (let i = 0; i < R.length; i++) { const q = R[i], r = R[(i + 1) % R.length]; Pm += Math.hypot(r[0] - q[0], r[1] - q[1]); } return Pm; };
    // voies ferrées qui traversent un plan d'eau en son milieu (loin des berges) : même rééchantillonnée, une grande nappe d'eau
    // reste UN SEUL grand triangle plat entre 2 sommets de berge distants - le calage en hauteur (waterTerrain) n'a alors aucun
    // sommet au niveau du rail pour s'appliquer, et l'eau interpolée peut redépasser le rail exactement à la traversée. Fix
    // définitif pour ce cas : on découpe littéralement un couloir (trou) dans le polygone d'eau à l'emplacement de la voie
    // ferrée - il n'y a alors plus aucune géométrie d'eau à cet endroit, donc plus aucun risque qu'elle ressorte au-dessus.
    // même traitement pour tout franchissement en pont (passerelle piétonne, route) au-dessus de l'eau : le tablier
    // ne doit jamais être recouvert. Rééchantillonné tous les <= 9 m (au lieu des sommets OSM bruts, parfois espacés
    // de plusieurs dizaines de mètres) pour que le rectangle tamponné de chaque segment tienne entièrement dans les
    // berges même sur un tracé courbe - sinon le test de confinement total ci-dessous échoue un segment sur deux et
    // laisse des triangles d'eau résiduels par-dessus le tablier (pontons, passerelles bois à lattes...).
    // le trou est découpé pour TOUT tronçon routier/piéton dont des sommets tombent dans le polygone d'eau, tagué pont
    // ou non (isBridge ne teste plus r.b) : une route qui traverse géométriquement un plan d'eau sans être taguée
    // bridge=yes dans OSM (tag manquant, ou canal réellement couvert/enterré à cet endroit comme la voûte du canal
    // Saint-Martin sous le boulevard Richard-Lenoir à Paris) ne doit de toute façon jamais se retrouver sous l'eau à
    // l'écran - le test géométrique (segment réellement à l'intérieur du polygone) suffit à ne toucher que les tronçons
    // concernés, sans rien inventer : aucun tablier n'est ajouté pour les non-ponts, seule l'eau cesse de les recouvrir.
    // pré-filtrage par boîte englobante (+30 m de marge) des plans d'eau : élargir isBridge à TOUTES les routes (k<=8, plus
    // plusieurs milliers de tronçons qu'avant, qui ne concernait que les rares tronçons tagués pont) ne doit pas remettre à
    // l'échantillonnage/au test point-in-polygon tout le réseau viaire de la ville - l'immense majorité des routes ne
    // passent jamais près d'un plan d'eau et sont écartées ici en O(1) par route, avant le rééchantillonnage coûteux.
    const waterBoxes = []; for (const ar of data.areas || []) { if (ar.t !== 'water') continue;
      const rings = Array.isArray(ar.p[0][0]) ? ar.p : [ar.p]; for (const ring of rings) { let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9; for (const p of ring) { if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<z0)z0=p[1]; if(p[1]>z1)z1=p[1]; } waterBoxes.push([x0-30,z0-30,x1+30,z1+30]); } }
    const nearWater = (r) => { if (!waterBoxes.length) return false; let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9; for (const p of r.p) { if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<z0)z0=p[1]; if(p[1]>z1)z1=p[1]; }
      for (const b of waterBoxes) if (x0 <= b[2] && x1 >= b[0] && z0 <= b[3] && z1 >= b[1]) return true; return false; };
    // rééchantillonnage <= 9 m conservé en UNE SEULE polyligne par tronçon (pas en segments isolés) : on en extrait plus
    // bas, pour chaque plan d'eau, les tronçons de cette polyligne réellement immergés (test du milieu de segment) et on
    // construit pour chacun UN SEUL polygone-ruban tamponné (dilatation le long du tracé, joints en biseau aux sommets
    // intérieurs) au lieu d'un rectangle indépendant par segment de 9 m. Un ruban par franchissement au lieu de plusieurs
    // dizaines de petits rectangles qui se chevauchent légèrement à chaque raccord : passés tels quels à la triangulation
    // polygone-à-trous, des trous voisins qui se recouvrent peuvent tromper l'algorithme (arêtes de deux trous quasi
    // confondues) et laisser un triangle d'eau résiduel PILE au raccord - observé sur le terrain (Chambéry, traversée
    // rail du Quai du 11 Novembre) malgré le débord (ex) censé garantir le recouvrement. Un seul polygone par traversée
    // supprime structurellement ce cas de figure, quelle que soit la ville.
    const railRuns = []; for (const r of data.roads || []) {
      const isRail = r.k === 9, isBridge = r.k <= 8; if ((!isRail && !isBridge) || !r.p || r.p.length < 2 || !nearWater(r)) continue;
      // largeur du trou découpé dans l'eau : doit suivre EXACTEMENT la largeur réelle du tablier construit par bridges.js
      // (r.k <= 7 depuis le fix pontons - largeur OSM taguée honorée pour un ponton/passerelle). En restant à r.k <= 6 ici,
      // un ponton large (largeur taguée) gardait un trou d'eau étroit (largeur par défaut 1,7 m) -> l'eau redébordait sur
      // les bords du tablier, exactement là où il est le plus large (le "encore sous l'eau sur les côtés" signalé).
      const hw = isRail ? CLS[9][0] / 2 + 1.6 : (r.w && r.k <= 7 ? r.w : (CLS[r.k] || [6])[0]) / 2 + 1.2;
      const pts = []; for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(L / 9));
        for (let k = 0; k < n; k++) pts.push([x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n]); }
      pts.push(r.p[r.p.length - 1]);
      railRuns.push({ pts, hw });
    }
    // distance jusqu'à la rive la plus proche depuis (ox,oz) en suivant la direction (dx,dz) (unitaire) : plus petit
    // paramètre t>0 d'intersection avec une arête du polygone R, plafonné à cap. Permet d'adapter la largeur du trou
    // LOCALEMENT (par sommet) à la forme réelle de la rive, au lieu de rétrécir tout le ruban dès qu'un seul sommet
    // est trop proche du bord - un rivage qui se resserre ponctuellement (confluence, pile de pont, quai) ne doit
    // assécher la largeur du trou qu'à cet endroit précis, pas sur toute la traversée.
    const rayDist = (ox, oz, dx, dz, R, cap) => { let best = cap;
      for (let i = 0; i < R.length; i++) { const [x1, z1] = R[i], [x2, z2] = R[(i + 1) % R.length];
        const ex2 = x2 - x1, ez2 = z2 - z1, denom = dx * ez2 - dz * ex2; if (Math.abs(denom) < 1e-9) continue;
        const aox = x1 - ox, aoz = z1 - oz, t = (aox * ez2 - aoz * ex2) / denom, u = (aox * dz - aoz * dx) / denom;
        if (t > 1e-6 && t < best && u >= -1e-6 && u <= 1 + 1e-6) best = t; }
      return best; };
    // ruban tamponné le long d'une polyligne : décalage perpendiculaire de hw de chaque côté (adapté sommet par
    // sommet via rayDist, cf. ci-dessus), normale moyennée (biseau) aux sommets intérieurs pour rester continu sur
    // un tracé courbe, débord longitudinal ex aux deux extrémités seulement (les raccords internes n'en ont plus
    // besoin, le ruban étant continu par construction). scale réduit encore la largeur en dernier recours (filet de
    // sécurité) si l'adaptation locale ne suffit malgré tout pas à faire tenir le ruban dans R.
    const railStrip = (pts, hw, ex, R, scale = 1) => { const segN = []; for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1;
        segN.push([-dz / L, dx / L, dx / L, dz / L]); }
      const left = [], right = []; for (let i = 0; i < pts.length; i++) { let nx, nz;
        if (i === 0) { nx = segN[0][0]; nz = segN[0][1]; } else if (i === pts.length - 1) { nx = segN[i - 1][0]; nz = segN[i - 1][1]; }
        else { nx = segN[i - 1][0] + segN[i][0]; nz = segN[i - 1][1] + segN[i][1]; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L; }
        let px = pts[i][0], pz = pts[i][1];
        if (i === 0) { px -= segN[0][2] * ex; pz -= segN[0][3] * ex; } if (i === pts.length - 1) { px += segN[i - 1][2] * ex; pz += segN[i - 1][3] * ex; }
        // les deux bords du ruban sont indépendants : près d'une rive, l'eau peut manquer d'un seul côté du tracé
        // (rive proche d'un côté, pleine largeur d'eau de l'autre) - le tablier réel (bridges.js) garde une largeur
        // constante, donc le bord côté eau doit rester découpé à pleine largeur même si l'autre bord doit se
        // rétrécir ; les forcer tous les deux à la même largeur réduite (le plus petit des deux) sous-découpait le
        // bord encore en pleine eau et y laissait le tablier partiellement recouvert - exactement le triangle d'eau
        // résiduel observé pile aux abords de rive (Chambéry, traversée rail Quai du 11 Novembre).
        const hwL = Math.min(hw, rayDist(px, pz, nx, nz, R, hw) * 0.92) * scale, hwR = Math.min(hw, rayDist(px, pz, -nx, -nz, R, hw) * 0.92) * scale;
        left.push([px + nx * hwL, pz + nz * hwL]); right.push([px - nx * hwR, pz - nz * hwR]); }
      return [...left, ...right.reverse()]; };
    let nW = 0;
    // 'sea' : polygone de mer/océan (construit côté PHP à partir de natural=coastline, cf. lib/osm.php) - même
    // pipeline de triangulation/trous que les lacs (les îles y sont juste des trous imbriqués comme n'importe
    // quelle île dans un lac), seul le niveau diffère plus bas (0 = niveau de la mer, jamais échantillonné sur
    // le relief : les 4 coins de l'emprise ne sont pas un échantillon fiable de l'altitude du littoral).
    for (const ar of data.areas || []) { if (ar.t !== 'water' && ar.t !== 'sea') continue;
      const rings = (ar.p || []).map((R) => R.length > 1 && R[0][0] === R[R.length - 1][0] && R[0][1] === R[R.length - 1][1] ? R.slice(0, -1) : R).filter((R) => R.length >= 3);
      const dep = rings.map((R, i) => rings.reduce((n, Q, j) => n + (j !== i && area(Q) > area(R) && pip(R[0][0], R[0][1], Q) ? 1 : 0), 0));
      rings.forEach((R, i) => { if (dep[i] % 2) return;   // anneaux extérieurs ; leurs trous = anneaux imbriqués de profondeur +1
        const islandHoles = rings.filter((Q, j) => dep[j] === dep[i] + 1 && area(Q) < area(R) && pip(Q[0][0], Q[0][1], R));
        const railHoles = [];
        // le rectangle tamponné (berge irrégulière, franchissement dont une extrémité est proche du bord de l'eau) peut légèrement
        // déborder du polygone d'eau : au lieu de rejeter le trou en bloc (ce qui laissait l'eau recouvrir tout le franchissement,
        // notamment près des rives), on le rétrécit progressivement autour du milieu du segment jusqu'à ce qu'il tienne entièrement
        // dans le polygone, plutôt que d'abandonner et de laisser l'eau visible par-dessus le pont/la passerelle à cet endroit.
        // le débord longitudinal (ex=1.5 m à chaque extrémité) est ce qui garantit le recouvrement entre les trous
        // de deux segments consécutifs (ils partagent un sommet : p2 du segment i = p1 du segment i+1) - le réduire en
        // même temps que la largeur (v113/114) désynchronise ce recouvrement d'un segment à l'autre dès qu'un seul des
        // deux doit rétrécir pour tenir dans une rive étroite, ouvrant une fente/triangle d'eau non découpée pile au
        // raccord (le "trou en dents de scie" avec de l'eau qui ressort par endroits sur le tablier, y compris aux
        // traversées de rail). On isole donc les deux causes de dépassement : la LARGEUR (rive étroite) se rétrécit
        // seule, à débord longitudinal inchangé (1.5 m fixe) pour que le recouvrement avec les segments voisins reste
        // garanti ; le débord n'est lui-même réduit qu'en tout dernier recours, si même une largeur quasi nulle ne
        // suffit pas (virage serré tout contre la berge).
        for (const { pts, hw } of railRuns) { const wet = []; for (let i = 0; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2; wet.push(pip(mx, mz, R)); }
          // sommet-sur-berge : le "milieu de segment" servant à détecter les tronçons immergés (wet[]) peut être
          // à l'intérieur du plan d'eau alors que le sommet OSM brut lui-même, à l'EXTRÉMITÉ de la traversée, tombe
          // juste à l'extérieur (le tracé continue au-delà, sur la berge) - un sommet hors polygone reste hors
          // polygone quel que soit le débord/largeur appliqué ensuite (aucun rétrécissement ne peut le ramener
          // dedans), ce qui faisait échouer TOUTE la découpe pour la traversée entière (tablier quasi entièrement
          // recouvert malgré une rivière large de ~12 m - Pont Saint-Charles, Chambéry). On ramène donc d'abord ce
          // sommet EXACTEMENT sur la rive (bissection le long du segment vers son voisin, déjà immergé par
          // construction) avant tout calcul de débord/largeur.
          const clipToShore = (inside, outside) => { if (pip(outside[0], outside[1], R)) return outside;
            let a = inside, b = outside; for (let k = 0; k < 25; k++) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (pip(m[0], m[1], R)) a = m; else b = m; }
            // un point ramené PILE sur la rive (a est le dernier point "dedans" trouvé par bissection, donc à une
            // distance quasi nulle de la frontière) échoue quand même souvent le test de confinement du ruban juste
            // après : depuis un point exactement sur la frontière, un décalage perpendiculaire au TRACÉ (pas à la
            // frontière elle-même, qui peut suivre une tout autre direction à cet endroit) retombe une fois sur deux
            // à l'extérieur, quelle que soit sa petitesse. On rentre donc un peu plus loin dans l'eau (15 % du
            // segment vers le point intérieur voisin, déjà confirmé immergé) pour disposer d'une vraie marge.
            return [a[0] * 0.85 + inside[0] * 0.15, a[1] * 0.85 + inside[1] * 0.15]; };
          let i = 0; while (i < wet.length) { if (!wet[i]) { i++; continue; } let j = i; while (j + 1 < wet.length && wet[j + 1]) j++;
            const runPts = pts.slice(i, j + 2); i = j + 1;
            if (runPts.length > 1) { runPts[0] = clipToShore(runPts[1], runPts[0]); runPts[runPts.length - 1] = clipToShore(runPts[runPts.length - 2], runPts[runPts.length - 1]); }
            // le débord (ex) et la largeur (hw) doivent être corrigés dans CET ORDRE, pas ensemble : sur une rive qui
            // s'incurve, le point de la ligne centrale À L'EXTRÉMITÉ (une fois décalé de ex vers l'extérieur du dernier
            // point réellement immergé) peut lui-même tomber hors du plan d'eau - aucun rétrécissement de la LARGEUR ne
            // peut alors réparer ça, puisqu'un décalage nul depuis un point déjà hors polygone reste hors polygone. En
            // rétrécissant les deux à la fois (v113-117), un échec dû au débord épuisait le rétrécisseur de largeur
            // avant d'atteindre le rétrécisseur de débord, qui reprenait alors avec une largeur déjà écrasée au lieu de
            // repartir pleine - un trou minuscule était cousu à la place d'un trou correctement dimensionné.
            // on corrige donc D'ABORD le débord seul (à largeur nominale) jusqu'à ce que les deux extrémités de la ligne
            // centrale retombent dans le polygone, PUIS on rétrécit la largeur à partir de zéro sur cette base saine.
            const [ax1, az1] = runPts[0], [bx1, bz1] = runPts[1], eL = Math.hypot(bx1 - ax1, bz1 - az1) || 1, eux = (bx1 - ax1) / eL, euz = (bz1 - az1) / eL;
            const [ax2, az2] = runPts[runPts.length - 2], [bx2, bz2] = runPts[runPts.length - 1], fL = Math.hypot(bx2 - ax2, bz2 - az2) || 1, fux = (bx2 - ax2) / fL, fuz = (bz2 - az2) / fL;
            let exf = 1; while (exf > 0.05 && !(pip(ax1 - eux * 1.5 * exf, az1 - euz * 1.5 * exf, R) && pip(bx2 + fux * 1.5 * exf, bz2 + fuz * 1.5 * exf, R))) exf *= 0.72;
            let s = 1, strip = railStrip(runPts, hw, 1.5 * exf, R, s);
            while (s > 0.12 && !strip.every((q) => pip(q[0], q[1], R))) { s *= 0.72; strip = railStrip(runPts, hw, 1.5 * exf, R, s); }
            if (strip.every((q) => pip(q[0], q[1], R))) railHoles.push(strip); } }
        // la triangulation (polygone à trous) peut malgré tout échouer sur un polygone d'eau très irrégulier avec de nombreux trous
        // proches/qui se chevauchent légèrement : au lieu de perdre TOUTES les découpes de franchissement d'un coup (l'eau recouvrait
        // alors tous les ponts de ce plan d'eau, pas seulement celui en cause), on retire les trous de franchissement un par un,
        // du plus récemment ajouté au plus ancien, jusqu'à ce que la triangulation réussisse.
        // bascule automatique niveau constant / niveau local, basée sur la FORME du polygone (pas sur l'écart d'altitude,
        // trop sensible au bruit du relief sous l'eau - cf. commentaire waterTerrain plus haut - qui ferait basculer à tort
        // un petit plan d'eau parfaitement plat mais avec un ou deux échantillons DEM aberrants sur sa rive). Un vrai plan
        // d'eau STATIQUE (lac, étang) est relativement compact ; un polygone d'eau qui suit au contraire un cours d'eau en
        // pente sur une longue distance (rivière/canal cartographié comme SURFACE, pas comme simple ligne - ex. La Leysse
        // à Chambéry) est nettement plus élancé/étroit pour sa surface. Mesure géométrique classique et indépendante de
        // l'échelle : le ratio isopérimétrique périmètre / racine(aire) - minimal (~3,5) pour un disque parfaitement
        // compact, croît sans borne pour une forme de plus en plus allongée/étroite, quelle que soit sa taille. Vérifié
        // sur les données réelles de plusieurs villes : les plans d'eau compacts (grand lac du Bourget compris, vu depuis
        // Chambéry) restent sous 11, les polygones qui suivent un cours d'eau sur une longue distance dépassent 20-45.
        // Seuil retenu (15) : au-delà, le niveau CONSTANT unique (v110, pensé pour un lac et qui plaçait alors la nappe
        // d'eau à plat très au-dessus ou très en dessous du terrain réel sur la majeure partie de son tracé - pontons/voies
        // ferrées "sous l'eau", nappe visiblement inclinée/"flottante" signalés) cède la place à un niveau local lissé
        // (rayon 70 m, cf. localLevel ci-dessus) qui suit la pente réelle tout en restant plat en travers.
        const A = area(R), P = perim(R), shape = A > 1 ? P / Math.sqrt(A) : 0;
        const wt = ar.t === 'sea' ? lakeWaterTerrain(-terrain.hOff) : lakeWaterTerrain(shape < 15 ? median(R.map(([x, z]) => terrain.heightAt(x, z))) : localLevel(R, 70));
        const tryTri = (holes) => { try { water.tri(R, holes, 0.03, col[10], wt); return true; } catch (e) { return false; } };
        if (tryTri([...islandHoles, ...railHoles])) nW++;
        else { let ok = false;
          for (let i = railHoles.length - 1; i >= 0 && !ok; i--) if (tryTri([...islandHoles, ...railHoles.slice(0, i)])) { ok = true; nW++; }
          if (!ok && tryTri(islandHoles)) nW++; } });
    }
    window.__waterPolys = nW; }
  // décalage de polygone nettement plus marqué que les autres couches (-1.5 avant) : glPolygonOffset ajoute
  // factor*penteMax + units*plusPetitEcartMesurable - la pente augmente fortement aux angles de vue rasants sur
  // une grande étendue d'eau (lac), donc un décalage trop faible laisse l'eau et le terrain sous-jacent entrer en
  // z-fighting précisément dans ce cas (le scintillement selon l'angle signalé). Valeur relevée à -6 : marge
  // nettement supérieure, sans détacher visiblement l'eau du rivage vue de près (le décalage reste en unités de
  // profondeur, pas en mètres réels).
  const wmat = mk(-6, { roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.85 }, false, false), wob = wmat.onBeforeCompile;
  const WU = { uT: { value: 0 }, uSkyC: { value: new THREE.Color(0.5, 0.65, 0.9) }, uSunW: { value: new THREE.Vector3(0, 1, 0) } };
  wmat.onBeforeCompile = (sh) => { wob(sh); Object.assign(sh.uniforms, WU);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform vec3 uSkyC;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { // cf. buildWaterMaterial : anti-aliasing du reflet spéculaire par élargissement du lobe (roughness),
          // nécessaire en plus du filtrage de l'amplitude de houle - sinon un grand plan d'eau (lac du Bourget)
          // scintille sur la quasi-totalité de sa surface visible, contrairement à un petit lac ou une rivière.
          vec2 fq = vXZ; float fw = max(length(dFdx(fq)), length(dFdy(fq)));
          float specAA = smoothstep(0.12, 1.6, fw);
          roughnessFactor = mix(roughnessFactor, 1.0, specAA * 0.92); }
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 q = vXZ; float t = uT;
          vec2 w1 = (texture2D(uNoise, q * 0.011 + vec2(0.13, 0.71) + t * 0.010).rg - 0.5) * 55.0;
          // repliement/moiré sur l'eau vu de loin ou en incidence rasante (horizon) : la seule distance caméra ne le détecte pas
          // (un angle rasant agrandit l'empreinte au sol d'un pixel sans éloigner la caméra) - on mesure directement cette empreinte
          // (fwidth de la position monde) et on éteint chaque octave de houle dès qu'elle approche sa longueur d'onde (critère de Nyquist).
          vec2 gdxQ = dFdx(q), gdyQ = dFdy(q); float fwQ = max(length(gdxQ), length(gdyQ));
          float fA = 1.0 - smoothstep(0.5, 1.8, fwQ * 6.1), fB = 1.0 - smoothstep(0.5, 1.8, fwQ * 2.6), fC = 1.0 - smoothstep(0.5, 1.8, fwQ * 0.85);
          vec2 w2 = (texture2D(uNoise, q * 0.07 - vec2(0.4, 0.2) + t * 0.023).rg - 0.5) * 9.0 * fB;
          vec2 qw = q + w1 + w2;
          vec2 g = vec2(sin(qw.x * 0.9 + t * 1.3 + sin(qw.y * 0.5 + t * 0.7)), cos(qw.y * 0.8 - t * 1.1 + sin(qw.x * 0.6 - t * 0.5))) * 0.5 * fC
                 + vec2(sin(qw.x * 2.3 + qw.y * 1.7 + t * 2.1), cos(qw.y * 2.9 - qw.x * 1.3 + t * 1.8)) * 0.3 * fB
                 + vec2(sin(qw.x * 6.1 - t * 3.0), cos(qw.y * 5.3 + t * 2.6)) * 0.12 * fA;
          normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.16); }`)
      .replace('#include <opaque_fragment>', `{ float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
          // véritable cause de l'"éventail" radiant sur les grandes nappes d'eau (lac du Bourget, plan d'inondation) :
          // ce n'était NI la houle, NI la géométrie, NI un défaut de précision flottante des sin/cos (pistes
          // explorées et invalidées ci-dessus) mais CETTE ligne - normalize(outgoingLight + 0.001) normalise la
          // couleur déjà ombrée comme si c'était un vecteur 3D : dès que la surface reçoit peu de lumière (cas
          // typique d'une eau immense, loin de toute source, ou de nuit), outgoingLight tend vers 0 et cette
          // normalisation devient numériquement instable (on normalise un vecteur quasi nul) - la moindre variation
          // infinitésimale de outgoingLight part dans une direction totalement différente une fois normalisée, ce qui
          // fait exploser le dot() qui suit en un bruit à haute fréquence, visible comme des bandes radiant depuis la
          // direction du reflet (confirmé en isolant chaque bloc de code injecté en direct dans le navigateur).
          // Remplacé par une simple luminance (stable même proche de 0, jamais de normalize() d'un vecteur quasi nul).
          float br = clamp(dot(outgoingLight, vec3(0.3333)) * 2.0, 0.0, 1.0);
          outgoingLight = mix(outgoingLight, uSkyC * (0.55 + 0.45 * br), clamp(0.12 + fr * 0.75, 0.0, 0.85)); }
        #include <opaque_fragment>`); };
  const rivers = water.mesh(wmat); rivers.userData.wu = WU;
  for (let i = 0; i < lamps.length; i += 3) lamps[i + 1] = terrain.heightAt(lamps[i], lamps[i + 2]) + 6.2;
  return { land, water: rivers, lamps: new Float32Array(lamps), count: roads.length };
}
