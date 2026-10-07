import * as THREE from 'three';

// Enseignes lumineuses et vitrines éclairées : un panneau coloré (selon la catégorie) au-dessus d'une vitrine, plaqués sur la façade du bâtiment le plus proche du commerce,
// sur l'arête qui regarde la rue. Allumés la nuit, discrets le jour.
const WARM = [1, 0.84, 0.58], AMB = [1, 0.66, 0.3];
// palette sobre : blanc chaud et ambre par défaut ; seules quelques catégories gardent une teinte (pharmacie vert, banque bleu, tabac rouge)
const CAT = [[/pharma/i, [0.25, 0.85, 0.5]], [/bar|caf[eé]|pub|brasserie|restaur|pizz|burger|kebab|snack|boulanger|p[aâ]tiss/i, AMB], [/banque|assur|bank/i, [0.45, 0.65, 1]],
  [/tabac|presse|journal/i, [0.95, 0.3, 0.25]], [/coiff|beaut[eé]|esth|supermarch|alimentation|primeur|boucher|h[oô]tel|poste/i, WARM]];
const PAL = [WARM, WARM, AMB, [0.96, 0.9, 0.78]];

export function buildSigns(data, terrain) {
  const group = new THREE.Group(); group.name = 'signs';
  const B = data.buildings || [], BC = 40, bg = new Map(), K = (i, j) => i * 100003 + j;
  B.forEach((b, bi) => { if (!b.p || b.p.length < 3 || (b.l !== undefined && b.l < 0)) return; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let cx = Math.floor((x0 - 8) / BC); cx <= Math.floor((x1 + 8) / BC); cx++) for (let cz = Math.floor((z0 - 8) / BC); cz <= Math.floor((z1 + 8) / BC); cz++) { const k = K(cx, cz); let a = bg.get(k); if (!a) bg.set(k, a = []); a.push(bi); } });
  const roads = (data.roads || []).filter((r) => r.k <= 6 && r.p && r.p.length >= 2), RG = new Map(), RC = 40;
  for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], seg = [x1, z1, x2, z2];
    for (let cx = Math.floor((Math.min(x1, x2) - 16) / RC); cx <= Math.floor((Math.max(x1, x2) + 16) / RC); cx++) for (let cz = Math.floor((Math.min(z1, z2) - 16) / RC); cz <= Math.floor((Math.max(z1, z2) + 16) / RC); cz++) { const k = K(cx, cz); let a = RG.get(k); if (!a) RG.set(k, a = []); a.push(seg); } }
  const roadDist = (x, z) => { let m = 99; for (const [x1, z1, x2, z2] of RG.get(K(Math.floor(x / RC), Math.floor(z / RC))) || []) { const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)); m = Math.min(m, Math.hypot(x1 + dx * t - x, z1 + dz * t - z)); } return m; };
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const S = [];   // [cx, cz, tx, tz (le long de la façade), nx, nz (normale sortante), w, r, g, b, h0]
  const used = new Set();
  for (const q of data.shops || []) { if (q.r > 2 || !q.n) continue;
    let best = null;
    for (const bi of bg.get(K(Math.floor(q.x / BC), Math.floor(q.z / BC))) || []) { const b = B[bi], P = b.p; const inside = inPoly(q.x, q.z, P);
      for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz); if (l < 3.5) continue;
        const t = Math.max(0, Math.min(1, ((q.x - a[0]) * dx + (q.z - a[1]) * dz) / (l * l))), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(q.x - px, q.z - pz); if (d > 14) continue;
        let nx = dz / l, nz = -dx / l; const mx = px + nx * 0.6, mz = pz + nz * 0.6; if (inPoly(mx, mz, P)) { nx = -nx; nz = -nz; }   // normale sortante
        const rd = roadDist(px + nx * 4, pz + nz * 4), score = d + rd * 0.35 - (inside ? 3 : 0) + (rd < 14 ? 0 : 20); if (!best || score < best.score) best = { score, px, pz, nx, nz, tx: dx / l, tz: dz / l, l, t, bi }; } }
    if (!best || best.score > 22) continue;
    const key = Math.round(best.px / 2) + ',' + Math.round(best.pz / 2); if (used.has(key)) continue; used.add(key);
    const w = Math.max(1.4, Math.min(5.0, q.n.length * 0.26)), half = w / 2, cl = Math.max(half + 0.2, Math.min(best.l * 1, 0)) || 0;
    const s0 = best.t * best.l, sc = Math.max(half + 0.3, Math.min(best.l - half - 0.3, s0)); if (best.l < w + 0.6) continue;
    const cx = best.px + best.tx * (sc - s0), cz = best.pz + best.tz * (sc - s0);
    let col = null; for (const [rx, c] of CAT) if (rx.test((q.c || '') + ' ' + q.n)) { col = c; break; }
    if (!col) { let h = 0; for (let i = 0; i < q.n.length; i++) h = (h * 31 + q.n.charCodeAt(i)) >>> 0; col = PAL[h % PAL.length]; }
    S.push([cx, cz, best.tx, best.tz, best.nx, best.nz, w, col[0], col[1], col[2], best.bi]);
  }
  window.__signs = S.length; window.__signS = S;
  if (!S.length) return { group, setNight() {}, count: 0 };
  const N = S.length;
  // enseigne « drapeau » (perpendiculaire à la façade, 0,9 m de saillie) calée sur la bande entre le haut des fenêtres du rez-de-chaussée et le bas de celles de l'étage ;
  // à la lumière du soir : halo autour de l'enseigne et tache de lumière chaude sur le trottoir (vitrines éclairées)
  const mergeG = (gs) => { let P = [], Nn = [], I = [], o = 0; for (const g0 of gs) { const g = g0.index ? g0 : g0; const p = g.attributes.position.array, n = g.attributes.normal.array; P.push(...p); Nn.push(...n); for (const i of g.index.array) I.push(i + o); o += p.length / 3; } const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); r.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); r.setIndex(I); return r; };
  const arrowSh = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.15, -0.5), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.15, 0.5), new THREE.Vector2(-0.5, 0.5)]);
  const arrowG = new THREE.ExtrudeGeometry(arrowSh, { depth: 1, bevelEnabled: false }); arrowG.translate(0, 0, -0.5);
  const SH = [   // formes d'enseignes : [géométrie, sx (saillie), sy, sz]
    [new THREE.BoxGeometry(1, 1, 1), 0.9, 0.58, null],                                   // 0 drapeau rectangulaire
    [new THREE.CylinderGeometry(0.5, 0.5, 1, 22).rotateX(Math.PI / 2), 0.75, 0.75, 0.16], // 1 disque
    [new THREE.CylinderGeometry(0.5, 0.5, 1, 6).rotateX(Math.PI / 2), 0.72, 0.72, 0.18],  // 2 hexagone
    [new THREE.BoxGeometry(1, 1, 1), 0.5, 1.35, 0.2],                                     // 3 oriflamme vertical
    [mergeG([new THREE.BoxGeometry(1, 0.34, 1), new THREE.BoxGeometry(0.34, 1, 1)]), 0.85, 0.85, 0.2],   // 4 croix (pharmacie)
    [arrowG, 0.95, 0.55, 0.2],                                                            // 5 flèche
    [new THREE.BoxGeometry(1, 1, 1), 0.22, 0.6, 'w'],                                     // 6 bandeau à plat sur la façade
  ];
  const WT = [0, 0, 0, 1, 1, 2, 3, 3, 5, 5, 6, 6, 6];
  const shp = S.map((q, i) => { const h = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1; const [r, g, b] = [q[7], q[8], q[9]]; if (g > r * 1.25 && g > b * 1.25 && h < 0.7) return 4; return WT[Math.floor(h * WT.length)]; });
  const signM = new THREE.MeshBasicMaterial({ color: 0x777777, toneMapped: false });
  const cnt = SH.map(() => 0); shp.forEach((k) => cnt[k]++);
  const sMesh = SH.map((d, k) => { const m = new THREE.InstancedMesh(d[0], signM, Math.max(1, cnt[k])); m.count = 0; m.frustumCulled = false; return m; });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), Cc = new THREE.Color(), basis = new THREE.Matrix4();
  const gp = new Float32Array(N * 3), gc = new Float32Array(N * 3);
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; { const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }
  const tex = new THREE.CanvasTexture(cv);
  const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 128; { const c = cv2.getContext('2d'), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); for (let q = 0; q <= 10; q++) { const t = q / 10; gr.addColorStop(t, 'rgba(255,255,255,' + (0.8 * Math.exp(-t * t * 5.5) * (1 - t * t * t * t)).toFixed(3) + ')'); } c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
  const poolTex = new THREE.CanvasTexture(cv2);   // halo très doux (chute progressive) pour la lumière colorée au sol
  const poolM = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -30, polygonOffsetUnits: -30, fog: false });
  const pools = new THREE.InstancedMesh(poolGeo, poolM, N); pools.renderOrder = 19; pools.frustumCulled = false;
  S.forEach(([x, z, tx, tz, nx, nz, w, r, g, b, bi], i) => {
    const bd = B[bi], gy = terrain.heightAt(x, z), yc = bd && bd.gBase !== undefined ? bd.gBase + bd.fH * 1.0 + 0.0 : gy + 3.15;
    basis.makeBasis(new THREE.Vector3(nx, 0, nz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-nz, 0, nx)); Q.setFromRotationMatrix(basis);
    const k = shp[i], d = SH[k], sx = d[1], sy = d[2], sz = d[3] === null ? Math.min(0.9, 0.35 + w * 0.12) : d[3] === 'w' ? w * 0.95 : d[3], cx = x + nx * (0.04 + sx / 2), cz = z + nz * (0.04 + sx / 2);
    V.set(cx, yc, cz); Sc.set(sx, sy, sz); M.compose(V, Q, Sc); const sm = sMesh[k]; sm.setMatrixAt(sm.count, M); sm.setColorAt(sm.count, Cc.setRGB(r, g, b)); sm.count++;
    gp[i * 3] = cx + nx * 0.5; gp[i * 3 + 1] = yc; gp[i * 3 + 2] = cz + nz * 0.5; gc[i * 3] = r; gc[i * 3 + 1] = g; gc[i * 3 + 2] = b;
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-tz, tx));   // tache de lumière alignée sur la façade
    V.set(x + nx * 4.6, gy + 0.6, z + nz * 4.6); Sc.set(Math.max(15, w * 3.6), 1, 16); M.compose(V, q2, Sc); pools.setMatrixAt(i, M);
    const mx = Math.max(r, g, b, 0.01); pools.setColorAt(i, Cc.setRGB(r / mx, g / mx, b / mx));   // tache de la couleur de l'enseigne (normalisée : teinte franche)
  });
  for (const m of sMesh) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } pools.instanceMatrix.needsUpdate = true; if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const glowM = new THREE.PointsMaterial({ size: 2.6, map: tex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.Points(gg, glowM); glow.frustumCulled = false;
  group.add(...sMesh);   // halos (points lumineux + taches au sol) retirés à la demande
  const dayS = new THREE.Color(0.55, 0.55, 0.58), nightS = new THREE.Color(1.25, 1.25, 1.25);
  const setNight = (n) => { const k = Math.min(1, n * 1.3); signM.color.copy(dayS).lerp(nightS, k); glowM.opacity = k * 0.55; poolM.opacity = k * 0.15; ; };
  setNight(0);
  return { group, setNight, count: N };
}
