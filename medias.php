<?php
// Liste des images de medias/images (galerie de la page d'accueil) : quelques extensions image courantes,
// triées naturellement (1, 4, 5, 7, 21… plutôt que l'ordre alphabétique brut qui mettrait 21 avant 4).
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0'); header('Pragma: no-cache'); header('Expires: 0');
$dir = __DIR__ . '/medias/images';
$exts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
$out = [];
if (is_dir($dir)) foreach (scandir($dir) as $f) {
    if ($f === '.' || $f === '..') continue;
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    if (in_array($ext, $exts, true)) $out[] = $f;
}
sort($out, SORT_NATURAL | SORT_FLAG_CASE);
echo json_encode($out, JSON_UNESCAPED_UNICODE);
