import * as THREE from 'three';

const C = (h) => new THREE.Color(h);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Ciel : nuit -> aube/crépuscule -> jour, selon l'élévation du soleil.
// Lever/coucher : nuit courte (21h-5h, 8h) et jour long (5h-21h, 16h), à la demande - remplace l'ancien modèle
// symétrique 6h-18h (12h/12h) qui donnait des nuits jugées trop longues (lumières/nuit dès ~17h, jusqu'à ~6h50).
// L'angle solaire `a` est construit en deux demi-tours d'amplitude π chacun mais de DURÉES différentes (jour :
// DAY_LEN heures, nuit : NIGHT_LEN heures) au lieu d'un unique sinus symétrique sur 24h - le soleil balaie donc le
// ciel plus vite pendant la nuit (comprimée) que pendant le jour, mais `elev`/`a` restent continus au lever et au
// coucher (les deux morceaux valent 0 exactement à SUNRISE et SUNSET). Tout le reste (jour/crépuscule/nuit/phares,
// ci-dessous) continue de ne dépendre QUE de `elev`, donc s'adapte automatiquement sans rien changer d'autre.
const SUNRISE = 5, SUNSET = 21, DAY_LEN = SUNSET - SUNRISE, NIGHT_LEN = 24 - DAY_LEN;
export function skyState(hour) {
  const a = (hour >= SUNRISE && hour <= SUNSET)
    ? Math.PI * (hour - SUNRISE) / DAY_LEN                                                  // jour : 0 (lever) -> π (coucher)
    : Math.PI + Math.PI * ((hour < SUNRISE ? hour + 24 - SUNSET : hour - SUNSET) / NIGHT_LEN);  // nuit : π (coucher) -> 2π (lever)
  const elev = Math.sin(a);
  const sunDir = new THREE.Vector3(Math.cos(a), Math.max(0.03, 0.75 * elev), 0.6 * Math.max(elev, 0.2)).normalize();
  const day = smooth(0.0, 0.35, elev);
  const dusk = 1 - Math.abs(smooth(-0.15, 0.25, elev) * 2 - 1);      // pic à l'horizon
  const night = 1 - smooth(-0.14, 0.12, elev);
  const drive = 1 - smooth(-0.14, 0.22, elev);   // pilote l'éclairage des fenêtres : commence ~45 min avant le coucher et déborde ~50 min après le lever

  const sky = C(0x0a1024).lerp(C(0xa9cdea), day);
  sky.lerp(C(0xf0a577), dusk * 0.55 * (1 - night * 0.6));
  const top = C(0x02040c).lerp(C(0x4f86cc), day); top.lerp(C(0x3a4f86), dusk * 0.5 * (1 - night));
  return {
    sky, top, night, drive, sunDir, day, dusk, a,   // `a` exposé pour que le calcul de la lune (main.js) reste cohérent avec la trajectoire solaire jour/nuit ci-dessus
    hemiSky: C(0x2a3a66).lerp(C(0xbcd8ff), day),
    hemi: 0.18 + 0.5 * day,
    sunI: 2.4 * smooth(0.0, 0.25, elev),
    sunColor: C(0xffb27a).lerp(C(0xfff1d6), smooth(0.05, 0.5, elev)),
    moonI: 0.35 * night,
  };
}
