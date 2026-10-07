import * as THREE from 'three';

// Habitacle 3D d'une voiture « standard » pour la vue intérieure d'un véhicule.
// Repère local : origine = les yeux du conducteur, -z = avant, +x = droite, +y = haut ; le plancher est à y = -1.10 m. Le cabinet est symétrique par rapport à x = 0
// (le conducteur est donc au centre, banquette avant : ça permet de voir les deux rétroviseurs extérieurs en même temps).
// Tout est rendu dans une scène à part (profondeur effacée avant le rendu) avec la même caméra que le monde : portières, montants, siège arrière, lunette arrière...
// existent réellement en 3D autour de la tête, il suffit de tourner la vue pour les voir. Pas de « vue dans les rétros » (trop gourmand) : les glaces sont des textures.
export function buildCabin() {
  const scene = new THREE.Scene(), root = new THREE.Group(), g = new THREE.Group(); scene.add(root); root.add(g);
  g.position.y = -0.15;   // yeux relevés de 15 cm (la caméra monte d'autant dans main.js) : tout l'habitacle descend d'autant ; `root` = repère des yeux, piloté par main.js
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x6a6560, 1.0), sun = new THREE.DirectionalLight(0xfff1dc, 0.9);
  sun.position.set(0.5, 1, 0.35); scene.add(hemi, sun);
  // « gs » = structure (carrosserie intérieure) resserrée latéralement (x * 0.72) : montants A et rétros entrent ainsi dans l'image même sur une fenêtre étroite ; « g » = accessoires (volant, compteur, aérateurs, écran) à leur taille réelle
  const SHIFT = 0.12;   // conducteur à gauche : l'axe de la voiture est à ~12 cm à droite des yeux
  const car = new THREE.Group(); car.position.x = SHIFT; g.add(car);
  const gs = new THREE.Group(); gs.scale.x = 0.80; car.add(gs);
  const FWD = 0.25;   // le conducteur est reculé de 25 cm : tout l'avant (tableau de bord, pare-brise, montants A, rétros) est repoussé d'autant, siège et arrière restent en place
  const gsF = new THREE.Group(); gsF.position.z = -FWD; gs.add(gsF);       // avant, resserré latéralement
  const carF = new THREE.Group(); carF.position.z = -FWD; car.add(carF);   // avant, taille réelle (axe de la voiture)
  const gF = new THREE.Group(); gF.position.z = -FWD; g.add(gF);           // avant, axe du conducteur (combiné)
  let cur = gs;                                                           // parent par défaut des helpers ci-dessous

  // ---------- textures procédurales ----------
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const tex = (c, rx = 1, ry = 1) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
  const grain = (base, amp = 20, size = 128, rx = 4, ry = 4, extra) => {
    const c = cv(size, size), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, size, size);
    const d = x.getImageData(0, 0, size, size); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * amp; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
    x.putImageData(d, 0, 0); if (extra) extra(x, size); return tex(c, rx, ry);
  };
  const Lm = (o) => new THREE.MeshLambertMaterial(o), Pm = (o) => new THREE.MeshPhongMaterial(o);
  const grilleTex = (() => { const c = cv(64, 64), x = c.getContext('2d'); x.fillStyle = '#0e0f11'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#3a3d43'; for (let i = 4; i < 64; i += 7) for (let j = 4; j < 64; j += 7) { x.beginPath(); x.arc(i, j, 1.8, 0, 7); x.fill(); } return tex(c); })();
  const M = {
    dash: Lm({ map: grain('#4b4e56', 26, 128, 12, 12) }),
    dashTop: Lm({ map: grain('#575b65', 26, 128, 14, 14) }),
    plastic: Lm({ map: grain('#3a3d43', 18, 64, 3, 3) }),
    plastic2: Lm({ map: grain('#50535a', 16, 64, 3, 3) }),
    black: Lm({ color: 0x0c0d0f }),
    trim: Pm({ color: 0xaeb4ba, specular: 0xffffff, shininess: 90 }),
    leather: Pm({ map: grain('#26272a', 22, 64, 4, 4), specular: 0x7a7a7a, shininess: 30 }),
    fabric: Lm({ map: grain('#46474f', 30, 128, 3, 3, (x, s) => { x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; for (let i = 0; i < s; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); } }) }),
    seat: Lm({ map: grain('#62646e', 12, 128, 2, 2, (x, s) => { x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 2; for (let i = 0; i < s; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); } x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 1; for (let i = 3; i < s; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); } x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 1; for (let i = 6; i < s; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); } }) }),
    liner: Lm({ map: grain('#b3b0a6', 18, 128, 6, 6), emissive: 0x4a4740 }),
    carpet: Lm({ map: grain('#2b2c31', 40, 128, 14, 30) }),
    paint: Pm({ color: 0x1a1d22, specular: 0x666666, shininess: 60 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xfff2d0, toneMapped: false }),
  };
  const add = (m, x, y, z, p = cur) => { m.position.set(x, y, z); p.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, p = cur) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, p);
  const bar = (a, b, w, d, mat) => { a = new THREE.Vector3(...a); b = new THREE.Vector3(...b); const me = new THREE.Mesh(new THREE.BoxGeometry(w, d, a.distanceTo(b)), mat); me.position.copy(a).add(b).multiplyScalar(0.5); me.lookAt(b); cur.add(me); return me; };
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const extruded = (pts, depth, mat) => {   // profil (d = distance en avant, y) extrudé en largeur, centré sur x = 0
    const sh = new THREE.Shape(pts.map(([d, y]) => new THREE.Vector2(d, y))), ge = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    ge.translate(0, 0, -depth / 2); ge.rotateY(Math.PI / 2); const me = new THREE.Mesh(ge, mat); cur.add(me); return me;
  };
  const MIR = { l: null, c: null, r: null };
  const FLOOR = -1.10, BELT = -0.28, ROOF = 0.35, HW = 0.72;

  // ---------- plancher, tapis, console centrale ----------
  { const fl = plane(1.5, 4.2 + FWD, M.carpet); fl.rotation.x = -Math.PI / 2; add(fl, 0, FLOOR, 0.9 - FWD / 2); }
  box(0.26, 0.42, 1.2 + FWD, M.plastic, 0, FLOOR + 0.21, -0.35 - FWD / 2);                       // tunnel / console
  box(0.2, 0.025, 0.52, M.plastic2, 0, FLOOR + 0.43, -0.4);
  const lever = new THREE.Group(); add(lever, 0, FLOOR + 0.44, -0.58);
  { const lv = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.17, 8), M.black); add(lv, 0, 0.085, 0, lever); add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), M.leather), 0, 0.185, 0, lever); add(new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.004, 10), M.trim), 0, 0.2, 0, lever); add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.035, 14), M.leather), 0, FLOOR + 0.455, -0.58); }
  box(0.04, 0.03, 0.22, M.leather, 0.08, FLOOR + 0.46, -0.1);                      // frein à main
  for (const x of [-0.05, 0.05]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), M.trim); r.rotation.x = Math.PI / 2; add(r, x, FLOOR + 0.445, -0.28); }   // porte-gobelets

  // ---------- tableau de bord ----------
  cur = gsF;
  extruded([[1.05, -0.35], [0.95, -0.335], [0.82, -0.34], [0.74, -0.37], [0.70, -0.43], [0.70, -0.70], [0.78, -0.95], [1.00, -1.10], [1.05, -1.10]], 1.46, M.dashTop);
  box(1.46, 0.012, 0.012, M.trim, 0, -0.445, -0.699);                              // filet chromé sur la tranche du tableau de bord
  box(1.46, 0.07, 0.015, M.plastic2, 0, -0.57, -0.701);                           // bandeau mat
  box(1.30, 0.04, 0.10, M.black, 0, -0.345, -1.0);                                // joint de base de pare-brise
  // surpiqûres (fil clair) sur la lèvre avant du tableau de bord et insert décor sur la face
  { const stC = cv(128, 8), stX = stC.getContext('2d'); stX.fillStyle = 'rgba(0,0,0,0)'; stX.fillRect(0, 0, 128, 8); stX.fillStyle = '#d6cdb2'; for (let i = 0; i < 128; i += 16) stX.fillRect(i, 3, 10, 2);
    const stT = tex(stC, 24, 1), stM = new THREE.MeshBasicMaterial({ map: stT, transparent: true, toneMapped: false });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.014), stM); top.rotation.x = -Math.PI / 2; add(top, 0, -0.362, -0.745);
    const fc = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.014), stM); add(fc, 0, -0.49, -0.697);
    const insC = cv(256, 24), iX = insC.getContext('2d'); const ig = iX.createLinearGradient(0, 0, 256, 0); ig.addColorStop(0, '#7b6a52'); ig.addColorStop(0.5, '#a58d6d'); ig.addColorStop(1, '#7b6a52'); iX.fillStyle = ig; iX.fillRect(0, 0, 256, 24);
    iX.strokeStyle = 'rgba(40,25,10,.35)'; iX.lineWidth = 1; for (let i = 0; i < 24; i += 3) { iX.beginPath(); iX.moveTo(0, i + Math.random() * 2); iX.lineTo(256, i + Math.random() * 2); iX.stroke(); }
    const ins = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.045), Pm({ map: tex(insC), specular: 0x555555, shininess: 40 })); add(ins, 0, -0.64, -0.697); }
  // bloc d'instruments : visière + compteur
  box(0.80, 0.29, 0.04, M.black, 0, -0.165, -0.935, gF);                           // boîtier du combiné (sans visière : plus de ciel/route visibles)
  const clC = cv(512, 192), clX = clC.getContext('2d'), clT = tex(clC); clT.repeat.set(1, 1);
  const cluster = add(plane(0.68, 0.255, new THREE.MeshBasicMaterial({ map: clT, toneMapped: false })), 0, -0.16, -0.86, gF); cluster.lookAt(0, 0, 0);
  // volant (incliné de 22°, ne dépasse que par le haut du cadre : on regarde par-dessus)
  const wheelPivot = new THREE.Group(); wheelPivot.position.set(0, -0.37, -0.81); wheelPivot.rotation.x = -22 * Math.PI / 180; g.add(wheelPivot);
  const spin = new THREE.Group(); wheelPivot.add(spin);
  { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.0175, 12, 48), M.leather); spin.add(rim);
    const st = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.0182, 4, 48, 0.12), new THREE.MeshBasicMaterial({ color: 0xd9d4c2 })); st.rotation.z = Math.PI / 2 - 0.06; spin.add(st);   // couture
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.04, 20), M.plastic2), 0, 0, -0.01, spin).rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), M.trim), 0, 0, 0.012, spin).rotation.x = Math.PI / 2;
    box(0.16, 0.026, 0.016, M.plastic2, -0.11, -0.01, -0.006, spin); box(0.16, 0.026, 0.016, M.plastic2, 0.11, -0.01, -0.006, spin); box(0.03, 0.15, 0.016, M.plastic2, 0, -0.11, -0.006, spin);
    for (const s of [-1, 1]) box(0.03, 0.012, 0.006, M.trim, s * 0.14, 0.0, 0.004, spin); }
  { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 14), M.black); col.rotation.x = Math.PI / 2 - 0.30; add(col, 0, -0.66, -1.12, g); }
  box(0.14, 0.014, 0.06, M.black, -0.20, -0.62, -0.84, g).rotation.z = 0.15; box(0.14, 0.014, 0.06, M.black, 0.20, -0.62, -0.84, g).rotation.z = -0.15;   // manettes sous le volant
  // aérateurs
  const ventTex = (() => { const c = cv(96, 48), x = c.getContext('2d'); x.fillStyle = '#0d0e10'; x.fillRect(0, 0, 96, 48); x.fillStyle = '#34373d'; for (let i = 0; i < 6; i++) x.fillRect(6, 6 + i * 6.5, 84, 3); return tex(c); })();
  const vent = (x, y, z) => { const m = plane(0.1, 0.05, Lm({ map: ventTex })); add(m, x, y, z, carF); m.lookAt(0, 0, 0); const fr = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.058, 0.01), M.trim); add(fr, x, y, z - 0.006, carF); fr.lookAt(0, 0, 0); };
  vent(0.20, -0.30, -0.97); vent(0.47, -0.28, -0.93);
  // bouton de warnings
  { const b = box(0.032, 0.03, 0.01, new THREE.MeshBasicMaterial({ color: 0xc02a22 }), 0.12, -0.36, -0.97, carF); b.lookAt(0, 0, 0); }
  // essuie-glaces au repos
  for (const x of [-0.30, 0.18]) { const w = box(0.56, 0.012, 0.022, M.black, x + 0.0, -0.32, -1.12); w.rotation.y = 0.06; w.rotation.z = -0.03; }

  // ---------- pare-brise : cadre + teinte pare-soleil + reflets ----------
  const wsC = cv(512, 256), wsX = wsC.getContext('2d');
  { const gr = wsX.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(60,125,150,.62)'); gr.addColorStop(0.17, 'rgba(70,135,155,.28)'); gr.addColorStop(0.3, 'rgba(70,135,155,0)'); wsX.fillStyle = gr; wsX.fillRect(0, 0, 512, 256);
    wsX.fillStyle = 'rgba(255,255,255,.055)'; wsX.beginPath(); wsX.moveTo(70, 256); wsX.lineTo(150, 256); wsX.lineTo(330, 0); wsX.lineTo(250, 0); wsX.fill();
    wsX.fillStyle = 'rgba(255,255,255,.035)'; wsX.beginPath(); wsX.moveTo(190, 256); wsX.lineTo(215, 256); wsX.lineTo(395, 0); wsX.lineTo(370, 0); wsX.fill();
    const gb = wsX.createLinearGradient(0, 200, 0, 256); gb.addColorStop(0, 'rgba(10,10,12,0)'); gb.addColorStop(1, 'rgba(10,10,12,.28)'); wsX.fillStyle = gb; wsX.fillRect(0, 200, 512, 56); }
  { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.168), new THREE.MeshBasicMaterial({ map: tex(wsC), transparent: true, depthWrite: false, toneMapped: false })); w.position.set(0, 0.19, -0.7025); w.rotation.x = 0.5755; cur.add(w); }
  for (const s of [-1, 1]) {
    bar([s * 0.75, -0.30, -1.02], [s * 0.665, 0.68, -0.385], 0.062, 0.05, M.plastic);                 // montant A
    bar([s * 0.745, -0.30, -1.0], [s * 0.675, 0.675, -0.39], 0.014, 0.01, M.dash);
  }
  box(1.34, 0.05, 0.075, M.liner, 0, 0.675, -0.385);
  box(1.34, 0.012, 0.012, M.black, 0, 0.64, -0.39);
  // rétroviseur intérieur : accroché au centre du pare-brise (axe de la voiture), tourné vers le conducteur (à gauche) ; la glace est un vrai miroir plan (cf. main.js)
  const mirrorOf = (k, mx, my, mz, W, H, hw, hh, hd, rear, parent, mat) => {   // boîtier + glace ; orientation = bissectrice (œil → miroir, direction arrière visée)
    const mC = cv(128, 64), mX = mC.getContext('2d'); const gr = mX.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#dfe9f1'); gr.addColorStop(0.6, '#a9bac6'); gr.addColorStop(0.61, '#4a4e53'); gr.addColorStop(1, '#2a2d31'); mX.fillStyle = gr; mX.fillRect(0, 0, 128, 64);
    const mt = tex(mC), h = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), mat); add(h, mx, my, mz, parent); h.updateWorldMatrix(true, false);
    const P = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld), n = P.clone().negate().normalize().add(new THREE.Vector3(...rear).normalize()).normalize(); h.lookAt(P.clone().add(n));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: mt, toneMapped: false })); gl.position.z = hd / 2 + 0.001; h.add(gl); MIR[k] = { gl, mt, w: W, h: H }; return h; };
  mirrorOf('c', 0, 0.38, -0.33, 0.46, 0.46 / (512 / 112), 0.50, 0.118, 0.03, [0, 0.02, 1], carF, M.black);
  { const a = new THREE.Vector3(0, 0.675, -0.38), b = new THREE.Vector3(0, 0.425, -0.345), st = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.02, a.distanceTo(b)), M.black); st.position.copy(a).add(b).multiplyScalar(0.5); st.lookAt(b); carF.add(st); }
  // ---------- pavillon, montants latéraux, lunette arrière ----------
  cur = gs;
  { const hl = plane(1.32, 2.2 + FWD, M.liner); hl.rotation.x = Math.PI / 2; add(hl, 0, 0.688, 0.74 - FWD / 2); }
  box(0.14, 0.012, 0.08, M.glow, 0, 0.682, 0.6); box(0.15, 0.02, 0.09, M.plastic2, 0, 0.69, 0.6);
  for (const s of [-1, 1]) {
    bar([s * 0.665, 0.68, -0.38 - FWD], [s * 0.70, 0.695, 1.85], 0.075, 0.06, M.liner);                    // longerons de toit
    bar([s * 0.72, -0.28, 0.58], [s * 0.70, 0.69, 0.54], 0.11, 0.075, M.plastic);                    // montant B
    box(0.04, 0.2, 0.025, M.plastic2, s * 0.69, -0.1, 0.54);
    bar([s * 0.73, -0.14, 1.70], [s * 0.62, 0.68, 1.90], 0.16, 0.085, M.plastic);                    // montant C
    box(0.05, 0.05, 0.28, M.plastic2, s * 0.64, 0.63, 0.16);                                        // poignée de maintien (jambages + barre)
    box(0.03, 0.03, 0.05, M.plastic2, s * 0.67, 0.665, 0.02); box(0.03, 0.03, 0.05, M.plastic2, s * 0.67, 0.665, 0.30);
  }
  box(1.30, 0.075, 0.08, M.liner, 0, 0.675, 1.9);
  box(1.46, 0.07, 0.34, M.plastic, 0, -0.14, 1.88);                                                  // plage arrière
  for (const x of [-0.45, 0.45]) { const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 20), M.black); add(gr, x, -0.10, 1.88); }   // haut-parleurs

  // ---------- portières (intérieur) ----------
  const doorTex = (len) => { const W = 640, H = 300, c = cv(W, H), x = c.getContext('2d');
    x.fillStyle = '#383a41'; x.fillRect(0, 0, W, H);
    const d = x.getImageData(0, 0, W, H); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 16; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0);
    x.fillStyle = '#2b2d33'; x.fillRect(0, 0, W, H * 0.27);
    x.fillStyle = '#15161a'; x.fillRect(0, H * 0.74, W, H * 0.26);
    const ins = x.createLinearGradient(0, H * 0.31, 0, H * 0.72); ins.addColorStop(0, '#6a6b76'); ins.addColorStop(1, '#4e505a'); x.fillStyle = ins; x.fillRect(14, H * 0.31, W - 28, H * 0.41);
    x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1; for (let i = 14; i < W - 14; i += 4) { x.beginPath(); x.moveTo(i, H * 0.31); x.lineTo(i, H * 0.72); x.stroke(); }
    x.strokeStyle = '#c3bba3'; x.lineWidth = 2; x.setLineDash([9, 6]); x.strokeRect(20, H * 0.31 + 6, W - 40, H * 0.41 - 12); x.setLineDash([]);
    x.fillStyle = '#b9bfc5'; x.fillRect(0, H * 0.285, W, 4); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, H * 0.285 + 4, W, 2);
    x.fillStyle = '#090a0c'; x.fillRect(W * 0.12, H * 0.8, W * 0.34, H * 0.14);   // vide-poche
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(W * 0.12, H * 0.8, W * 0.34, 3);
    const t = tex(c); t.repeat.set(1, 1); return t; };
  const door = (s, z0, z1, front) => {
    const len = z1 - z0, h = BELT - FLOOR - 0.02, me = new THREE.Mesh(new THREE.PlaneGeometry(len, h), Lm({ map: doorTex(len) }));
    me.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; me.position.set(s * (HW - 0.005), FLOOR + 0.02 + h / 2, (z0 + z1) / 2); gs.add(me);
    box(0.06, h, len, M.black, s * (HW + 0.03), FLOOR + 0.02 + h / 2, (z0 + z1) / 2);
    box(0.11, 0.035, len, M.plastic2, s * (HW - 0.045), BELT, (z0 + z1) / 2);                       // haut de portière
    box(0.012, 0.012, len, M.trim, s * (HW - 0.095), BELT + 0.0, (z0 + z1) / 2);
    box(0.085, 0.045, len * 0.4, M.plastic2, s * (HW - 0.06), -0.50, (z0 + z1) / 2 + (front ? 0.05 : 0.0));   // accoudoir
    const hd = box(0.04, 0.03, 0.15, M.trim, s * (HW - 0.03), -0.355, z0 + len * 0.58); hd.scale.set(1, 1, 1);   // poignée d'ouverture
    box(0.03, 0.03, 0.2, M.black, s * (HW - 0.02), -0.355, z0 + len * 0.58);
    const sp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), Lm({ map: grilleTex })); sp.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; add(sp, s * (HW - 0.008), -0.83, z0 + len * 0.28);
    if (front) { for (let i = 0; i < 4; i++) box(0.012, 0.02, 0.028, i < 2 ? M.trim : M.black, s * (HW - 0.052), -0.46, z0 + len * 0.15 + i * 0.045).position.y = -0.462; }   // commandes de vitres
  };
  for (const s of [-1, 1]) { door(s, -0.85 - FWD, 0.52, true); door(s, 0.62, 1.70, false); }
  box(1.44, 0.01, 0.02, M.black, 0, FLOOR + 0.01, -1.0 - FWD);

  // ---------- rétroviseurs extérieurs ----------
  for (const sd of [-1, 1]) {
    const mx = sd < 0 ? -0.85 : 0.74;
    mirrorOf(sd < 0 ? 'l' : 'r', mx, -0.06, -0.97, 0.34, 0.19, 0.39, 0.235, 0.07, [sd * 0.14, 0.02, 1], carF, M.paint);
  }

  // ---------- vitres latérales / lunette arrière (verre teinté + reflets), détails supplémentaires ----------
  { const gC = cv(512, 128), gX = gC.getContext('2d'); const gr = gX.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(60,110,130,.16)'); gr.addColorStop(1, 'rgba(60,110,130,.04)'); gX.fillStyle = gr; gX.fillRect(0, 0, 512, 128);
    gX.fillStyle = 'rgba(255,255,255,.07)'; for (const o of [60, 230, 330]) { gX.beginPath(); gX.moveTo(o, 128); gX.lineTo(o + 40, 128); gX.lineTo(o + 110, 0); gX.lineTo(o + 70, 0); gX.fill(); }
    const gt = tex(gC); const gm = new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, toneMapped: false });
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + FWD, 0.96), gm); w.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; add(w, s * 0.712, 0.20, 0.75 - FWD / 2);
      box(0.03, 0.02, 2.2 + FWD, M.black, s * 0.70, BELT + 0.01, 0.75 - FWD / 2); box(0.016, 0.014, 2.2 + FWD, M.trim, s * 0.69, BELT + 0.025, 0.75 - FWD / 2); }   // joint + jonc chromé de bas de vitre
    const rC = cv(256, 128), rX = rC.getContext('2d'); rX.fillStyle = 'rgba(60,110,130,.22)'; rX.fillRect(0, 0, 256, 128); rX.strokeStyle = 'rgba(30,25,20,.55)'; rX.lineWidth = 1.5; for (let i = 14; i < 128; i += 12) { rX.beginPath(); rX.moveTo(10, i); rX.lineTo(246, i); rX.stroke(); }
    rX.fillStyle = 'rgba(255,255,255,.07)'; rX.beginPath(); rX.moveTo(40, 128); rX.lineTo(90, 128); rX.lineTo(170, 0); rX.lineTo(120, 0); rX.fill();
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.82), new THREE.MeshBasicMaterial({ map: tex(rC), transparent: true, depthWrite: false, toneMapped: false })); rw.rotation.y = Math.PI; rw.rotation.x = 0.22; add(rw, 0, 0.27, 1.93); }
  // aérateurs de dégivrage sur le haut du tableau de bord, vide-poche côté droit, plafonniers
  cur = gsF;
  { const df = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), Lm({ map: ventTex })); df.rotation.x = -Math.PI / 2; add(df, 0, -0.3345, -0.88); }
  box(0.46, 0.2, 0.012, M.plastic2, 0.46, -0.57, -0.701); box(0.1, 0.02, 0.014, M.trim, 0.46, -0.49, -0.692);
  for (const s of [-1, 1]) box(0.1, 0.06, 0.012, M.trim, s * 0.60, -0.40, -0.98);
  cur = gs;
  for (const s of [-1, 1]) box(0.05, 0.016, 0.07, M.glow, s * 0.18, 0.682, -0.20);
  // seuils de portes et poches de portières

  // ---------- sièges : banquette avant (3 places), banquette arrière ----------
  { const back = box(1.40, 0.66, 0.13, M.seat, 0, -0.44, 0.40); back.rotation.x = 0.12;
    box(1.40, 0.14, 0.62, M.seat, 0, -0.80, 0.02);                                                 // assise
    for (const x of [-0.23, 0.23]) box(0.012, 0.66, 0.14, M.black, x, -0.44, 0.395).rotation.x = 0.12;
    // ceinture (diagonale)
    bar([-0.62, 0.22, 0.55], [-0.28, -0.50, 0.30], 0.05, 0.008, M.black); }
  { box(1.42, 0.14, 0.62, M.seat, 0, -0.80, 1.35);
    const back = box(1.42, 0.62, 0.13, M.seat, 0, -0.49, 1.70); back.rotation.x = -0.12;
  }

  // ---------- zone de rendu des écrans dynamiques ----------
  const rrect = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  const arrow = (x, cx, cy, dir, on) => { const K = 1.35; x.save(); x.translate(cx, cy); x.scale(dir * K, K); x.beginPath(); x.moveTo(20, 0); x.lineTo(-6, -17); x.lineTo(-6, -7); x.lineTo(-22, -7); x.lineTo(-22, 7); x.lineTo(-6, 7); x.lineTo(-6, 17); x.closePath();
    if (on) { x.shadowColor = '#5dff94'; x.shadowBlur = 28; x.fillStyle = '#7dffa8'; x.fill(); x.shadowBlur = 10; x.fill(); x.lineWidth = 2; x.strokeStyle = '#eafff0'; x.stroke(); } else { x.fillStyle = 'rgba(40,110,65,.5)'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = 'rgba(90,170,120,.55)'; x.stroke(); }
    x.restore(); x.shadowBlur = 0; };
  const drawCluster = (speed, sg, blinkOn, hh, mm, gear, rpm) => {
    const x = clX, W = 512, H = 192; x.clearRect(0, 0, W, H);
    const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1017'); bg.addColorStop(1, '#030507'); x.fillStyle = bg; rrect(x, 0, 0, W, H, 18); x.fill();
    // compteur de vitesse (0-200 km/h sur 270°)
    const gx = 92, gy = 100, R = 78; x.lineWidth = 6; x.strokeStyle = '#17212b'; x.beginPath(); x.arc(gx, gy, R, 0, 7); x.stroke();
    for (let k = 0; k <= 16; k++) { const a = (225 - k * 16.875) * Math.PI / 180, mj = k % 2 === 0, r1 = R - (mj ? 14 : 8), c = Math.cos(a), s = Math.sin(a);
      x.strokeStyle = k >= 14 ? '#ff5a3a' : mj ? '#e8eef2' : '#6c7882'; x.lineWidth = mj ? 3 : 1.5; x.beginPath(); x.moveTo(gx + c * r1, gy - s * r1); x.lineTo(gx + c * (R - 2), gy - s * (R - 2)); x.stroke();
      if (mj) { x.fillStyle = '#c9d3da'; x.font = '600 12px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(k * 10), gx + c * (R - 29), gy - s * (R - 29)); } }
    { const a = (225 - Math.min(speed, 160) / 160 * 270) * Math.PI / 180; x.strokeStyle = '#ff6a2b'; x.lineWidth = 4; x.lineCap = 'round'; x.shadowColor = '#ff6a2b'; x.shadowBlur = 8; x.beginPath(); x.moveTo(gx - Math.cos(a) * 10, gy + Math.sin(a) * 10); x.lineTo(gx + Math.cos(a) * (R - 18), gy - Math.sin(a) * (R - 18)); x.stroke(); x.shadowBlur = 0; x.fillStyle = '#222a31'; x.beginPath(); x.arc(gx, gy, 8, 0, 7); x.fill(); }
    // cadran secondaire : compte-tours (0-7 x1000 tr/min, zone rouge dès 6) + niveau de carburant
    const hx = 420, hy = 100, r2 = 62; x.lineWidth = 5; x.strokeStyle = '#17212b'; x.beginPath(); x.arc(hx, hy, r2, 0, 7); x.stroke();
    for (let k = 0; k <= 14; k++) { const a = (225 - k / 14 * 270) * Math.PI / 180, mj = k % 2 === 0, r1 = r2 - (mj ? 12 : 7), c = Math.cos(a), s2 = Math.sin(a);
      x.strokeStyle = k >= 12 ? '#ff5a3a' : mj ? '#e8eef2' : '#6c7882'; x.lineWidth = mj ? 2.5 : 1.2; x.beginPath(); x.moveTo(hx + c * r1, hy - s2 * r1); x.lineTo(hx + c * (r2 - 2), hy - s2 * (r2 - 2)); x.stroke();
      if (mj) { x.fillStyle = k >= 12 ? '#ff8a70' : '#c9d3da'; x.font = '600 11px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(k / 2), hx + c * (r2 - 24), hy - s2 * (r2 - 24)); } }
    x.fillStyle = '#7f95a4'; x.font = '600 9px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillText('x1000 tr/min', hx, hy + 26);
    { x.fillStyle = '#17212b'; x.fillRect(hx - 22, hy + 38, 44, 6); x.fillStyle = '#4ec3ff'; x.fillRect(hx - 22, hy + 38, 30, 6); x.fillStyle = '#93a3ae'; x.font = '600 8px system-ui,sans-serif'; x.fillText('E', hx - 28, hy + 45); x.fillText('F', hx + 28, hy + 45); }
    { const a = (225 - Math.min(rpm, 7000) / 7000 * 270) * Math.PI / 180; x.strokeStyle = '#e8eef2'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(hx - Math.cos(a) * 8, hy + Math.sin(a) * 8); x.lineTo(hx + Math.cos(a) * (r2 - 16), hy - Math.sin(a) * (r2 - 16)); x.stroke(); x.fillStyle = '#222a31'; x.beginPath(); x.arc(hx, hy, 6, 0, 7); x.fill(); }
    // compteur kilométrique dans le grand cadran
    x.fillStyle = '#7f95a4'; x.font = '600 10px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText('48 213 km', gx, gy + 46);
    // vitesse numérique, rapport engagé, heure
    x.fillStyle = '#f3f7fa'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.font = '700 58px system-ui,sans-serif'; x.fillText(String(Math.round(speed)), 256, 112); x.fillStyle = '#7f95a4'; x.font = '600 14px system-ui,sans-serif'; x.fillText('km/h', 256, 134);
    { const G = ['N', '1', '2', '3', '4', '5']; x.textBaseline = 'alphabetic'; for (let i = 0; i < 6; i++) { const on = i === gear; x.fillStyle = on ? '#35e06a' : '#35424c'; x.font = (on ? '700 22px' : '600 13px') + ' system-ui,sans-serif'; if (on) { x.shadowColor = '#35e06a'; x.shadowBlur = 10; } x.fillText(G[i], 214 + i * 14.4, 166); x.shadowBlur = 0; } }
    x.fillStyle = '#b6c3cc'; x.font = '600 15px system-ui,sans-serif'; x.fillText(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), 336, 166); x.fillText('18°C', 176, 166);
    // clignotants + voyants
    arrow(x, 194, 40, -1, (sg === -1 || sg === 2) && blinkOn); arrow(x, 318, 40, 1, (sg === 1 || sg === 2) && blinkOn);
    const lamp = (cx, col, t) => { x.fillStyle = col; x.globalAlpha = 0.28; x.beginPath(); x.arc(cx, 183, 8, 0, 7); x.fill(); x.globalAlpha = 1; x.fillStyle = '#05080b'; x.font = '700 8px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText(t, cx, 186); };
    lamp(208, '#ff4d3a', 'BAT'); lamp(232, '#ffb347', 'ENG'); lamp(256, '#ffb347', 'ABS'); lamp(280, '#4ec3ff', 'ESP'); lamp(304, '#35e06a', 'ECO');
    clT.needsUpdate = true;
  };
  // ---------- API ----------
  let lastKey = '', lastT = 0, infoKey = '', gear = 0, rpm = 800;
  const UPS = [18, 32, 50, 72], DNS = [12, 24, 40, 62], KPK = [0, 3.3, 5.8, 9.1, 13.1, 26];   // seuils de passage (km/h) et km/h par 1000 tr/min dans chaque rapport
  const SH = [[0, 0], [-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1]];                     // grille en H : [colonne, rangée] de chaque rapport
  const api = {
    scene, group: root, visible: false, gear: 0, mirrors: MIR,
    // glaces des rétroviseurs : textures temps réel (rendu de la vue arrière) ou, à défaut, le décor peint
    setMirrorLive(tx) { for (const k of ['l', 'c', 'r']) { const m = MIR[k]; if (!m) continue; const live = !!(tx && tx[k]); m.gl.material.map = live ? tx[k] : m.mt; m.gl.scale.x = live ? -1 : 1; m.gl.material.needsUpdate = true; } },
    update(o) {
      spin.rotation.z = -o.wheel * Math.PI / 180;
      const day = 1 - THREE.MathUtils.clamp(o.night || 0, 0, 1);
      hemi.intensity = 0.45 + 1.7 * day; sun.intensity = 0.1 + 1.5 * day;
      const sp = o.speed; if (gear === 0) { if (sp > 1.5) gear = 1; } else if (sp < 0.8) gear = 0; if (gear) { while (gear < 5 && sp > UPS[gear - 1]) gear++; while (gear > 1 && sp < DNS[gear - 2]) gear--; }
      const rt = gear ? Math.max(850, sp / KPK[gear] * 1000) : 800 + Math.min(300, sp * 60); rpm += (rt - rpm) * 0.4; api.gear = gear;
      lever.rotation.z += (-SH[gear][0] * 0.14 - lever.rotation.z) * 0.25; lever.rotation.x += (SH[gear][1] * 0.16 - lever.rotation.x) * 0.25;
      const blinkOn = (performance.now() % 700) < 400, hh = Math.floor(o.hour) % 24, mm = Math.floor((o.hour % 1) * 60), now = performance.now();
      const key = [Math.round(o.speed), o.sg, blinkOn ? 1 : 0, mm, gear, Math.round(rpm / 60)].join();
      if (key !== lastKey && now - lastT > 40) { lastKey = key; lastT = now; drawCluster(o.speed, o.sg, blinkOn, hh, mm, gear, rpm); }
    },
    reset() { lastKey = ''; infoKey = ''; gear = 0; rpm = 800; },
  };
  drawCluster(0, 0, false, 12, 0, 0, 800);
  return api;
}
