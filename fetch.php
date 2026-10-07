<?php
// Téléchargement des données depuis le navigateur : http://serveur/chambery/fetch.php  (?force=1 pour tout refaire)
// Utile si « php tools/fetch_osm.php » n'est pas pratique. Réservé au réseau local.
ini_set('memory_limit', '2G'); set_time_limit(0); ignore_user_abort(true);   // les téléchargements hires/force sont longs : ne pas les interrompre si l'onglet qui les a lancés est fermé ou perd la connexion
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
if (!preg_match('/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1)/', $ip)) { http_response_code(403); exit('Réseau local uniquement'); }
require __DIR__ . '/lib/osm.php';
if (!defined('STDERR')) define('STDERR', fopen('php://output', 'w'));
if (!CH_RESOLVED) { ch_city_resolve(); header('Location: fetch.php?cp=' . CH_CP . (isset($_GET['force']) ? '&force=1' : '')); exit; }   // le centre vient d'être trouvé : on relance avec ses coordonnées
header('Content-Type: text/plain; charset=utf-8');
header('X-Accel-Buffering: no');
@ini_set('display_errors', '1');
// ch_log écrit sur STDERR : on redirige vers la sortie pour les requêtes web
echo "PHP " . PHP_VERSION . ' | curl: ' . (function_exists('curl_init') ? 'oui' : 'non') . ' | allow_url_fopen: ' . ini_get('allow_url_fopen') . "\n";
if (isset($_GET['hires'])) { $ok = ch_fetch_ortho_hi(max(17, min(19, (int)$_GET['hires'] ?: 19))); ch_dirvol_invalidate(CH_CP); echo $ok ? "TERMINÉ\n" : "INCOMPLET (relancer)\n"; exit; }
$ok = ch_fetch_all(isset($_GET['force']));
ch_dirvol_invalidate(CH_CP);   // le volume sur disque vient de changer (même en cas d'échec partiel) : le cache de taille (7 jours) ne doit pas rester bloqué sur l'ancien total jusqu'à expiration
echo $ok ? "TERMINÉ\n" : "ÉCHEC\n";
