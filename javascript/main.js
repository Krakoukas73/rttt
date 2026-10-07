import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { loadDem, buildTerrain } from './terrain.js';
import { buildRoads, buildWaterMaterial } from './roads.js';
import { buildTraffic } from './traffic.js';
import { buildStreetlights } from './streetlights.js';
import { liftBridges, buildBridges } from './bridges.js';
import { buildBarriers } from './barriers.js';
import { buildCatenary } from './catenary.js';
import { buildSidewalks } from './roadside.js';
import { buildFurniture } from './furniture.js';
import { buildStreetDeco } from './streetdeco.js';
import { buildSigns } from './signs.js';
import { buildBuildings } from './buildings.js';
import { buildVegetation } from './vegetation.js';
import { buildSky } from './sky.js';
import { skyState } from './daynight.js';

const LITE = location.search.includes('lite');
const $ = (id) => document.getElementById(id);
// ---------- Préchargeur : une ligne animée par élément chargé ----------
const STEPS = [['Données de la ville', 'Chargement'], ['Relief', 'Relief'], ['Terrain', 'Terrain'], ['Routes et rivières', 'Routes'], ['Bâtiments', 'Bâtiments'], ['Végétation et photo aérienne', 'Végétation'], ['Circulation, trains, lampadaires', 'Circulation'], ['Finitions', 'Finitions']];
const pre = (() => {
  const el = $('loading'); el.innerHTML = '<div class="pl"><div class="pl-logo"><i></i><i></i><i></i></div><div class="pl-map"><img class="pl-photo" alt="" hidden><canvas width="1400" height="330" hidden></canvas><div class="pl-cn"><b></b><span></span></div></div><div class="pl-bar"><b></b><span class="pl-pc">0 %</span></div><p class="pl-msg"></p><ul></ul><button class="pl-go" hidden>Tout est chargé&nbsp;! GO&nbsp;!</button></div>';
  const ul = el.querySelector('ul'), bar = el.querySelector('.pl-bar b'), pc = el.querySelector('.pl-pc'), msg = el.querySelector('.pl-msg');
  const EM = [[/fontaines à eau/, '🚰'], [/fontaine/, '⛲'], [/photo aérienne|tuiles photo/, '🛰️'], [/tuiles d/, '🧱'], [/rues nommées/, '🪧'], [/rues/, '🏘️'], [/bâtiments/, '🏠'], [/arbres/, '🌳'], [/km de voirie|axes principaux/, '🛣️'], [/tronçons/, '🛤️'], [/zones/, '🗺️'], [/équipements routiers/, '🚦'], [/objets urbains/, '🪑'], [/commerces/, '🛍️'], [/numéros/, '🔢'], [/toponymes/, '🏷️'], [/sommets/, '⛰️'], [/densité/, '👥'], [/centre/, '📍'], [/emprise/, '📐'], [/rayon/, '🎯'], [/maillage/, '🔺'], [/relief/, '🏔️'], [/chemins/, '🥾'], [/sens uniques?/, '➡️'], [/pistes cyclables/, '🚲'], [/ronds-points|giratoires/, '🔄'], [/ponts/, '🌉'], [/tunnels/, '🚇'], [/plans d/, '💧'], [/culte/, '⛪'], [/écoles/, '🏫'], [/hôpitaux/, '🏥'], [/hôtels/, '🏨'], [/bureaux/, '🏢'], [/usines/, '🏭'], [/immeubles/, '🏬'], [/maisons/, '🏡'], [/gares/, '🚉'], [/tours/, '🗼'], [/plus haut/, '📏'], [/pelouses/, '🌿'], [/bois/, '🌲'], [/broussailles/, '🌱'], [/sport/, '⚽'], [/agricoles/, '🌾'], [/cimetières/, '🪦'], [/piscines/, '🏊'], [/voies de circulation/, '🚗'], [/voitures/, '🚌'], [/trains/, '🚆'], [/lampadaires/, '💡'], [/passages/, '🚸'], [/feux/, '🚥'], [/stops/, '🛑'], [/arrêts|abribus/, '🚏'], [/bancs/, '🪑'], [/poubelles/, '🗑️'], [/parkings/, '🅿️'], [/statues/, '🗽'], [/jardinières/, '🌷'], [/enseignes/, '🪧']];
  const emo = (t) => { const f = EM.find(([r]) => r.test(t)); return f ? f[1] + ' ' : ''; };
  const EMO = ['🏙️', '⛰️', '🗺️', '🛣️', '🏢', '🌳', '🚗', '💡'];
  const rows = STEPS.map(([n], k) => { const li = document.createElement('li'); li.innerHTML = '<span class="pl-ic"></span><span class="pl-n"><span class="pl-t"><em>' + EMO[k] + '</em>' + n + '</span><i class="pl-sb"><b></b></i></span><span class="pl-d"></span><span class="pl-k"></span><span class="pl-s"></span>'; ul.appendChild(li); return li; });
  const fr = rows.map(() => ({ p: 0, real: false, t0: 0 }));   // avancement par rubrique (réel si fourni, sinon estimé de façon asymptotique)
  const upd = () => { const v = Math.round(fr.reduce((t, f) => t + f.p, 0) / fr.length * 100); bar.style.width = v + '%'; pc.textContent = v + ' %'; };   // avancement global = moyenne des rubriques
  const paint = (i) => { const b = rows[i].querySelector('.pl-sb b'); if (b) b.style.width = Math.round(fr[i].p * 100) + '%'; upd(); };
  let cur = -1;
  const goto = (i) => { cur = i; rows.forEach((r, k) => { r.className = k < i ? 'ok' : k === i ? 'run' : ''; if (k < i) { fr[k].p = 1; paint(k); const d = r.querySelector('.pl-d'); if (d) d.textContent = ''; } }); if (i >= 0 && i < rows.length && !fr[i].t0) fr[i].t0 = performance.now(); upd(); };
  setInterval(() => { if (cur >= 0 && cur < rows.length && !fr[cur].real) { const t = (performance.now() - fr[cur].t0) / 1000; fr[cur].p = Math.max(fr[cur].p, Math.min(0.93, 1 - Math.exp(-t / 2.2))); paint(cur); } }, 120);
  const ko = (n) => Math.max(1, Math.round(n / 1024)).toLocaleString('fr-FR') + ' Ko';
  return { goto, detail: (t) => { if (rows[cur]) rows[cur].querySelector('.pl-d').textContent = t || ''; }, msg: (t) => { msg.textContent = t || ''; },
    stat: (i, items, bar) => { const e = rows[i] && rows[i].querySelector('.pl-s'); if (!e) return; e.innerHTML = '';
      if (bar && bar.some((x) => x[1] > 0)) { const tot = bar.reduce((a, x) => a + x[1], 0), b = document.createElement('div'); b.className = 'pl-st'; b.innerHTML = bar.filter((x) => x[1] > 0).map((x) => '<i style="flex:' + x[1] + ';background:' + x[2] + '" title="' + x[0] + ' : ' + x[1].toLocaleString('fr-FR') + '"></i>').join(''); e.appendChild(b);
        const lg = document.createElement('div'); lg.className = 'pl-lg'; lg.innerHTML = bar.filter((x) => x[1] > 0).map((x) => '<span><u style="background:' + x[2] + '"></u>' + x[0] + ' ' + Math.round(x[1] / tot * 100) + ' %</span>').join(''); e.appendChild(lg); }
      const RX = /^([\d\s\u202f\u00a0,]*\d(?: [KkMm]o)?)\s+(.+)$/, its = (items || []).filter(Boolean), hero = its.filter((x) => RX.test(x)).slice(0, 3), h = document.createElement('div'); h.className = 'pl-h';
      h.innerHTML = hero.map((x) => { const m = RX.exec(x); return '<div><b>' + m[1] + '</b><small>' + emo(m[2]) + m[2] + '</small></div>'; }).join(''); if (hero.length) e.appendChild(h);
      const cw = document.createElement('div'); cw.className = 'pl-cw'; for (const it of its) { if (hero.includes(it)) continue; const m = RX.exec(it), c = document.createElement('span'); c.className = 'pl-c'; c.innerHTML = m ? emo(m[2]) + '<b>' + m[1] + '</b>' + m[2] : emo(it) + it; cw.appendChild(c); } if (cw.children.length) e.appendChild(cw); },
    wait: () => new Promise((res) => { const b = el.querySelector('.pl-go'); b.hidden = false; b.focus(); b.onclick = () => { b.hidden = true; res(); }; }),
    map: (d) => {
      const wrap = el.querySelector('.pl-map'), img = wrap.querySelector('.pl-photo'), cv = wrap.querySelector('canvas');
      el.querySelector('.pl-cn b').textContent = d.name || ''; { const so = $('city') && $('city').selectedOptions[0], zm = so && /\((\d{5})\)/.exec(so.textContent), pop = so && +so.dataset.pop; el.querySelector('.pl-cn span').textContent = (zm ? zm[1] : (d.cp || '').slice(0, 5)) + (pop ? ' · ' + pop.toLocaleString('fr-FR') + ' habitants' : ''); }
      // Bannière = la vraie photo de la ville (medias/city-bg/<cp>.jpg, identique à celle de la sélection en page d'accueil) plutôt
      // que le plan/carte vectoriel dessiné jusqu'ici. Le plan reste en secours (canvas) si la photo est absente pour cette ville.
      const drawFallbackMap = () => {
        const g = cv.getContext('2d'), W = cv.width, H = cv.height;
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const r of d.roads) for (const q of r.p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
        const w = Math.max(1, x1 - x0), h = Math.max(1, z1 - z0), sc = Math.max(W / w, H / (h * 0.62)) , cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const X = (x) => W / 2 + (x - cx) * sc, Y = (z) => H / 2 + (z - cz) * sc;
        g.fillStyle = '#ece6d8'; g.fillRect(0, 0, W, H);
        const poly = (ring) => { g.beginPath(); ring.forEach((q, k) => k ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.closePath(); };
        const col = { grass: '#cddcae', forest: '#a9c48c', scrub: '#c3d2a0', sport: '#d9d9a6', farm: '#e4dcae', cem: '#c4d0b0', water: '#a9c8de', pool: '#a9c8de', res: '#e7dfd0', urban: '#e3dccd' };
        for (const a of d.areas || []) { const c = col[a.t]; if (!c) continue; g.fillStyle = c; for (const ring of (a.p && Array.isArray(a.p[0]) && Array.isArray(a.p[0][0]) ? a.p : [a.p])) if (ring && ring.length > 2) { poly(ring); g.fill(); } }
        g.lineCap = 'round'; g.lineJoin = 'round';
        const wd = [9, 7, 6, 5, 4, 3, 2.4, 1.2, 1, 1, 1, 1];
        for (const pass of [1, 0]) for (const r of d.roads) { if (r.k > 7) continue; const lw = Math.max(0.6, (wd[r.k] || 1) * sc * 2.2); g.strokeStyle = pass ? '#c9c2b3' : '#fbf9f4'; g.lineWidth = pass ? lw + 1.6 : lw; g.beginPath(); r.p.forEach((q, k) => k ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.stroke(); }
        g.fillStyle = 'rgba(217,119,87,.88)'; for (const b of d.buildings) { const q = b.p; if (!q || q.length < 3) continue; const px = X(q[0][0]), py = Y(q[0][1]); if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue; poly(q); g.fill(); }
        img.hidden = true; cv.hidden = false; wrap.classList.add('on');
      };
      img.hidden = false; cv.hidden = true; img.onerror = drawFallbackMap; img.onload = () => wrap.classList.add('on');
      img.src = 'medias/city-bg/' + (d.cp || '').slice(0, 5) + '.jpg';
    },
    size: (i, bytes) => { if (rows[i] && bytes > 0) rows[i].querySelector('.pl-k').textContent = ko(bytes); },
    prog: (i, f) => { if (fr[i]) { fr[i].real = true; fr[i].p = Math.max(fr[i].p, Math.min(1, f)); paint(i); } },
    done: () => { goto(rows.length); }, err: (t) => { el.classList.add('err'); msg.textContent = t; }, get cur() { return cur; } };
})();
// taille des données réellement transférées (Resource Timing) et mémoire géométrique des objets 3D construits
const resBytes = (pat) => performance.getEntriesByType('resource').filter((e) => e.name.includes(pat)).reduce((a, e) => a + (e.encodedBodySize || e.transferSize || e.decodedBodySize || 0), 0);
const geoBytes = (o) => { let n = 0; if (o) o.traverse((m) => { const g = m.geometry; if (g) { for (const k in g.attributes) n += g.attributes[k].array ? g.attributes[k].array.byteLength : 0; if (g.index) n += g.index.array.byteLength; } if (m.isInstancedMesh && m.instanceMatrix) n += m.instanceMatrix.array.byteLength; }); return n; };
const fmtN = (n) => (n || 0).toLocaleString('fr-FR');
const nres = (pat) => performance.getEntriesByType('resource').filter((e) => e.name.includes(pat)).length;
const cnt = (arr, key, val) => arr.reduce((a, o) => a + ((o[key] === val) ? 1 : 0), 0);
const join = (a) => a.filter((x) => x && !/^0\s/.test(x));
const status = (t) => { const i = STEPS.findIndex(([, k]) => t.startsWith(k)); if (i >= 0) pre.goto(i); else pre.msg(t); };

// ---------- Rendu ----------
// NOTE (tenté puis annulé) : le tampon de profondeur logarithmique corrigeait bien le scintillement eau/terrain à
// distance, mais provoquait en contrepartie un bien pire z-fighting en bandes sur toute l'eau - en pratique, three.js
// écrit alors gl_FragDepth explicitement dans le fragment shader, ce qui court-circuite le polygonOffset matériel
// (glPolygonOffset s'applique au z issu du rasterizeur AVANT le fragment shader, jamais à un gl_FragDepth réécrit) :
// tous les calages par polygonOffset entre l'eau et le reste (voirie, berges) perdaient alors tout effet. Revenu au
// tampon standard ; la protection contre le scintillement à angle rasant se fait maintenant uniquement via un
// polygonOffset plus marqué sur l'eau (cf. wmat plus bas), qui lui fonctionne correctement en tampon standard.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9cdea, 1500, 3000);   // valeur par défaut alignée sur le curseur "Distance de vue" (3 km par défaut, à la demande)
// ---------- Distorsion « barillet » (post-traitement) ----------
let distort = 0.12, tilt = 1.35;
const post = { rt: null, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
post.mat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uC: { value: 0 }, uK: { value: 0 }, uAsp: { value: 1 }, uT: { value: 0 }, uPx: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uC; uniform float uK; uniform float uAsp; uniform float uT; uniform vec2 uPx; varying vec2 vUv;
    void main(){
      vec2 a = vec2(uAsp, 1.0); vec2 o = vUv * 2.0 - 1.0; o.x -= uC; vec2 q = o * a; float r = length(q) / length(a);   // uC : centre optique (zone visible à droite du menu)
      float f = uK > 0.0 ? 1.0 / (1.0 + uK * 5.0 * r * r) : 1.0 - uK * 3.5 * r * r;                    // les bords sont étirés vers l'extérieur
      vec2 sn = (q * f) / a; sn.x += uC; vec2 uv = sn * 0.5 + 0.5;
      vec4 col = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { float e = max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0)); col.rgb = mix(col.rgb, vec3(0.015, 0.02, 0.035), smoothstep(0.0, 0.03, e)); }
      if (uT > 0.005) {   // tilt-shift : flou progressif haut/bas, couleurs un peu saturées (maquette)
        float d = abs(uv.y - 0.5) * 2.0;
        float bl = smoothstep(0.28, 1.0, d) * uT * 5.5;
        if (bl > 0.05) {
          vec4 acc = col; float wsum = 1.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.399963, rr = sqrt((float(i) + 0.5) / 12.0) * bl;
            vec2 o = vec2(cos(a), sin(a)) * rr * uPx;
            acc += texture2D(tDiffuse, uv + o); wsum += 1.0;
          }
          col = acc / wsum;
        }
        float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        col.rgb = mix(vec3(l), col.rgb, 1.0 + 0.25 * uT);
      }
      gl_FragColor = col;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
{ const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.mat); m.frustumCulled = false; post.scene.add(m); }
function ensureRT() {
  const pr = renderer.getPixelRatio(), w = Math.floor(innerWidth * pr), h = Math.floor(innerHeight * pr);
  if (!post.rt || post.rt.width !== w || post.rt.height !== h) { if (post.rt) post.rt.dispose(); post.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: LITE ? 0 : 4 }); }
}
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1.5, 30000);
camera.position.set(0, 320, 460);

const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false, minDistance: 4, maxDistance: 6000, maxPolarAngle: Math.PI / 2 - 0.02 });

// ---------- Boussole (bas droite) : le cadran (N/E/S/W) tourne, comme sur une vraie boussole dont l'aiguille reste
// alignée au nord - un repère fixe (le triangle au-dessus du cadran) indique la direction actuellement regardée.
// nord = -z (cf. lib/osm.php, ch_proj) : cap = atan2(est, nord) = atan2(dir.x, -dir.z).
const compassRose = document.querySelector('#compass .cp-rose'), compassFwd = new THREE.Vector3();
function updateCompass() {
  camera.getWorldDirection(compassFwd);
  const heading = Math.atan2(compassFwd.x, -compassFwd.z) * 180 / Math.PI;
  compassRose.setAttribute('transform', `rotate(${(-heading).toFixed(1)} 50 50)`);
}

// ---------- Lumières ----------
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x776f60, 0.6);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
const moon = new THREE.DirectionalLight(0x6f8cff, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 4096, LITE ? 1024 : 4096);
const S = 650;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 6000 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.5;
scene.add(hemi, sun, sun.target, moon, moon.target);

const sky = buildSky(); scene.add(sky.group);

// ---------- Scénario : montée des eaux ----------
// Un simple plan d'eau global (pas une vraie hydraulique, hors de portée ici), assez grand pour couvrir n'importe
// quelle ville, positionné en ALTITUDE RÉELLE (ex. ~360 m à Chambéry) plutôt que sur une élévation relative : le
// curseur est calé, pour chaque ville, sur l'altitude min/max réelle de son emprise (cf. load()
// pour le calage des bornes min/max/value du <input id="flood">) - une station de ski à 1600 m a ainsi un curseur
// qui va de 1200 à 2000 m, pas 0 à 200 m, qui n'avait de sens que pour une ville au niveau de la mer. Matériau
// identique (vagues + reflet du ciel) à celui des lacs/rivières (buildWaterMaterial, cf. roads.js), mais totalement
// opaque : contrairement à un lac/une rivière peu profonde, on ne doit JAMAIS voir les bâtiments engloutis par transparence.
let floodPlane = null, floodWU = null, floodOn = false;

// ---------- Monde ----------
let bridgeList = [], bridgesG = null, sidewalksG = null, furn = null, signs = null, deco = null, barriersG = null, catenaryG = null;
let terrain = null, city = null, lampMat = null, lampPts = null, trees = null;
const layers = {}; let traffic = null, lights = null, curNight = 0;

// ---------- Écran d'accueil : choix de la ville, avec statistiques et poids du téléchargement ----------
async function pickCity() {
  const el = $('loading'); el.classList.add('picking');
  // les visuels de la prez ne démarrent leur téléchargement qu'une fois la bannière vidéo en lecture : sur connexion lente (6 connexions
  // HTTP/1.1 par hôte), les images partaient en même temps qu'elle et la faisaient attendre derrière.
  let gateOpen = false;
  const gate = (h) => gateOpen ? h : h.replace(/<img\b(?![^>]*favicon)([^>]*?)\ssrc=/g, '<img$1 data-src=');
  const gateEl = (root) => { if (!gateOpen) root.querySelectorAll('img[src]').forEach((i) => { i.dataset.src = i.getAttribute('src'); i.removeAttribute('src'); }); };
  const openGate = () => { if (gateOpen) return; gateOpen = true; box.querySelectorAll('img[data-src]').forEach((i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); }); };
  const box = document.createElement('div'); box.className = 'pk'; box.innerHTML = gate(`
    <div class="pk-h">
	
	
	
	
      <div class="pk-hero"><h1><img src="favicon.png" height="40px"> R<span class="lg-t">t</span>TT</h1><p class="pk-full">Real-Time Town Traffic</p></div>
	  
	  <video poster="medias/videos/banner.jpg" preload="auto" autoplay loop muted playsinline width="100%" style="display: block;    width: 100%;    max-width: 100%;    height: auto;    border-radius:16px;    overflow: hidden; margin-bottom:40px;">
      <source src="medias/videos/banner.mp4" type="video/mp4">
	  </video>
	  
	  <br>
      
	  
	  
	  <div class="pk-intro">
        <div class="pk-pitch">
          <h2>Le principe</h2>
          <p class="pk-lede"><strong>Votre ville en 3D vivante,</strong> reconstituée bâtiment par bâtiment, rue par rue, relief compris, et mise en mouvement avec la circulation de milliers de véhicules en tous genres, minute après minute. 
		  <br><br>
		  <strong>Choisissez une ville</strong>. Survolez-la librement ! Glissez-vous au ras du bitume ou regardez du haut des montagnes, ou encore <strong>grimpez à bord d'un véhicule</strong> en cliquant dessus, et laissez le temps filer jusqu'à voir le jour basculer dans le crépuscule.</p>
		  
		  
	  <img src="medias/presentation/maquette.jpg" alt="Mode maquette" style="width: 100%; border-radius:16px; display:block; margin:14px 0;">
	  <video autoplay loop muted playsinline width="100%" style="display: block;    width: 100%;    max-width: 100%;    height: auto;    border-radius:16px;    overflow: hidden; margin-bottom:40px;">
      <source src="medias/videos/360-courte-acceleree.mp4" type="video/mp4">
	  </video>
		  
		  
		  
          <ul class="pk-feat">
            <li><i class="pk-fi">🚗</i><div class="pk-ft"><b>Une circulation bien vivante</b><span>Voitures, bus, poids lourds, motos et vélos se partagent la ville : les véhicules motorisés empruntent le <strong>vrai réseau routier</strong> — sens uniques, ronds-points — tandis que les vélos roulent, quand elle existe, sur leur <strong>propre piste cyclable</strong>, à l'écart du reste du trafic. Le tout avec une densité qui change du tout au tout selon l'heure que vous choisissez.</span><img src="medias/presentation/carrefour.jpg" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi">🏍️</i><div class="pk-ft"><b>Des dépassements malins</b><span>Les véhicules rapides cherchent à doubler ceux qui roulent moins vite, <strong>sans provoquer ni accident ni embouteillage</strong> : les vélos sont doublés par tous les véhicules motorisés, et les motos doublent tout le monde encore plus vite. Avant de doubler comme avant de tourner, les véhicules motorisés <strong>allument leurs clignotants</strong> pour indiquer leur intention.</span></div></li>
            <li><i class="pk-fi">🚦</i><div class="pk-ft"><b>Un soupçon de code de la route</b><span>Les clignotants ne servent pas qu'au dépassement : ils <strong>anticipent aussi les changements de direction</strong> aux carrefours. Les vélos, faute de clignotants, <strong>tendent le bras</strong> du côté où ils s'apprêtent à tourner. Et tout véhicule qui freine ou ralentit voit s'allumer ses <strong>feux stop rouges à l'arrière</strong>, pour une lecture du trafic plus réaliste. Chaque véhicule anticipe aussi la route : il <strong>freine avant d'aborder un virage</strong> serré et <strong>réaccélère</strong> dès que la ligne droite revient. Et en cas de bouchon sur une route assez rapide, les <strong>derniers véhicules de la file allument leurs feux de détresse</strong> pour prévenir ceux qui arrivent du ralentissement.</span></div></li>
            <li><i class="pk-fi">🚆</i><div class="pk-ft"><b>Et même les trains !</b><span>Ils circulent eux aussi sur <strong>leurs propres voies</strong>, au fil de la journée, aux côtés de la circulation routière.</span><img src="medias/presentation/trains.jpg" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi">🎮</i><div class="pk-ft"><b>Devenez passager de n'importe quel véhicule</b><span><strong>Cliquez sur n'importe quel véhicule</strong> pour embarquer à son bord et voir la ville défiler comme si vous étiez au volant.</span></div></li>
            <li><i class="pk-fi">🕹️</i><div class="pk-ft"><b>Une caméra totalement libre</b><span><strong>Zoomez, tournez, réglez la hauteur de caméra</strong> — du niveau de la rue jusqu'à la vue aérienne pour explorer la ville sous tous les angles.</span></div></li>
            <li><i class="pk-fi">🌗</i><div class="pk-ft"><b>Le temps qui passe</b><span>Faites défiler les heures : le jour laisse place à la nuit, et <strong>lampadaires, feux tricolores, vitrines, fenêtres des immeubles et lieux importants</strong> (mairie, église, monuments…) s'allument progressivement à mesure que le soleil descend, pour une ambiance nocturne saisissante.</span></div></li>
            <li><i class="pk-fi">✨</i><div class="pk-ft"><b>Lumières temps réel</b><span>Bien plus qu'un simple cycle jour/nuit : les <strong>ombres portées bougent et s'allongent</strong> en suivant la position réelle du soleil, les <strong>feux tricolores changent de couleur</strong> à chaque carrefour, et les <strong>feux stop rouges</strong> des véhicules s'allument à chaque freinage. 
			<br><br>
			À la nuit tombée, les <strong>fenêtres s'allument une à une, chacune indépendamment</strong>, et tous les véhicules roulent <strong>phares allumés</strong> : tout ce qui produit un effet de lumière est simulé en temps réel.</span><img src="medias/presentation/chambery-by-night.jpg" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi pk-fi-wip">🚧</i><div class="pk-ft"><b>Work in progress</b><span>Pour le moment, <strong>les feux tricolores ne sont pas respectés</strong>, ni les ronds-points ni les priorités à droite. C'est globalement un joyeux bazar ! 😅</span></div></li>
          </ul>
        </div>
        <div class="pk-sources">




          <h2>D'où viennent les données ?</h2>
          <p class="pk-lede">Le projet représente aujourd'hui <strong>près de 4 Go</strong> de données pour <strong>environ 320 000 fichiers</strong>, principalement des tuiles de photos satellites.</p>
          <ul class="pk-src">
            <li><i class="pk-fi">🗺️</i><div class="pk-ft"><b>1. Cartographie</b><span><strong>Bâtiments et routes</strong> (emprise, hauteur estimée, classe, sens, nombre de voies) : <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a>, cartographiée par des contributeurs bénévoles du monde entier sous <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">licence ODbL</a>.</span>
			
					
			  <video autoplay loop muted playsinline width="100%" style="display: block;    width: 100%;    max-width: 100%;    height: auto;    border-radius:16px;    overflow: hidden; margin-top:40px;">
			  <source src="medias/videos/modelisation.mp4" type="video/mp4">
			  </video>
			
			
			</div></li>
            <li><i class="pk-fi">🏔️</i><div class="pk-ft"><b>2. Relief</b><span><strong>Altitude du terrain, point par point</strong> sur toute l'emprise de la ville : <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>, jeu de données <a href="https://github.com/tilezen/joerd" target="_blank" rel="noopener">Terrarium</a> (projet Tilezen), un modèle numérique de terrain mondial qui sert à sculpter le sol sous les routes, les bâtiments et les arbres.</span><img src="medias/presentation/relief.jpg" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi">🛰️</i><div class="pk-ft"><b>3. Photos satellites haute résolution</b><span><strong>Imagerie aérienne haute résolution</strong>, jusqu'à 0,6 m au sol par pixel à proximité de la caméra (un peu moins précise au loin, pour préserver les performances), drapée sur les routes, trottoirs et talus pour un rendu réaliste : <a href="https://www.geoportail.gouv.fr/" target="_blank" rel="noopener">IGN Géoplateforme</a> (BD ORTHO, service <a href="https://geoservices.ign.fr/services-web-experts" target="_blank" rel="noopener">Géoservices</a>), sous <a href="https://www.data.gouv.fr/pages/legal/licences/etalab-2.0" target="_blank" rel="noopener">licence ouverte</a> Etalab.</span><img src="medias/presentation/satellite.jpg" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi">🚏</i><div class="pk-ft"><b>4. Véritables mobiliers urbains, fontaines, commerces</b><span><strong>Lampadaires, feux tricolores, arrêts de bus, bancs, poubelles, fontaines…</strong> : chaque élément vient d'un authentique point OpenStreetMap réel, positionné et catégorisé par des contributeurs locaux. Commerces, services et lieux nommés (boulangeries, pharmacies, mairies, écoles, monuments…) proviennent de la même source, avec leur nom et leur catégorie d'origine.</span><img src="medias/presentation/enseignes.png" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi">🌳</i><div class="pk-ft"><b>5. Végétation authentique</b><span><strong>Chaque arbre cartographié un par un</strong> sur OpenStreetMap est planté à sa position exacte, avec son essence quand elle est renseignée (<strong>chêne, platane, tilleul, marronnier</strong>…) et sa hauteur estimée, pour des silhouettes crédibles plutôt qu'un décor générique. Dans les bois, parcs et jardins où OpenStreetMap ne détaille pas chaque arbre, la canopée est complétée automatiquement à partir de la photo aérienne IGN elle-même : les zones de feuillage y sont détectées par analyse de couleur (vert sombre = frondaison), pour ne jamais laisser un bois cartographié vide. Pelouses, broussailles, haies et parcelles agricoles suivent le même principe : chaque type d'espace vert vient d'un tag OpenStreetMap réel, jamais d'un remplissage arbitraire.</span><img src="medias/presentation/vegetation.jpg" style="width: 100%; margin-top: 20px; border-radius:16px; "></div></li>
            <li><i class="pk-fi">📐</i><div class="pk-ft"><b>6. Corrections des bâtiments & routes</b><span><a href="https://cadastre.data.gouv.fr/" target="_blank" rel="noopener">Cadastre officiel</a> (DGFiP) et <a href="https://geoservices.ign.fr/bdtopo" target="_blank" rel="noopener">BD TOPO</a> (IGN), licence ouverte — une vérification automatique, rejouée pour chaque ville, qui corrige les imprécisions ponctuelles d'OpenStreetMap (bâtiments ou tronçons de route mal placés ou obsolètes).</span></div></li>
          </ul>
        </div>
        <div class="pk-apoc">
            <h2>Déclenchez l'apocalypse !</h2>
            <p>Avec le curseur <strong>« Niveau de l'eau »</strong>, faites <strong>monter puis redescendre les eaux</strong> du point le plus bas au point le plus haut de la ville, et regardez l'inondation gagner <strong>en temps réel</strong> l'environnement et les villes : plaines, vallées, rues et bâtiments disparaissent peu à peu sous la nappe d'eau, puis réapparaissent à la décrue.</p>
            <p>Le bouton <strong>« Simuler l'Apocalypse »</strong> déroule le scénario tout seul en une minute : l'eau monte très progressivement jusqu'au maximum, puis se retire exactement à son niveau de départ, pendant qu'une caméra haute tourne autour de la scène.</p>
            <video autoplay loop muted playsinline width="100%" style="display: block; width: 100%; max-width: 100%; height: auto; border-radius:16px; overflow: hidden; margin-top:20px;">
              <source src="medias/videos/apocalypse.mp4" type="video/mp4">
            </video>
          </div>
          <div class="pk-how">
            <h2>Comment ça marche ?</h2>
            <p>M'enfin... Un brin de bon sens ! <strong>CA NE MARCHE PAS !</strong></p>
            
            <ul class="pk-how-list">
              <li><strong>Des trains lancés à 140 km/h</strong> sautent littéralement par-dessus les véhicules de l'autoroute.</li>
              <li><strong>Deux vélos en conflit</strong> sur une priorité en centre-ville peuvent générer un bouchon de 1 000 véhicules motorisés en 5 min alors qu'il suffirait de leur rouler dessus.</li>
              <li>On a déjà vu des véhicules traverser des bâtiments ou des montagnes en ligne droite.</li>
            </ul>
			
            
          </div>
      </div>
      <a id="villes" class="pk-anchor" aria-hidden="true"></a>
      <p class="pk-cta">Choisissez une ville à explorer en temps réel</p>
    </div>
    <div class="pk-g"><p class="pk-w">Analyse des villes disponibles…</p></div>
    <div class="pk-gallery">
      <h2>Galerie</h2>
      <div class="pk-gvideo"><video controls autoplay loop muted playsinline><source src="medias/videos/360.mp4" type="video/mp4"></video></div>
      <div class="pk-gimgs" id="pk-gimgs"><p class="pk-w">Chargement des images…</p></div>
    </div>
    <footer class="pk-foot"><span class="pk-foot-src">Toute ressemblance, de près ou de loin, avec une ville réelle est absolument faite exprès</span></footer>`);
  el.appendChild(box);
  // clic sur la bannière ou n'importe où dans l'intro / la galerie (sauf lecteur vidéo et liens) : ancre HTML (#villes) juste avant « Choisissez une ville », sur la même page
  { const toCities = (e) => { if (e.target.closest('a, video[controls]')) return; e.preventDefault(); if (location.hash !== '#villes') location.hash = 'villes'; else box.querySelector('#villes').scrollIntoView({ behavior: 'smooth' }); };
    [box.querySelector('.pk-h video'), box.querySelector('.pk-intro'), box.querySelector('.pk-gallery')].forEach((n) => { if (n) { n.classList.add('pk-jump'); n.addEventListener('click', toCities); } }); }
  // priorité de chargement des vidéos (lourdes, jusqu'à ~60 Mo) : 1) la bannière d'en-tête, 2) toutes les autres, UNE À LA FOIS
  // (pour ne pas se disputer la bande passante), dès que la précédente est bufferisée - la plus proche de l'écran d'abord, recalculé
  // à chaque fois ; 3) une vidéo qui entre à l'écran sans être encore chargée passe immédiatement devant, en parallèle.
  { const all = [...box.querySelectorAll('video')], ban = all.find((v) => /banner\.mp4/.test(v.innerHTML)), pend = new Set(all.filter((v) => v !== ban));
    const dist = (v) => { const r = v.getBoundingClientRect(); return r.bottom < 0 ? -r.bottom : r.top > innerHeight ? r.top - innerHeight : 0; };
    const start = (v, done) => { if (!pend.delete(v)) return done && done();
      let fin = false; const end = () => { if (fin) return; fin = true; ['canplaythrough', 'suspend', 'error'].forEach((ev) => v.removeEventListener(ev, end)); clearTimeout(tm); done && done(); };
      const tm = setTimeout(end, 45000);   // filet de sécurité : connexion trop lente, on enchaîne quand même
      ['canplaythrough', 'suspend', 'error'].forEach((ev) => v.addEventListener(ev, end));
      v.querySelectorAll('source[data-src]').forEach((c) => { c.src = c.dataset.src; c.removeAttribute('data-src'); }); v.preload = 'auto'; v.load();
      v.addEventListener('canplay', () => v.play().catch(() => {}), { once: true }); };
    for (const v of pend) { v.preload = 'none'; v.removeAttribute('autoplay'); v.querySelectorAll('source').forEach((c) => { c.dataset.src = c.getAttribute('src'); c.removeAttribute('src'); }); }
    const next = () => { if (!pend.size) return; start([...pend].sort((x, y) => dist(x) - dist(y))[0], next); };
    const vis = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && pend.has(e.target)) { vis.unobserve(e.target); start(e.target); } }), { rootMargin: '200px 0px' });
    for (const v of pend) vis.observe(v);
    let go = false; const launch = () => { if (go) return; go = true; next(); };
    if (ban) { ['canplaythrough', 'suspend', 'error'].forEach((ev) => ban.addEventListener(ev, launch, { once: true }));
      ban.addEventListener('playing', openGate, { once: true }); ban.addEventListener('canplay', () => ban.play().catch(() => {}), { once: true });
      setTimeout(openGate, 10000); setTimeout(launch, 12000); } else { openGate(); launch(); } }
  // galerie d'images : liste tirée de medias.php (scan de medias/images), pour ne jamais avoir à retoucher ce
  // fichier quand les visuels changent - simples vignettes, sans lien vers l'image en pleine résolution.
  // le nom affiché est déduit du nom de fichier ("le-fort-de-montmelian.png" -> "Le Fort De Montmelian").
  (async () => {
    const gi = box.querySelector('#pk-gimgs');
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // préfixe numérique optionnel ("04-rotonde-...") : sert à ordonner les fichiers mais n'apparaît pas dans le titre.
    const titleOf = (f) => esc(f.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[-_]+/, '').replace(/[-_]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
    try {
      const imgs = await (await fetch('medias.php?t=' + Date.now(), { cache: 'no-store' })).json();
      if (!imgs.length) { gi.innerHTML = '<p class="pk-w">Aucune image pour le moment.</p>'; return; }
      const card = (f) => { const t = titleOf(f); return `<div class="pk-gimg"><img src="medias/images/${encodeURIComponent(f)}" loading="lazy" alt="${t}"><div class="pk-n"><b>${t}</b></div></div>`; };
      // 2 colonnes en "round-robin" (image 1 et 3 à gauche, 2 et 4 à droite…) pour respecter l'ordre alphabétique
      // des fichiers tout en empilant chaque colonne sans espace perdu (voir .pk-gcol dans le CSS).
      const left = imgs.filter((_, i) => i % 2 === 0).map(card).join('');
      const right = imgs.filter((_, i) => i % 2 === 1).map(card).join('');
      gi.innerHTML = `<div class="pk-gcol">${left}</div><div class="pk-gcol">${right}</div>`; gateEl(gi);
    } catch { gi.innerHTML = '<p class="pk-w">Images indisponibles.</p>'; }
  })();
  const list = await (await fetch('cities.php')).json(), g = box.querySelector('.pk-g'); g.innerHTML = '';
  const fkm = (v) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace('.', ',')) + ' km';   // 3,2 km / 12 km
  const fm = (n) => (n || 0).toLocaleString('fr-FR'), mo = (b) => { const m = b / 1048576; return m >= 10 ? Math.round(m).toLocaleString('fr-FR') + ' Mo' : m.toFixed(1).replace('.', ',') + ' Mo'; };
  const last = (() => { try { return localStorage.getItem('ycbn-city'); } catch (e) { return null; } })();
  for (const c of list) {
    const a = document.createElement('a'); a.className = 'pk-c' + (c.cp === last ? ' last' : ''); a.href = '?cp=' + c.cp;
    const T = (t, d) => ' data-tip="' + (t + '|' + d).replace(/"/g, '&quot;') + '"', E = (e) => '<em class="pk-e">' + e + '</em>', dn = (n) => fm(Math.round(n / Math.max(0.1, c.km2))), sz = fm(c.disk || 0);
    a.innerHTML = '<div class="pk-m"><img class="pk-photo" src="medias/city-bg/' + c.cp + '.jpg" alt="" loading="lazy" onerror="this.closest(\'.pk-m\').classList.add(\'pk-m-nf\');this.remove()"><canvas width="640" height="260"></canvas><div class="pk-n"><b>' + c.name + '</b><span>' + c.zip + (c.cp === last ? ' · dernière visite' : '') + '</span></div><i class="pk-dl"' + T('Volume des données', mo(c.disk || c.mb * 1048576) + ' sur disque (' + sz + ' octets) répartis en ' + fm(c.files) + ' fichiers : bâtiments, routes, relief et photos aériennes de la ville') + '>' + E('💾') + ' ' + mo(c.disk || c.mb * 1048576) + ' · ' + fm(c.files) + ' fichiers</i></div>'
      + '<div class="pk-s"><span' + T('Habitants', (c.pop ? fm(c.pop) : '?') + ' habitants (population légale INSEE)') + '><b>' + (c.pop ? fm(c.pop) : '—') + '</b>' + E('👥') + ' habitants</span><span' + T('Bâtiments', fm(c.bat) + ' bâtiments modélisés en 3D, soit environ ' + dn(c.bat) + ' au km²') + '><b>' + fm(c.bat) + '</b>' + E('🏠') + ' bâtiments</span><span' + T('Arbres', fm(c.arb) + ' arbres placés sur la carte, soit environ ' + dn(c.arb) + ' au km²') + '><b>' + fm(c.arb) + '</b>' + E('🌳') + ' arbres</span><span' + T('Voirie', fm(c.km) + ' km de voies (routes, rues, chemins), soit ' + fm(Math.round(c.km / Math.max(0.1, c.km2))) + ' km par km²') + '><b>' + fm(c.km) + ' km</b>' + E('🛣️') + ' de voirie</span></div>'
      + '<div class="pk-t"><span' + T('Superficie', Math.round(c.km2).toLocaleString('fr-FR') + ' km² de zone modélisée autour du centre-ville (carré de ' + fkm(c.rkm * 2) + ' de côté)') + '>' + E('📐') + ' ' + Math.round(c.km2).toLocaleString('fr-FR') + 'km² (~' + Math.max(1, Math.round(c.rkm)) + 'km de rayon)</span>' + (c.eglises ? '<span' + T('Lieux de culte', fm(c.eglises) + ' églises, chapelles ou autres lieux de culte') + '>' + E('⛪') + ' ' + fm(c.eglises) + '</span>' : '') + (c.ecoles ? '<span' + T('Écoles', fm(c.ecoles) + ' écoles, collèges, lycées et universités') + '>' + E('🏫') + ' ' + fm(c.ecoles) + '</span>' : '') + (c.hop ? '<span' + T('Hôpitaux', fm(c.hop) + ' bâtiments hospitaliers') + '>' + E('🏥') + ' ' + fm(c.hop) + '</span>' : '') + '<span' + T('Commerces et lieux', fm(c.shops) + ' commerces et lieux référencés, affichés comme enseignes la nuit') + '>' + E('🛒') + ' ' + fm(c.shops) + '</span>' + (c.peaks ? '<span' + T('Sommets', fm(c.peaks) + ' sommets repérés dans le relief') + '>' + E('⛰️') + ' ' + fm(c.peaks) + '</span>' : '') + '</div>';
    a.onclick = () => { try { localStorage.setItem('ycbn-city', c.cp); } catch (e) { /* stockage indisponible */ } };
    gateEl(a); g.appendChild(a);
    const cv = a.querySelector('canvas'), x = cv.getContext('2d'), W = cv.width, H = cv.height, [x0, z0, x1, z1] = c.ext, sc = Math.max(W / Math.max(1, x1 - x0), H / Math.max(1, z1 - z0)) * 1.0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const X = (v) => W / 2 + (v - cx) * sc, Y = (v) => H / 2 + (v - cz) * sc;
    x.fillStyle = '#ece6d8'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#a9c8de'; for (const r of c.thumb.w) { x.beginPath(); r.forEach((q, k) => k ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.closePath(); x.fill(); }
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const pass of [1, 0]) for (const [k, q] of c.thumb.r) { x.strokeStyle = pass ? '#a89f8e' : '#ffffff'; x.lineWidth = (k <= 2 ? 4.2 : k <= 4 ? 3 : 2) + (pass ? 1.6 : 0); x.beginPath(); q.forEach((p, i) => i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1]))); x.stroke(); }
    x.fillStyle = 'rgba(217,119,87,.85)'; for (const q of c.thumb.b) x.fillRect(X(q[0]) - 1.6, Y(q[1]) - 1.6, 3.2, 3.2);
  }
  { // infobulle instantanée aux couleurs du thème
    const tip = document.createElement('div'); tip.className = 'pk-tip'; box.appendChild(tip); let cur = null;
    const show = (t) => { const r = t.getBoundingClientRect(); { const [h, d] = t.dataset.tip.split('|'); tip.innerHTML = '<b></b><span></span>'; tip.firstChild.textContent = h; tip.lastChild.textContent = d; } tip.classList.add('on'); const w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; tip.style.top = (r.top - tip.offsetHeight - 10 < 8 ? r.bottom + 10 : r.top - tip.offsetHeight - 10) + 'px'; };
    box.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && t !== cur) { cur = t; show(t); } else if (!t) { cur = null; tip.classList.remove('on'); } });
    box.addEventListener('mouseleave', () => { cur = null; tip.classList.remove('on'); }); el.addEventListener('scroll', () => { cur = null; tip.classList.remove('on'); });
  }
  if (!list.length) g.innerHTML = '<p class="pk-w">Aucune ville disponible.</p>';
}
async function load() {
  if (!new URLSearchParams(location.search).get('cp')) { try { await pickCity(); return; } catch (e) { console.error('pickCity', e); } }
  status('Chargement des données…');
  const CP = new URLSearchParams(location.search).get('cp') || '73000';
  const data = await (async () => { // téléchargement en flux : octets reçus affichés en direct
    const r = await fetch('data.php?cp=' + CP), tot = +r.headers.get('content-length') || 0;
    if (!r.body || !r.body.getReader) return r.json();
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; pre.size(0, got); if (tot) { pre.prog(0, got / tot); pre.msg(Math.round(got / tot * 100) + ' %'); } }
    pre.detail('analyse…'); pre.prog(0, 0.97); await new Promise((r2) => setTimeout(r2));
    return JSON.parse(await new Blob(parts).text());
  })(); if (!data.cp) data.cp = CP;
  { const A = data.areas || [], S = data.street || [], F = data.furn || [];
    pre.stat(0, join([fmtN(data.buildings.length) + ' bâtiments', fmtN(data.trees.length + (data.treesx || []).length) + ' arbres', fmtN(data.roads.length) + ' tronçons de voies', fmtN(A.length) + ' zones (parcs, eau, bois…)', fmtN(F.length) + ' équipements routiers', fmtN(S.length) + ' objets urbains', fmtN((data.shops || []).length) + ' commerces & lieux', fmtN((data.numbers || []).length) + ' numéros de rue', fmtN((data.labels || []).length) + ' toponymes', fmtN((data.peaks || []).length) + ' sommets', 'densité ' + fmtN(Math.round(data.buildings.length / Math.max(1, (data.bbox[3] - data.bbox[1]) * 111.32 * Math.cos(data.center[0] * Math.PI / 180) * (data.bbox[2] - data.bbox[0]) * 110.54))) + ' bât./km²', 'centre ' + data.center.map((v) => v.toFixed(4)).join(', '), 'emprise ' + Math.round((data.bbox[3] - data.bbox[1]) * 111.32 * Math.cos(data.center[0] * Math.PI / 180) * 10) / 10 + ' × ' + Math.round((data.bbox[2] - data.bbox[0]) * 110.54 * 10) / 10 + ' km'])); }
  addrIdx = buildAddr(data); try { pre.map(data); } catch (e) { console.error('pre.map', e); }
  { let nw = 0; for (const r of data.roads || []) if (r.ow && r.ln && !r.w && r.k <= 4 && !r.rb) { const w = Math.max(4.4, r.ln * 3.3 + 1.2), d = { 0: 14, 1: 10.5, 2: 8.5, 3: 7.2, 4: 5.6 }[r.k]; if (w < d - 0.2) { r.w = w; nw++; } }   // sens unique à n voies (OSM lanes) : la chaussée dessinée fait la largeur de ses n voies (avant : 1 voie dans une chaussée de 2-3 voies, véhicules « à cheval » sur le tiret central)
    window.__owNarrow = nw; }
  { // indice de ruralité (0 = ville dense, 1 = campagne) d'après la densité de bâtiments sur l'emprise
    const [bs, bw, bn, be] = data.bbox || [0, 0, 0, 0], km2 = Math.max(1, (bn - bs) * 110.54 * (be - bw) * 111.32 * Math.cos((bs + bn) / 2 * Math.PI / 180));
    data.ru = Math.max(0, Math.min(1, (300 - data.buildings.length / km2) / 250)); window.__ru = data.ru;
  }
  status('Relief…');
  const elev = await loadDem(data); pre.size(1, resBytes('/relief/')); pre.stat(1, join([fmtN(nres('/relief/')) + ' tuiles d\'altitude', fmtN((data.peaks || []).length) + ' sommets repérés', 'rayon ' + (data.demRadius / 1000).toFixed(1).replace('.', ',') + ' km']));
  status('Terrain…');
  terrain = buildTerrain(data, elev); window.__terrain = terrain; scene.add(terrain.mesh); terrain.refreshLocal(0, 0); pre.size(2, geoBytes(terrain.mesh)); pre.stat(2, join([fmtN(Math.round(geoBytes(terrain.mesh) / 32)) + ' points de maillage', terrain.hasRelief ? 'relief réel' : 'terrain plat', 'photo aérienne à la demande']));
  { const { material, uniforms } = buildWaterMaterial(terrain, { opacity: 1, transparent: false }); floodWU = uniforms; window.__floodWU = uniforms;
    // 128x128 segments (pas 1x1 par défaut) : un plan de 60 km en seulement 2 triangles fait courir
    // l'interpolation barycentrique/perspective du GPU sur une distance énorme en un seul triangle, ce qui
    // produit, vu de haut, un "éventail" de bandes radiant depuis le nadir de la caméra (signalé sur le lac
    // du Bourget en mode Apocalypse) - un artefact de précision de rastérisation, PAS le même phénomène que
    // le moiré de houle (déjà traité dans buildWaterMaterial). Subdiviser le maillage le supprime à la racine.
    floodPlane = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 128, 128), material); window.__floodPlane = floodPlane;
    floodPlane.rotation.x = -Math.PI / 2; floodPlane.visible = false; floodPlane.renderOrder = 5; floodPlane.frustumCulled = false;
    scene.add(floodPlane);
    // Curseur recalé sur le relief réel de CETTE ville : min = altitude du point le plus bas, max = altitude du point le plus
    // haut de son emprise (bbox des données, en repère local : x = est, z = sud), relevées dans le MNT déjà chargé (pas de
    // retéléchargement). Valeur initiale = min, qui reste le repère "désactivé" (cf. listener ci-dessous).
    { const [bs, bw, bn, be] = data.bbox || [0, 0, 0, 0], [la0, lo0] = data.center || [0, 0];
      const kx = 111320 * Math.cos(la0 * Math.PI / 180), kz = 110540;
      const xa = (bw - lo0) * kx, xb = (be - lo0) * kx, za = -(bn - la0) * kz, zb = -(bs - la0) * kz;
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      let lo = Infinity, hi = -Infinity;
      for (let z = z0; z <= z1 + 1e-6; z += 20) for (let x = x0; x <= x1 + 1e-6; x += 20) { const e = terrain.absElev(x, z); if (e < lo) lo = e; if (e > hi) hi = e; }
      if (!isFinite(lo)) { lo = Math.round(terrain.absElev(0, 0)); hi = lo + 50; }
      lo = Math.floor(lo); hi = Math.max(Math.ceil(hi), lo + 5);
      $('flood').min = lo; $('flood').max = hi; $('flood').value = lo; }
    $('flood').dispatchEvent(new Event('input')); }
  await new Promise((r) => setTimeout(r));
  try { bridgeList = liftBridges(data, terrain); } catch (e) { console.error('liftBridges', e); }   // les tabliers de ponts sont relevés AVANT le tracé des routes
  status('Routes…');
  await new Promise((r) => setTimeout(r));
  const roads = await buildRoads(data, terrain); scene.add(roads.land, roads.water); layers.roads = roads.land; layers.rivers = roads.water; pre.size(3, geoBytes(roads.land) + geoBytes(roads.water)); { const R = data.roads, A = data.areas || []; pre.stat(3, join([fmtN(R.length) + ' tronçons', fmtN(Math.round(R.reduce((a, r) => { let l = 0; const q = r.p; for (let i = 1; i < q.length; i++) l += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return a + l; }, 0) / 1000)) + ' km de voirie', fmtN(R.filter((r) => r.k <= 3).length) + ' axes principaux', fmtN(R.filter((r) => r.k >= 4 && r.k <= 6).length) + ' rues', fmtN(cnt(R, 'k', 7)) + ' chemins & voies douces', fmtN(R.filter((r) => r.ow).length) + ' sens uniques', fmtN(R.filter((r) => r.cy).length) + ' pistes cyclables', fmtN(R.filter((r) => r.nm).length) + ' rues nommées', fmtN(R.filter((r) => r.rb).length) + ' ronds-points', fmtN(R.filter((r) => r.b).length) + ' ponts', fmtN(R.filter((r) => r.tr).length) + ' tunnels', fmtN(A.filter((a) => a.t === 'water').length) + ' plans d\'eau & rivières'])); }
  status('Bâtiments…');
  await new Promise((r) => setTimeout(r));
  city = buildBuildings(data, terrain); scene.add(city.group); layers.buildings = city.group; pre.size(4, geoBytes(city.group)); { const B = data.buildings, c = (t) => cnt(B, 't', t); pre.stat(4, join([fmtN(city.count) + ' bâtiments', c('church') ? fmtN(c('church')) + ' lieux de culte' : '', c('school') + c('university') ? fmtN(c('school') + c('university')) + ' écoles & universités' : '', fmtN(c('hospital')) + ' hôpitaux', fmtN(c('hotel')) + ' hôtels', fmtN(c('retail')) + ' commerces', fmtN(c('office')) + ' bureaux', fmtN(c('industrial') + c('warehouse')) + ' usines & entrepôts', fmtN(c('apartments')) + ' immeubles', fmtN(c('house') + c('detached') + c('residential')) + ' maisons', fmtN(c('transportation')) + ' gares', fmtN(B.filter((b) => b.h >= 30).length) + ' tours de plus de 30 m', 'plus haut : ' + Math.round(B.reduce((a, b) => Math.max(a, b.h || 0), 0)) + ' m']), [['Habitat', B.filter((b) => /^(apartments|house|detached|residential|terrace|dormitory|semidetached_house|bungalow)$/.test(b.t)).length, '#d97757'], ['Commerces & bureaux', B.filter((b) => /^(retail|commercial|hotel|office|service|supermarket)$/.test(b.t)).length, '#e9a27c'], ['Industrie & annexes', B.filter((b) => /^(industrial|warehouse|garage|garages|shed|greenhouse|farm|barn|construction)$/.test(b.t)).length, '#a89f91'], ['Équipements publics', B.filter((b) => /^(school|university|hospital|government|public|church|sports_centre|transportation|civic)$/.test(b.t)).length, '#6f8fa8'], ['Autres', B.filter((b) => !b.t || !/^(apartments|house|detached|residential|terrace|dormitory|semidetached_house|bungalow|retail|commercial|hotel|office|service|supermarket|industrial|warehouse|garage|garages|shed|greenhouse|farm|barn|construction|school|university|hospital|government|public|church|sports_centre|transportation|civic)$/.test(b.t)).length, '#d6d0c4']]); }
  status('Végétation…');
  await new Promise((r) => setTimeout(r));
  pre.detail('photo aérienne…'); if (terrain.orthoReady) await Promise.race([terrain.orthoReady, new Promise((r) => setTimeout(r, 15000))]);   // la photo sert à repérer les zones boisées
  trees = buildVegetation(data, terrain); scene.add(trees.group); pre.size(5, geoBytes(trees.group) + resBytes('/orthophoto/')); { const A = data.areas || []; pre.stat(5, join([fmtN(trees.count) + ' arbres', fmtN(A.filter((a) => a.t === 'grass').length) + ' pelouses & parcs', fmtN(A.filter((a) => a.t === 'forest').length) + ' bois & forêts', fmtN(A.filter((a) => a.t === 'scrub').length) + ' broussailles', fmtN(A.filter((a) => a.t === 'sport').length) + ' terrains de sport', fmtN(A.filter((a) => a.t === 'farm').length) + ' parcelles agricoles', fmtN(A.filter((a) => a.t === 'cem').length) + ' cimetières', fmtN(A.filter((a) => a.t === 'pool').length) + ' piscines', fmtN(nres('/orthophoto/')) + ' tuiles photo aérienne']), [['Pelouses', A.filter((a) => a.t === 'grass').length, '#9bb56b'], ['Bois', A.filter((a) => a.t === 'forest').length, '#5f8a4f'], ['Broussailles', A.filter((a) => a.t === 'scrub').length, '#b5bf7d'], ['Sport', A.filter((a) => a.t === 'sport').length, '#d9b26a'], ['Champs', A.filter((a) => a.t === 'farm').length, '#e3cf8f'], ['Eau', A.filter((a) => a.t === 'water').length, '#7fa8c9']]); }
  status('Circulation…');
  await new Promise((r) => setTimeout(r));
  traffic = buildTraffic(data, terrain); window.__traffic = traffic; scene.add(traffic.group); pre.size(6, geoBytes(traffic.group)); pre.stat(6, join([traffic._ways ? fmtN(traffic._ways.length) + ' voies de circulation' : '', traffic._ways ? fmtN(traffic._ways.filter((w) => w.oneway).length) + ' voies à sens unique' : '', traffic._ways ? fmtN(traffic._ways.filter((w) => w.rb).length) + ' giratoires' : '', 'voitures, bus, camions, motos, vélos', traffic.trains ? 'trains & locomotives' : ''])); traffic.setNight(curNight); traffic.group.visible = $('show-cars').checked; { const f = 0.8 * (1 - 0.6 * (window.__ru || 0)), xm = Math.min(VEH_MAX, Math.floor(traffic.total / f / 500) * 500); $('veh').max = xm; if (+$('veh').value > xm) $('veh').value = xm; const tgt = Math.min(VEH_MAX, +$('veh').dataset.def || 0); if (tgt) { const k = traffic.setBoostedDefault(tgt / f, 1.12); $('veh').value = Math.max(0, Math.min(xm, Math.round(k / f / 500) * 500)); $('o-veh').textContent = k.toLocaleString('fr'); syncVehWarn(); } else $('veh').dispatchEvent(new Event('input')); }   // curseur linéaire (0-8000, pas de 500) plafonné à la capacité réelle du réseau ; réglage par défaut : +12 % sur les véhicules motorisés (tous genres sauf vélos), vélos inchangés (cf. setBoostedDefault dans traffic.js)
  status('Finitions…');
  // Chaque bâtisseur ci-dessous (lampadaires, ponts, glissières, caténaires, trottoirs, mobilier urbain, enseignes)
  // est synchrone et peut, à lui seul, prendre plusieurs centaines de ms à plus d'une seconde sur une grosse ville -
  // enchaînés sans interruption comme avant, ils formaient un seul bloc JS de plusieurs secondes (mesuré : ~4 s sur
  // Chambéry), risquant de déclencher le message « la page ne répond pas » de Chrome sur les machines plus lentes.
  // Un `await new Promise(setTimeout)` entre chacun (même motif que pour les autres étapes du chargement ci-dessus)
  // rend la main à chaque fois, sans changer le résultat.
  try { lights = buildStreetlights(data, terrain); lights.group.visible = $('show-lampposts').checked; scene.add(lights.group); lights.setNight(curNight); pre.size(7, geoBytes(lights.group)); { const F = data.furn || [], S = data.street || [], c = (a, t) => cnt(a, 't', t); pre.stat(7, join([fmtN(lights.count) + ' lampadaires', fmtN(c(F, 'cr')) + ' passages piétons', fmtN(c(F, 'ts')) + ' feux tricolores', fmtN(c(F, 'st')) + ' stops', fmtN(c(F, 'bs')) + ' arrêts de bus', fmtN(c(F, 'sh')) + ' abribus', fmtN(c(S, 'bn')) + ' bancs', fmtN(c(S, 'wb')) + ' poubelles', fmtN(c(S, 'bk')) + ' parkings à vélos', fmtN(c(S, 'fo')) + ' fontaines', fmtN(c(S, 'dw')) + ' fontaines à eau', fmtN(c(S, 'sa') + c(S, 'statue') + c(S, 'sculpture') + c(S, 'bust')) + ' statues & monuments', fmtN(c(S, 'pl')) + ' jardinières', fmtN((data.shops || []).length) + ' enseignes'])); } } catch (e) { console.error('streetlights', e); }
  status('Finitions : ponts, trottoirs, mobilier, enseignes…'); await new Promise((r) => setTimeout(r));
  await new Promise((r) => setTimeout(r));
  try { bridgesG = buildBridges(data, terrain, bridgeList).group; bridgesG.visible = $('show-bridges').checked; scene.add(bridgesG); } catch (e) { console.error('bridges', e); }
  await new Promise((r) => setTimeout(r));
  try { barriersG = buildBarriers(data, terrain).group; barriersG.visible = $('show-barriers').checked; scene.add(barriersG); } catch (e) { console.error('barriers', e); }
  await new Promise((r) => setTimeout(r));
  try { catenaryG = buildCatenary(data, terrain).group; catenaryG.visible = $('show-catenary').checked; scene.add(catenaryG); } catch (e) { console.error('catenary', e); }
  await new Promise((r) => setTimeout(r));
  try { sidewalksG = buildSidewalks(data, terrain).group; sidewalksG.visible = $('show-ground').checked; scene.add(sidewalksG); } catch (e) { console.error('sidewalks', e); }
  await new Promise((r) => setTimeout(r));
  try { deco = buildStreetDeco(data, terrain); deco.group.visible = $('show-deco').checked; scene.add(deco.group); } catch (e) { console.error('deco', e); }
  await new Promise((r) => setTimeout(r));
  try { furn = buildFurniture(data, terrain); furn.furn.visible = $('show-furn').checked; furn.marks.visible = $('show-ground').checked; scene.add(furn.furn, furn.marks); } catch (e) { console.error('furniture', e); }
  await new Promise((r) => setTimeout(r));
  try { signs = buildSigns(data, terrain); signs.group.visible = $('show-signs').checked; signs.setNight(curNight); scene.add(signs.group); } catch (e) { console.error('signs', e); }
  // éclairage public
  const lamps = roads.lamps.length ? roads.lamps : city.lamps;
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));   // halos de lampadaires supprimés (ressemblaient à des lucioles)
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,225,160,1)'); gr.addColorStop(0.3, 'rgba(255,200,110,.45)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  lampMat = new THREE.PointsMaterial({ size: 10, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  lampPts = new THREE.Points(lg, lampMat); lampPts.frustumCulled = false; scene.add(lampPts);

  // zone de données effective (bbox OSM : bâtiments, routes, arbres, circulation) : pointillés rouges animés, visibles en vue lointaine
  {
    const [bs, bw, bn, be] = data.bbox, LA = data.center[0], LO = data.center[1];
    const X = (lo) => (lo - LO) * 111320 * Math.cos(LA * Math.PI / 180), Z = (la) => -(la - LA) * 110540;
    const x0 = X(bw), x1 = X(be), z0 = Z(bn), z1 = Z(bs);
    const P = [], corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) { const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 25); for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, (bx - ax) / L, (bz - az) / L]); }
    P.push([...P[0]]);
    const pos = [], nor = [], sd = [], sa = [], idx = []; let acc = 0;
    P.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); for (const sg of [-1, 1]) { pos.push(p[0], 0, p[1]); nor.push(-p[3], p[2]); sd.push(sg); sa.push(acc); } if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('nrm', new THREE.Float32BufferAttribute(nor, 2));
    g.setAttribute('side', new THREE.Float32BufferAttribute(sd, 1)); g.setAttribute('arc', new THREE.Float32BufferAttribute(sa, 1)); g.setIndex(idx);
    const hs = P.map((p) => terrain.heightAt(p[0], p[1]));
    const ph = g.attributes.position; for (let i = 0; i < P.length; i++) { ph.setY(i * 2, hs[i]); ph.setY(i * 2 + 1, hs[i]); }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uW: { value: 10 }, uD: { value: 60 }, uA: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'attribute vec2 nrm; attribute float side; attribute float arc; uniform float uW; varying float vA; void main(){ vec3 p = position + vec3(nrm.x, 0., nrm.y) * side * uW; p.y += uW * 0.5; vA = arc; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }',
      fragmentShader: 'uniform float uT, uD, uA; varying float vA; void main(){ if (fract(vA / uD - uT * 1.8) > 0.55) discard; gl_FragColor = vec4(1.0, 0.1, 0.05, 1.0); }' });
    dataZone = new THREE.Mesh(g, mat); dataZone.frustumCulled = false; dataZone.renderOrder = 50; dataZone.visible = false; scene.add(dataZone);
  }

  // caméra initiale : au-dessus du centre
  const g0 = terrain.heightAt(0, 0);
  controls.target.set(0, g0, 0); camera.position.set(0, g0 + 320, 460); controls.update();

  // Récap technique (bâtiments/arbres/tronçons, sources) retiré du bas du menu (redondant avec la présentation de
  // la galerie de villes) - les avertissements de données restent en console pour le diagnostic.
  if (data.source !== 'osm') console.warn('Données de démonstration (fictives). Lancez « php tools/fetch_osm.php ».');
  else if (!data.roads || !data.roads.length) console.warn('Routes absentes : relancez « php tools/fetch_osm.php ».');
  buildPlaces(data); buildLabels(data);
  applyTime();
  pre.done(); pre.msg('Chargement terminé');
  await pre.wait(); pre.msg(''); $('loading').classList.add('done'); $('compass').classList.add('on');
}
load().catch((e) => { console.error(e); pre.err('Erreur : ' + e.message); });

// ---------- Jour / nuit ----------
let hour = 5.25;   // 05:15 par défaut au chargement de chaque ville (le défilement automatique reste inchangé)
const bg = new THREE.Color();
const skyTopC = new THREE.Color(0.5, 0.65, 0.9);
function applyTime() {
  const st = skyState(hour);
  bg.copy(st.sky); scene.background = null;
  scene.fog.color.copy(bg);
  sky.uniforms.uHor.value.copy(bg); sky.uniforms.uTop.value.copy(st.top); skyTopC.copy(st.top).lerp(bg, 0.4);
  sky.uniforms.uSun.value.copy(st.sunDir); sky.uniforms.uSunCol.value.copy(st.sunColor); sky.uniforms.uSunI.value = st.sunI > 0.01 ? 1 : 0;
  sky.stars.material.opacity = Math.max(0, st.night * 1.2 - 0.3);
  { // lune : phase réelle (date du jour), position sur la voûte décalée du soleil selon la phase
    const jd = Date.now() / 86400000 + 2440587.5, f = (((jd - 2451550.26) / 29.530588853) % 1 + 1) % 1, aM = st.a - f * 2 * Math.PI, e = Math.sin(aM);   // aS (angle solaire) = st.a, cohérent avec le lever/coucher jour/nuit de skyState
    sky.uniforms.uMoon.value.set(Math.cos(aM), 0.75 * e, 0.6 * Math.max(e, 0.2) * 0.8 + 0.1).normalize(); sky.uniforms.uMoonF.value = f;
    sky.uniforms.uDay.value = st.day; sky.uniforms.uDusk.value = st.dusk; window.__moonF = f;
  }
  hemi.intensity = st.hemi; hemi.color.copy(st.hemiSky);
  sun.intensity = st.sunI; sun.color.copy(st.sunColor); sun.visible = st.sunI > 0.01;
  { // centre de l'ombre calé sur la grille des texels : supprime le scintillement des ombres quand la caméra bouge
    const d = st.sunDir, r = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize(), u = new THREE.Vector3().crossVectors(d, r);
    const T = controls.target, texel = (2 * 650) / (LITE ? 1024 : 4096) * 4;
    const a = Math.round(T.dot(r) / texel) * texel, b = Math.round(T.dot(u) / texel) * texel, c = T.dot(d);
    const c0 = new THREE.Vector3().addScaledVector(r, a).addScaledVector(u, b).addScaledVector(d, c);
    sun.position.copy(c0).addScaledVector(d, 2500); sun.target.position.copy(c0);
  }
  moon.intensity = st.moonI * (0.15 + 0.85 * Math.sin(Math.PI * (window.__moonF ?? 0.5)) ** 2); moon.position.copy(controls.target).add(new THREE.Vector3(-800, 1800, -600)); moon.target.position.copy(controls.target);
  renderer.toneMappingExposure = 1.0 + st.night * 0.5;
  curNight = st.night; if (traffic) traffic.setNight(st.night); if (lights) lights.setNight(st.night); if (signs) signs.setNight(st.night); if (furn) furn.setNight(st.night); if (deco) deco.setNight(st.night);
  if (city) city.setNight(st.night, $('lights').checked, st.drive); if (city && city.setClock) city.setClock(hour);
  if (lampMat) { lampMat.opacity = $('lights').checked ? st.night : 0; lampPts.visible = lampMat.opacity > 0.01; }
  $('o-time').textContent = fmt(hour);
}
const fmt = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

$('time').addEventListener('input', (e) => { hour = +e.target.value; applyTime(); });
$('lights').addEventListener('change', applyTime);
const VEH_MAX = 8000;   // à la demande : curseur linéaire (pas plus de constante quadratique), jamais plus de 8 000 véhicules simulés quelle que soit la capacité du réseau routier de la ville
// Curseurs "coût" (distance de vue, véhicules, informations) : couleur du vert (peu d'objets/infos) au rouge (beaucoup),
// calée sur le seuil de charge au-delà duquel on est franchement dans le rouge (5 km de vue, 2000 véhicules ; pour les
// informations, le rouge est atteint au maximum du curseur). Les variables CSS --p (remplissage), --w (position du
// seuil rouge sur la piste) et --h (teinte du curseur, 120 = vert, 0 = rouge) sont lues par `input.heat` dans style.css.
const HEAT_WARN = { fog: 5000, veh: 1000 }, HEAT_BLACK = { fog: 7000, veh: 2000 };   // rouge plein au seuil WARN, puis piste et poignée NOIRES à partir de HEAT_BLACK (7 km de vue / 2 000 véhicules)
function heatSync(id) {
  const el = $(id), mn = +el.min, mx = +el.max, v = mx > mn ? Math.min(1, Math.max(0, (+el.value - mn) / (mx - mn))) : 0;
  const w = HEAT_WARN[id] && mx > mn ? Math.min(1, Math.max(0.05, (HEAT_WARN[id] - mn) / (mx - mn))) : 1;
  el.style.setProperty('--p', (v * 100).toFixed(1) + '%'); el.style.setProperty('--w', w.toFixed(3));
  el.style.setProperty('--h', String(Math.round(120 * (1 - Math.min(1, v / w)))));
  const bk = HEAT_BLACK[id] && mx > mn ? (HEAT_BLACK[id] - mn) / (mx - mn) : 3, black = +el.value >= (HEAT_BLACK[id] || Infinity);
  el.style.setProperty('--b', bk.toFixed(3)); el.style.setProperty('--s', black ? '0%' : '78%'); el.style.setProperty('--l', black ? '9%' : '44%');
}
function syncVehWarn() { heatSync('veh'); }
// boutons d'action du panneau gauche (style "plaque de laiton", cf. .act dans style.css) : seul le libellé (et, pour
// lecture/pause, l'icône) change ; la structure et le voyant restent fixes
const ACT_ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="f" d="M8 5.2v13.6l11-6.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="f" x="6.5" y="5" width="3.8" height="14" rx="1"/><rect class="f" x="13.7" y="5" width="3.8" height="14" rx="1"/></svg>',
  maq: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 20.5h17M5.5 20.5V9.5l5-3v14M10.5 20.5V4l7 3v13.5M17.5 20.5v-7l2 1v6"/><path d="M13 9.5h2M13 13h2M13 16.5h2" stroke-width="1.3"/></svg>',
  orb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20.3 3.8v4.6h-4.6"/><circle class="f" cx="12" cy="12" r="1.7"/></svg>',
  apoc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 17.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>'
};
function setAct(id, label, icon) { const b = $(id); b.querySelector('.act-t').textContent = label; if (icon) b.querySelector('.act-i').innerHTML = ACT_ICONS[icon]; }
$('veh').addEventListener('input', (e) => { const n = +e.target.value; const k = traffic ? traffic.setCount(n) : n; $('o-veh').textContent = k.toLocaleString('fr') + (traffic && k >= traffic.total ? ' (max)' : ''); syncVehWarn(); });
$('show-cars').addEventListener('change', (e) => { if (traffic) traffic.group.visible = e.target.checked; });
$('show-bridges').addEventListener('change', (e) => { if (bridgesG) bridgesG.visible = e.target.checked; });
$('show-barriers').addEventListener('change', (e) => { if (barriersG) barriersG.visible = e.target.checked; });
$('show-lampposts').addEventListener('change', (e) => { if (lights) lights.group.visible = e.target.checked; });
$('show-catenary').addEventListener('change', (e) => { if (catenaryG) catenaryG.visible = e.target.checked; });
$('show-ground').addEventListener('change', (e) => { if (sidewalksG) sidewalksG.visible = e.target.checked; if (furn) furn.marks.visible = e.target.checked; });
$('show-deco').addEventListener('change', (e) => { if (deco) deco.group.visible = e.target.checked; });
$('show-furn').addEventListener('change', (e) => { if (furn) furn.furn.visible = e.target.checked; });
$('show-signs').addEventListener('change', (e) => { if (signs) signs.group.visible = e.target.checked; });
$('trees').addEventListener('change', (e) => { if (trees) trees.group.visible = e.target.checked; });
for (const [id, k] of [['show-buildings', 'buildings'], ['show-roads', 'roads'], ['show-rivers', 'rivers']])
  $(id).addEventListener('change', (e) => { if (layers[k]) layers[k].visible = e.target.checked; });

// ---------- Lieux : clic = vol jusqu'à l'endroit ----------
let fly = null;
// ---------- Noms de routes et de quartiers ----------
const labelEls = [];
function buildLabels(data) {
  const box = $('labels'); box.innerHTML = '';
  const add = (txt, x, z, cls, max, lift, rk, lv, land) => {
    const e = document.createElement('div'); e.className = 'lbl ' + cls; e.textContent = txt; box.appendChild(e);
    const RUL = data.ru || 0;   // milieu rural : plus de textes (niveau d'info abaissé, portée accrue)
    let lv2 = lv ?? 1; if (RUL > 0.3) lv2 = Math.max(1, lv2 - (RUL > 0.7 ? 2 : 1));
    // land = repère paysager (sommet/col) : visible à sa propre portée `max`, sans être en plus bridé par le curseur
    // "Distance de vue" (scene.fog.far) - une montagne se voit de loin même quand ce réglage réduit le rendu du terrain proche
    labelEls.push({ e, x, z, max: max * (1 + RUL * 0.8), lift, v: false, rk: rk ?? 20, lv: lv2, land: !!land });
  };
  const segs = [];                                 // le nom est répété le long de la voie (espacement minimal)
  for (const r of data.roads || []) {
    if (!r.nm || r.p.length < 2) continue;
    let L = 0; for (let i = 1; i < r.p.length; i++) L += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    if (L >= (r.k >= 10 ? 30 : 25) * (1 - 0.6 * (data.ru || 0))) segs.push({ nm: r.nm, L, r });
  }
  segs.sort((a, b) => (a.r.k - b.r.k) || (b.L - a.L));
  const placed = new Map();
  for (const { nm, L, r } of segs) {
    const sp = (r.k >= 10 ? 320 : r.k <= 3 ? 320 : 200) * (1 - 0.65 * (data.ru || 0));
    const m = r.p[Math.floor(r.p.length / 2)];
    const arr = placed.get(nm) || []; placed.set(nm, arr);
    if (arr.some((q) => Math.hypot(q[0] - m[0], q[1] - m[1]) < sp)) continue;
    arr.push(m);
    add(nm, m[0], m[1], r.k === 10 ? 'water' : 'road', r.k >= 10 ? (r.k === 10 ? 5000 : 3600) : r.k <= 1 ? 2400 : r.k <= 3 ? 1800 : 1100, 6, r.k >= 10 ? 2 : r.k, r.k >= 10 ? (r.k === 10 ? 1 : 2) : r.k <= 1 ? 1 : r.k <= 3 ? 2 : r.k <= 4 ? 3 : r.k >= 7 ? 4 : 5);   // sentiers/chemins/pistes nommés (k=7/8) : niveau « Très riche » (« Riche » en milieu rural)
  }
  // cours d'eau : un seul nom par tronçon (OSM découpe un fleuve en quelques longs segments) laissait des kilomètres de lit sans étiquette ;
  // on répète le nom le long du lit, tous les ~420 m (rivières) / ~320 m (ruisseaux : répétition volontairement légère), dès le niveau « Riche », à portée réduite
  { const placedW = new Map();
    for (const { nm, r } of segs) {
      if (r.k < 10) continue;
      const step = (r.k === 10 ? 420 : 320) * (1 - 0.35 * (data.ru || 0)), arr = placedW.get(nm) || []; placedW.set(nm, arr); let acc = step * 0.5;
      for (let i = 1; i < r.p.length; i++) {
        const a0 = r.p[i - 1], b0 = r.p[i], sl = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); if (!sl) continue;
        while (acc <= sl) { const f = acc / sl, x = a0[0] + (b0[0] - a0[0]) * f, z = a0[1] + (b0[1] - a0[1]) * f; acc += step;
          if (arr.some((q) => Math.hypot(q[0] - x, q[1] - z) < step * 0.8) || (placed.get(nm) || []).some((q) => Math.hypot(q[0] - x, q[1] - z) < step * 0.8)) continue;
          arr.push([x, z]); add(nm, x, z, r.k === 10 ? 'water' : 'road', r.k === 10 ? 2500 : 1800, 6, 2, 3); }
        acc -= sl;
      }
    } }
  // niveau maximal : le nom de chaque voie est répété tous les ~70 m
  const placed2 = new Map();
  for (const { nm, r } of segs) {
    if (r.k >= 10 || r.k > 7) continue;
    const arr = placed2.get(nm) || []; placed2.set(nm, arr); let acc = 0;
    for (let i = 1; i < r.p.length; i++) {
      acc += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]); if (acc < 70 * (1 - 0.35 * (data.ru || 0))) continue; acc = 0;
      const q = r.p[i]; if (arr.some((a) => Math.hypot(a[0] - q[0], a[1] - q[1]) < 60) || (placed.get(nm) || []).some((a) => Math.hypot(a[0] - q[0], a[1] - q[1]) < 60)) continue;
      arr.push(q); add(nm, q[0], q[1], 'road', 700, 6, 12, 5);
    }
  }
  // point intérieur représentatif d'un anneau polygonal (balayage horizontal à mi-hauteur de sa boîte englobante,
  // milieu du plus large segment d'intersection) - utilisé pour poser une seule étiquette par lac/étang nommé.
  const ringInteriorPoint = (ring) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
    const midZ = (minZ + maxZ) / 2, xs = [];
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
      if ((z1 <= midZ && z2 > midZ) || (z2 <= midZ && z1 > midZ)) xs.push(x1 + (midZ - z1) / (z2 - z1) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    return xs.length >= 2 ? [(xs[0] + xs[xs.length - 1]) / 2, midZ] : [(minX + maxX) / 2, midZ];
  };
  for (const a of data.areas || []) {
    if (a.t !== 'water' || !a.nm || !a.p || !a.p[0] || a.p[0].length < 3) continue;
    const [x, z] = ringInteriorPoint(a.p[0]);
    add(a.nm, x, z, 'water', 6000, 6, 2, 1);
  }
  const cellN = new Set();                                  // numéros de rue : un par case de 35 m (non exhaustif)
  const nums = (data.numbers || []).map((q) => [q.n, q.x, q.z]);
  for (const b of data.buildings || []) if (b.hn) { let sx = 0, sz = 0; for (const p of b.p) { sx += p[0]; sz += p[1]; } nums.push([String(b.hn), sx / b.p.length, sz / b.p.length]); }
  for (const [n, x, z] of nums) {
    const k = Math.floor(x / 14) * 10007 + Math.floor(z / 14); if (cellN.has(k)) continue; cellN.add(k);
    add(n, x, z, 'num', 500, 10, 30, 3);
  }
  for (const q of data.labels || []) add(q.n, q.x, q.z, q.t === 2 ? 'park' : q.t ? 'loc' : 'quarter', q.t === 2 ? 1500 : q.t ? 2000 : 3800, q.t === 2 ? 15 : 40, undefined, q.t === 0 ? 1 : 2);
  // montagnes, sommets et cols environnants : repères visibles de tout le monde, donc toujours affichés au niveau
  // d'info le plus bas actif (lv=1) avec la meilleure priorité d'affichage (rk bas), et à une portée bien plus grande
  // que les autres textes (20-26 km) - portée qui n'est PAS bridée par le curseur "Distance de vue" (cf. `land` dans add()
  // et son utilisation dans updateLabels), car un sommet reste visible à l'horizon même quand ce curseur réduit le
  // rendu du terrain proche.
  for (const q of data.peaks || []) add(q.t === 1 ? q.n : q.t === 2 ? q.n : '▲ ' + q.n + (q.e ? ' · ' + q.e.toLocaleString('fr') + ' m' : ''), q.x, q.z, q.t === 1 ? 'col' : 'peak', q.t === 0 ? 26000 : q.t === 1 ? 16000 : 20000, q.t === 1 ? 14 : 40, q.t === 0 ? 1 : q.t === 1 ? 2 : 4, 1, true);
  for (const q of data.shops || []) add(q.c && q.c !== q.n ? q.n + ' · ' + q.c : q.n, q.x, q.z, q.r === 1 ? 'shop1' : q.r === 2 ? 'shop' : 'shop3', q.r === 1 ? 2600 : q.r === 2 ? 1300 : 800, 9, q.r === 1 ? 12 : q.r === 2 ? 22 : 26, q.r === 1 ? 1 : q.r === 2 ? 3 : 4);
}
let infoLv = 3; const INFO_N = ['Aucune', 'Minimale', 'Modérée', 'Riche', 'Très riche', 'Maximale (tout)'];
$('infolv').addEventListener('input', (e) => { infoLv = +e.target.value; $('o-info').textContent = INFO_N[infoLv]; heatSync('infolv'); });
heatSync('infolv');
const _v = new THREE.Vector3();
function updateLabels() {
  if (!terrain || infoLv === 0) { for (const l of labelEls) if (l.v) { l.e.style.display = 'none'; l.v = false; } return; }
  const W = innerWidth, H = innerHeight, cp = camera.position, cand = [];
  for (const l of labelEls) {
    const d = Math.hypot(l.x - cp.x, l.z - cp.z);
    const mx = l.max * 0.55 * (infoLv >= 5 ? 1.6 : 1); let ok = l.lv <= infoLv && d < (l.land ? mx : Math.min(mx, scene.fog.far));   // les textes suivent la distance de vue, sauf les repères paysagers (montagnes/cols), non bridés par le brouillard
    if (ok) {
      _v.set(l.x, terrain.heightAt(l.x, l.z) + l.lift, l.z).project(camera);
      ok = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    }
    if (ok && Math.abs(distort) > 0.005) {           // inverse de la déformation : où l'objet apparaît-il à l'écran ?
      const asp = W / H, na = Math.hypot(asp, 1); let px = _v.x, py = _v.y; const c0 = view.ndc;
      for (let it = 0; it < 10; it++) { const r = Math.hypot((px - c0) * asp, py) / na, f = distort > 0 ? 1 / (1 + distort * 5 * r * r) : 1 - distort * 3.5 * r * r; px = c0 + (_v.x - c0) / f; py = _v.y / f; if (Math.abs(px) > 3 || Math.abs(py) > 3) break; }
      _v.x = px; _v.y = py; ok = Math.abs(px) < 1.03 && Math.abs(py) < 1.03;
    }
    if (ok) cand.push({ l, d, sx: (_v.x + 1) / 2 * W, sy: (1 - _v.y) / 2 * H });
    else if (l.v) { l.e.style.display = 'none'; l.v = false; }
  }
  cand.sort((a, b) => (a.l.rk - b.l.rk) || (a.d - b.d));
  const boxes = [];
  for (const c of cand) {
    const bf = infoLv >= 5 ? 0.5 : infoLv === 4 ? 0.75 : 1, w = (c.l.e.textContent.length * (c.l.e.className.includes('quarter') ? 11 : 7) + 8) * bf, h = (c.l.e.className.includes('quarter') ? 22 : 16) * bf;
    const bx = { x0: c.sx - w / 2, x1: c.sx + w / 2, y0: c.sy - h / 2, y1: c.sy + h / 2 };
    const hit = boxes.some((o) => bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0);
    if (hit) { if (c.l.v) { c.l.e.style.display = 'none'; c.l.v = false; } continue; }
    boxes.push(bx);
    if (!c.l.v) { c.l.e.style.display = 'block'; c.l.v = true; }
    c.l.e.style.transform = `translate(-50%,-50%) translate(${c.sx.toFixed(1)}px,${c.sy.toFixed(1)}px)`;
    { const mx1 = c.l.max * 0.55 * (infoLv >= 5 ? 1.6 : 1), mx2 = c.l.land ? mx1 : Math.min(mx1, scene.fog.far); c.l.e.style.opacity = Math.max(0, Math.min(1, (mx2 - c.d) / (mx2 * 0.35))).toFixed(2); }
  }
}
function flyTo(x, z) {
  if (!terrain) return;
  const t1 = new THREE.Vector3(x, terrain.heightAt(x, z) + 8, z);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target); dir.y = 0;
  if (dir.lengthSq() < 1) dir.set(0, 0, 1);
  dir.normalize();
  const p1 = new THREE.Vector3(x, 0, z).addScaledVector(dir, 230);
  p1.y = terrain.heightAt(p1.x, p1.z) + 110;
  fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1, t1 };
}
function buildPlaces(data) {
  const box = $('places'); box.innerHTML = '';
  const list = data.places || [];
  if (!list.length) { box.innerHTML = '<p class="info">Aucun lieu prédéfini pour cette ville.</p>'; return; }
  for (const p of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'place';
    const n = document.createElement('b'); n.textContent = p.n;
    const d = document.createElement('span'); d.textContent = p.d + (p.approx ? ' (position approximative)' : '');
    b.append(n, d); b.addEventListener('click', () => flyTo(p.x, p.z)); box.appendChild(b);
  }
}
const TIME_SPEED = 0.3176;   // h/s in-game au défilement automatique (durée du cycle raccourcie de 15 % à la demande ; ralenti cumulé de 36,5 % depuis l'origine 0,5 h/s) - référence commune pour la boucle horaire ET la Vue circulaire (durée calée sur un cycle de 24h in-game pile à cette vitesse)
let playing = true;   // défilement automatique de l'heure activé par défaut, pour toutes les villes
$('play').classList.add('on'); setAct('play', 'Pause', 'pause');
function setPlaying(p) { playing = p; $('play').classList.toggle('on', playing); setAct('play', playing ? 'Pause' : 'Faire défiler', playing ? 'pause' : 'play'); }
$('play').addEventListener('click', () => { if (orbit) endOrbit(); if (apoc) endApoc(true); setPlaying(!playing); });

// ---------- Hauteur caméra (au-dessus du sol) / brouillard ----------
const agl = () => camera.position.y - (terrain ? terrain.heightAt(camera.position.x, camera.position.z) : 0);
function syncFogWarn() { heatSync('fog'); }
$('fog').addEventListener('input', (e) => {
  scene.fog.far = +e.target.value; scene.fog.near = scene.fog.far * 0.5;
  $('o-fog').textContent = `${(scene.fog.far / 1000).toFixed(1).replace('.0', '')} km`;
  syncFogWarn();
});
syncFogWarn();
// altitude réelle visée (m), PAS une élévation relative - cf. calage des bornes dans load() - factorisé en
// fonction réutilisable par le curseur ET par la simulation automatique "Apocalypse" (applyApoc ci-dessous), qui
// doit piloter exactement le même état (floodOn/floodPlane) et refléter sa progression sur le curseur lui-même.
function setFlood(v) {
  if (!floodPlane) return; v = Math.round(v);
  floodOn = v > +$('flood').min; floodPlane.position.y = v - terrain.hOff; floodPlane.visible = floodOn;
  $('flood').value = v;
  $('o-flood').textContent = `${v.toLocaleString('fr-FR')} m` + (floodOn ? '' : ' (désactivé)');
}
$('flood').addEventListener('input', (e) => setFlood(+e.target.value));

// ---------- Simulation "Apocalypse" : monte le niveau de l'eau jusqu'au maximum du curseur puis le fait
// redescendre exactement à son niveau de départ, en une seule boucle parfaitement lisse (vitesse nulle au départ
// et à l'arrivée, comme l'oscillation de hauteur de la vue circulaire) - même principe que startOrbit/applyOrbit,
// mais sur le niveau d'eau plutôt que sur la caméra. Un seul cycle, puis arrêt automatique (pas de répétition).
let apoc = null;
const APOC_DUR = 60;   // secondes, montée + descente (×3 à la demande : 20 s jugées trop rapides, surtout tout le début sur terrain plat)
// travelling circulaire HAUT qui accompagne la montée des eaux : rayon / hauteur au-dessus du sol lissé / garde
// au-dessus du niveau d'eau COURANT (pas seulement final) / constante de lissage du sol / nombre de tours complets
// pendant toute la durée (2 ou 3 demandés -> 3, qui ramène aussi la caméra exactement à son azimut de départ).
const APOC_ORBIT_RADIUS = 900, APOC_ORBIT_HEIGHT = 420, APOC_ORBIT_CLEARANCE = 150, APOC_ORBIT_GROUND_TAU = 2.5, APOC_ORBIT_LAPS = 3;
// easing quintique ("smootherstep") appliqué symétriquement à la montée et à la descente : vitesse ET accélération
// nulles aux deux bornes (et au passage par le pic), donc un démarrage et une fin bien plus progressifs qu'un
// simple cosinus à durée uniforme (demandé explicitement : "ralentis particulièrement le début") - sur terrain
// plat, la nappe d'eau met nettement plus de temps à se mettre en mouvement avant d'accélérer, puis ralentit de
// nouveau en approchant le pic/le retour - tout en restant une boucle parfaite (retour exact au niveau de départ)
// et globalement fluide puisque c'est la même courbe des deux côtés.
function smootherstep(u) { return u * u * u * (u * (u * 6 - 15) + 10); }
function apocEase(p) { const u = p < 0.5 ? p * 2 : (1 - p) * 2; return smootherstep(Math.max(0, Math.min(1, u))); }
function startApoc() {
  if (!floodPlane || !terrain) return;
  if (orbit) endOrbit();   // vue circulaire et apocalypse pilotent toutes deux directement la caméra : mutuellement exclusives
  if (ride) stopRide(); fly = null;
  const cx = controls.target.x, cz = controls.target.z;
  const dx = camera.position.x - cx, dz = camera.position.z - cz;
  const az0 = Math.hypot(dx, dz) > 1 ? Math.atan2(dz, dx) : 0;   // part de l'azimut actuel, comme la vue circulaire
  apoc = { t: 0, startVal: +$('flood').value, peakVal: +$('flood').max, cx, cz, az0, groundSmooth: null, prevPlaying: playing };
  controls.enabled = false;
  hour = 14; $('time').value = hour; applyTime(); setPlaying(false);   // l'apocalypse se déroule à 14 h pile, temps figé pendant tout le traveling
  $('apoc').classList.add('on'); setAct('apoc', "Arrêter l'Apocalypse");
  applyApoc(0);
}
function endApoc(restore) {
  if (!apoc) return;
  if (restore) setFlood(apoc.startVal);
  setPlaying(apoc.prevPlaying);
  apoc = null;
  controls.enabled = true; controls.update();
  $('apoc').classList.remove('on'); setAct('apoc', "Simuler l'Apocalypse");
}
function applyApoc(dt) {
  apoc.t += dt;
  const p = Math.min(1, apoc.t / APOC_DUR), k = apocEase(p);
  setFlood(apoc.startVal + (apoc.peakVal - apoc.startVal) * k);
  // vitesse angulaire constante sur APOC_ORBIT_LAPS tours complets pendant toute la durée : le rythme propre de la
  // montée des eaux est déjà géré par apocEase ci-dessus, pas besoin de le recaler sur le mouvement de caméra.
  const az = apoc.az0 + p * Math.PI * 2 * APOC_ORBIT_LAPS;
  const x = apoc.cx + APOC_ORBIT_RADIUS * Math.cos(az), z = apoc.cz + APOC_ORBIT_RADIUS * Math.sin(az);
  const groundNow = terrain.heightAt(x, z);
  apoc.groundSmooth = apoc.groundSmooth == null ? groundNow : apoc.groundSmooth + (groundNow - apoc.groundSmooth) * (1 - Math.exp(-dt / APOC_ORBIT_GROUND_TAU));
  const y = Math.max(apoc.groundSmooth + APOC_ORBIT_HEIGHT, (floodPlane ? floodPlane.position.y : groundNow) + APOC_ORBIT_CLEARANCE);   // toujours bien au-dessus de l'eau courante, même en pleine montée
  camera.position.set(x, y, z);
  controls.target.set(apoc.cx, apoc.groundSmooth, apoc.cz);
  camera.lookAt(controls.target);
  if (p >= 1) endApoc(false);   // la boucle revient déjà pile sur startVal/az0 à p=1
}
$('apoc').addEventListener('click', () => { apoc ? endApoc(true) : startApoc(); });

// ---------- Rendu maquette : style épuré façon plan-masse (bâtiments plats, sans photo aérienne, lumière de
// plein jour fixe) - réutilise applyTime() avec une heure figée plutôt que de dupliquer la logique jour/nuit ----------
let maquetteOn = false, maquettePrevHour = 5.25, maquettePrevPlaying = true, maquettePrevOrtho = true, maquettePrevInfo = 3;
$('maquette').addEventListener('click', () => {
  maquetteOn = !maquetteOn;
  $('maquette').classList.toggle('on', maquetteOn);
  setAct('maquette', maquetteOn ? 'Rendu normal' : 'Rendu maquette');
  if (city && city.setStyle) city.setStyle(maquetteOn);
  if (terrain && terrain.setStyle) terrain.setStyle(maquetteOn);
  if (trees && trees.setStyle) trees.setStyle(maquetteOn);
  if (maquetteOn) {
    maquettePrevHour = hour; maquettePrevPlaying = playing; maquettePrevOrtho = $('show-ortho').checked; maquettePrevInfo = infoLv;
    if (orbit) endOrbit(); if (apoc) endApoc(true); setPlaying(false);
    $('time').disabled = true; $('play').disabled = true;
    $('show-ortho').checked = false; $('show-ortho').disabled = true; if (terrain) terrain.setOrtho(false);
    hour = 12.5; applyTime();
    // style plan-masse épuré : on masque aussi toute l'info de la carte (noms de rues, POI, repères...) en
    // réutilisant le niveau 0 ("Aucune") déjà prévu par le curseur infolv, plutôt que de dupliquer sa logique de masquage.
    infoLv = 0; $('infolv').value = 0; $('o-info').textContent = INFO_N[0]; $('infolv').disabled = true; heatSync('infolv');
  } else {
    $('time').disabled = false; $('play').disabled = false;
    $('show-ortho').disabled = false; $('show-ortho').checked = maquettePrevOrtho; if (terrain) terrain.setOrtho(maquettePrevOrtho);
    hour = maquettePrevHour; applyTime();
    if (maquettePrevPlaying) setPlaying(true);
    infoLv = maquettePrevInfo; $('infolv').value = maquettePrevInfo; $('o-info').textContent = INFO_N[maquettePrevInfo]; $('infolv').disabled = false; heatSync('infolv');
  }
});

// ---------- Vue circulaire : travelling circulaire autour de la cible actuelle de la caméra (pas forcément le
// centre de la ville - on orbite autour d'où on regardait au moment du clic), avec une oscillation verticale
// sinusoïdale pendant le tour pour un rendu moins statique qu'un simple survol à altitude constante ----------
// Hauteur au-dessus du SOL LOCAL (celui exactement sous la caméra à chaque instant du cercle), pas au-dessus d'une
// référence fixe : sur un relief vallonné, une hauteur fixe calée sur le centre pouvait mettre la caméra sous le
// niveau du terrain ailleurs sur le cercle (signalé - la caméra traversait le sol). CIRCUIT_GROUND_TAU lisse cette
// référence de sol dans le temps (évite de recopier au mètre près chaque micro-ondulation, trajectoire saccadée)
// tout en la laissant suivre une vraie pente en quelques secondes ; CIRCUIT_MIN_CLEARANCE est un plancher de
// sécurité appliqué sur le sol RÉEL (non lissé) sous la caméra, qui ne doit jamais être percé, colline ou pas.
const CIRCUIT_HEIGHT_MAX = 200, CIRCUIT_HEIGHT_MIN = 100, CIRCUIT_MIN_CLEARANCE = 60, CIRCUIT_GROUND_TAU = 2.5, CIRCUIT_OSC_CYCLES = 6, CIRCUIT_RADIUS = 400;   // m / m / m / s / cycles (6, +2 à la demande) / m
let orbit = null;
function startOrbit() {
  if (!terrain) return;
  if (apoc) endApoc(true);   // vue circulaire et apocalypse pilotent toutes deux directement la caméra : mutuellement exclusives
  if (ride) stopRide(); fly = null;
  const cx = controls.target.x, cz = controls.target.z, cy = terrain.heightAt(cx, cz);   // centre du tour = cible actuelle, pas (0,0)
  const dx = camera.position.x - cx, dz = camera.position.z - cz;
  const az0 = Math.hypot(dx, dz) > 1 ? Math.atan2(dz, dx) : 0;   // part de l'azimut actuel (vu depuis le centre), pour un démarrage sans à-coup
  const prevFog = +$('fog').value;   // restauré à la fin du tour : la vue circulaire pousse temporairement le brouillard à sa distance maximale pour le panoramique
  const maxFog = +$('fog').max;
  scene.fog.far = maxFog; scene.fog.near = scene.fog.far * 0.5; $('fog').value = maxFog; $('o-fog').textContent = `${(maxFog / 1000).toFixed(1).replace('.0', '')} km`; syncFogWarn();
  controls.enabled = false;
  orbit = { cx, cz, cy, az0, t: 0, dur: 24 / TIME_SPEED, prevPlaying: playing, prevFog, groundSmooth: null };   // dur = exactement 24h in-game à la vitesse de défilement automatique (TIME_SPEED)
  setPlaying(true);
  $('circuit').classList.add('on'); setAct('circuit', 'Arrêter la vue');
  applyOrbit(0);
}
function applyOrbit(dt) {
  orbit.t = Math.min(orbit.dur, orbit.t + dt);
  const p = orbit.t / orbit.dur;
  const az = orbit.az0 + p * Math.PI * 2;   // cercle parfait : rayon constant, seul l'azimut varie, à vitesse angulaire uniforme
  const x = orbit.cx + CIRCUIT_RADIUS * Math.cos(az), z = orbit.cz + CIRCUIT_RADIUS * Math.sin(az);
  const groundNow = terrain.heightAt(x, z);
  orbit.groundSmooth = orbit.groundSmooth == null ? groundNow : orbit.groundSmooth + (groundNow - orbit.groundSmooth) * (1 - Math.exp(-dt / CIRCUIT_GROUND_TAU));
  // hauteur sinusoïdale au-dessus du sol lissé : CIRCUIT_OSC_CYCLES montées/descentes complètes pendant le tour de
  // 360°, entre CIRCUIT_HEIGHT_MIN (creux) et CIRCUIT_HEIGHT_MAX (crête) ; cosinus choisi pour démarrer ET finir en
  // crête (p=0 et p=1), donc un raccord net avec le reste de l'appli.
  const hDesired = orbit.groundSmooth + CIRCUIT_HEIGHT_MIN + (CIRCUIT_HEIGHT_MAX - CIRCUIT_HEIGHT_MIN) * (0.5 + 0.5 * Math.cos(p * Math.PI * 2 * CIRCUIT_OSC_CYCLES));
  let y = Math.max(hDesired, groundNow + CIRCUIT_MIN_CLEARANCE);   // jamais sous le sol réel, même si le lissage n'a pas encore rattrapé une colline
  if (floodOn && floodPlane) y = Math.max(y, floodPlane.position.y + 2);   // montée des eaux : jamais sous la surface non plus
  camera.position.set(x, y, z);
  controls.target.set(orbit.cx, orbit.cy, orbit.cz);
  camera.lookAt(controls.target);
  if (orbit.t >= orbit.dur) endOrbit();
}
function endOrbit() {
  if (!orbit) return;
  setPlaying(orbit.prevPlaying);
  scene.fog.far = orbit.prevFog; scene.fog.near = scene.fog.far * 0.5; $('fog').value = orbit.prevFog; $('o-fog').textContent = `${(orbit.prevFog / 1000).toFixed(1).replace('.0', '')} km`; syncFogWarn();
  orbit = null;
  controls.enabled = true; controls.update();
  $('circuit').classList.remove('on'); setAct('circuit', 'Vue circulaire');
}
$('circuit').addEventListener('click', () => { orbit ? endOrbit() : startOrbit(); });

// ---------- Clavier ----------
const keys = new Set();
addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') keys.add(e.key.toLowerCase()); });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), mv = new THREE.Vector3(), vel = new THREE.Vector3();
let velUp = 0;   // vitesses lissées : les déplacements au clavier ont de l'inertie (accélération et arrêt progressifs, comme la souris)
function moveByKeys(dt) {
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, camera.up).normalize(); mv.set(0, 0, 0);
  if (keys.has('arrowup') || keys.has('z') || keys.has('w')) mv.add(fwd);
  if (keys.has('arrowdown') || keys.has('s')) mv.sub(fwd);
  if (keys.has('arrowright') || keys.has('d')) mv.add(right);
  if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) mv.sub(right);
  if (mv.lengthSq()) mv.normalize().multiplyScalar(Math.max(15, agl()) * 1.2 * (keys.has('shift') ? 4 : 1));
  const k = 1 - Math.exp(-dt * (mv.lengthSq() ? 5 : 4));   // montée en vitesse ~0,2 s, arrêt ~0,25 s
  vel.lerp(mv, k); if (vel.lengthSq() < 1e-3 && !mv.lengthSq()) vel.set(0, 0, 0);
  const up = (keys.has('+') || keys.has('=') ? 1 : 0) - (keys.has('-') || keys.has('_') || keys.has(')') ? 1 : 0);   // + / - : hauteur de la caméra
  velUp += (up - velUp) * (1 - Math.exp(-dt * 5)); if (Math.abs(velUp) < 0.01 && !up) velUp = 0;
  if (velUp) { const g = terrain ? terrain.heightAt(camera.position.x, camera.position.z) : 0, h = agl(), nh = Math.min(1500, Math.max(3, h + velUp * Math.max(6, h * 0.9) * dt * (keys.has('shift') ? 3 : 1))); camera.position.y = g + nh; controls.update(); }
  if (vel.lengthSq() > 0) { const d = vel.clone().multiplyScalar(dt); camera.position.add(d); controls.target.add(d); }
}

// La caméra suit le relief : le point visé reste au sol, la caméra ne passe pas sous le terrain.
function followTerrain() {
  if (!terrain) return;
  const dy = (terrain.heightAt(controls.target.x, controls.target.z) - controls.target.y) * 0.25;
  if (Math.abs(dy) > 0.005) { controls.target.y += dy; camera.position.y += dy; }
  let min = terrain.heightAt(camera.position.x, camera.position.z) + 3;
  if (floodOn && floodPlane) min = Math.max(min, floodPlane.position.y + 2);   // montée des eaux : la caméra ne doit jamais passer sous la surface
  if (camera.position.y < min) camera.position.y = min;
}

// ---------- Boucle ----------

$('show-ortho').addEventListener('change', (e) => terrain && terrain.setOrtho(e.target.checked));

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); syncView(); });
const clock = new THREE.Clock();
let acc = 0, uiAcc = 0;
let dataZone = null; window.__camera = camera; window.__controls = controls; window.__bench = (n = 20) => { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const t = performance.now(); for (let i = 0; i < n; i++) { if (post.rt) { renderer.setRenderTarget(post.rt); renderer.render(scene, camera); renderer.setRenderTarget(null); } else renderer.render(scene, camera); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return (performance.now() - t) / n; };

// ---------- Visite virtuelle : survol (cercle vert), clic = on monte dans le véhicule, Échap = retour à la vue haute ----------
const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 56), new THREE.MeshBasicMaterial({ color: 0x35e06a, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; ring.renderOrder = 30; ring.visible = false; ring.frustumCulled = false; scene.add(ring);

// ---------- Cible au sol : viseur blanc (type lunette de carabine) plaqué sur le relief au point visé, "N" du nord et altitude autour ----------
const tgt = (() => {
  const N = 40, S = 512, C = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
  { const g = cv.getContext('2d'); g.lineCap = 'round';
    const draw = (w, col, blur) => { g.lineWidth = w; g.strokeStyle = col; g.fillStyle = col; g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = blur;
      g.beginPath(); g.arc(C, C, 230, 0, 7); g.stroke();                       // anneau extérieur
      g.beginPath(); g.arc(C, C, 146, 0, 7); g.stroke();                       // anneau intérieur
      g.beginPath(); for (const [a, b] of [[40, 230], [-40, -230]]) { g.moveTo(C + a, C); g.lineTo(C + b, C); g.moveTo(C, C + a); g.lineTo(C, C + b); } g.stroke();   // réticule en croix, vide au centre
      g.beginPath(); g.arc(C, C, 7, 0, 7); g.fill(); g.stroke(); };
    draw(20, 'rgba(0,0,0,.40)', 0); draw(11, '#fff', 14); draw(11, '#fff', 0); }   // liseré sombre + halo d'ombre externe (lisibilité sur photo/herbe/neige) puis trait blanc net
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(2, 2, N, N); geo.rotateX(-Math.PI / 2);   // x,z ∈ [-1,1] : mis à l'échelle et déformé à chaque mise à jour (le haut de la texture = nord = -z)
  const base = geo.attributes.position.array.slice(), pos = geo.attributes.position;
  // opacité 80 % (la cible se fond dans le paysage, les textes alentour restent à 100 %) ; décalage de profondeur FORT : les routes sont tracées
  // avec un polygonOffset de -3-i (jusqu'à ~ -11) et surélevées de 0,09 à 0,3 m - la cible passait systématiquement dessous
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -40, polygonOffsetUnits: -40 });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 20; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  const TXT = 'position:fixed;left:0;top:0;z-index:1;pointer-events:none;display:none;color:#fff;font:700 14px system-ui,sans-serif;letter-spacing:.03em;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 4px rgba(0,0,0,.8);white-space:nowrap';
  const lab = document.createElement('div'), nrd = document.createElement('div');
  lab.style.cssText = TXT + ';transform:translate(-50%,0)';
  nrd.style.cssText = TXT + ';transform:translate(-50%,-50%);font:800 17px Georgia,"Times New Roman",serif'; nrd.textContent = 'N';
  document.body.append(lab, nrd);
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), U = new THREE.Vector3(); let lx = NaN, lz = NaN, lr = 0, txt = '';
  const put = (el, v) => { el.style.display = 'block'; el.style.left = v.x.toFixed(1) + 'px'; el.style.top = v.y.toFixed(1) + 'px'; };
  const scr = (x, z, off, out) => { out.set(x, terrain.heightAt(x, z) + off, z).project(camera); return out.z <= 1 && Math.abs(out.x) <= 1.05 && Math.abs(out.y) <= 1.05 ? { x: (out.x + 1) / 2 * innerWidth, y: (1 - out.y) / 2 * innerHeight } : null; };
  const hide = () => { mesh.visible = false; lab.style.display = nrd.style.display = 'none'; };
  const update = () => {
    const on = !!terrain && $('show-target').checked && !ride && !orbit && !apoc;
    if (!on) { hide(); return; }
    mesh.visible = true;
    const t = controls.target, d = camera.position.distanceTo(t), R = THREE.MathUtils.clamp(d * 0.05, 4, 500), off = 0.4 + Math.min(d * 0.0015, 2.5);
    if (Math.abs(t.x - lx) > 0.02 || Math.abs(t.z - lz) > 0.02 || Math.abs(R - lr) > lr * 0.01) {   // re-plaquage sur le relief seulement si le point visé / la taille ont bougé
      lx = t.x; lz = t.z; lr = R;
      for (let i = 0; i < pos.count; i++) { const x = lx + base[3 * i] * R, z = lz + base[3 * i + 2] * R; pos.setXYZ(i, x, terrain.heightAt(x, z) + off, z); }
      pos.needsUpdate = true; geo.computeBoundingSphere();
      txt = `Alt : ${Math.round(terrain.absElev(lx, lz)).toLocaleString('fr-FR')}m`; lab.textContent = txt;
    }
    camera.updateMatrixWorld();
    // "N" : au nord (-z) juste à l'extérieur de l'anneau, texte toujours droit à l'écran (comme la rose des vents, il tourne autour de la cible)
    const pn = scr(lx, lz - R * 1.26, off, Q); if (pn) put(nrd, pn); else nrd.style.display = 'none';
    // altitude : côté « bas de l'écran » (direction du haut de l'écran projetée sur le sol), nettement écartée de l'anneau pour ne jamais recouvrir le N
    U.set(0, 1, 0).applyQuaternion(camera.quaternion); let ux = U.x, uz = U.z, ul = Math.hypot(ux, uz);
    if (ul < 1e-3) { camera.getWorldDirection(U); ux = U.x; uz = U.z; ul = Math.hypot(ux, uz) || 1; }
    ux /= ul; uz /= ul;
    const pl = scr(lx - ux * R * 1.62, lz - uz * R * 1.62, off, P);
    if (!pl) { lab.style.display = 'none'; return; }
    if (pn && Math.abs(pl.x - pn.x) < 34 && pl.y > pn.y - 14 && pl.y < pn.y + 26) pl.y = pn.y + 26;   // filet de sécurité : si le N passe quand même sous l'altitude, on la repousse sous le N
    put(lab, pl);
  };
  return { update, mesh, lab };
})();
const rideHint = document.createElement('div');
rideHint.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(30,28,25,.72);color:#fff;font:13px system-ui,sans-serif;z-index:5;display:none;pointer-events:none';
rideHint.textContent = 'Visite en véhicule — Échap pour sortir · glisser la souris pour regarder autour';
document.body.appendChild(rideHint);
const rideAddr = document.createElement('div');   // 2e pastille : adresse en temps réel
rideAddr.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(30,28,25,.72);color:#fff;font:600 14px system-ui,sans-serif;z-index:5;display:none;pointer-events:none;white-space:nowrap';
document.body.appendChild(rideAddr);
// ---------- Habitacle : overlay SVG de la vue intérieure d'un véhicule (montants, pare-brise, vitres, rétroviseurs extérieurs et intérieur,
// volant qui tourne selon le lacet du véhicule, compteur de vitesse + voyants de clignotants/warnings). Pas de « vue dans les rétros » : trop gourmand.
// L'habitacle est solidaire du véhicule : il est posé dans un plan CSS 3D (perspective = focale de la caméra) que l'on fait pivoter avec la tête du conducteur
// (yaw/pitch de la vue), si bien qu'en regardant à gauche/droite/haut/bas on voit défiler portières, montants et vitres latérales. Il est cadré sur la zone
// VISIBLE (à droite du menu de gauche), comme le centre optique de la caméra (cf. syncView).
const cockpit = (() => {
  const el = document.createElement('div'); el.id = 'cockpit';
  let ticks = ''; for (let k = 0; k <= 8; k++) { const a = (-120 + k * 30) * Math.PI / 180, sx = Math.sin(a), cy = -Math.cos(a), r1 = k % 2 ? 49 : 44, r2 = 55;
    ticks += `<line x1="${(800 + sx * r1).toFixed(1)}" y1="${(590 + cy * r1).toFixed(1)}" x2="${(800 + sx * r2).toFixed(1)}" y2="${(590 + cy * r2).toFixed(1)}" stroke="${k % 2 ? '#7d8791' : '#e8edf1'}" stroke-width="${k % 2 ? 1.5 : 2.4}"/>`;
    if (k % 2 === 0) ticks += `<text x="${(800 + sx * 34).toFixed(1)}" y="${(593 + cy * 34).toFixed(1)}" fill="#c9d1d8" font-size="9.5" font-family="system-ui,sans-serif" font-weight="600" text-anchor="middle">${k * 20}</text>`; }
  el.innerHTML = `<div class="cp-3d"><svg viewBox="-1600 -900 4800 2700" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cp-dash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34373d"/><stop offset=".18" stop-color="#1b1d21"/><stop offset="1" stop-color="#08090b"/></linearGradient>
      <linearGradient id="cp-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0c0e"/><stop offset="1" stop-color="#23262b"/></linearGradient>
      <linearGradient id="cp-pil" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#101114"/><stop offset="1" stop-color="#25282d"/></linearGradient>
      <linearGradient id="cp-pilR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#101114"/><stop offset="1" stop-color="#25282d"/></linearGradient>
      <linearGradient id="cp-door" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2d32"/><stop offset=".25" stop-color="#16181b"/><stop offset="1" stop-color="#0a0b0d"/></linearGradient>
      <linearGradient id="cp-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfdbe6"/><stop offset=".5" stop-color="#7b8c9b"/><stop offset="1" stop-color="#34414c"/></linearGradient>
      <linearGradient id="cp-tint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".45" stop-color="#fff" stop-opacity=".0"/><stop offset=".62" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="cp-wheel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2f34"/><stop offset="1" stop-color="#111214"/></linearGradient>
      <radialGradient id="cp-gauge" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#16202a"/><stop offset="1" stop-color="#05080b"/></radialGradient>
    <linearGradient id="cp-doorS" gradientUnits="userSpaceOnUse" x1="0" y1="600" x2="0" y2="1150"><stop offset="0" stop-color="#2a2d32"/><stop offset=".22" stop-color="#16181b"/><stop offset="1" stop-color="#0a0b0d"/></linearGradient>
      <g id="cp-side"><path d="M-1600 600 L0 640 V6000 H-1600 Z" fill="url(#cp-doorS)"/><path d="M-1600 600 L0 640" stroke="rgba(255,255,255,.10)" stroke-width="2" fill="none"/>
        <path d="M-860 40 L-720 40 L-745 622 L-885 616 Z" fill="url(#cp-pil)"/>
        <path d="M-1600 -200 H-885 V610 H-1600 Z M-1480 120 V500 H-980 V120 Z" fill="#0e0f12" fill-rule="evenodd"/></g>
    </defs>
    <rect x="-1600" y="-6000" width="4800" height="6040" fill="#0b0c0e"/><rect x="0" y="880" width="1600" height="5200" fill="#08090b"/>
    <use href="#cp-side"/><use href="#cp-side" transform="translate(1600 0) scale(-1 1)"/>
    <path d="M232 78 H1368 L1512 566 Q800 528 88 566 Z" fill="url(#cp-tint)"/>
    <path d="M0 0 H1600 V52 Q1560 64 1368 78 Q800 120 232 78 Q40 64 0 52 Z" fill="url(#cp-roof)"/>
    <path d="M232 78 Q800 120 1368 78" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2"/>
    <path d="M0 40 L238 76 L252 88 L96 574 L0 640 Z" fill="url(#cp-pil)"/><path d="M238 76 L252 88 L96 574" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
    <path d="M1600 40 L1362 76 L1348 88 L1504 574 L1600 640 Z" fill="url(#cp-pilR)"/><path d="M1362 76 L1348 88 L1504 574" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
    <path d="M0 640 L96 574 Q170 590 300 640 L360 900 H0 Z" fill="url(#cp-door)"/><path d="M96 574 Q170 590 300 640" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2"/>
    <path d="M1600 640 L1504 574 Q1430 590 1300 640 L1240 900 H1600 Z" fill="url(#cp-door)"/><path d="M1504 574 Q1430 590 1300 640" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2"/>
    <g><path d="M104 520 L70 452" stroke="#0e0f12" stroke-width="13" stroke-linecap="round"/><rect x="6" y="392" width="124" height="84" rx="26" fill="#121316" stroke="#2c2f35" stroke-width="3"/><rect x="17" y="402" width="102" height="64" rx="18" fill="url(#cp-glass)" opacity=".9"/><path d="M26 456 Q60 420 112 410" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <g><path d="M1496 520 L1530 452" stroke="#0e0f12" stroke-width="13" stroke-linecap="round"/><rect x="1470" y="392" width="124" height="84" rx="26" fill="#121316" stroke="#2c2f35" stroke-width="3"/><rect x="1481" y="402" width="102" height="64" rx="18" fill="url(#cp-glass)" opacity=".9"/><path d="M1490 456 Q1524 420 1576 410" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <g><rect x="788" y="88" width="24" height="42" rx="6" fill="#0e0f12"/><rect x="668" y="120" width="264" height="66" rx="24" fill="#121316" stroke="#2c2f35" stroke-width="3"/><rect x="680" y="130" width="240" height="46" rx="16" fill="url(#cp-glass)" opacity=".88"/><path d="M698 166 Q760 138 880 134" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <path d="M0 704 C300 600 560 560 800 560 C1040 560 1300 600 1600 704 V900 H0 Z" fill="url(#cp-dash)"/>
    <path d="M0 704 C300 600 560 560 800 560 C1040 560 1300 600 1600 704" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="3"/>
    <rect x="300" y="628" width="150" height="9" rx="4" fill="#050607" opacity=".8"/><rect x="1150" y="628" width="150" height="9" rx="4" fill="#050607" opacity=".8"/>
    <path d="M598 650 V572 Q598 514 664 510 H936 Q1002 514 1002 572 V650 Z" fill="#07080a" stroke="#2a2d33" stroke-width="3"/>
    <circle cx="800" cy="590" r="60" fill="url(#cp-gauge)" stroke="#3a3f46" stroke-width="5"/>
    ${ticks}
    <g id="cp-needle"><line x1="800" y1="590" x2="800" y2="540" stroke="#ff6a2b" stroke-width="3" stroke-linecap="round"/><circle cx="800" cy="590" r="5" fill="#ff6a2b"/></g>
    <text id="cp-spd" x="800" y="616" fill="#fff" font-size="21" font-weight="700" font-family="system-ui,sans-serif" text-anchor="middle">0</text><text x="800" y="628" fill="#8aa0b0" font-size="8" font-family="system-ui,sans-serif" text-anchor="middle">km/h</text>
    <polygon id="cp-L" points="670,590 706,566 706,582 730,582 730,598 706,598 706,614" fill="#35e06a" opacity=".12"/>
    <polygon id="cp-R" points="930,590 894,566 894,582 870,582 870,598 894,598 894,614" fill="#35e06a" opacity=".12"/>
    <g id="cp-wheel"><circle cx="800" cy="880" r="215" fill="none" stroke="url(#cp-wheel)" stroke-width="46"/><circle cx="800" cy="880" r="239" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2"/><circle cx="800" cy="880" r="191" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="2"/>
      <path d="M590 868 L744 858 Q756 880 744 902 L590 896 Z" fill="#1a1c20"/><path d="M1010 868 L856 858 Q844 880 856 902 L1010 896 Z" fill="#1a1c20"/><path d="M770 930 L830 930 L840 1010 L760 1010 Z" fill="#1a1c20"/>
      <circle cx="800" cy="880" r="66" fill="#1d1f23" stroke="#34373c" stroke-width="3"/><circle cx="800" cy="880" r="30" fill="none" stroke="#4a4f57" stroke-width="3"/><rect x="793" y="648" width="14" height="40" rx="4" fill="#e8e8e8"/></g>
  </svg></div>`;
  document.body.appendChild(el);
  const d3 = el.querySelector('.cp-3d'), svg = el.querySelector('svg'), needle = el.querySelector('#cp-needle'), digits = el.querySelector('#cp-spd'), wheel = el.querySelector('#cp-wheel'), L = el.querySelector('#cp-L'), R = el.querySelector('#cp-R');
  let sp = 0, prev = NaN, yr = 0, wa = 0, cy = 0, cpi = 0, F = 900;
  // cadrage : la largeur visible de l'habitacle (1600 unités) occupe toute la zone visible ; verticalement on garde plutôt le bas (volant, tableau de bord)
  const layout = () => { const W = Math.max(50, innerWidth - view.inset), H = innerHeight, vh = 1600 * H / W, y0 = (900 - vh) * (vh > 900 ? 0.12 : 0.6);   // écran étroit : on garde presque tout le haut du pare-brise (le surplus d'habitacle est en bas)
    svg.setAttribute('viewBox', `-1600 ${(y0 - vh).toFixed(1)} 4800 ${(3 * vh).toFixed(1)}`); F = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); el.style.perspective = F.toFixed(1) + 'px'; };
  const show = (v) => { const mk = v && !v.isTrain && traffic.models[v.mi], ok = !!mk && !mk.cyc && !['moto', 'bike', 'scoot'].includes(mk.kind); el.style.display = ok ? 'block' : 'none'; sp = 0; prev = NaN; yr = 0; wa = 0; cy = 0; cpi = 0; if (ok) layout(); };
  const update = (dt, v, r) => {
    if (el.style.display === 'none' || !v) return;
    const k = Math.min(1, dt * 8); sp += (Math.max(0, (v.v || 0) * 3.6) - sp) * k;
    needle.setAttribute('transform', `rotate(${(-120 + Math.min(sp, 160) / 160 * 240).toFixed(1)} 800 590)`); digits.textContent = Math.round(sp);
    const psi = Math.atan2(v.hz || 0, v.hx || 1);   // x = est, z = sud : virage à droite = cap qui augmente = volant dans le sens horaire
    if (isFinite(prev) && dt > 1e-4) { let d = psi - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; yr += (d / dt - yr) * Math.min(1, dt * 6); }
    prev = psi; wa += (THREE.MathUtils.clamp(yr * 300, -170, 170) - wa) * Math.min(1, dt * 10);
    wheel.setAttribute('transform', `rotate(${wa.toFixed(1)} 800 880)`);
    const sg = traffic.signal ? traffic.signal() : 0, on = (performance.now() % 700) < 400;
    L.setAttribute('opacity', (sg === -1 || sg === 2) && on ? 1 : 0.12); R.setAttribute('opacity', (sg === 1 || sg === 2) && on ? 1 : 0.12);
    // tête du conducteur : même constante de temps que le lissage de la caméra de visite, pour que cabine et monde restent solidaires
    const kc = 1 - Math.exp(-dt * 9); cy += ((r ? r.yaw : 0) - cy) * kc; cpi += ((r ? r.pitch : 0) - cpi) * kc;
    d3.style.transform = `translateZ(${F.toFixed(1)}px) rotateX(${(Math.atan(cpi) * 57.2958).toFixed(2)}deg) rotateY(${(cy * 57.2958).toFixed(2)}deg) translateZ(${(-F).toFixed(1)}px)`;
  };
  return { show, hide: () => { el.style.display = 'none'; }, update, layout };
})();
// ---------- Zone visible : le menu de gauche masque une bande de l'écran ; le centre « utile » de l'image (point visé, cible, habitacle, pastilles) est le centre de la zone
// restante. La caméra reçoit donc un décalage de vue (centre optique déplacé à droite) et le post-traitement (barillet / tilt-shift) le même centre.
const view = { inset: 0, ndc: 0 };
function syncView() {
  const pn = document.getElementById('panel'); let inset = 0;
  if (pn && innerWidth > 640) inset = Math.max(0, Math.min(pn.clientWidth - (parseFloat(getComputedStyle(pn).paddingRight) || 0), innerWidth * 0.6));
  view.inset = inset; view.ndc = inset / innerWidth;
  camera.aspect = innerWidth / innerHeight; camera.setViewOffset(innerWidth, innerHeight, -inset / 2, 0, innerWidth, innerHeight);
  post.mat.uniforms.uC.value = view.ndc;
  document.documentElement.style.setProperty('--vis-l', inset + 'px');
  const cx = (inset + (innerWidth - inset) / 2).toFixed(1) + 'px'; rideHint.style.left = cx; rideAddr.style.left = cx;
  if (ride) cockpit.layout();
}
let addrIdx = null, addrT = 0;
function buildAddr(data) {   // index spatial : tronçons de rues nommées + numéros (OSM)
  const C = 40, segs = new Map(), nums = new Map(), put = (m, x, z, o) => { const k = Math.floor(x / C) * 100003 + Math.floor(z / C); let a = m.get(k); if (!a) m.set(k, a = []); a.push(o); };
  for (const r of data.roads || []) { if (!r.nm || r.k > 6 || r.p.length < 2) continue;
    for (let i = 0; i < r.p.length - 1; i++) { const a = r.p[i], b = r.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / C)); const o = [a[0], a[1], b[0], b[1], r.nm];
      for (let j = 0; j <= n; j++) put(segs, a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n, o); } }
  for (const q of data.numbers || []) put(nums, q.x, q.z, [String(q.n), q.x, q.z]);
  for (const b of data.buildings || []) if (b.hn) { let sx = 0, sz = 0; for (const p of b.p) { sx += p[0]; sz += p[1]; } put(nums, sx / b.p.length, sz / b.p.length, [String(b.hn), sx / b.p.length, sz / b.p.length]); }
  // quartiers/lieux-dits (toponymes OSM déjà utilisés pour les étiquettes flottantes de la carte, place=suburb/quarter -> t=0,
  // place=locality/hamlet -> t=1) : servent de repli quand aucune rue nommée n'est assez proche (survol d'un grand parc, d'un
  // bois, d'une zone rurale sans voirie taguée...) pour quand même situer la caméra par rapport à un nom connu du terrain.
  const quarters = (data.labels || []).filter((q) => q.t === 0), locs = (data.labels || []).filter((q) => q.t === 1);
  return { segs, nums, C, quarters, locs };
}
function nearestLabel(list, x, z) { let best = null, bd = Infinity; for (const q of list) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = q.n; } } return best; }
function addrAt(x, z) {
  if (!addrIdx) return '';
  const { segs, nums, C, quarters, locs } = addrIdx, cx = Math.floor(x / C), cz = Math.floor(z / C); let best = null, bd = 60, nb = null, nd = 32;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    for (const o of segs.get((cx + a) * 100003 + cz + b) || []) { const dx = o[2] - o[0], dz = o[3] - o[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - o[0]) * dx + (z - o[1]) * dz) / l2)), d = Math.hypot(o[0] + dx * t - x, o[1] + dz * t - z); if (d < bd) { bd = d; best = o[4]; } }
    for (const q of nums.get((cx + a) * 100003 + cz + b) || []) { const d = Math.hypot(q[1] - x, q[2] - z); if (d < nd) { nd = d; nb = q[0]; } }
  }
  const sel = document.getElementById('city'), city = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/\s*\(.*$/, '').replace(/\s+[-–—]\s.*$/, '') : '';
  if (!best) {   // hors voie nommée : à défaut de rue précise, on situe au moins le quartier (ou, à défaut, le lieu-dit) survolé
    const quarter = nearestLabel(quarters, x, z) || nearestLabel(locs, x, z);
    if (!quarter) return '';
    return quarter + (city ? ' · ' + city : '');
  }
  return (nb ? nb + ' ' : '') + best + (city ? ' · ' + city : '');
}
let hoverV = null, ride = null, mouse = { x: 0, y: 0, in: false, t: 0 }, downAt = null;
syncView();
const rc = new THREE.Raycaster(), tmpO = new THREE.Camera()   /* Camera.lookAt regarde vers -Z (Object3D.lookAt vers +Z : vue à 180°) */;
function pickAt(cx, cy) {   // pointe un véhicule : l'écran est déformé par le post-traitement (barillet) → on inverse la déformation
  if (!traffic || !traffic.group.visible) return null;
  const nx = cx / innerWidth * 2 - 1, ny = -(cy / innerHeight * 2 - 1), asp = innerWidth / innerHeight, r = Math.hypot((nx - view.ndc) * asp, ny) / Math.hypot(asp, 1);
  const f = distort > 0 ? 1 / (1 + distort * 5 * r * r) : 1 - distort * 3.5 * r * r;
  rc.setFromCamera({ x: view.ndc + (nx - view.ndc) * f, y: ny * f }, camera);
  return traffic.pick(rc.ray.origin, rc.ray.direction, 800);
}
function startRide(v) {
  ride = { v, yaw: 0, pitch: 0, off: camera.position.clone().sub(controls.target), tilt, near: camera.near };
  controls.enabled = false; tilt = 0; camera.near = 0.25; camera.updateProjectionMatrix(); traffic.setRide(v);
  hoverV = null; ring.visible = false; rideHint.style.display = 'block'; addrT = 0; rideAddr.style.display = 'block'; rideAddr.textContent = addrAt(v.x, v.z) || '📍 …'; renderer.domElement.style.cursor = 'var(--c-grabbing)'; cockpit.show(v);
}
function stopRide() {
  const r = ride; if (!r) return; ride = null; traffic.setRide(null); cockpit.hide(); rideHint.style.display = 'none'; rideAddr.style.display = 'none'; renderer.domElement.style.cursor = '';
  tilt = r.tilt; camera.near = r.near; camera.updateProjectionMatrix(); controls.enabled = true;
  controls.target.set(r.v.x, r.v.y, r.v.z); camera.position.copy(controls.target).add(r.off); controls.update();
}
function rideCamera(dt) {
  const v = ride.v, moto = !v.isTrain && traffic.models[v.mi].kind === 'moto', e = traffic.eye(v), fw = v.len * (v.isTrain ? 0.32 : 0.05), sd = moto || v.isTrain ? 0 : -0.36 * v.sc;
  controls.target.set(v.x, v.y, v.z);
  camera.position.set(v.x + v.hx * fw - v.hz * sd, v.y + e, v.z + v.hz * fw + v.hx * sd);
  if (floodOn && floodPlane && camera.position.y < floodPlane.position.y + 2) camera.position.y = floodPlane.position.y + 2;   // montée des eaux : jamais sous la surface, même en immersion
  const ya = Math.atan2(v.hz, v.hx) + ride.yaw, dx = Math.cos(ya), dz = Math.sin(ya);
  tmpO.position.copy(camera.position); tmpO.lookAt(camera.position.x + dx * 30, camera.position.y - 0.9 + ride.pitch * 30 - (v.pitch || 0) * 12, camera.position.z + dz * 30);
  camera.quaternion.slerp(tmpO.quaternion, 1 - Math.exp(-dt * 9));
  if (!ride.drag) { const k = Math.exp(-dt * 1.2); ride.yaw *= k; ride.pitch *= k; }
}
{
  const cv = renderer.domElement;
  cv.addEventListener('pointermove', (e) => {
    if (ride) { if (e.buttons & 1) { ride.drag = true; ride.yaw = Math.max(-2.4, Math.min(2.4, ride.yaw + e.movementX * 0.006)); ride.pitch = Math.max(-0.7, Math.min(0.7, ride.pitch - e.movementY * 0.004)); } return; }
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  });
  cv.addEventListener('pointerleave', () => { mouse.in = false; hoverV = null; ring.visible = false; cv.style.cursor = ''; });
  cv.addEventListener('pointerdown', (e) => { if (orbit) endOrbit(); if (apoc) endApoc(true); downAt = [e.clientX, e.clientY]; if (ride) ride.drag = false; });
  cv.addEventListener('pointerup', (e) => {
    if (ride) { ride.drag = false; return; }
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) { const v = pickAt(e.clientX, e.clientY) || hoverV; if (v) startRide(v); }
    downAt = null;
  });
  cv.addEventListener('wheel', () => { if (orbit) endOrbit(); if (apoc) endApoc(true); }, { passive: true });   // zoom molette : interrompt la Vue circulaire et l'Apocalypse, comme tout autre contrôle manuel de la caméra
  addEventListener('keydown', (e) => { if (orbit) endOrbit(); if (apoc) endApoc(true); if (e.key === 'Escape' && ride) stopRide(); });
}
window.__ride = { start: startRide, stop: stopRide, pick: pickAt, get hover() { return hoverV; }, get ride() { return ride; } };
function updateHover(dt) {
  if (ride) return;
  mouse.t -= dt;
  if (mouse.t <= 0) { mouse.t = 0.06; hoverV = mouse.in && !(fly) ? pickAt(mouse.x, mouse.y) : null; renderer.domElement.style.cursor = hoverV ? 'var(--c-ptr)' : ''; }
  if (hoverV && hoverV.x !== 1e9) {
    const d = Math.hypot(hoverV.x - camera.position.x, hoverV.y - camera.position.y, hoverV.z - camera.position.z), sc = Math.max(2.6, d * 0.02);
    ring.position.set(hoverV.x, hoverV.y + 0.2, hoverV.z); ring.scale.set(sc, sc, sc); ring.visible = true;
  } else ring.visible = false;
}
renderer.setAnimationLoop(() => {
  if (dataZone) { const h = agl(), u = dataZone.material.uniforms; u.uA.value = Math.min(1, Math.max(0, (h - 250) / 250)); dataZone.visible = u.uA.value > 0.01; if (dataZone.visible) { u.uT.value = performance.now() / 1000; u.uW.value = Math.max(2.5, h * 0.004); u.uD.value = Math.max(40, h * 0.035); } }
  const dt = Math.min(clock.getDelta(), 0.1);
  if (playing) { hour = (hour + dt * TIME_SPEED) % 24; $('time').value = hour; }
  if (fly) {
    fly.t += dt / 1.6; const k = Math.min(1, fly.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }
  if (orbit) applyOrbit(dt);
  if (apoc) applyApoc(dt);
  if (!ride && !orbit && !apoc) moveByKeys(dt);
  { const wu = layers.rivers && layers.rivers.userData.wu; if (wu) { wu.uT.value = performance.now() / 1000; wu.uSkyC.value.copy(skyTopC); } }
  if (floodWU) { floodWU.uT.value = performance.now() / 1000; floodWU.uSkyC.value.copy(skyTopC); }
  sky.uniforms.uTime.value = performance.now() / 1000; sky.uniforms.uCloud.value = 0.5 + 0.35 * Math.sin(performance.now() / 240000);
  if (city && city.setTime) city.setTime(performance.now() / 1000 + (window.__tOff || 0));   // horloge réelle des fenêtres (indépendante de la pause)
  if (!ride && !orbit && !apoc) { followTerrain(); controls.update(); }
  tgt.update();
  sky.group.position.copy(camera.position);
  if (traffic && traffic.group.visible && !floodOn) traffic.update(dt, camera.position, camera);   // montée des eaux active : véhicules et trains figés (sinon ils "nageraient")
  if (furn && furn.furn.visible) furn.update(performance.now() / 1000);
  if (ride) cockpit.update(dt, ride.v, ride);
  if (ride) { rideCamera(dt); if ((addrT -= dt) <= 0) { addrT = 0.4; rideAddr.textContent = '📍 ' + (addrAt(ride.v.x, ride.v.z) || 'hors voie nommée'); } } else { updateHover(dt); if ((addrT -= dt) <= 0) { addrT = 0.4; rideAddr.style.display = 'block'; rideAddr.textContent = '📍 ' + (addrAt(camera.position.x, camera.position.z) || 'hors voie nommée'); } }   // mode normal : même pastille, adresse à la verticale de la caméra
  acc += dt; uiAcc += dt;
  if (playing || acc > 0.25) { acc = 0; applyTime(); }
  if (uiAcc > 0.15 && terrain) {
    uiAcc = 0;
    { const lc = terrain.localCenter(); if (Math.hypot(controls.target.x - lc[0], controls.target.z - lc[1]) > 260) terrain.refreshLocal(controls.target.x, controls.target.z); }
    if (trees && trees.group.visible) trees.update(camera.position.x, camera.position.z, camera.position.y);   // ~12,6 ms de recalcul LOD/instances (185 k arbres à Chambéry) : inutile de le payer quand la case « Arbres » est décochée
  }
  { const ha = ride ? 2 : agl(), tg = 0.12 * (1 - THREE.MathUtils.smootherstep(ha, 250, 6000)); distort += (tg - distort) * (1 - Math.exp(-dt * 2.5)); if (Math.abs(tg - distort) < 1e-4) distort = tg; }   // barillet : 12 % en vue basse/immersive, décroît très progressivement avec l'altitude jusqu'à 0 à 6 km
  if (Math.abs(distort) > 0.005 || tilt > 0.005) {
    ensureRT(); renderer.setRenderTarget(post.rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    post.mat.uniforms.tDiffuse.value = post.rt.texture; post.mat.uniforms.uK.value = distort; post.mat.uniforms.uT.value = tilt; post.mat.uniforms.uPx.value.set(1 / post.rt.width, 1 / post.rt.height); post.mat.uniforms.uAsp.value = innerWidth / innerHeight;
    renderer.render(post.scene, post.cam);
  } else renderer.render(scene, camera);
  updateLabels();
  updateCompass();
});
