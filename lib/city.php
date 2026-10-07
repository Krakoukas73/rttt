<?php
// Sélection de la ville : ?cp=73000 (web) ou premier argument à 5 chiffres (CLI). Chaque ville a son dossier data/<cp>/.
$__cp = $_GET['cp'] ?? '73000';
if (PHP_SAPI === 'cli') { foreach (array_slice($GLOBALS['argv'] ?? [], 1) as $a) if (preg_match('/^\d{5}$/', $a)) $__cp = $a; }
$__list = json_decode(file_get_contents(__DIR__ . '/cities.json'), true);
$__C = $__list[0]; foreach ($__list as $c) if ($c['cp'] === $__cp) $__C = $c;
$__cp = $__C['cp'];
$__dir = __DIR__ . '/../data/' . $__cp;
$__ci = is_file("$__dir/centre.json") ? json_decode(file_get_contents("$__dir/centre.json"), true) : null;
$__lat = $__C['lat'] ?? $__ci['lat'] ?? null; $__lon = $__C['lon'] ?? $__ci['lon'] ?? null;
define('CH_CP', $__cp);
define('CH_NAME', $__C['name']);
define('CH_FIND', $__C['find'] ?? null);
define('CH_RESOLVED', $__lat !== null);
define('CH_LAT', (float)($__lat ?? 45.5));
define('CH_LON', (float)($__lon ?? 6.0));
$__h = (float)($__C['half'] ?? 3200);
define('CH_BBOX', $__C['bbox'] ?? [round(CH_LAT - $__h / 110540, 4), round(CH_LON - $__h / (111320 * cos(deg2rad(CH_LAT))), 4), round(CH_LAT + $__h / 110540, 4), round(CH_LON + $__h / (111320 * cos(deg2rad(CH_LAT))), 4)]);
define('CH_DIR', $__dir);
define('CH_FILE', "$__dir/ville.json");
function ch_cities(): array {   // villes déjà préchargées (fichier de données présent)
    static $memo = null; if ($memo !== null) return $memo;
    $out = [];
    foreach (json_decode(file_get_contents(__DIR__ . '/cities.json'), true) as $c) {
        $d = __DIR__ . '/../data/' . $c['cp'];
        if (is_file("$d/ville.json")) {
            $chk = is_file("$d/cache/cadastre_check.json") ? json_decode((string)file_get_contents("$d/cache/cadastre_check.json"), true) : null;
            $out[] = ['cp' => $c['cp'], 'name' => $c['name'], 'zip' => $c['zip'] ?? $c['cp'], 'mb' => ($vv = ch_dirvol_cached($c['cp'], $d))['bytes'] / 1048576, 'disk' => $vv['disk'], 'files' => $vv['files'], 'veh' => $c['veh'] ?? 3000, 'pop' => $c['pop'] ?? null, 'check' => $chk];
        }
    }
    usort($out, fn($a, $b) => strcmp((string)$b['zip'], (string)$a['zip']) ?: strcmp($a['name'], $b['name']));   // sélecteur : code postal décroissant
    return $memo = $out;
}

function ch_dirsize_cached(string $cp, string $d): int { return (int)ch_dirvol_cached($cp, $d)['bytes']; }
function ch_dirvol_cached(string $cp, string $d): array {   // volume d'une ville (octets réels, taille sur disque à clusters de 4 Ko, nb de fichiers) : le parcours de centaines de milliers de tuiles est lent, résultat mis en cache 7 jours (?fresh=1 force le recalcul)
    $f = __DIR__ . '/../data/.sizes.json'; $c = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    $e = $c[$cp] ?? null;
    if ($e && isset($e['bytes'], $e['disk']) && empty($_GET['fresh']) && time() - $e['t'] < 7 * 86400) return $e;
    $v = ch_dirvol($d); $v['t'] = time(); $c[$cp] = $v; @file_put_contents($f, json_encode($c), LOCK_EX); return $v;
}
// invalide le cache de volume d'une ville : à appeler après tout téléchargement (fetch.php, ?hires=…) qui a pu
// modifier le contenu de data/<cp>/, car un fetch complémentaire (ex. ?hires=19) n'écrit que des tuiles jpg et
// ne touche jamais ville.json - le cache de volume, purement temporel (7 jours), pouvait donc rester bloqué sur
// un volume mesuré AVANT un téléchargement complémentaire, affichant un total obsolète et trop faible jusqu'à
// expiration (jusqu'à 7 jours), quelle que soit la ville. En liant l'invalidation à l'évènement réel qui change
// le volume sur disque (la fin d'un fetch), plutôt qu'à une durée arbitraire, le total affiché redevient exact
// dès le prochain chargement de la page, pour toutes les villes.
function ch_dirvol_invalidate(string $cp): void {
    $f = __DIR__ . '/../data/.sizes.json'; $c = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    if (array_key_exists($cp, $c)) { unset($c[$cp]); @file_put_contents($f, json_encode($c), LOCK_EX); }
}
function ch_dirvol(string $d): array {
    $b = 0; $k = 0; $n = 0;
    if (is_dir($d)) foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS)) as $f) if ($f->isFile()) { $z = $f->getSize(); $b += $z; $k += (int)(ceil($z / 4096) * 4096); $n++; }
    return ['bytes' => $b, 'disk' => $k, 'files' => $n];
}

function ch_dirsize(string $d): int {   // taille totale d'un sous-dossier de data/ (octets)
    $n = 0;
    if (!is_dir($d)) return 0;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS)) as $f) if ($f->isFile()) $n += $f->getSize();
    return $n;
}
