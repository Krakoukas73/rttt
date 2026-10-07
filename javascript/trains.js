import * as THREE from 'three';

// Trains 3D (locomotive + voitures) sur les voies ferrées OSM (k = 9). Vitesse 100-150 km/h, ralentissements périodiques (jamais sous ~70 km/h).
// Fenêtres allumées/éteintes la nuit (au hasard, par fenêtre), 2 phares blancs à l'avant de la locomotive, 2 feux rouges à l'arrière du dernier wagon.
export function buildTrains(data, terrain) {
  const group = new THREE.Group(); group.name = 'trains';
  // ---------------- voies : chaînage des polylignes ferroviaires en longues lignes continues
  const segs = (data.roads || []).filter((r) => r.k === 9 && r.p && r.p.length >= 2).map((r) => r.p.map((q) => [q[0], q[1]]));
  const used = new Array(segs.length).fill(false), TOL = 3.5, chains = [];
  const dirOf = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const grow = (pts, atEnd) => {
    for (;;) {
      const tail = atEnd ? pts[pts.length - 1] : pts[0], prev = atEnd ? pts[Math.max(0, pts.length - 4)] : pts[Math.min(pts.length - 1, 3)], dv = dirOf(prev, tail);
      let best = -1, bestRev = false, bestA = 1e9;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue; const s = segs[i];
        for (const rev of [false, true]) {
          const a = rev ? s[s.length - 1] : s[0], b = rev ? s[Math.max(0, s.length - 4)] : s[Math.min(s.length - 1, 3)];
          if (Math.hypot(a[0] - tail[0], a[1] - tail[1]) > TOL) continue;
          const d2 = dirOf(a, b), ang = Math.acos(Math.max(-1, Math.min(1, dv[0] * d2[0] + dv[1] * d2[1])));
          if (ang < 0.9 && ang < bestA) { bestA = ang; best = i; bestRev = rev; }
        }
      }
      if (best < 0) return;
      used[best] = true; const s = segs[best].slice(); if (bestRev) s.reverse();
      if (atEnd) pts.push(...s.slice(1)); else pts.unshift(...s.reverse().slice(0, -1));
    }
  };
  for (let i = 0; i < segs.length; i++) { if (used[i]) continue; used[i] = true; const pts = segs[i].slice(); grow(pts, true); grow(pts, false); chains.push(pts); }
  // rééchantillonnage tous les 2 m
  const DS = 2, tracks = [];
  for (const pts of chains) {
    const X = [], Z = []; let acc = 0, lx = pts[0][0], lz = pts[0][1]; X.push(lx); Z.push(lz);
    for (let i = 1; i < pts.length; i++) {
      let sx = pts[i - 1][0], sz = pts[i - 1][1]; const ex = pts[i][0], ez = pts[i][1], L = Math.hypot(ex - sx, ez - sz); if (L < 1e-6) continue;
      let d = DS - acc; while (d <= L) { const t = d / L; X.push(sx + (ex - sx) * t); Z.push(sz + (ez - sz) * t); d += DS; } acc = L - (d - DS);
    }
    const n = X.length, len = (n - 1) * DS; if (len < 350) continue;
    const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = terrain.heightAt(X[i], Z[i]) + 0.32;
    tracks.push({ X, Z, Y, n, L: len });
  }
  window.__rails = { chains: tracks.length, len: Math.round(tracks.reduce((a, t) => a + t.L, 0)) };
  const at = (tr, s) => { const f = Math.max(0, Math.min(tr.n - 1.001, s / DS)), i = f | 0, t = f - i; return [tr.X[i] + (tr.X[i + 1] - tr.X[i]) * t, tr.Y[i] + (tr.Y[i + 1] - tr.Y[i]) * t, tr.Z[i] + (tr.Z[i + 1] - tr.Z[i]) * t]; };

  // ---------------- modèles
  const WID = 3.0;
  const mk = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr.P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(arr.C, 3)); g.setIndex(arr.I); g.computeVertexNormals(); return g; };
  const newB = () => ({ P: [], C: [], I: [] });
  const box = (B, cx, cy, cz, sx, sy, sz, col) => {   // parallélépipède (sans normales partagées : sommets dupliqués par face)
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const F = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]];
    for (const f of F) { const b0 = B.P.length / 3; for (const p of f) { B.P.push(...p); B.C.push(...col); } B.I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); }
  };
  const taper = (B, x0, x1, y0, y1, wBase, wTop, yTopFront, col) => {   // nez de locomotive : prisme dont la face avant est réduite et plus basse
    const V = [[x0, y0, -wBase / 2], [x0, y0, wBase / 2], [x0, y1, wBase / 2], [x0, y1, -wBase / 2], [x1, y0, -wBase / 2 * 0.86], [x1, y0, wBase / 2 * 0.86], [x1, yTopFront, wTop / 2], [x1, yTopFront, -wTop / 2]];
    const q = [[1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [5, 1, 0, 4], [4, 7, 6, 5], [0, 4, 5, 1]];
    for (const f of q) { const b0 = B.P.length / 3; for (const k of f) { B.P.push(...V[k]); B.C.push(...col); } B.I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); }
  };
  const taperAero = (B, x0, x1, yBase, yRoof, wBase, wTip, yTip, col, rear, n = 7) => {   // nez profilé multi-segments (motrices TGV) : largeur et hauteur du toit suivent une courbe d'accélération -> silhouette bien plus effilée/aérodynamique qu'un simple biseau ; rear inverse le sens de bouclage (motrice de queue)
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, wE = Math.pow(t, 0.72), hE = Math.pow(t, 1.3);
      pts.push({ x: x0 + (x1 - x0) * t, w: wBase + (wTip - wBase) * wE, yTop: yRoof + (yTip - yRoof) * hE, yBot: yBase + yBase * 0.06 * wE });
    }
    const quad = (V, f) => { const b0 = B.P.length / 3; for (const k of f) { B.P.push(...V[k]); B.C.push(...col); } if (rear) B.I.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); else B.I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); };
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      const V = [[a.x, a.yBot, -a.w / 2], [a.x, a.yBot, a.w / 2], [a.x, a.yTop, a.w / 2], [a.x, a.yTop, -a.w / 2], [b.x, b.yBot, -b.w / 2], [b.x, b.yBot, b.w / 2], [b.x, b.yTop, b.w / 2], [b.x, b.yTop, -b.w / 2]];
      quad(V, [1, 5, 6, 2]); quad(V, [4, 0, 3, 7]); quad(V, [3, 2, 6, 7]); quad(V, [0, 4, 5, 1]);
    }
    const p = pts[n], Vc = [[p.x, p.yBot, -p.w / 2], [p.x, p.yBot, p.w / 2], [p.x, p.yTop, p.w / 2], [p.x, p.yTop, -p.w / 2]];
    quad(Vc, [0, 1, 2, 3]);
  };
  const DARK = [0.07, 0.075, 0.085], GREY = [0.55, 0.57, 0.6], GLASS = [0.05, 0.07, 0.1];
  const bogies = (B, L) => { for (const x of [-L * 0.32, L * 0.32]) { box(B, x, 0.62, 0, 3.4, 0.5, 2.6, DARK); for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(B, x + dx * 0.9, 0.42, dz * 1.15, 0.9, 0.84, 0.16, [0.2, 0.2, 0.22]); } box(B, 0, 0.98, 0, L * 0.98, 0.5, 2.2, [0.09, 0.09, 0.1]); };
  // voiture (silhouette « TER/TGV » simplifiée) : caisse, bande de couleur, toit, portes ; fenêtres à part (allumables)
  // chaque entrée : [r,g,b caisse, r,g,b bande basse] - le toit (caisse * 0.9) et la climatisation/bogies (GREY/DARK, constants ci-dessous)
  // apportent naturellement une 3e teinte grise à toutes les livrées, y compris la TGV (dernière entrée : caisse orange, bande blanche).
  const PAL = [[0.90, 0.91, 0.93, 0.09, 0.22, 0.52], [0.90, 0.91, 0.93, 0.62, 0.08, 0.10], [0.85, 0.87, 0.9, 0.05, 0.40, 0.30], [0.16, 0.30, 0.55, 0.85, 0.85, 0.87], [0.78, 0.78, 0.8, 0.85, 0.5, 0.05],
    [0.82, 0.33, 0.06, 0.15, 0.16, 0.18]];   // TGV Sud-Est : r,g,b = orange (bandeaux haut/bas + nez), r2,g2,b2 = gris anthracite (large bande fenêtres + toit) - fidèle à la livrée d'origine (orange/gris anthracite/liseré blanc)
  const carGeo = (L, pal, isTGV) => {
    const B = newB(), W = newB(); const [r, g, b, r2, g2, b2] = pal;
    bogies(B, L);
    if (isTGV) {   // livrée TGV Sud-Est fidèle : bas de caisse orange, liseré blanc, large bande fenêtres gris anthracite, bandeau haut orange sous le toit, toit gris foncé
      box(B, 0, 1.30, 0, L, 0.70, WID, [r, g, b]);                                    // bas de caisse orange
      box(B, 0, 1.72, 0, L + 0.02, 0.14, WID + 0.03, [0.90, 0.88, 0.84]);              // liseré blanc
      box(B, 0, 2.405, 0, L, 1.23, WID, [r2, g2, b2]);                                // bande fenêtres gris anthracite
      box(B, 0, 3.13, 0, L * 0.98, 0.22, WID * 0.94, [r, g, b]);                       // bandeau haut orange sous le toit
      box(B, 0, 3.39, 0, L * 0.98, 0.3, WID * 0.86, [r2 * 0.82, g2 * 0.82, b2 * 0.82]); // pan de toit gris foncé
      box(B, 0, 3.66, 0, L * 0.8, 0.22, WID * 0.5, GREY);                             // climatisation
    } else {
      box(B, 0, 2.1, 0, L, 2.3, WID, [r, g, b]);                                   // caisse
      box(B, 0, 1.55, 0, L + 0.02, 0.5, WID + 0.03, [r2, g2, b2]);                  // bande basse
      box(B, 0, 3.4, 0, L * 0.98, 0.3, WID * 0.86, [r * 0.9, g * 0.9, b * 0.9]);   // pan de toit
      box(B, 0, 3.66, 0, L * 0.8, 0.22, WID * 0.5, GREY);                          // climatisation
    }
    const nW = Math.max(6, Math.round(L / 3)), pitch = (L - 4) / nW;
    for (let i = 0; i < nW; i++) { const x = -L / 2 + 2 + pitch * (i + 0.5); for (const s of [-1, 1]) box(W, x, 2.55, s * (WID / 2 + 0.03), pitch * 0.62, 0.95, 0.05, GLASS); }
    for (const s of [-1, 1]) for (const x of [-L * 0.5 + 1.4, L * 0.5 - 1.4]) box(B, x, 2.0, s * (WID / 2 + 0.02), 1.1, 1.9, 0.05, [0.25, 0.27, 0.3]);   // portes
    return { body: mk(B), win: mk(W), nW: W.P.length / 3 };
  };
  const locoGeo = (L, pal, isTGV, rear) => {
    const B = newB(), W = newB(), [r, g, b, r2, g2, b2] = pal, sgn = rear ? -1 : 1, sx = (v) => v * sgn; bogies(B, L);
    if (isTGV) {   // motrice TGV réversible, livrée Sud-Est fidèle : bas de caisse orange, liseré blanc, bande fenêtres gris anthracite (mêmes bandes que les voitures), nez allongé (9 m) arrondi et peu effilé (pas un biseau pointu) ; rear=true -> géométrie inversée (motrice de queue, nez vers l'arrière)
      const bodyLen = L - 9;
      box(B, sx(-1.5), 1.30, 0, bodyLen, 0.70, WID, [r, g, b]);                        // bas de caisse orange
      box(B, sx(-1.5), 1.72, 0, bodyLen + 0.02, 0.14, WID + 0.03, [0.90, 0.88, 0.84]);  // liseré blanc
      box(B, sx(-1.5), 2.405, 0, bodyLen, 1.23, WID, [r2, g2, b2]);                     // bande fenêtres gris anthracite
      box(B, sx(-1.5), 3.185, 0, bodyLen * 0.98, 0.33, WID * 0.94, [r, g, b]);          // bandeau haut orange sous le toit
      taperAero(B, sx(L / 2 - 9), sx(L / 2), 0.6, 3.2, WID, WID * 0.5, 1.85, [r, g, b], rear, 8);   // nez orange, profil arrondi et bas peu effilé
      box(B, sx(L / 2 - 3.4), 2.75, 0, 0.12, 0.95, WID * 0.6, GLASS); box(B, sx(L / 2 - 1.5), 2.35, 0, 0.1, 0.85, WID * 0.5, GLASS);   // pare-brise incliné, reculé sur le nez allongé
      box(B, sx(-1.5), 3.5, 0, bodyLen - 0.5, 0.3, WID * 0.8, [r2 * 0.82, g2 * 0.82, b2 * 0.82]);   // toit gris foncé
      box(B, sx(-3), 3.85, 0, 2.2, 0.16, 1.9, DARK); box(B, sx(-3), 4.35, 0, 0.12, 0.9, 0.12, DARK); box(B, sx(-3), 4.8, 0, 0.12, 0.12, 2.0, DARK);   // pantographe
      box(B, sx(-L / 2 + 2.9), 2.6, 0, 0.1, 1.9, WID * 0.8, [0.25, 0.27, 0.3]);
      for (let i = 0; i < 2; i++) for (const s of [-1, 1]) box(W, sx(-4.2 + i * 4.4), 2.55, s * (WID / 2 + 0.03), 1.6, 0.9, 0.05, GLASS);
      for (const s of [-1, 1]) box(W, sx(L / 2 - 5.2), 2.85, s * (WID / 2 * 0.6 + 0.02), 1.0, 0.7, 0.05, GLASS);
    } else {
      box(B, -1.5, 2.1, 0, L - 5.5, 2.5, WID, [r, g, b]); box(B, -1.5, 1.45, 0, L - 5.5 + 0.02, 0.6, WID + 0.03, [r2, g2, b2]);
      taper(B, L / 2 - 7, L / 2, 0.85, 3.35, WID, WID * 0.8, 2.75, [r, g, b]);
      box(B, L / 2 - 2.7, 2.98, 0, 0.12, 0.85, WID * 0.7, GLASS); box(B, L / 2 - 0.6, 2.55, 0, 0.1, 0.9, WID * 0.74, GLASS);   // pare-brise
      box(B, -1.5, 3.5, 0, L - 6, 0.3, WID * 0.8, [r * 0.9, g * 0.9, b * 0.9]);
      box(B, -3, 3.85, 0, 2.2, 0.16, 1.9, DARK); box(B, -3, 4.35, 0, 0.12, 0.9, 0.12, DARK); box(B, -3, 4.8, 0, 0.12, 0.12, 2.0, DARK);   // pantographe
      box(B, -L / 2 + 2.9, 2.6, 0, 0.1, 1.9, WID * 0.8, [0.25, 0.27, 0.3]);
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) box(W, -3.4 + i * 3.8, 2.55, s * (WID / 2 + 0.03), 1.6, 0.9, 0.05, GLASS);
      for (const s of [-1, 1]) box(W, L / 2 - 3.6, 2.9, s * (WID / 2 * 0.86 + 0.02), 1.2, 0.8, 0.05, GLASS);
    }
    return { body: mk(B), win: mk(W), nW: W.P.length / 3 };
  };
  const bodyMats = PAL.map((p) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }));
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const lampGeo = new THREE.BoxGeometry(0.16, 0.34, 0.5);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), tailMat = new THREE.MeshBasicMaterial({ color: 0xff1a08 });
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; { const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }
  const glowTex = new THREE.CanvasTexture(cv);
  const halo = (col, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.scale.set(size, size, 1); return s; };

  // ---------------- convois
  const trains = [], rnd = (() => { let s = 91237; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const totalL = tracks.reduce((a, t) => a + t.L, 0), budget = Math.max(6, Math.min(48, Math.round(totalL / 260)));   // nombre volontairement exagéré
  let night = 0, lit = false;
  const geoCache = new Map();
  const getGeo = (kind, L, pi, rear) => { const k = kind + L + ':' + pi + (rear ? 'R' : ''); let g = geoCache.get(k); if (!g) geoCache.set(k, g = kind === 'loco' ? locoGeo(L, PAL[pi], pi === PAL.length - 1, !!rear) : carGeo(L, PAL[pi], pi === PAL.length - 1)); return g; };
  tracks.forEach((tr, ti) => {
    tr.v = (100 + rnd() * 50) / 3.6; tr.T = 40 + rnd() * 60; tr.ph = rnd() * 6.283; tr.pos = rnd() * tr.L; tr.trains = [];
    const share = Math.max(1, Math.round(budget * tr.L / totalL)); let maxLen = 0;
    const list = [];
    for (let k = 0; k < share; k++) {
      const nCars = 3 + Math.floor(rnd() * 5), pi = Math.floor(rnd() * PAL.length), isTGV = pi === PAL.length - 1, cars = [{ kind: 'loco', L: 19 }]; for (let c = 0; c < nCars; c++) cars.push({ kind: 'car', L: c % 3 === 2 ? 20 : 25 });
      if (isTGV) cars[cars.length - 1] = { kind: 'loco', L: 19, rear: true };   // rame réversible : motrice profilée aussi en queue de train
      const len = cars.reduce((a, c) => a + c.L, 0) + cars.length * 0.8; maxLen = Math.max(maxLen, len); list.push({ cars, pi, len });
    }
    tr.cyc = tr.L + maxLen + 120; list.length = Math.max(1, Math.min(list.length, Math.floor(tr.cyc / (maxLen + 90))));   // pas de chevauchement sur une même voie
    list.forEach((tn, k) => {
      const T = { tr, off: tr.cyc * (k + rnd() * 0.3) / list.length, len: tn.len, cars: [], pLit: 0.55 + rnd() * 0.45, ridden: false, px: { isTrain: true, x: 1e9, y: 0, z: 0, hx: 1, hz: 0, th: 0, pitch: 0, len: 19, sc: 1, v: 0 } };
      tn.cars.forEach((c, ci) => {
        const g = getGeo(c.kind, c.L, tn.pi, c.rear), body = new THREE.Mesh(g.body, bodyMats[tn.pi]), wg = g.win.clone(), col = wg.getAttribute('color'), wm = new THREE.Mesh(wg, winMat);
        const node = new THREE.Group(); node.add(body); node.add(wm); node.visible = false;
        const lit0 = []; for (let w = 0; w < g.nW / 24; w++) lit0.push(rnd() < T.pLit);   // 24 sommets par parallélépipède
        const car = { node, L: c.L, wg, col, lit0, nW: g.nW / 24, nose: null, tail: null, halos: [] };
        if (ci === 0) for (const s of [-1, 1]) { const l = new THREE.Mesh(lampGeo, headMat); l.position.set(c.L / 2 + 0.02, 1.35, s * 0.95); node.add(l); const h = halo(0xffe9c0, 3.6); h.position.set(c.L / 2 + 0.8, 1.35, s * 0.95); node.add(h); car.halos.push(h); }
        if (ci === tn.cars.length - 1) for (const s of [-1, 1]) { const l = new THREE.Mesh(lampGeo, tailMat); l.position.set(-c.L / 2 - 0.02, 1.6, s * 0.95); node.add(l); const h = halo(0xff2010, 2.2); h.position.set(-c.L / 2 - 0.6, 1.6, s * 0.95); node.add(h); car.halos.push(h); }
        group.add(node); T.cars.push(car);
      });
      tr.trains.push(T); trains.push(T);
    });
  });
  const paintWindows = () => {
    for (const T of trains) for (const c of T.cars) { const a = c.col.array; for (let w = 0; w < c.nW; w++) { const on = lit && c.lit0[w]; for (let v = 0; v < 24; v++) { const j = (w * 24 + v) * 3; if (on) { a[j] = 1; a[j + 1] = 0.82; a[j + 2] = 0.45; } else { a[j] = 0.05; a[j + 1] = 0.07; a[j + 2] = 0.1; } } } c.col.needsUpdate = true; }
  };
  paintWindows();
  let time = 0;
  const update = (dt) => {
    dt = Math.min(dt, 0.1); time += dt;
    for (const tr of tracks) {
      const f = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(6.283 * time / tr.T + tr.ph)); tr.pos = (tr.pos + tr.v * f * dt) % tr.cyc;
      for (const T of tr.trains) {
        let head = (tr.pos + T.off) % tr.cyc, s = head;
        T.cars.forEach((c, ci) => {
          const sf = s, sr = s - c.L; s -= c.L + 0.8;
          if (sr < 0 || sf > tr.L) { c.node.visible = false; return; }
          const pf = at(tr, Math.min(tr.L, sf - 2)), pr = at(tr, Math.max(0, sr + 2)), dx = pf[0] - pr[0], dz = pf[2] - pr[2], hl = Math.hypot(dx, dz) || 1;
          c.node.visible = true; c.node.position.set((pf[0] + pr[0]) / 2, (pf[1] + pr[1]) / 2, (pf[2] + pr[2]) / 2);
          c.node.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(pf[1] - pr[1], hl), 'YZX');
          if (ci === 0) { const p = T.px; p.x = c.node.position.x; p.y = c.node.position.y; p.z = c.node.position.z; p.hx = dx / hl; p.hz = dz / hl; p.th = Math.atan2(-dz, dx); p.pitch = Math.atan2(pf[1] - pr[1], hl); p.v = tr.v * f; if (T.ridden) c.node.visible = false; }
        });
      }
    }
  };
  const pick = (o, d, maxD = 800) => {   // locomotives cliquables (mêmes conventions que les véhicules)
    let best = null, bt = 1e9;
    for (const T of trains) { const p = T.px; if (p.x === 1e9) continue;
      const rx = p.x - o.x, ry = p.y + 1.8 - o.y, rz = p.z - o.z, t = rx * d.x + ry * d.y + rz * d.z; if (t < 1 || t > maxD) continue;
      const px = rx - d.x * t, py = ry - d.y * t, pz = rz - d.z * t, tol = Math.max(3.5, t * 0.011, 9);
      if (px * px + py * py + pz * pz < tol * tol && t < bt) { bt = t; best = p; } }
    return best ? { p: best, t: bt } : null;
  };
  const setRide = (p) => { for (const T of trains) T.ridden = T.px === p; };
  const setNight = (n) => {
    night = n; const on = n > 0.4; if (on !== lit) { lit = on; paintWindows(); }
    for (const T of trains) for (const c of T.cars) for (const h of c.halos) h.material.opacity = Math.min(1, n * 1.4) * 0.9;
  };
  return { group, update, setNight, pick, setRide, tracks: () => tracks.length, count: () => trains.length };
}
