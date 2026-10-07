<?php
// Page utilitaire (pas de lien depuis le menu) : lance le téléchargement des photos aériennes en haute définition
// (zoom 19 par défaut, ~0,6 m/px) pour TOUTES les villes déjà chargées, les unes après les autres, dans un seul
// onglet. Chaque ville attend la fin de la précédente avant de démarrer (fetch.php?cp=...&hires=... est appelé en
// AJAX, en série). fetch.php protège désormais l'exécution avec ignore_user_abort(true) : fermer cet onglet
// n'interrompt PAS la ville en cours de téléchargement, mais les villes suivantes de la file ne seront alors pas
// lancées - laisser l'onglet ouvert jusqu'à "TOUT TERMINÉ" pour un enchaînement automatique complet.
require __DIR__ . '/lib/city.php';
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
if (!preg_match('/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1)/', $ip)) { http_response_code(403); exit('Réseau local uniquement'); }
$z = max(17, min(19, (int)($_GET['z'] ?? 19)));

// ordre : les plus petites zones d'abord (résultats rapides), estimé par le nombre de tuiles déjà en cache au zoom
// de base (16) - proportionnel à la surface de chaque ville, contrairement à la taille du dossier ville.json.
$cities = ch_cities();
foreach ($cities as &$c) {
    $dir = __DIR__ . "/data/{$c['cp']}/orthophoto/16";
    $c['n16'] = is_dir($dir) ? count(glob("$dir/*/*.jpg") ?: []) : 0;
}
unset($c);
usort($cities, fn($a, $b) => $a['n16'] <=> $b['n16']);
?>
<!doctype html><meta charset="utf-8"><title>Photos aériennes HD - toutes les villes</title>
<style>body{font:14px/1.5 monospace;white-space:pre-wrap;padding:20px;background:#111;color:#ddd}</style>
<div id="out">Zoom cible : z<?= $z ?> — <?= count($cities) ?> ville(s) en file (petite -> grande) :
<?php foreach ($cities as $c): ?>
 - <?= htmlspecialchars($c['cp']) ?> (<?= htmlspecialchars($c['name']) ?>) — ~<?= $c['n16'] ?> tuiles z16<?php endforeach; ?>

Ne pas fermer cet onglet tant que possible (une ville déjà lancée continue même onglet fermé, mais la file s'arrête là).
</div>
<script>
const cities = <?= json_encode(array_map(fn($c) => ['cp' => $c['cp'], 'name' => $c['name']], $cities)) ?>;
const z = <?= $z ?>;
const out = document.getElementById('out');
(async () => {
  for (const c of cities) {
    out.textContent += `\n\n=== ${c.name} (${c.cp}) ===\n`;
    try {
      const res = await fetch(`fetch.php?cp=${encodeURIComponent(c.cp)}&hires=${z}`);
      const text = await res.text();
      out.textContent += text;
    } catch (e) {
      out.textContent += `ERREUR réseau : ${e.message}\n`;
    }
  }
  out.textContent += '\n\n=== TOUT TERMINÉ ===';
  document.title = 'TERMINÉ - Photos aériennes HD';
})();
</script>
