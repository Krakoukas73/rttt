<?php
require __DIR__ . '/lib/city.php';
$v = 1; $mods = [];
foreach (glob(__DIR__ . '/javascript/*.js') as $f) { $t = filemtime($f); $v = max($v, $t); $mods[basename($f)] = $t; }
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RtTT</title>

<link rel="alternate icon" href="favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap">
<link rel="stylesheet" href="css/style.css?v=<?= $v ?>">
<script type="importmap">
{ "imports": { "three": "./javascript/vendor/three.module.js",
               "three/addons/": "./javascript/vendor/"<?php foreach ($mods as $n => $t) echo ",\n               \"./javascript/$n\": \"./javascript/$n?v=$t\""; ?> } }
</script>
</head>
<body>
<div id="scene"></div>

<aside id="panel">
  <label>Ville
    <select id="city" onchange="location.search='?cp='+this.value"><?php foreach (ch_cities() as $c) {
        echo '<option data-pop="' . ($c['pop'] ?? '') . '" value="' . $c['cp'] . '"' . ($c['cp'] === CH_CP ? ' selected' : '') . '>' . htmlspecialchars($c['name']) . ' (' . $c['zip'] . ') (' . number_format($c['mb'], $c['mb'] < 10 ? 1 : 0, ',', '') . ' Mo)</option>';
    } ?></select></label>

  <label>Heure <output id="o-time">05:15</output>
    <input id="time" type="range" min="0" max="24" step="0.05" value="5.25"></label>
  <div class="row">
    <button id="play" class="act act-play" type="button"><span class="act-i"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="f" d="M8 5.2v13.6l11-6.8z"/></svg></span><span class="act-t">Faire défiler</span><span class="act-l"></span></button>
  </div>
  <div class="row acts">
    <button id="maquette" class="act act-maq" type="button"><span class="act-i"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 20.5h17M5.5 20.5V9.5l5-3v14M10.5 20.5V4l7 3v13.5M17.5 20.5v-7l2 1v6"/><path d="M13 9.5h2M13 13h2M13 16.5h2" stroke-width="1.3"/></svg></span><span class="act-t">Rendu maquette</span><span class="act-l"></span></button>
    <button id="circuit" class="act act-orb" type="button"><span class="act-i"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20.3 3.8v4.6h-4.6"/><circle class="f" cx="12" cy="12" r="1.7"/></svg></span><span class="act-t">Vue circulaire</span><span class="act-l"></span></button>
  </div>

  <h2>Afficher</h2>
  <div class="checks">
    <label><input id="show-buildings" type="checkbox" checked> Bâtiments</label>
    <label><input id="show-roads" type="checkbox" checked> Routes</label>
    <label><input id="show-rivers" type="checkbox" checked> Rivières</label>
    <label><input id="trees" type="checkbox" checked> Arbres</label>
    <label><input id="lights" type="checkbox" checked> Lumières</label>
    <label><input id="show-cars" type="checkbox" checked> Véhicules</label>
    <label><input id="show-ground" type="checkbox"> Trottoirs et marquages</label>
    <label><input id="show-furn" type="checkbox" checked> Feux</label>
    <label><input id="show-deco" type="checkbox" checked> Mobilier</label>
    <label><input id="show-signs" type="checkbox" checked> Enseignes</label>
    <label><input id="show-bridges" type="checkbox" checked> Ponts</label>
    <label><input id="show-barriers" type="checkbox" checked> Glissières</label>
    <label><input id="show-catenary" type="checkbox" checked> Caténaires</label>
    <label><input id="show-lampposts" type="checkbox" checked> Lampadaires</label>
    <label><input id="show-ortho" type="checkbox" checked> Photos aériennes</label>
    <label><input id="show-target" type="checkbox" checked> Cible au sol</label>
  </div>

  <h2>Détails</h2>

  <label>Distance de vue <output id="o-fog">3 km</output>
    <input id="fog" class="heat" type="range" min="500" max="10000" step="100" value="3000"></label>

  <label>Nombre de véhicules <output id="o-veh">0</output>
    <input id="veh" class="heat" data-def="<?php foreach (ch_cities() as $c) if ($c['cp'] === CH_CP) echo (int)$c['veh']; ?>" type="range" min="0" max="8000" step="500" value="0"></label>
  <label>Informations affichées <output id="o-info">Riche</output>
    <input id="infolv" class="heat" type="range" min="0" max="5" step="1" value="3"></label>

  <h2>Apocalypse</h2>
  <label>Niveau de l'eau <output id="o-flood">0 m (désactivé)</output>
    <input id="flood" type="range" min="0" max="200" step="1" value="0"></label>
  <div class="row">
    <button id="apoc" class="act act-apoc" type="button"><span class="act-i"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 17.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg></span><span class="act-t">Simuler l'Apocalypse</span><span class="act-l"></span></button>
  </div>

  <h2>Lieux à voir</h2>
  <div id="places" class="places"><p class="info">Chargement…</p></div>

</aside>

<div id="compass" aria-hidden="true">
  <svg viewBox="0 0 100 100" width="132" height="132">
    <defs>
      <radialGradient id="cpBezel" cx="34%" cy="28%" r="78%">
        <stop offset="0%" stop-color="#f4ecd4"/>
        <stop offset="40%" stop-color="#cdbd82"/>
        <stop offset="75%" stop-color="#8d7a46"/>
        <stop offset="100%" stop-color="#4a3c1c"/>
      </radialGradient>
      <radialGradient id="cpFace" cx="38%" cy="32%" r="72%">
        <stop offset="0%" stop-color="#fdf9ec"/>
        <stop offset="55%" stop-color="#ecdfbd"/>
        <stop offset="100%" stop-color="#c9ba8e"/>
      </radialGradient>
      <radialGradient id="cpGlass" cx="32%" cy="24%" r="80%">
        <stop offset="0%" stop-color="#fff" stop-opacity=".55"/>
        <stop offset="35%" stop-color="#fff" stop-opacity=".08"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="cpLetterN" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ef6a55"/>
        <stop offset="50%" stop-color="#b3291b"/>
        <stop offset="100%" stop-color="#7a1710"/>
      </linearGradient>
      <linearGradient id="cpLetterEW" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#453a26"/>
        <stop offset="100%" stop-color="#110d05"/>
      </linearGradient>
      <filter id="cpShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="0.4" stdDeviation="0.35" flood-color="#000" flood-opacity="0.55"/>
      </filter>
      <filter id="cpGlowN" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur"/>
        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.92  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 1 0" result="glowColor"/>
        <feMerge>
          <feMergeNode in="glowColor"/>
          <feMergeNode in="glowColor"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#cpBezel)" stroke="#2e2510" stroke-width="1"/>
    <circle cx="50" cy="50" r="48" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".6"/>
    <g class="cp-ring">
      <line x1="50.00" y1="8.70" x2="50.00" y2="2.70" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="54.32" y1="8.93" x2="54.94" y2="2.96" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="58.59" y1="9.60" x2="59.83" y2="3.73" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="62.76" y1="10.72" x2="64.62" y2="5.02" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="66.80" y1="12.27" x2="69.24" y2="6.79" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="70.65" y1="14.23" x2="73.65" y2="9.04" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="74.28" y1="16.59" x2="77.80" y2="11.73" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="77.64" y1="19.31" x2="81.65" y2="14.85" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="80.69" y1="22.36" x2="85.15" y2="18.35" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="83.41" y1="25.72" x2="88.27" y2="22.20" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="85.77" y1="29.35" x2="90.96" y2="26.35" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="87.73" y1="33.20" x2="93.21" y2="30.76" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="89.28" y1="37.24" x2="94.98" y2="35.38" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="90.40" y1="41.41" x2="96.27" y2="40.17" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="91.07" y1="45.68" x2="97.04" y2="45.06" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="91.30" y1="50.00" x2="97.30" y2="50.00" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="91.07" y1="54.32" x2="97.04" y2="54.94" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="90.40" y1="58.59" x2="96.27" y2="59.83" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="89.28" y1="62.76" x2="94.98" y2="64.62" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="87.73" y1="66.80" x2="93.21" y2="69.24" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="85.77" y1="70.65" x2="90.96" y2="73.65" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="83.41" y1="74.28" x2="88.27" y2="77.80" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="80.69" y1="77.64" x2="85.15" y2="81.65" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="77.64" y1="80.69" x2="81.65" y2="85.15" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="74.28" y1="83.41" x2="77.80" y2="88.27" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="70.65" y1="85.77" x2="73.65" y2="90.96" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="66.80" y1="87.73" x2="69.24" y2="93.21" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="62.76" y1="89.28" x2="64.62" y2="94.98" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="58.59" y1="90.40" x2="59.83" y2="96.27" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="54.32" y1="91.07" x2="54.94" y2="97.04" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="50.00" y1="91.30" x2="50.00" y2="97.30" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="45.68" y1="91.07" x2="45.06" y2="97.04" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="41.41" y1="90.40" x2="40.17" y2="96.27" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="37.24" y1="89.28" x2="35.38" y2="94.98" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="33.20" y1="87.73" x2="30.76" y2="93.21" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="29.35" y1="85.77" x2="26.35" y2="90.96" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="25.72" y1="83.41" x2="22.20" y2="88.27" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="22.36" y1="80.69" x2="18.35" y2="85.15" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="19.31" y1="77.64" x2="14.85" y2="81.65" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="16.59" y1="74.28" x2="11.73" y2="77.80" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="14.23" y1="70.65" x2="9.04" y2="73.65" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="12.27" y1="66.80" x2="6.79" y2="69.24" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="10.72" y1="62.76" x2="5.02" y2="64.62" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="9.60" y1="58.59" x2="3.73" y2="59.83" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="8.93" y1="54.32" x2="2.96" y2="54.94" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="8.70" y1="50.00" x2="2.70" y2="50.00" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="8.93" y1="45.68" x2="2.96" y2="45.06" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="9.60" y1="41.41" x2="3.73" y2="40.17" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="10.72" y1="37.24" x2="5.02" y2="35.38" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="12.27" y1="33.20" x2="6.79" y2="30.76" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="14.23" y1="29.35" x2="9.04" y2="26.35" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="16.59" y1="25.72" x2="11.73" y2="22.20" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="19.31" y1="22.36" x2="14.85" y2="18.35" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="22.36" y1="19.31" x2="18.35" y2="14.85" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="25.72" y1="16.59" x2="22.20" y2="11.73" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="29.35" y1="14.23" x2="26.35" y2="9.04" stroke="#3a2e14" stroke-opacity="0.6" stroke-width="0.55"/>
      <line x1="33.20" y1="12.27" x2="30.76" y2="6.79" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="37.24" y1="10.72" x2="35.38" y2="5.02" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="41.41" y1="9.60" x2="40.17" y2="3.73" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <line x1="45.68" y1="8.93" x2="45.06" y2="2.96" stroke="#3a2e14" stroke-opacity="0.4" stroke-width="0.3"/>
      <circle cx="81.32" cy="18.68" r="1.7" fill="#2e2510" stroke="#6b5a2e" stroke-width="0.3"/>
      <line x1="80.84" y1="17.63" x2="81.81" y2="19.72" stroke="#9a8a52" stroke-width="0.3"/>
      <circle cx="81.32" cy="81.32" r="1.7" fill="#2e2510" stroke="#6b5a2e" stroke-width="0.3"/>
      <line x1="82.37" y1="80.84" x2="80.28" y2="81.81" stroke="#9a8a52" stroke-width="0.3"/>
      <circle cx="18.68" cy="81.32" r="1.7" fill="#2e2510" stroke="#6b5a2e" stroke-width="0.3"/>
      <line x1="19.16" y1="82.37" x2="18.19" y2="80.28" stroke="#9a8a52" stroke-width="0.3"/>
      <circle cx="18.68" cy="18.68" r="1.7" fill="#2e2510" stroke="#6b5a2e" stroke-width="0.3"/>
      <line x1="17.63" y1="19.16" x2="19.72" y2="18.19" stroke="#9a8a52" stroke-width="0.3"/>
    </g>
    <circle cx="50" cy="50" r="40.9" fill="none" stroke="#2a2310" stroke-opacity=".55" stroke-width="1.1"/>
    <circle cx="50" cy="50" r="40.5" fill="url(#cpFace)" stroke="#5a4b28" stroke-width="0.6"/>
    <circle cx="50" cy="50" r="39.6" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="0.35"/>
    <circle cx="50" cy="50" r="40.5" fill="url(#cpGlass)"/>
    <g class="cp-rose">
      <line x1="56.95" y1="10.61" x2="56.42" y2="13.56" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="63.68" y1="12.41" x2="62.65" y2="15.23" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="70.00" y1="15.36" x2="67.25" y2="20.12" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="75.71" y1="19.36" x2="73.78" y2="21.66" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="80.64" y1="24.29" x2="78.34" y2="26.22" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="84.64" y1="30.00" x2="79.88" y2="32.75" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="87.59" y1="36.32" x2="84.77" y2="37.35" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="89.39" y1="43.05" x2="86.44" y2="43.58" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="89.39" y1="56.95" x2="86.44" y2="56.42" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="87.59" y1="63.68" x2="84.77" y2="62.65" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="84.64" y1="70.00" x2="79.88" y2="67.25" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="80.64" y1="75.71" x2="78.34" y2="73.78" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="75.71" y1="80.64" x2="73.78" y2="78.34" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="70.00" y1="84.64" x2="67.25" y2="79.88" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="63.68" y1="87.59" x2="62.65" y2="84.77" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="56.95" y1="89.39" x2="56.42" y2="86.44" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="43.05" y1="89.39" x2="43.58" y2="86.44" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="36.32" y1="87.59" x2="37.35" y2="84.77" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="30.00" y1="84.64" x2="32.75" y2="79.88" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="24.29" y1="80.64" x2="26.22" y2="78.34" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="19.36" y1="75.71" x2="21.66" y2="73.78" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="15.36" y1="70.00" x2="20.12" y2="67.25" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="12.41" y1="63.68" x2="15.23" y2="62.65" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="10.61" y1="56.95" x2="13.56" y2="56.42" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="10.61" y1="43.05" x2="13.56" y2="43.58" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="12.41" y1="36.32" x2="15.23" y2="37.35" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="15.36" y1="30.00" x2="20.12" y2="32.75" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="19.36" y1="24.29" x2="21.66" y2="26.22" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="24.29" y1="19.36" x2="26.22" y2="21.66" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="30.00" y1="15.36" x2="32.75" y2="20.12" stroke="#4a3f23" stroke-width="0.9"/>
      <line x1="36.32" y1="12.41" x2="37.35" y2="15.23" stroke="#4a3f23" stroke-width="0.5"/>
      <line x1="43.05" y1="10.61" x2="43.58" y2="13.56" stroke="#4a3f23" stroke-width="0.5"/>
      <path d="M 50.00 14.00 L 53.44 41.69 L 66.26 33.74 L 58.31 46.56 L 86.00 50.00 L 58.31 53.44 L 66.26 66.26 L 53.44 58.31 L 50.00 86.00 L 46.56 58.31 L 33.74 66.26 L 41.69 53.44 L 14.00 50.00 L 41.69 46.56 L 33.74 33.74 L 46.56 41.69 Z" fill="#2f2718" fill-opacity=".9" stroke="#140f08" stroke-width="0.3"/>
      <circle cx="50" cy="50" r="12.5" fill="#efe4c3" stroke="#4a3f23" stroke-width="0.5"/>
      <g class="cp-letters" paint-order="stroke fill" stroke="#f6eecd" stroke-width="2.1" stroke-linejoin="round" filter="url(#cpShadow)">
        <g filter="url(#cpGlowN)">
          <text x="50" y="22.3" class="cp-n" fill="url(#cpLetterN)" text-anchor="middle" dominant-baseline="middle">N</text>
        </g>
        <text x="77.7" y="50" class="cp-ew" fill="url(#cpLetterEW)" text-anchor="middle" dominant-baseline="middle">E</text>
        <text x="50" y="77.7" class="cp-ew" fill="url(#cpLetterEW)" text-anchor="middle" dominant-baseline="middle">S</text>
        <text x="22.3" y="50" class="cp-ew" fill="url(#cpLetterEW)" text-anchor="middle" dominant-baseline="middle">O</text>
      </g>
    </g>
    <circle cx="50" cy="50" r="2.4" fill="#1c1709" stroke="#000" stroke-width="0.3"/>
    <circle cx="49.5" cy="49.4" r="0.6" fill="#fff" fill-opacity=".5"/>
  </svg>
  <div class="cp-lubber"></div>
</div>
<div id="labels"></div>
<div id="loading"><div class="pl"><p class="pl-msg">Chargement…</p></div></div>
<script type="module" src="javascript/main.js?v=<?= $v ?>"></script>
</body>
</html>
