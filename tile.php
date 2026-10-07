<?php
// Tuile d'orthophoto IGN à la demande (mise en cache dans data/73000/orthophoto/z/x/y.jpg)
require __DIR__ . '/lib/osm.php';
$z = (int)($_GET['z'] ?? 0); $x = (int)($_GET['x'] ?? 0); $y = (int)($_GET['y'] ?? 0);
if ($z < 15 || $z > 19 || $x < 0 || $y < 0) { http_response_code(400); exit; }
$f = CH_DIR . "/orthophoto/$z/$x/$y.jpg";
if (!is_file($f) || filesize($f) < 500) {
    @mkdir(dirname($f), 0777, true);
    $url = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=$z&TILEROW=$y&TILECOL=$x";
    [$img, $e] = ch_http($url, null, 30);
    if ($img === null || strlen($img) < 500) { http_response_code(502); exit; }
    file_put_contents($f, $img);
    ch_dirvol_invalidate(CH_CP);   // nouvelle tuile écrite sur disque pendant la navigation normale (pas seulement via fetch.php) :
    // le cache de taille (7 jours) doit être invalidé ici aussi, sinon la taille/nb de fichiers affichés dans le
    // sélecteur de ville reste bloqué sur l'ancien total pendant toute la durée du cache, alors que le dossier
    // continue de grossir au fil de la navigation (ex. Albiez-Montrond : 652 fichiers en cache, 1648 réels).
}
header('Content-Type: image/jpeg'); header('Cache-Control: public, max-age=604800');
readfile($f);
