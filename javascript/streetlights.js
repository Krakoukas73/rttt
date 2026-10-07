import * as THREE from 'three';

// Lampadaires 3D : le long des trottoirs des autoroutes/VRU (k0) et avenues principales (k1, k2), autour des places (voies nommées « Place … »),
// des églises et des bâtiments officiels. La nuit : lumière diffuse (halo doux + tache lumineuse au sol), volontairement plus faible que fenêtres et phares.
const WIDTH = [14, 10.5, 8.5, 7.2, 5.6, 3.4, 6, 1.7];
const OFFICIAL = new Set(['church', 'cathedral', 'chapel', 'civic', 'government', 'public', 'townhall', 'castle', 'palace', 'courthouse', 'prefecture']);

export function buildStreetlights(data, terrain) {
  const group = new THREE.Group(); group.name = 'streetlights';
  const roads = (data.roads || []).filter((r) => r.p && r.p.length >= 2 && (r.k <= 4 || r.k === 6));
  const hw = (r) => (r.w && r.k <= 6 ? r.w : WIDTH[r.k]) / 2;
  // ---- index spatial des routes (pour ne jamais poser un lampadaire sur une chaussée ou dans un carrefour)
  const CS = 40, sg = new Map();
  roads.forEach((r, ri) => { const h = hw(r) + 1.2;
    for (let i = 0; i < r.p.length - 1; i++) { const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], s = [x1, z1, x2, z2, h, ri];
      for (let cx = Math.floor((Math.min(x1, x2) - h) / CS); cx <= Math.floor((Math.max(x1, x2) + h) / CS); cx++) for (let cz = Math.floor((Math.min(z1, z2) - h) / CS); cz <= Math.floor((Math.max(z1, z2) + h) / CS); cz++) { const k = cx * 100003 + cz; let a = sg.get(k); if (!a) sg.set(k, a = []); a.push(s); } } });
  const onRoad = (x, z, own) => { for (const [x1, z1, x2, z2, h, ri] of sg.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)) || []) {
    if (ri === own) continue; const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)); if (Math.hypot(x1 + dx * t - x, z1 + dz * t - z) < h) return true; } return false; };
  // ---- bâtiments : index pour éviter de poser un lampadaire à l'intérieur
  const B = data.buildings || [], bg = new Map(), BC = 60;
  B.forEach((b, bi) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } b.bb = [x0, z0, x1, z1];
    for (let cx = Math.floor(x0 / BC); cx <= Math.floor(x1 / BC); cx++) for (let cz = Math.floor(z0 / BC); cz <= Math.floor(z1 / BC); cz++) { const k = cx * 100003 + cz; let a = bg.get(k); if (!a) bg.set(k, a = []); a.push(bi); } });
  const pip = (x, z, ring) => { let inn = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / ((b[1] - a[1]) || 1e-9) + a[0]) inn = !inn; } return inn; };
  const inBuilding = (x, z) => { for (const bi of bg.get(Math.floor(x / BC) * 100003 + Math.floor(z / BC)) || []) { const b = B[bi], bb = b.bb; if (x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && pip(x, z, b.p)) return true; } return false; };
  // ---- placement
  const L = [], seen = new Map(), SC = 8;   // [x, z, dirx, dirz] (direction du bras : vers la chaussée)
  const free = (x, z) => { const cx = Math.floor(x / SC), cz = Math.floor(z / SC); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of seen.get((cx + a) * 100003 + cz + b) || []) if (Math.hypot(q[0] - x, q[1] - z) < 8) return false; return true; };
  const add = (x, z, dx, dz) => { const k = Math.floor(x / SC) * 100003 + Math.floor(z / SC); let a = seen.get(k); if (!a) seen.set(k, a = []); a.push([x, z]); L.push([x, z, dx, dz]); };
  // densité locale de bâti (bâtiments dans 3×3 cellules de 100 m autour de la voie) : au-delà du seuil (~1000 bât./km², quartiers de grande ville), les rues k3/k4 sont aussi éclairées
  const DG = new Map(); for (const b of B) { if (!b.bb) continue; const k = Math.floor((b.bb[0] + b.bb[2]) / 200) * 100003 + Math.floor((b.bb[1] + b.bb[3]) / 200); DG.set(k, (DG.get(k) || 0) + 1); }
  const dense = (r) => { const m = r.p[r.p.length >> 1], cx = Math.floor(m[0] / 100), cz = Math.floor(m[1] / 100); let n = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) n += DG.get((cx + i) * 100003 + cz + j) || 0; return n >= 90; };
  let nDense = 0;
  roads.forEach((r, ri) => {
    const named = /^place\b/i.test(r.nm || ''), main = r.k <= 2, dn = !main && (r.k === 3 || r.k === 4) && dense(r);
    if (!main && !named && !dn) return;
    if (r.k <= 2 && r.p.length > 1 && r.rb) return;
    const step = r.k === 0 ? 21 : r.k === 1 ? 16 : named && r.k > 2 ? 20 : 34, both = false,   // quinconce : un lampadaire tous les step/2 en alternant les côtés (jamais face à face)
      off = hw(r) + (r.k === 0 ? 2.4 : r.k === 6 ? 0.9 : 1.75);
    let acc = 6, side = 1;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [x1, z1] = r.p[i], [x2, z2] = r.p[i + 1], sl = Math.hypot(x2 - x1, z2 - z1) || 1, tx = (x2 - x1) / sl, tz = (z2 - z1) / sl, nx = tz, nz = -tx;
      for (let d = 0; d < sl; d += 1) { if (--acc > 0) continue; acc = step;
        const cx = x1 + tx * d, cz = z1 + tz * d;
        for (const s of both ? [1, -1] : [side]) { let x = cx + nx * off * s, z = cz + nz * off * s;
          if (dn && inBuilding(x, z)) { x = cx + nx * (hw(r) + 0.9) * s; z = cz + nz * (hw(r) + 0.9) * s; }   // rue étroite : lampadaire au bord du trottoir
          if (!onRoad(x, z, ri) && !inBuilding(x, z) && free(x, z)) { add(x, z, -nx * s, -nz * s); if (dn) nDense++; } }
        side = -side; }
    }
  });
  for (const b of B) {   // églises et bâtiments officiels : couronne de lampadaires à 3 m des façades
    const stn = b.t === 'train_station' || b.t === 'transportation';   // gares : éclairées comme les bâtiments officiels (les petits abris exclus)
    if (!(OFFICIAL.has(b.t) || stn) || b.p.length < 3) continue;
    let ar = 0; for (let i = 0; i < b.p.length; i++) { const a = b.p[i], c = b.p[(i + 1) % b.p.length]; ar += a[0] * c[1] - c[0] * a[1]; } const sgn = ar > 0 ? 1 : -1; let n = 0;
    if (stn && b.t === 'transportation' && Math.abs(ar) / 2 < 300) continue;
    for (let i = 0; i < b.p.length && n < 14; i++) { const a = b.p[i], c = b.p[(i + 1) % b.p.length], sl = Math.hypot(c[0] - a[0], c[1] - a[1]); if (sl < 3) continue; const tx = (c[0] - a[0]) / sl, tz = (c[1] - a[1]) / sl, nx = tz * sgn, nz = -tx * sgn;
      for (let d = Math.min(3, sl / 2); d < sl && n < 14; d += 16) { const x = a[0] + tx * d + nx * 3.2, z = a[1] + tz * d + nz * 3.2; if (!onRoad(x, z, -1) && !inBuilding(x, z) && free(x, z)) { add(x, z, -nx, -nz); n++; } } }
  }
  window.__streetlights = L.length; window.__streetlightsDense = nDense;
  // ---- rendu : mâts (instanciés), halos doux, taches de lumière au sol
  const N = L.length, H = 6.3;
  const pole = (() => { const P = [], I = [], C = [], push = (bx, by, bz, sx, sy, sz, col) => { const x0 = bx - sx / 2, x1 = bx + sx / 2, y0 = by, y1 = by + sy, z0 = bz - sz / 2, z1 = bz + sz / 2;
      const F = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]];
      for (const f of F) { const b0 = P.length / 3; for (const p of f) { P.push(...p); C.push(...col); } I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); } };
    const g0 = [0.24, 0.26, 0.29]; push(0, 0, 0, 0.32, 0.5, 0.32, g0); push(0, 0.5, 0, 0.14, H - 0.5, 0.14, g0); push(0.6, H - 0.12, 0, 1.3, 0.1, 0.1, g0); push(1.25, H - 0.22, 0, 0.55, 0.14, 0.26, [0.6, 0.6, 0.55]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals(); return g; })();
  const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.4 }), Math.max(1, N)); poles.frustumCulled = false;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const gp = new Float32Array(N * 3), pools = [];
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; { const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }
  const tex = new THREE.CanvasTexture(cv);
  const poolMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd6e4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -30, polygonOffsetUnits: -30, fog: false });
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const pool = new THREE.InstancedMesh(poolGeo, poolMat, Math.max(1, N)); pool.frustumCulled = false; pool.renderOrder = 20;
  L.forEach(([x, z, dx, dz], i) => {
    const y = terrain.heightAt(x, z);
    Q.setFromAxisAngle(Y, Math.atan2(-dz, dx)); P.set(x, y, z); M4.compose(P, Q, S); poles.setMatrixAt(i, M4);   // bras local +x -> vers la chaussée
    gp[i * 3] = x + dx * 1.3; gp[i * 3 + 1] = y + H - 0.3; gp[i * 3 + 2] = z + dz * 1.3;
    const px = x + dx * 1.6, pz = z + dz * 1.6; P.set(px, terrain.heightAt(px, pz) + 0.55, pz); S.set(22, 1, 22); M4.compose(P, new THREE.Quaternion(), S); pool.setMatrixAt(i, M4); S.set(1, 1, 1);
  });
  poles.instanceMatrix.needsUpdate = true; pool.instanceMatrix.needsUpdate = true;
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const glowMat = new THREE.PointsMaterial({ size: 14, map: tex, color: 0xe4eeff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.Points(gg, glowMat); glow.frustumCulled = false;
  group.add(poles, pool, glow);
  const setNight = (n) => { glowMat.opacity = Math.min(1, n * 1.2) * 0.3; poolMat.opacity = Math.min(1, n * 1.2) * 0.26; pool.visible = glow.visible = n > 0.03; };
  setNight(0);
  return { group, setNight, count: N };
}
