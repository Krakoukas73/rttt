import * as THREE from 'three';

// Dôme de ciel dégradé + étoiles ; suit la caméra.
export function buildSky() {
  const group = new THREE.Group();
  const u = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
              uSunCol: { value: new THREE.Color() }, uSunI: { value: 1 }, uTime: { value: 0 }, uMoon: { value: new THREE.Vector3(0, -1, 0) }, uMoonF: { value: 0.5 },
              uDay: { value: 1 }, uDusk: { value: 0 }, uCloud: { value: 0.5 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor, uSunCol, uSun, uMoon; uniform float uSunI, uTime, uMoonF, uDay, uDusk, uCloud; varying vec3 vD;
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.3; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHor, uTop, pow(h, 0.55));
        vec3 sd = normalize(uSun); float s = max(dot(d, sd), 0.0);
        // crépuscule : bande chaude côté soleil, ciel pourpré en altitude à l'opposé
        vec2 hs = normalize(sd.xz + 1e-4), hd = normalize(d.xz + 1e-4); float az = max(dot(hs, hd), 0.0);
        c += vec3(1.0, 0.45, 0.18) * uDusk * pow(az, 3.0) * exp(-h * 5.0) * 0.55;
        c = mix(c, c * vec3(0.9, 0.78, 1.05), uDusk * (1.0 - az) * h * 0.4);
        c += uSunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25) * uSunI;
        // nuages animés
        if (d.y > 0.0) {
          vec2 q = d.xz / (d.y + 0.12) * 0.9 + vec2(uTime * 0.006, uTime * 0.003);
          float dn = fbm(q), dn2 = fbm(q * 2.7 + 5.0);
          float cov = mix(0.62, 0.34, uCloud), cl = smoothstep(cov, cov + 0.22, dn * 0.75 + dn2 * 0.35) * smoothstep(0.0, 0.22, d.y);
          float lit = clamp(0.55 + 0.7 * (1.0 - fbm(q + sd.xz * 0.15)) , 0.0, 1.2);
          vec3 cc = mix(vec3(0.05, 0.06, 0.10), vec3(1.0), uDay) * lit;
          cc = mix(cc, cc * uSunCol * 1.25 + uHor * 0.25, uDusk * 0.8);
          cc = mix(cc, cc * 0.72, smoothstep(0.55, 0.9, dn));           // dessous plus gris
          c = mix(c, cc, cl * 0.92);
        }
        // lune : disque avec phase et mers
        vec3 md = normalize(uMoon); float mc = dot(d, md);
        if (uMoon.y > -0.1) {
          float R = 0.026, ang = acos(clamp(mc, -1.0, 1.0));
          if (ang < R * 3.0) {
            vec3 ax = normalize(cross(md, vec3(0.0, 1.0, 0.0))), ay = cross(ax, md);
            vec2 p = vec2(dot(d, ax), dot(d, ay)) / R; float r2 = dot(p, p);
            float halo = exp(-ang * ang / (R * R * 6.0)) * 0.22 * (1.0 - uDay * 0.85);
            c += vec3(0.75, 0.82, 1.0) * halo;
            if (r2 < 1.0) {
              vec3 n = vec3(p, sqrt(1.0 - r2)); float ph = 6.2831853 * uMoonF; vec3 L = vec3(sin(ph), 0.0, -cos(ph));
              float lit2 = smoothstep(-0.03, 0.06, dot(n, L));
              float mare = fbm(p * 2.2 + 3.0); vec3 sur = mix(vec3(0.62, 0.62, 0.64), vec3(0.93, 0.92, 0.88), smoothstep(0.35, 0.65, mare));
              vec3 mcol = sur * (0.12 + 0.95 * lit2) * (1.0 - uDay * 0.6);
              c = mix(c, mcol + vec3(0.02, 0.025, 0.04) * (1.0 - lit2), smoothstep(1.0, 0.94, sqrt(r2)) * (1.0 - uDay * 0.55));
            }
          }
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -10;
  const sp = [], rnd = (i) => { const x = Math.sin(i * 91.7) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < 1500; i++) {
    const a = rnd(i) * 6.283, y = 0.05 + rnd(i + 3000) * 0.95, r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * r * 18000, y * 18000, Math.sin(a) * r * 18000);
  }
  const sc = [];
  for (let i = 0; i < 1500; i++) { const m = Math.pow(rnd(i + 7000), 3); const c = 0.35 + 0.65 * m, t = rnd(i + 9000); sc.push(c * (0.85 + 0.15 * t), c * (0.9 + 0.1 * t), c * (1.0 - 0.15 * t)); }
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const cx = cv.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, vertexColors: true, map: new THREE.CanvasTexture(cv), alphaTest: 0.02, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  group.add(dome, stars);
  return { group, uniforms: u, stars };
}
