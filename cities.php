<?php
// Liste des villes disponibles + statistiques et tailles à télécharger (mises en cache dans data/<cp>/stats.json, recalculées si ville.json change)
ini_set('memory_limit', '3G'); set_time_limit(600);
require __DIR__ . '/lib/city.php';
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-cache');
const STATS_V = 2;   // v2 : km² = emprise RÉELLE des données (bbox), plus l'étendue des tronçons routiers (des routes sortant de la zone la gonflaient jusqu'à x2,5)
function ch_stats(array $c): array {
    $cp = $c['cp']; $dir = __DIR__ . '/data/' . $cp; $vf = "$dir/ville.json"; $sf = "$dir/stats.json";
    $key = filemtime($vf) . '-' . filesize($vf) . '-' . STATS_V;
    if (is_file($sf)) { $s = json_decode((string)file_get_contents($sf), true); if ($s && ($s['key'] ?? '') === $key) return $s; }
    $raw = file_get_contents($vf); $d = json_decode($raw, true); if (!$d) return ['key' => 'x'];
    $B = $d['buildings'] ?? []; $R = $d['roads'] ?? []; $A = $d['areas'] ?? [];
    $x0 = 1e9; $x1 = -1e9; $z0 = 1e9; $z1 = -1e9; $len = 0.0;
    foreach ($R as $r) { $p = $r['p']; $n = count($p); for ($i = 0; $i < $n; $i++) { $q = $p[$i]; if ($q[0] < $x0) $x0 = $q[0]; if ($q[0] > $x1) $x1 = $q[0]; if ($q[1] < $z0) $z0 = $q[1]; if ($q[1] > $z1) $z1 = $q[1]; if ($i) $len += hypot($q[0] - $p[$i - 1][0], $q[1] - $p[$i - 1][1]); } }
    $bb = []; $nb = count($B); $st = max(1, (int)floor($nb / 1800)); for ($i = 0; $i < $nb; $i += $st) { $p = $B[$i]['p'] ?? null; if ($p) $bb[] = [round($p[0][0]), round($p[0][1])]; }
    $rr = []; foreach ($R as $r) { if ($r['k'] > 5) continue; $q = []; $p = $r['p']; $n = count($p); for ($i = 0; $i < $n; $i += 3) $q[] = [round($p[$i][0]), round($p[$i][1])]; if ($n > 1 && $i - 3 !== $n - 1) $q[] = [round($p[$n - 1][0]), round($p[$n - 1][1])]; $rr[] = [$r['k'], $q]; if (count($rr) > 1400) break; }
    $ww = []; foreach ($A as $a) { if (($a['t'] ?? '') !== 'water') continue; $rings = (isset($a['p'][0][0]) && is_array($a['p'][0][0])) ? $a['p'] : [$a['p']]; foreach ($rings as $ring) { $q = []; $n = count($ring); $s2 = max(1, (int)floor($n / 40)); for ($i = 0; $i < $n; $i += $s2) $q[] = [round($ring[$i][0]), round($ring[$i][1])]; if (count($q) > 2) $ww[] = $q; } if (count($ww) > 40) break; }
    $cnt = function ($t) use ($B) { $n = 0; foreach ($B as $b) if (($b['t'] ?? '') === $t) $n++; return $n; };
    $areaKm2 = ($x1 - $x0) * ($z1 - $z0) / 1e6;
    if (!empty($d['bbox']) && count($d['bbox']) === 4) { [$bs, $bw, $bn, $be] = $d['bbox']; $areaKm2 = ($be - $bw) * 111.32 * cos(deg2rad(($bs + $bn) / 2)) * ($bn - $bs) * 110.54; }   // zone téléchargée = carré (bbox) autour du centre
    $gz = strlen(gzencode($raw, 6)); unset($raw);
    $s = ['key' => $key, 'cp' => $cp, 'bat' => $nb, 'arb' => count($d['trees'] ?? []) + count($d['treesx'] ?? []), 'km' => round($len / 1000), 'zones' => count($A), 'shops' => count($d['shops'] ?? []), 'num' => count($d['numbers'] ?? []), 'peaks' => count($d['peaks'] ?? []),
        'eglises' => $cnt('church'), 'ecoles' => $cnt('school') + $cnt('university'), 'hop' => $cnt('hospital'), 'km2' => round($areaKm2, 1), 'rkm' => round(sqrt($areaKm2) / 2, 1), 'ext' => [round($x0), round($z0), round($x1), round($z1)],
        'dl' => ['ville' => $gz, 'relief' => ch_dirsize("$dir/relief"), 'ortho' => ch_dirsize("$dir/orthophoto/16")], 'hires' => ch_dirsize("$dir/orthophoto/17") + ch_dirsize("$dir/orthophoto/18") + ch_dirsize("$dir/orthophoto/19"),
        'thumb' => ['b' => $bb, 'r' => $rr, 'w' => $ww]];
    @file_put_contents($sf, json_encode($s, JSON_UNESCAPED_UNICODE), LOCK_EX); return $s;
}
$out = [];
foreach (ch_cities() as $c) { $s = ch_stats($c); $dd = __DIR__ . '/data/' . $c['cp']; $s['dl']['relief'] = ch_dirsize("$dd/relief"); $s['dl']['ortho'] = ch_dirsize("$dd/orthophoto/16");   // tailles recalculées à chaque appel (petits dossiers) ; seules les stats lourdes restent en cache
    $s['name'] = $c['name']; $s['zip'] = $c['zip']; $s['pop'] = $c['pop'] ?? null; $s['mb'] = round($c['mb']); $s['disk'] = $c['disk']; $s['files'] = $c['files']; $out[] = $s; }
echo json_encode($out, JSON_UNESCAPED_UNICODE);
