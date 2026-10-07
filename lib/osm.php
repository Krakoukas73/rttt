<?php
// Téléchargement des données de Chambéry (OpenStreetMap via Overpass + relief AWS Terrarium)
// et conversion en JSON compact (coordonnées en mètres autour du centre, x = est, z = sud).
require_once __DIR__ . '/city.php';   // définit CH_CP, CH_NAME, CH_LAT, CH_LON, CH_BBOX, CH_DIR, CH_FILE
const CH_DEM_RADIUS = 9000;                        // rayon du relief (m)
const CH_DEM_ZOOM = 13;

function ch_log(string $m): void { fwrite(STDERR, $m . "\n"); @mkdir(CH_DIR, 0777, true); @file_put_contents(CH_DIR . '/fetch.log', date('H:i:s ') . $m . "\n", FILE_APPEND); }

function ch_proj(float $lat, float $lon): array {
    return [round(($lon - CH_LON) * 111320 * cos(deg2rad(CH_LAT)), 1),
            round(-($lat - CH_LAT) * 110540, 1)]; // nord = -z
}

// ---------------------------------------------------------------- HTTP
function ch_http(string $url, ?string $post = null, int $timeout = 170): array {
    $err = ''; $body = null; $code = 0;
    foreach ([true, false] as $verify) {           // 2e essai sans vérification SSL (PHP Windows sans CA configurée)
        if (function_exists('curl_init')) {
            $c = curl_init($url);
            curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_USERAGENT => 'vue-3d-chambery/1.0 (projet personnel)', CURLOPT_ENCODING => '',
                CURLOPT_SSL_VERIFYPEER => $verify, CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0]);
            if ($post !== null) { curl_setopt($c, CURLOPT_POST, true); curl_setopt($c, CURLOPT_POSTFIELDS, $post); }
            $body = curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); $err = curl_error($c); curl_close($c);
        } else {
            $h = ['method' => $post === null ? 'GET' : 'POST', 'timeout' => $timeout, 'ignore_errors' => true,
                  'header' => "User-Agent: vue-3d-chambery/1.0\r\nContent-Type: application/x-www-form-urlencoded\r\n"];
            if ($post !== null) $h['content'] = $post;
            $body = @file_get_contents($url, false, stream_context_create(['http' => $h,
                'ssl' => ['verify_peer' => $verify, 'verify_peer_name' => $verify]]));
            $code = 0;
            if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) $code = (int)$m[1];
            if ($body === false) { $body = null; $err = error_get_last()['message'] ?? 'échec file_get_contents'; }
        }
        if ($body !== null && $body !== false && $code >= 200 && $code < 300) {
            if (!$verify) ch_log("  (attention : vérification SSL désactivée, le certificat n'a pas pu être validé)");
            return [$body, ''];
        }
        if ($code >= 400) break;                    // erreur HTTP réelle : inutile de réessayer sans SSL
    }
    return [null, "HTTP $code $err"];
}

function ch_overpass(string $ql): ?array {
    $servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
                'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
    foreach ([0, 1] as $round) foreach ($servers as $u) {
        ch_log("  -> $u");
        [$raw, $e] = ch_http($u, http_build_query(['data' => $ql]));
        if ($raw === null) { ch_log("     échec : $e"); if (str_contains($e, '429') || str_contains($e, '504')) sleep(20); continue; }
        $j = json_decode($raw, true);
        if (is_array($j) && isset($j['elements'])) return $j['elements'];
        ch_log('     réponse inattendue : ' . substr($raw, 0, 150));
    }
    return null;
}

// ---------------------------------------------------------------- Conversion
function ch_poly(array $geom): array {
    $p = [];
    foreach ($geom as $g) { if ($g) $p[] = ch_proj($g['lat'], $g['lon']); }
    return $p;
}
function ch_num($v): ?float { return $v !== null && preg_match('/-?\d+([.,]\d+)?/', (string)$v, $m) ? (float)str_replace(',', '.', $m[0]) : null; }

function ch_pip(array $pt, array $ring): bool {
    $in = false; $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        if ((($ring[$i][1] > $pt[1]) !== ($ring[$j][1] > $pt[1])) && ($pt[0] < ($ring[$j][0] - $ring[$i][0]) * ($pt[1] - $ring[$i][1]) / (($ring[$j][1] - $ring[$i][1]) ?: 1e-9) + $ring[$i][0])) $in = !$in;
    }
    return $in;
}

function ch_btags(array $t, array $p): ?array {
    if (isset($t['building:part']) && !isset($t['building'])) return null;
    $b = $t['building'] ?? 'yes';
    if (in_array($b, ['roof', 'no'], true)) return null;
    $o = ['p' => $p];
    if (!empty($t['addr:housenumber'])) $o['hn'] = $t['addr:housenumber'];
    if (($h = ch_num($t['height'] ?? null)) !== null) $o['h'] = round($h, 1);
    if (($l = ch_num($t['building:levels'] ?? null)) !== null) $o['l'] = $l;
    if (($v = ch_num($t['roof:height'] ?? null)) !== null) $o['rh'] = $v;
    if (($v = ch_num($t['min_height'] ?? null)) !== null) $o['mh'] = $v;
    if (isset($t['roof:shape'])) $o['r'] = $t['roof:shape'];
    if (isset($t['building:colour'])) $o['c'] = $t['building:colour'];
    if (isset($t['roof:colour'])) $o['rc'] = $t['roof:colour'];
    $hi = $t['historic'] ?? '';
    $type = ($t['amenity'] ?? '') === 'place_of_worship' ? 'church'
        : ((in_array($hi, ['castle', 'fort'], true) || $b === 'castle' || $b === 'fort') ? 'castle'   // château/fort : façade pierre de taille dédiée (cf. buildings.js isStone)
        : $b);
    if ($type !== 'yes') $o['t'] = $type;
    return $o;
}

function ch_parse_buildings(array $els): array {
    $out = []; $trees = [];
    foreach ($els as $el) {
        $t = $el['tags'] ?? [];
        if ($el['type'] === 'node') { $trees[] = ch_proj($el['lat'], $el['lon']); continue; }
        if ($el['type'] === 'relation') {      // bâtiment multipolygone : contour + cours intérieures
            if (empty($el['members']) || ($t['type'] ?? '') !== 'multipolygon') continue;
            $rings = ['outer' => [], 'inner' => []];
            foreach (['outer', 'inner'] as $role) {
                $segs = [];
                foreach ($el['members'] as $m) if (($m['type'] ?? '') === 'way' && ($m['role'] ?? '') === $role && !empty($m['geometry'])) $segs[] = ch_poly($m['geometry']);
                $rings[$role] = ch_rings($segs);
            }
            foreach ($rings['outer'] as $ring) {
                array_pop($ring);
                $o = ch_btags($t, $ring); if ($o === null) continue;
                $holes = [];
                foreach ($rings['inner'] as $h) { array_pop($h); if (count($h) >= 3 && ch_pip($h[0], $ring)) $holes[] = $h; }
                if ($holes) $o['hh'] = $holes;
                $out[] = $o;
            }
            continue;
        }
        if (empty($el['geometry']) || count($el['geometry']) < 4) continue;
        $p = ch_poly($el['geometry']); array_pop($p);
        $o = ch_btags($t, $p); if ($o !== null) $out[] = $o;
    }
    return [$out, $trees];
}

const CH_ROAD = ['motorway' => 0, 'motorway_link' => 0, 'trunk' => 1, 'trunk_link' => 1, 'primary' => 1, 'primary_link' => 1,
    'secondary' => 2, 'secondary_link' => 2, 'tertiary' => 3, 'tertiary_link' => 3, 'unclassified' => 4, 'residential' => 4,
    'living_street' => 4, 'road' => 4, 'service' => 5, 'busway' => 5, 'bus_guideway' => 5, 'pedestrian' => 6,
    'footway' => 7, 'path' => 7, 'cycleway' => 7, 'steps' => 7, 'bridleway' => 7, 'track' => 8];
    // 'road' (route non classifiée faute de relevé terrain) -> comme 'unclassified' ; 'busway'/'bus_guideway' (voie bus
    // dédiée) -> comme 'service' ; 'bridleway' (chemin équestre) -> comme footway/path/cycleway/steps, même gabarit.

function ch_parse_lines(array $els): array {
    $roads = [];
    foreach ($els as $el) {
        if (($el['type'] ?? '') !== 'way' || empty($el['geometry'])) continue;
        $t = $el['tags'] ?? [];
        if (isset($t['highway'])) {
            if (!isset(CH_ROAD[$t['highway']])) continue;
            if (isset($t['tunnel']) && $t['tunnel'] !== 'no') continue;
            // service=driveway (chemin privé menant à une maison) conservé : seules les allées de parking (service=parking_aisle,
            // simples marquages au sol dans un parking, pas de "chemin" au sens propre) restent filtrées.
            if (($t['area'] ?? '') === 'yes' || ($t['service'] ?? '') === 'parking_aisle') continue;
            $k = CH_ROAD[$t['highway']];
            $o = ['k' => $k, 'p' => ch_poly($el['geometry'])];
            if (($w = ch_num($t['width'] ?? null)) !== null && $w > 1 && $w < 40) $o['w'] = $w;
            if (isset($t['bridge']) && $t['bridge'] !== 'no') $o['b'] = 1;
            if (in_array($t['junction'] ?? '', ['roundabout', 'circular'], true)) $o['rb'] = 1;
            if (($t['highway'] ?? '') === 'trunk') $o['tr'] = 1;
            $ow = (string)($t['oneway'] ?? '');
            if (in_array($ow, ['yes', 'true', '1'], true)) $o['ow'] = 1;
            elseif (in_array($ow, ['-1', 'reverse'], true)) $o['ow'] = -1;
            elseif ($ow !== 'no' && in_array($t['highway'], ['motorway', 'motorway_link'], true)) $o['ow'] = 1;
            if ($k === 7) {
                $hwv = $t['highway'] ?? ''; $bike = $t['bicycle'] ?? '';
                // piste cyclable "pure" (highway=cycleway), ou voie mixte piéton+vélo explicitement dédiée au vélo
                // (highway=path/footway + bicycle=designated) : très fréquent le long des rivières en France (ex. la
                // Leysse à Chambéry) - l'usage réel y est goudronné comme une route, pas un sentier en terre.
                if ($hwv === 'cycleway' || ((($hwv === 'path') || ($hwv === 'footway')) && $bike === 'designated')) $o['cy'] = 1;
            }
            if ($k <= 4) {   // bandes / pistes cyclables portées par la chaussée : cl = l (bande) ou t (piste séparée), cs = côté (r, l, b)
                $cw = ['r' => $t['cycleway:right'] ?? null, 'l' => $t['cycleway:left'] ?? null];
                if (isset($t['cycleway'])) $cw['r'] = $cw['r'] ?? $t['cycleway']; if (isset($t['cycleway']) && $cw['l'] === null && !in_array($t['cycleway'], ['opposite', 'opposite_lane', 'opposite_track'], true)) $cw['l'] = $t['cycleway'];
                if (isset($t['cycleway:both'])) $cw = ['r' => $t['cycleway:both'], 'l' => $t['cycleway:both']];
                $sd = ''; $ty = '';
                foreach ($cw as $sdk => $v) { if ($v === null) continue; if (in_array($v, ['lane', 'shared_lane', 'opposite_lane'], true)) { $sd .= $sdk; $ty = $ty ?: 'l'; } elseif (in_array($v, ['track', 'opposite_track'], true)) { $sd .= $sdk; $ty = 't'; } }
                if ($sd !== '') { $o['cl'] = $ty; $o['cs'] = $sd; }
            }
            if (($ln = (int)($t['lanes'] ?? 0)) > 0 && $ln <= 8) $o['ln'] = $ln;
            if (($ms = (int)($t['maxspeed'] ?? 0)) > 0) $o['ms'] = $ms;
            // allée privée menant à une maison : à exempter du recalage BD TOPO ci-dessous (ch_filter_orphan_roads),
            // qui ne connaît que le réseau routier OFFICIEL (public) et prendrait sinon systématiquement ces allées
            // privées pour des tronçons orphelins faute de contrepartie dans la BD TOPO, les supprimant à tort.
            if (($t['service'] ?? '') === 'driveway') $o['dw'] = 1;
            // sentiers/chemins/pistes (k=7/8) : leur nom (ou, à défaut, leur ref : "GR 9"...) était jusqu'ici ignoré faute de `k <= 6`.
            // Les trottoirs et passages piétons (footway=sidewalk/crossing) portent souvent le nom de la rue qu'ils longent : exclus,
            // sinon chaque rue serait étiquetée une seconde fois sur son trottoir.
            if ($k >= 7 && in_array($t['footway'] ?? '', ['sidewalk', 'crossing'], true)) { /* pas de nom */ }
            elseif ($k <= 8 && (!empty($t['name']) || !empty($t['ref']))) $o['nm'] = !empty($t['name']) && $k > 0 ? $t['name'] : (!empty($t['ref']) ? explode(';', $t['ref'])[0] : $t['name']);
        } elseif (isset($t['man_made']) && $t['man_made'] === 'pier') {
            // ponton/jetée : modélisé comme un chemin piéton en pont (k=7) même sans tag bridge=yes ni highway - c'est
            // physiquement un tablier surélevé au-dessus de l'eau, exactement le même besoin que les passerelles
            $o = ['k' => 7, 'p' => ch_poly($el['geometry']), 'b' => 1];
            if (($w = ch_num($t['width'] ?? null)) !== null && $w > 1 && $w < 40) $o['w'] = $w;
        } elseif (isset($t['railway'])) {
            if (isset($t['tunnel']) && $t['tunnel'] !== 'no') continue;
            $o = ['k' => 9, 'p' => ch_poly($el['geometry'])];
        } elseif (isset($t['waterway'])) {
            if (isset($t['tunnel']) && $t['tunnel'] !== 'no') continue;
            $k = in_array($t['waterway'], ['river', 'canal'], true) ? 10 : 11;
            $o = ['k' => $k, 'p' => ch_poly($el['geometry'])];
            if ($k >= 10 && !empty($t['name'])) $o['nm'] = $t['name'];
        } else continue;
        $roads[] = $o;
    }
    return $roads;
}

function ch_area_type(array $t): ?string {
    $lu = $t['landuse'] ?? ''; $na = $t['natural'] ?? ''; $le = $t['leisure'] ?? '';
    if ($lu === 'forest' || $na === 'wood') return 'forest';
    if ($na === 'water' || ($t['waterway'] ?? '') === 'riverbank' || in_array($lu, ['reservoir', 'basin'], true)) return 'water';
    if (in_array($na, ['scrub', 'heath', 'grassland'], true)) return 'scrub';
    if (in_array($na, ['bare_rock', 'scree', 'rock'], true) || $lu === 'quarry') return 'rock';
    if (in_array($lu, ['grass', 'meadow', 'village_green', 'recreation_ground', 'allotments'], true) || in_array($le, ['park', 'garden', 'common'], true)) return 'grass';
    if (in_array($lu, ['farmland', 'orchard', 'vineyard', 'farmyard', 'greenhouse_horticulture'], true)) return 'farm';
    if ($lu === 'cemetery') return 'cem';
    if (in_array($lu, ['industrial', 'commercial', 'retail', 'railway', 'construction', 'garages'], true) || ($t['amenity'] ?? '') === 'parking') return 'urban';
    if ($le === 'swimming_pool') return 'pool';
    if ($le === 'track') return 'track';
    if (in_array($le, ['pitch', 'stadium', 'sports_centre', 'playground'], true)) return 'sport';
    if ($lu === 'residential') return 'res';
    return null;
}

// Assemble les segments d'une relation multipolygone en anneaux fermés.
function ch_rings(array $segs): array {
    $rings = []; $segs = array_values(array_filter($segs, fn($s) => count($s) >= 2));
    while ($segs) {
        $cur = array_shift($segs); $guard = 0;
        while ($guard++ < 5000) {
            $a = $cur[0]; $b = $cur[count($cur) - 1];
            if (count($cur) > 3 && $a == $b) break;
            $found = false;
            foreach ($segs as $i => $s) {
                $sa = $s[0]; $sb = $s[count($s) - 1];
                if ($sa == $b) { $cur = array_merge($cur, array_slice($s, 1)); }
                elseif ($sb == $b) { $cur = array_merge($cur, array_slice(array_reverse($s), 1)); }
                elseif ($sb == $a) { $cur = array_merge($s, array_slice($cur, 1)); }
                elseif ($sa == $a) { $cur = array_merge(array_reverse($s), array_slice($cur, 1)); }
                else continue;
                array_splice($segs, $i, 1); $found = true; break;
            }
            if (!$found) break;
        }
        if (count($cur) >= 4) $rings[] = $cur;
    }
    return $rings;
}

function ch_parse_areas(array $els): array {
    $out = [];
    foreach ($els as $el) {
        $t = $el['tags'] ?? []; $type = ch_area_type($t); if (!$type) continue;
        // nom du plan d'eau (lac, étang...) : utile pour l'étiquetage sur la carte (cf. buildLabels, main.js) - seuls
        // les plans d'eau NOMMÉS en profitent ; un simple "name" existe aussi sur d'autres types de zone (parcs...)
        // mais on ne le capture que pour l'eau, seul besoin actuel.
        $nm = ($type === 'water' && !empty($t['name'])) ? $t['name'] : null;
        if ($el['type'] === 'way' && !empty($el['geometry']) && count($el['geometry']) >= 4) {
            $o = ['t' => $type, 'p' => [ch_poly($el['geometry'])]]; if ($nm) $o['nm'] = $nm;
            $out[] = $o;
        } elseif ($el['type'] === 'relation' && !empty($el['members'])) {
            $rings = [];
            foreach (['outer', 'inner'] as $role) {
                $segs = [];
                foreach ($el['members'] as $m) if (($m['type'] ?? '') === 'way' && ($m['role'] ?? '') === $role && !empty($m['geometry'])) $segs[] = ch_poly($m['geometry']);
                $rings = array_merge($rings, ch_rings($segs));
            }
            if ($rings) { $o = ['t' => $type, 'p' => $rings]; if ($nm) $o['nm'] = $nm; $out[] = $o; }
        }
    }
    return $out;
}

// ---------------------------------------------------------------- Littoral (mer/océan)
// natural=coastline (OSM) : des LIGNES brutes, pas des polygones. Convention OSM : la TERRE est à GAUCHE et
// l'EAU à DROITE dans le sens de tracé du chemin. Notre repère local (x=est, z=SUD, cf. ch_proj) inverse l'axe
// nord/sud par rapport à (lon,lat) : la terre se retrouve donc à DROITE et l'eau à GAUCHE dans NOTRE repère
// (x,z) - vérifié par calcul sur un cas concret (pas un sens supposé au hasard, cf. CONDUITE.MD) avant d'écrire
// ce code. On assemble les tronçons OSM en chaînes, on garde telles quelles celles déjà refermées sur
// elles-mêmes ENTIÈREMENT dans l'emprise (île - cas vérifié en direct sur Île d'Ouessant), et pour une chaîne
// qui entre/sort de l'emprise (ville côtière "continentale" - cas non encore rencontré dans nos données, à
// revérifier en direct le jour où une telle ville sera ajoutée) on la referme en suivant le contour du
// rectangle d'emprise entre son point de sortie et l'entrée de la chaîne suivante, dans le sens correspondant
// à "la terre reste à droite" - technique standard pour transformer un trait de côte en polygone de terre
// borné par une emprise rectangulaire.

function ch_coast_chains(array $ways): array {
    $chains = []; $ways = array_values(array_filter($ways, fn($w) => count($w) >= 2));
    while ($ways) {
        $cur = array_shift($ways); $guard = 0;
        while ($guard++ < 5000) {
            $a = $cur[0]; $b = $cur[count($cur) - 1];
            if (count($cur) > 3 && $a == $b) break;
            $found = false;
            foreach ($ways as $i => $w) {
                $wa = $w[0]; $wb = $w[count($w) - 1];
                if ($wa == $b) { $cur = array_merge($cur, array_slice($w, 1)); }
                elseif ($wb == $b) { $cur = array_merge($cur, array_slice(array_reverse($w), 1)); }
                elseif ($wb == $a) { $cur = array_merge($w, array_slice($cur, 1)); }
                elseif ($wa == $a) { $cur = array_merge(array_reverse($w), array_slice($cur, 1)); }
                else continue;
                array_splice($ways, $i, 1); $found = true; break;
            }
            if (!$found) break;
        }
        if (count($cur) >= 2) $chains[] = $cur;
    }
    return $chains;
}

// Découpe une chaîne (fermée ou non) contre le rectangle [x0,z0]-[x1,z1] : renvoie les morceaux à l'intérieur.
// Un morceau dont les 2 extrémités sont IDENTIQUES et ne tombent PAS sur le bord du rectangle est une chaîne
// d'origine déjà refermée sur elle-même, entièrement dans l'emprise (île) ; sinon ses extrémités sont des
// points d'intersection réels avec le bord du rectangle (entrée/sortie).
function ch_clip_chain(array $pts, float $x0, float $z0, float $x1, float $z1): array {
    $eps = 1e-6;
    $inside = fn($p) => $p[0] >= $x0 - $eps && $p[0] <= $x1 + $eps && $p[1] >= $z0 - $eps && $p[1] <= $z1 + $eps;
    // intersections du segment [a,b] (prolongé en droite infinie) avec les 4 bords du rectangle, restreintes à
    // t dans [0,1] (le segment lui-même), triées par t croissant - un segment peut couper le rectangle 0, 1
    // (une extrémité dedans) ou 2 fois (les deux extrémités dehors, le segment traverse de part en part).
    $segRectAll = function (array $a, array $b) use ($x0, $z0, $x1, $z1): array {
        $ts = [];
        $dx = $b[0] - $a[0]; $dz = $b[1] - $a[1];
        $add = function ($t, $onOther, $lo, $hi) use (&$ts) { if ($t === null || $t < -1e-9 || $t > 1 + 1e-9) return; if ($onOther < $lo - 1e-6 || $onOther > $hi + 1e-6) return; $ts[] = max(0, min(1, $t)); };
        if (abs($dx) > 1e-9) { $t = ($x0 - $a[0]) / $dx; $add($t, $a[1] + $dz * $t, $z0, $z1);
                                $t = ($x1 - $a[0]) / $dx; $add($t, $a[1] + $dz * $t, $z0, $z1); }
        if (abs($dz) > 1e-9) { $t = ($z0 - $a[1]) / $dz; $add($t, $a[0] + $dx * $t, $x0, $x1);
                                $t = ($z1 - $a[1]) / $dz; $add($t, $a[0] + $dx * $t, $x0, $x1); }
        sort($ts);
        $pts = []; $lastT = null;
        foreach ($ts as $t) { if ($lastT !== null && abs($t - $lastT) < 1e-9) continue; $lastT = $t;
            $pts[] = [$a[0] + $dx * $t, $a[1] + $dz * $t]; }
        return $pts;
    };
    $out = []; $cur = [];
    $n = count($pts);
    for ($i = 0; $i < $n - 1; $i++) {
        $a = $pts[$i]; $b = $pts[$i + 1]; $ai = $inside($a); $bi = $inside($b);
        if ($ai && !$cur) $cur[] = $a;
        if ($ai && $bi) { $cur[] = $b; }
        elseif ($ai && !$bi) { $xs = $segRectAll($a, $b); if ($xs) $cur[] = $xs[0]; if (count($cur) >= 2) $out[] = $cur; $cur = []; }
        elseif (!$ai && $bi) { $xs = $segRectAll($a, $b); $cur = $xs ? [$xs[count($xs) - 1], $b] : [$b]; }
        else { $xs = $segRectAll($a, $b);   // les deux extrémités dehors : le segment traverse peut-être le rectangle de part en part
            if (count($xs) >= 2) $out[] = [$xs[0], $xs[count($xs) - 1]]; }
    }
    if (count($cur) >= 2) $out[] = $cur;
    return $out;
}

function ch_rect_perim(float $x0, float $z0, float $x1, float $z1): float { return 2 * ($x1 - $x0) + 2 * ($z1 - $z0); }

// Position le long du contour du rectangle, dans le sens "la terre reste à droite" du trait de côte (repère
// local x=est, z=sud) : bord est vers le nord, bord nord vers l'ouest, bord ouest vers le sud, bord sud vers
// l'est - démontré par calcul (aire signée) sur un cas concret, cf. commentaire en tête de fichier.
function ch_boundary_t(array $p, float $x0, float $z0, float $x1, float $z1): float {
    $W = $x1 - $x0; $H = $z1 - $z0; $eps = 1e-3;
    if (abs($p[0] - $x1) < $eps) return $z1 - $p[1];                       // bord est (nord = t croissant)
    if (abs($p[1] - $z0) < $eps) return $H + ($x1 - $p[0]);                // bord nord (ouest = t croissant)
    if (abs($p[0] - $x0) < $eps) return $H + $W + ($p[1] - $z0);           // bord ouest (sud = t croissant)
    return 2 * $H + $W + ($p[0] - $x0);                                    // bord sud (est = t croissant)
}

function ch_rect_corner(int $i, float $x0, float $z0, float $x1, float $z1): array {
    return [[$x1, $z1], [$x1, $z0], [$x0, $z0], [$x0, $z1]][$i % 4];       // SE, NE, NW, SW
}

// Corners du rectangle dont la position (t) tombe strictement entre $fromT (exclu) et $fromT+$span (exclu),
// triés dans l'ordre croissant de distance depuis $fromT - c'est ce qui garantit que les coins sont insérés
// dans le bon ordre le long du contour, quel que soit celui où on se trouve.
function ch_corners_between(float $fromT, float $span, float $x0, float $z0, float $x1, float $z1, float $P): array {
    $found = [];
    foreach ([0, 1, 2, 3] as $ci) {
        $c = ch_rect_corner($ci, $x0, $z0, $x1, $z1); $ct = ch_boundary_t($c, $x0, $z0, $x1, $z1);
        $dc = fmod($ct - $fromT + 10 * $P, $P);
        if ($dc > 1e-6 && $dc < $span - 1e-9) $found[] = ['d' => $dc, 'p' => $c];
    }
    usort($found, fn($a, $b) => $a['d'] <=> $b['d']);
    return array_map(fn($f) => $f['p'], $found);
}

// Construit le(s) polygone(s) de TERRE (destinés à servir de trous dans le rectangle d'emprise = la mer) à
// partir des tronçons natural=coastline bruts. Renvoie [] si l'emprise ne contient aucun trait de côte (ville
// non côtière : comportement inchangé).
function ch_coast_land_rings(array $ways, float $x0, float $z0, float $x1, float $z1): array {
    $chains = ch_coast_chains($ways);
    $land = []; $open = [];
    $onRect = fn($q) => abs($q[0] - $x0) < 1e-3 || abs($q[0] - $x1) < 1e-3 || abs($q[1] - $z0) < 1e-3 || abs($q[1] - $z1) < 1e-3;
    foreach ($chains as $ch) {
        foreach (ch_clip_chain($ch, $x0, $z0, $x1, $z1) as $p) {
            $n = count($p);
            if ($n > 3 && $p[0] == $p[$n - 1] && !$onRect($p[0])) { array_pop($p); $land[] = $p; }
            elseif ($n >= 2) $open[] = $p;
        }
    }
    if (!$land && !$open) return [];
    $per = fn($p) => ch_boundary_t($p, $x0, $z0, $x1, $z1);
    $P = ch_rect_perim($x0, $z0, $x1, $z1);
    $used = array_fill(0, count($open), false);
    for ($s = 0; $s < count($open); $s++) {
        if ($used[$s]) continue;
        $ring = $open[$s]; $used[$s] = true;
        $startT = $per($open[$s][0]);
        $guard = 0; $closed = false;
        while ($guard++ < 500) {
            $exit = $ring[count($ring) - 1]; $et = $per($exit);
            $dtClose = fmod($startT - $et + 10 * $P, $P);
            $bestJ = -1; $bestDt = null;
            foreach ($open as $j => $pc) { if ($used[$j]) continue;
                $dt = fmod($per($pc[0]) - $et + 10 * $P, $P);
                if ($bestDt === null || $dt < $bestDt) { $bestDt = $dt; $bestJ = $j; }
            }
            if ($bestJ < 0 || $dtClose <= $bestDt + 1e-9) {
                foreach (ch_corners_between($et, $dtClose, $x0, $z0, $x1, $z1, $P) as $c) $ring[] = $c;
                $closed = true; break;
            }
            foreach (ch_corners_between($et, $bestDt, $x0, $z0, $x1, $z1, $P) as $c) $ring[] = $c;
            $ring = array_merge($ring, $open[$bestJ]); $used[$bestJ] = true;
        }
        if ($closed && count($ring) >= 4) $land[] = $ring;
    }
    return $land;
}

// ---------------------------------------------------------------- Relief
function ch_dem_tiles(): array {
    $z = CH_DEM_ZOOM; $n = 2 ** $z; $r = CH_DEM_RADIUS;
    $lat0 = CH_LAT; $lon0 = CH_LON;
    $dlat = $r / 110540; $dlon = $r / (111320 * cos(deg2rad($lat0)));
    $tx = fn($lon) => (int)floor(($lon + 180) / 360 * $n);
    $ty = function ($lat) use ($n) { $l = deg2rad($lat); return (int)floor((1 - log(tan($l) + 1 / cos($l)) / M_PI) / 2 * $n); };
    return ['z' => $z, 'x0' => $tx($lon0 - $dlon), 'x1' => $tx($lon0 + $dlon), 'y0' => $ty($lat0 + $dlat), 'y1' => $ty($lat0 - $dlat)];
}

function ch_fetch_dem(): ?array {
    $d = ch_dem_tiles();
    for ($x = $d['x0']; $x <= $d['x1']; $x++) for ($y = $d['y0']; $y <= $d['y1']; $y++) {
        $f = CH_DIR . "/relief/{$d['z']}/$x/$y.png";
        if (is_file($f) && filesize($f) > 100) continue;
        @mkdir(dirname($f), 0777, true);
        [$png, $e] = ch_http("https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{$d['z']}/$x/$y.png", null, 60);
        if ($png === null) { ch_log("  tuile $x/$y : $e"); return null; }
        file_put_contents($f, $png); ch_log("  tuile {$d['z']}/$x/$y ok");
    }
    return $d;
}


// ---------------------------------------------------------------- Orthophoto IGN (Géoplateforme, licence ouverte)
const CH_ORTHO_ZOOM = 16;
function ch_ortho_tiles(): array {
    $z = CH_ORTHO_ZOOM; $n = 2 ** $z; [$s, $w, $nn, $e] = CH_BBOX;
    $tx = fn($lon) => (int)floor(($lon + 180) / 360 * $n);
    $ty = function ($lat) use ($n) { $l = deg2rad($lat); return (int)floor((1 - log(tan($l) + 1 / cos($l)) / M_PI) / 2 * $n); };
    return ['z' => $z, 'x0' => $tx($w), 'x1' => $tx($e), 'y0' => $ty($nn), 'y1' => $ty($s)];
}
function ch_fetch_ortho(): ?array {
    $d = ch_ortho_tiles(); $miss = 0;
    for ($x = $d['x0']; $x <= $d['x1']; $x++) for ($y = $d['y0']; $y <= $d['y1']; $y++) {
        $f = CH_DIR . "/orthophoto/{$d['z']}/$x/$y.jpg";
        if (is_file($f) && filesize($f) > 500) continue;
        @mkdir(dirname($f), 0777, true);
        $url = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={$d['z']}&TILEROW=$y&TILECOL=$x";
        [$img, $e] = ch_http($url, null, 40);
        if ($img === null || strlen($img) < 500) { ch_log("  orthophoto $x/$y : " . ($e ?: 'vide')); if (++$miss > 5) return null; continue; }
        file_put_contents($f, $img); ch_log("  orthophoto {$d['z']}/$x/$y ok");
    }
    return $d;
}

// ---------------------------------------------------------------- Lieux importants
// Coordonnées de repli (approximatives) utilisées si la recherche par nom dans OpenStreetMap échoue.
const CH_PLACES = CH_CP !== '73000' ? [] : [
 ['n' => 'Château des ducs de Savoie', 'd' => "Ancienne résidence des ducs de Savoie, aujourd'hui préfecture.", 'q' => 'Château des [Dd]ucs de Savoie', 'lat' => 45.5667, 'lon' => 5.9262],
 ['n' => 'Fontaine des Éléphants', 'd' => 'Monument emblématique de 1838, dédié au général de Boigne.', 'q' => 'Fontaine des [ÉE]léphants', 'lat' => 45.5651, 'lon' => 5.9199],
 ['n' => 'Gare de Chambéry', 'd' => 'Gare SNCF, porte vers Lyon, Turin et les Alpes.', 'q' => 'Gare de Chambéry|Chambéry - Challes-les-Eaux|Chambéry-Challes-les-Eaux', 'tag' => ['railway', 'station'], 'lat' => 45.5709, 'lon' => 5.9107],
 ['n' => 'La Sasson', 'd' => 'Monument du centenaire de la réunion de la Savoie à la France, place du Centenaire.', 'q' => 'Sasson', 'lat' => 45.5662, 'lon' => 5.9205],
 ['n' => 'Collège de Côte Rousse', 'd' => 'Collège du quartier de Côte Rousse.', 'q' => 'C[ôo]te [Rr]ousse', 'tag' => ['amenity', 'school'], 'lat' => 45.5721, 'lon' => 5.9285],
 ['n' => 'Palais de justice', 'd' => 'Tribunal judiciaire de Chambéry.', 'q' => 'Palais de [Jj]ustice', 'lat' => 45.5680, 'lon' => 5.9193],
 ['n' => 'Parc du Verney', 'd' => 'Grand parc urbain de la ville.', 'q' => 'Verney', 'lat' => 45.5615, 'lon' => 5.9065],
 ['n' => 'Carré Curial', 'd' => 'Espace culturel et de loisirs du centre-ville.', 'q' => 'Carré Curial', 'lat' => 45.5645, 'lon' => 5.9145],
 ['n' => 'Square Jacques Lapeyre', 'd' => 'Square public de Chambéry.', 'q' => 'Square Jacques Lapeyre', 'lat' => 45.5690, 'lon' => 5.9348],
 ['n' => 'Place Saint-Léger', 'd' => 'Place animée de la vieille ville, terrasses et rues piétonnes.', 'q' => 'Place Saint-Léger', 'lat' => 45.5660, 'lon' => 5.9212],
];

function ch_places_from(array $els): array {
    $out = [];
    $roadPts = [];   // centres des voies nommées utilisées comme repères (near)
    foreach (CH_PLACES as $P) if (isset($P['near']))
        foreach ($els as $el) if (($el['tags']['name'] ?? '') === $P['near'] && isset($el['center'])) $roadPts[$P['near']][] = ch_proj((float)$el['center']['lat'], (float)$el['center']['lon']);
    foreach (CH_PLACES as $P) {
        $x = null;
        if (isset($P['near'])) {
            $best = 1e12; $pts = $roadPts[$P['near']] ?? [];
            foreach ($els as $el) {
                $t = $el['tags'] ?? [];
                if (($t[$P['tag'][0]] ?? '') !== $P['tag'][1]) continue;
                $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null; if ($lat === null) continue;
                $c = ch_proj((float)$lat, (float)$lon); $d = 1e9;
                foreach ($pts as $q) $d = min($d, hypot($c[0] - $q[0], $c[1] - $q[1]));
                if (preg_match('/hospitalier|h[ôo]pital|m[ée]tropole/iu', $t['name'] ?? '')) $d -= 300;   // préfère le centre hospitalier
                if ($d < $best) { $best = $d; $x = $c; }
            }
        } else {
            foreach ($els as $el) {
                $t = $el['tags'] ?? []; $nm = $t['name'] ?? ''; if ($nm === '') continue;
                if (!preg_match('/' . str_replace('/', '\/', $P['q']) . '/u', $nm)) continue;
                if (isset($P['tag']) && ($t[$P['tag'][0]] ?? '') !== $P['tag'][1]) continue;
                $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null;
                if ($lat === null) continue;
                $x = ch_proj((float)$lat, (float)$lon); break;
            }
        }
        $approx = $x === null;
        if ($approx) $x = ch_proj($P['lat'], $P['lon']);
        $out[] = ['n' => $P['n'], 'd' => $P['d'], 'x' => $x[0], 'z' => $x[1], 'approx' => $approx];
    }
    foreach (json_decode(file_get_contents(__DIR__ . '/cities.json'), true) as $c) if ($c['cp'] === CH_CP)
        foreach ($c['pois'] ?? [] as $q) $out[] = ['n' => $q['n'], 'd' => $q['d'], 'x' => $q['x'], 'z' => $q['z'], 'approx' => false];   // lieux propres à la ville (coordonnées locales)
    return $out;
}

// Résout le centre d'une ville (Overpass, place=village/town/city portant son nom) et l'enregistre dans data/<cp>/centre.json
function ch_city_resolve(): bool {
    if (CH_RESOLVED) return true;
    $nm = CH_FIND ?: CH_NAME;
    $els = ch_overpass("[out:json][timeout:60];(node[\"place\"~\"^(village|town|city|hamlet)$\"][\"name\"=\"$nm\"](45.0,5.5,46.0,6.6);way[\"boundary\"=\"administrative\"][\"name\"=\"$nm\"](45.0,5.5,46.0,6.6););out center tags;");
    if (!$els) { ch_log("Impossible de localiser $nm"); return false; }
    $best = null;
    foreach ($els as $el) { $lat = $el['lat'] ?? $el['center']['lat'] ?? null; $lon = $el['lon'] ?? $el['center']['lon'] ?? null; if ($lat === null) continue; if (isset($el['lat'])) { $best = [$lat, $lon]; break; } $best = $best ?: [$lat, $lon]; }
    if (!$best) return false;
    @mkdir(CH_DIR, 0777, true);
    file_put_contents(CH_DIR . '/centre.json', json_encode(['lat' => round($best[0], 5), 'lon' => round($best[1], 5)]));
    ch_log("Centre de $nm : {$best[0]}, {$best[1]}");
    return true;
}


// ---------------------------------------------------------------- Cadastre officiel / BD TOPO (recalage)
// Croisement des données OSM avec les couches officielles publiées sur le Géoplateforme IGN (data.geopf.fr, WFS,
// licence ouverte - même famille de licence que les orthophotos déjà utilisées) : le plan cadastral informatisé
// (PCI vecteur, DGFiP - "cadastre officiel") pour les bâtiments, la BD TOPO (IGN) pour le réseau routier. Objectif
// unique : repérer ce qui n'a plus de contrepartie officielle (bâtiments démolis, tronçons orphelins/mal
// raccordés) et le retirer - on ne fait jamais l'inverse (jamais d'ajout ni d'invention de géométrie à partir de
// la donnée officielle). Générique : s'applique à toute ville (n'importe quelle bbox), la fonction elle-même
// se met sans effet là où les couches officielles n'ont pas de données (hors de France, etc.).
const CH_GEOPF_WFS = 'https://data.geopf.fr/wfs/ows';
const CH_CAD_DIST = 15.0;          // tolérance bâtiment (m) : écart de numérisation OSM/PCI
const CH_CAD_ZONE_RADIUS = 70.0;   // rayon (m) du voisinage examiné pour distinguer une démolition isolée d'une zone entière non numérisée au cadastre
const CH_CAD_ZONE_MIN = 5;         // nombre minimal de bâtiments OSM voisins dans ce rayon pour que la statistique soit significative
const CH_CAD_ZONE_FRAC = 0.3;      // fraction de voisins eux-mêmes sans correspondance cadastrale au-delà de laquelle on considère que c'est le secteur (pas le bâtiment) qui manque au cadastre
const CH_ROAD_DIST = 12.0;         // tolérance route (m) : écart de numérisation OSM/BD TOPO
const CH_ROAD_MIN_MATCH = 0.4;     // fraction minimale de points OSM à proximité d'un tronçon officiel pour garder la route

// Télécharge toutes les pages d'une couche WFS du Géoplateforme sur une bbox (lat_min,lon_min,lat_max,lon_max)
function ch_wfs_features(string $typename, string $geomProp, string $bboxCQL): ?array {
    $out = []; $start = 0; $count = 1000; $guard = 0;
    while (true) {
        if (++$guard > 300) { ch_log("  [$typename] arrêt de sécurité (trop de pages)"); break; }
        $url = CH_GEOPF_WFS . '?' . http_build_query(['SERVICE' => 'WFS', 'VERSION' => '2.0.0', 'REQUEST' => 'GetFeature',
            'TYPENAMES' => $typename, 'OUTPUTFORMAT' => 'application/json', 'COUNT' => $count, 'STARTINDEX' => $start,
            'CQL_FILTER' => "BBOX($geomProp,$bboxCQL)"]);
        [$raw, $e] = ch_http($url, null, 120);
        if ($raw === null) { ch_log("  [$typename] échec page $start : $e"); return $out ?: null; }
        $j = json_decode($raw, true);
        if (!is_array($j) || !isset($j['features'])) { ch_log("  [$typename] réponse inattendue : " . substr((string)$raw, 0, 150)); return $out ?: null; }
        foreach ($j['features'] as $f) $out[] = $f;
        $n = count($j['features']);
        ch_log("  [$typename] page " . (int)($start / $count + 1) . " : $n entité(s) (total " . count($out) . ')');
        if ($n < $count) break;
        $start += $count;
    }
    return $out;
}

// Centroïde d'un (Multi)Polygon GeoJSON (coordonnées lon,lat) projeté en mètres locaux [x,z]
function ch_wfs_centroid(array $geom): ?array {
    $ring = null;
    if (($geom['type'] ?? '') === 'Polygon') $ring = $geom['coordinates'][0] ?? null;
    elseif (($geom['type'] ?? '') === 'MultiPolygon') $ring = $geom['coordinates'][0][0] ?? null;
    if (!$ring || count($ring) < 3) return null;
    $sx = 0.0; $sz = 0.0; $n = 0;
    foreach ($ring as $pt) { [$x, $z] = ch_proj((float)$pt[1], (float)$pt[0]); $sx += $x; $sz += $z; $n++; }
    return $n ? [round($sx / $n, 1), round($sz / $n, 1)] : null;
}

// Polyligne(s) d'un (Multi)LineString GeoJSON, projetée(s) en mètres locaux
function ch_wfs_lines(array $geom): array {
    $lines = [];
    if (($geom['type'] ?? '') === 'LineString') $lines = [$geom['coordinates'] ?? []];
    elseif (($geom['type'] ?? '') === 'MultiLineString') $lines = $geom['coordinates'] ?? [];
    $out = [];
    foreach ($lines as $l) { $p = []; foreach ($l as $pt) $p[] = ch_proj((float)$pt[1], (float)$pt[0]); if (count($p) >= 2) $out[] = $p; }
    return $out;
}

// Index spatial minimal par grille (clé "gx,gz") : recherche de proximité en O(1) amorti au lieu de O(n)
function ch_grid_add(array &$grid, float $x, float $z, $val, float $cell): void {
    $grid[(int)floor($x / $cell) . ',' . (int)floor($z / $cell)][] = $val;
}
function ch_grid_near(array &$grid, float $x, float $z, float $cell): array {
    $gx = (int)floor($x / $cell); $gz = (int)floor($z / $cell); $out = [];
    for ($dx = -1; $dx <= 1; $dx++) for ($dz = -1; $dz <= 1; $dz++) {
        $k = ($gx + $dx) . ',' . ($gz + $dz); if (isset($grid[$k])) $out = array_merge($out, $grid[$k]);
    }
    return $out;
}
// Comme ch_grid_near, mais sur un rectangle [$x0,$z0]-[$x1,$z1] entier (toutes les cellules qu'il recouvre, +1 cellule
// de marge) plutôt qu'un simple voisinage 3x3 autour d'un point : nécessaire pour parcourir l'emprise complète d'un
// grand bâtiment (cf. ch_filter_demolished, cas des bâtiments dont le barycentre des sommets tombe loin de toute
// matière construite - anneau, U, L... - un simple point de recherche ne suffit plus).
function ch_grid_near_bbox(array &$grid, float $x0, float $z0, float $x1, float $z1, float $cell): array {
    $gx0 = (int)floor($x0 / $cell) - 1; $gx1 = (int)floor($x1 / $cell) + 1;
    $gz0 = (int)floor($z0 / $cell) - 1; $gz1 = (int)floor($z1 / $cell) + 1;
    $out = [];
    for ($gx = $gx0; $gx <= $gx1; $gx++) for ($gz = $gz0; $gz <= $gz1; $gz++) {
        $k = "$gx,$gz"; if (isset($grid[$k])) $out = array_merge($out, $grid[$k]);
    }
    return $out;
}

// Retire les bâtiments OSM sans contrepartie cadastrale à proximité (probablement démolis) : pour chaque
// bâtiment OSM, on cherche un bâtiment du cadastre officiel dont le centroïde tombe à moins de CH_CAD_DIST m
// du sien. Mais l'absence de correspondance n'est pas toujours une démolition : le PCI vecteur (DGFiP) peut tout
// simplement n'avoir jamais été numérisé pour un lotissement ou un quartier entier, même construit depuis des
// années (vérifié en direct sur le flux WFS IGN : le vide touche aussi bien les bâtiments que les parcelles
// cadastrales elles-mêmes dans ces secteurs). Une vraie démolition isolée laisse un bâtiment sans contrepartie au
// milieu de voisins, eux, bien appariés ; une zone jamais numérisée laisse au contraire un groupe entier de
// bâtiments OSM voisins tous sans contrepartie, sur plusieurs centaines de mètres. On distingue les deux en
// regardant, pour chaque bâtiment sans contrepartie directe, la proportion de ses propres voisins OSM (pas les
// bâtiments officiels) qui sont eux aussi sans contrepartie dans un rayon de CH_CAD_ZONE_RADIUS m : si cette
// proportion dépasse CH_CAD_ZONE_FRAC (avec un échantillon d'au moins CH_CAD_ZONE_MIN voisins), c'est le secteur
// qui manque au cadastre, pas le bâtiment qui a disparu - on le conserve.
function ch_filter_demolished(array $buildings, array $officialCentroids): array {
    $cell = 20.0; $officialGrid = [];
    foreach ($officialCentroids as $c) ch_grid_add($officialGrid, $c[0], $c[1], $c, $cell);

    // Centroïde + verdict cadastral brut (correspondance directe ou non) de chaque bâtiment OSM
    $items = [];
    foreach ($buildings as $b) {
        $ring = $b['p'] ?? [];
        if (count($ring) < 3) { $items[] = ['b' => $b, 'cx' => null, 'cz' => null, 'match' => true]; continue; }
        $sx = 0.0; $sz = 0.0; foreach ($ring as $pt) { $sx += $pt[0]; $sz += $pt[1]; }
        $cx = $sx / count($ring); $cz = $sz / count($ring);
        $match = false;
        foreach (ch_grid_near($officialGrid, $cx, $cz, $cell) as $c) { if (($c[0] - $cx) ** 2 + ($c[1] - $cz) ** 2 <= CH_CAD_DIST ** 2) { $match = true; break; } }
        if (!$match) {   // grand bâtiment / forme complexe : le barycentre des sommets peut tomber hors matière (cf. commentaire ci-dessus)
            $xs = array_column($ring, 0); $zs = array_column($ring, 1);
            $bx0 = min($xs) - 1; $bx1 = max($xs) + 1; $bz0 = min($zs) - 1; $bz1 = max($zs) + 1;
            foreach (ch_grid_near_bbox($officialGrid, $bx0, $bz0, $bx1, $bz1, $cell) as $c) { if (ch_pip($c, $ring)) { $match = true; break; } }
        }
        $items[] = ['b' => $b, 'cx' => $cx, 'cz' => $cz, 'match' => $match];
    }

    // Index spatial des bâtiments OSM eux-mêmes (pas les officiels), pour la statistique de voisinage
    $zCell = CH_CAD_ZONE_RADIUS; $ownGrid = [];
    foreach ($items as $i => $it) if ($it['cx'] !== null) ch_grid_add($ownGrid, $it['cx'], $it['cz'], $i, $zCell);

    $kept = []; $removed = 0; $zoneSpared = 0;
    foreach ($items as $it) {
        if ($it['match'] || $it['cx'] === null) { $kept[] = $it['b']; continue; }
        $n = 0; $unmatched = 0;
        foreach (ch_grid_near($ownGrid, $it['cx'], $it['cz'], $zCell) as $j) {
            $o = $items[$j];
            if ($o['cx'] === null || (($o['cx'] - $it['cx']) ** 2 + ($o['cz'] - $it['cz']) ** 2) > CH_CAD_ZONE_RADIUS ** 2) continue;
            $n++; if (!$o['match']) $unmatched++;
        }
        if ($n >= CH_CAD_ZONE_MIN && $unmatched / $n >= CH_CAD_ZONE_FRAC) { $kept[] = $it['b']; $zoneSpared++; }
        else { $removed++; }
    }
    if ($zoneSpared) ch_log("  [cadastre] $zoneSpared bâtiment(s) conservé(s) malgré l'absence de correspondance directe : secteur(s) entier(s) non numérisé(s) au PCI (pas une démolition)");
    return [$kept, $removed];
}

// Retire les tronçons de route OSM carrossables (k<=5, motorway…service - cf. CH_ROAD) sans contrepartie sur la
// majorité de leur longueur dans le réseau routier officiel BD TOPO (tronçons orphelins ou mal raccordés). Les
// chemins piétons, pistes cyclables, etc. (k>=6) sont exclus du filtre : la BD TOPO ne les couvre pas
// systématiquement, les y soumettre supprimerait à tort de la vraie donnée OSM.
function ch_filter_orphan_roads(array $roads, array $officialLines): array {
    $cell = 20.0; $grid = [];
    foreach ($officialLines as $line) for ($i = 0; $i < count($line) - 1; $i++) {
        [$ax, $az] = $line[$i]; [$bx, $bz] = $line[$i + 1];
        $len = sqrt(($bx - $ax) ** 2 + ($bz - $az) ** 2); $steps = max(1, (int)ceil($len / 5));
        for ($s = 0; $s <= $steps; $s++) { $t = $s / $steps; $px = $ax + ($bx - $ax) * $t; $pz = $az + ($bz - $az) * $t; ch_grid_add($grid, $px, $pz, [$px, $pz], $cell); }
    }
    $kept = []; $removed = 0;
    foreach ($roads as $r) {
        if (($r['k'] ?? 9) > 5 || !empty($r['dw'])) { $kept[] = $r; continue; }   // hors périmètre du filtre (piéton, rail, cours d'eau, allée privée…)
        $pts = $r['p'] ?? [];
        if (count($pts) < 2) { $kept[] = $r; continue; }
        $tot = 0; $ok = 0;
        for ($i = 0; $i < count($pts) - 1; $i++) {
            [$ax, $az] = $pts[$i]; [$bx, $bz] = $pts[$i + 1];
            $len = sqrt(($bx - $ax) ** 2 + ($bz - $az) ** 2); $steps = max(1, (int)ceil($len / 10));
            for ($s = 0; $s <= $steps; $s++) {
                $t = $s / $steps; $x = $ax + ($bx - $ax) * $t; $z = $az + ($bz - $az) * $t; $tot++;
                $dist2 = (($r['k'] ?? 9) <= 1 ? 30.0 : CH_ROAD_DIST) ** 2;   // tolérance élargie pour motorway/trunk : chaussées séparées par un large terre-plein central, trop loin de l'unique tracé BD TOPO (une ligne pour les 2 sens) avec la tolérance standard
                foreach (ch_grid_near($grid, $x, $z, $cell) as $p2) { if (($p2[0] - $x) ** 2 + ($p2[1] - $z) ** 2 <= $dist2) { $ok++; break; } }
            }
        }
        if ($tot > 0 && $ok / $tot >= CH_ROAD_MIN_MATCH) $kept[] = $r; else $removed++;
    }
    return [$kept, $removed];
}

// Lance le recalage cadastre + BD TOPO pour la ville courante et retourne un résumé (ou null si indisponible).
// Modifie $buildings et $roads (par référence) en place.
function ch_cadastral_check(array &$buildings, array &$roads, bool $force): ?array {
    [$s, $w, $n, $e] = CH_BBOX; $bboxCQL = "$s,$w,$n,$e";
    $cb = ch_stage('cadastre_batiments', function () use ($bboxCQL) {
        $feats = ch_wfs_features('BDPARCELLAIRE-VECTEUR_WLD_BDD_WGS84G:batiment', 'geom', $bboxCQL);
        if ($feats === null) return null;
        $c = [];
        foreach ($feats as $f) { $ct = ch_wfs_centroid($f['geometry'] ?? []); if ($ct) $c[] = $ct; }
        return $c;
    }, $force);
    $cr = ch_stage('bdtopo_routes', function () use ($bboxCQL) {
        $feats = ch_wfs_features('BDTOPO_V3:troncon_de_route', 'geometrie', $bboxCQL);
        if ($feats === null) return null;
        $l = [];
        foreach ($feats as $f) {
            if (!empty($f['properties']['fictif'])) continue;   // tronçon virtuel (giratoire schématique, etc.) : pas une route réelle
            foreach (ch_wfs_lines($f['geometry'] ?? []) as $line) $l[] = $line;
        }
        return $l;
    }, $force);
    if (!$cb || !$cr) { ch_log('[cadastre/BD TOPO] données officielles indisponibles, recalage ignoré pour ce lancement'); return null; }
    [$btF, $nBat] = ch_filter_demolished($buildings, $cb);
    [$roF, $nRoad] = ch_filter_orphan_roads($roads, $cr);
    $buildings = $btF; $roads = $roF;
    $sum = ['source' => 'Cadastre PCI (DGFiP) + BD TOPO (IGN), via data.geopf.fr - Licence Ouverte', 'date' => date('Y-m-d'),
        'batOfficial' => count($cb), 'roadOfficial' => count($cr), 'batRemoved' => $nBat, 'roadRemoved' => $nRoad];
    @mkdir(CH_DIR . '/cache', 0777, true);
    file_put_contents(CH_DIR . '/cache/cadastre_check.json', json_encode($sum, JSON_UNESCAPED_UNICODE));
    ch_log("[cadastre/BD TOPO] $nBat bâtiment(s) sans contrepartie cadastrale retiré(s), $nRoad tronçon(s) routier(s) orphelin(s) retiré(s)");
    return $sum;
}

// ---------------------------------------------------------------- Orchestration
function ch_stage(string $name, callable $fn, bool $force) {
    @mkdir(CH_DIR . '/cache', 0777, true);
    $f = CH_DIR . "/cache/$name.json";
    if (!$force && is_file($f)) { ch_log("[$name] déjà téléchargé (cache)"); return json_decode(file_get_contents($f), true); }
    ch_log("[$name] téléchargement…");
    $r = $fn();
    if ($r === null) { ch_log("[$name] ÉCHEC"); return null; }
    file_put_contents($f, json_encode($r, JSON_UNESCAPED_UNICODE));
    return $r;
}

function ch_fetch_all(bool $force = false): bool {
    @mkdir(CH_DIR, 0777, true);
    [$s, $w, $n, $e] = CH_BBOX; $bb = "$s,$w,$n,$e";
    $q = fn($body) => "[out:json][timeout:180];($body);out geom;";
    $re = fn(array $a) => '^(' . implode('|', $a) . ')$';
    $hw = $re(array_keys(CH_ROAD));

    $bt = ch_stage('batiments', function () use ($q, $bb) {
        $els = ch_overpass($q("way[\"building\"]($bb);rel[\"building\"][\"type\"=\"multipolygon\"]($bb);node[\"natural\"=\"tree\"]($bb);"));
        return $els === null ? null : ch_parse_buildings($els);
    }, $force);
    $ro = ch_stage('routes', function () use ($q, $bb, $hw) {
        // man_made=pier (pontons/jetées) : aucun tag highway, donc jamais capté par la requête voirie ci-dessus - ils
        // n'existaient tout simplement pas dans les données, d'où leur absence totale de géométrie 3D (juste recouverts
        // par la photo aérienne et le polygone d'eau, sans aucun trou ni tablier). Ajoutés ici et traités par ch_parse_lines
        // comme des chemins piétons en pont (k=7, b=1) : ils héritent alors automatiquement de tout le pipeline pont déjà
        // en place (tablier, parapets, trou découpé dans l'eau, prolongement si trop court) sans code de rendu dédié.
        $els = ch_overpass($q("way[\"highway\"~\"$hw\"]($bb);way[\"railway\"~\"^(rail|light_rail|tram)$\"]($bb);way[\"waterway\"~\"^(river|stream|canal)$\"]($bb);way[\"man_made\"=\"pier\"]($bb);"));
        return $els === null ? null : ch_parse_lines($els);
    }, $force);
    $ar = ch_stage('zones', function () use ($q, $bb) {
        $lu = '^(forest|grass|meadow|farmland|orchard|vineyard|farmyard|cemetery|industrial|commercial|retail|recreation_ground|village_green|reservoir|basin|railway|allotments|construction|quarry|residential|garages)$';
        $na = '^(wood|water|scrub|heath|grassland|bare_rock|scree)$';
        $le = '^(park|garden|common|pitch|stadium|sports_centre|playground|swimming_pool|track)$';
        $els = ch_overpass($q("way[\"landuse\"~\"$lu\"]($bb);way[\"natural\"~\"$na\"]($bb);way[\"leisure\"~\"$le\"]($bb);way[\"waterway\"=\"riverbank\"]($bb);"
            . "rel[\"type\"=\"multipolygon\"][\"landuse\"~\"$lu\"]($bb);rel[\"type\"=\"multipolygon\"][\"natural\"~\"$na\"]($bb);rel[\"type\"=\"multipolygon\"][\"leisure\"~\"$le\"]($bb);rel[\"type\"=\"multipolygon\"][\"waterway\"=\"riverbank\"]($bb);rel[\"type\"=\"multipolygon\"][\"water\"~\"^(river|canal|lake|pond|reservoir|basin)$\"]($bb);"));
        return $els === null ? null : ch_parse_areas($els);
    }, $force);
    $co = ch_stage('littoral', function () use ($q, $bb) {
        // ville côtière (ou non) : natural=coastline n'est présent que là où la terre touche la mer, donc une
        // ville sans façade maritime dans son emprise renvoie simplement [] ici (comportement inchangé pour
        // toutes les villes non côtières déjà en place).
        $els = ch_overpass($q("way[\"natural\"=\"coastline\"]($bb);"));
        if ($els === null) return null;
        $ways = [];
        foreach ($els as $el) { if (($el['type'] ?? '') === 'way' && !empty($el['geometry'])) { $p = ch_poly($el['geometry']); if (count($p) >= 2) $ways[] = $p; } }
        if (!$ways) return [];
        [$s, $w, $n, $e] = CH_BBOX;
        $c0 = ch_proj($s, $w); $c1 = ch_proj($n, $e);   // rectangle EXACT de l'emprise, même repère local que le reste des données
        $x0 = min($c0[0], $c1[0]); $x1 = max($c0[0], $c1[0]); $z0 = min($c0[1], $c1[1]); $z1 = max($c0[1], $c1[1]);
        $land = ch_coast_land_rings($ways, $x0, $z0, $x1, $z1);
        if (!$land) return [];
        // un seul polygone d'eau, borné par toute l'emprise, avec un trou par masse de terre (île, presqu'île...) -
        // le même mécanisme de profondeur/imbrication que les lacs (cf. javascript/roads.js) s'en charge ensuite,
        // sans aucun code dédié côté client : la "mer" est juste un plan d'eau de plus dans data.areas.
        return [['t' => 'sea', 'p' => array_merge([[[$x0, $z0], [$x1, $z0], [$x1, $z1], [$x0, $z1]]], $land)]];
    }, $force);
    $pl = ch_stage('lieux', function () use ($bb) {
        $rx = implode('|', array_filter(array_map(fn($P) => $P['q'], CH_PLACES)));
        $els = ch_overpass("[out:json][timeout:60];(nwr[\"name\"~\"$rx\"]($bb);nwr[\"amenity\"=\"hospital\"]($bb);way[\"name\"=\"Avenue de Lyon\"]($bb););out center tags;");
        return $els === null ? null : ch_places_from($els);
    }, $force);
    $lb = ch_stage('noms', function () use ($bb) {
        $els = ch_overpass("[out:json][timeout:60];(nwr[\"place\"~\"^(suburb|neighbourhood|quarter|hamlet|locality|village|town|city_block|square|isolated_dwelling|farm|city)$\"][\"name\"]($bb);rel[\"boundary\"=\"administrative\"][\"admin_level\"~\"^(9|10|11)$\"][\"name\"]($bb);nwr[\"landuse\"~\"^(residential|commercial|industrial|retail|cemetery|allotments)$\"][\"name\"]($bb);nwr[\"natural\"~\"^(peak|hill|wood)$\"][\"name\"]($bb);nwr[\"leisure\"~\"^(park|garden)$\"][\"name\"]($bb););out center tags;");
        if ($els === null) return null;
        $r = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null;
            if ($lat === null || empty($t['name'])) continue;
            $x = ch_proj((float)$lat, (float)$lon);
            $r[] = ['n' => $t['name'], 'x' => $x[0], 'z' => $x[1], 't' => isset($t['leisure']) ? 2 : (isset($t['landuse']) ? 3 : (isset($t['natural']) ? 1 : (in_array($t['place'] ?? '', ['locality', 'hamlet', 'isolated_dwelling', 'farm', 'square'], true) ? 1 : 0)))];
        }
        return $r;
    }, $force);
    $sh = ch_stage('commerces', function () use ($bb) {
        $els = ch_overpass("[out:json][timeout:170];(node[\"name\"][!\"highway\"][!\"place\"][!\"natural\"]($bb);way[\"name\"][!\"highway\"][!\"waterway\"][!\"place\"][!\"boundary\"][!\"natural\"][!\"landuse\"][!\"route\"][!\"railway\"]($bb);nwr[\"name\"][\"railway\"~\"^(station|halt|tram_stop)$\"]($bb);node[\"name\"][\"highway\"~\"^(bus_stop)$\"]($bb);nwr[\"shop\"][!\"name\"]($bb);nwr[\"amenity\"~\"^(pharmacy|bank|restaurant|cafe|bar|fast_food|post_office|bakery|dentist|doctors|veterinary)$\"][!\"name\"]($bb););out center tags;");
        if ($els === null) return null;
        $major = ['mall', 'department_store', 'supermarket']; $r = []; $seen = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null;
            $cat = ch_shop_cat($t);
            if ($lat === null || (empty($t['name']) && !$cat)) continue;
            if (empty($t['name'])) $t['name'] = $cat;
            $x = ch_proj((float)$lat, (float)$lon);
            $k = $t['name'] . round($x[0] / 15) . round($x[1] / 15); if (isset($seen[$k])) continue; $seen[$k] = 1;
            $sp = $t['shop'] ?? ''; $am = $t['amenity'] ?? ''; $to = $t['tourism'] ?? '';
            // rang : 1 = grands équipements (centre commercial, hôpital, université, gare, musée…), 2 = commerces et services usuels, 3 = le reste
            if (in_array($sp, $major, true) || in_array($am, ['hospital', 'university', 'townhall', 'theatre', 'cinema', 'courthouse', 'college', 'library', 'marketplace'], true) || in_array($to, ['museum', 'attraction'], true) || isset($t['railway'])) $rk = 1;
            elseif ($sp !== '' || in_array($am, ['pharmacy', 'bank', 'post_office', 'school', 'clinic', 'police', 'place_of_worship', 'fire_station'], true) || in_array($to, ['hotel', 'gallery'], true)) $rk = 2;
            else $rk = 3;
            if ($rk === 3 && $cat !== '') $rk = 2;   // commerce/service catégorisé (restaurant, café, coiffeur…) = rang 2
            $r[] = ['n' => $t['name'], 'x' => round($x[0], 1), 'z' => round($x[1], 1), 'r' => $rk] + ($cat ? ['c' => $cat] : []);
        }
        return $r;
    }, $force);
    $pk = ch_stage('sommets', function () {   // sommets (natural=peak), cols (natural=saddle, mountain_pass) dans un rayon de 9 km (étendue du relief)
        $dl = 9000 / 110540; $dn = 9000 / (111320 * cos(deg2rad(CH_LAT))); $bx = round(CH_LAT - $dl, 4) . ',' . round(CH_LON - $dn, 4) . ',' . round(CH_LAT + $dl, 4) . ',' . round(CH_LON + $dn, 4);
        $els = ch_overpass("[out:json][timeout:90];(node[\"name\"][\"natural\"~\"^(peak|saddle|volcano)$\"]($bx);node[\"name\"][\"mountain_pass\"=\"yes\"]($bx);node[\"name\"][\"natural\"=\"ridge\"]($bx);way[\"name\"][\"natural\"=\"ridge\"]($bx););out center tags;");
        if ($els === null) return null;
        $r = []; $seen = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null;
            if ($lat === null || empty($t['name']) || isset($seen[$t['name']])) continue; $seen[$t['name']] = 1;
            $x = ch_proj((float)$lat, (float)$lon); $nat = $t['natural'] ?? '';
            $col = ($t['mountain_pass'] ?? '') === 'yes' || $nat === 'saddle';
            $r[] = ['n' => $t['name'], 'x' => round($x[0], 1), 'z' => round($x[1], 1), 't' => $col ? 1 : ($nat === 'ridge' ? 2 : 0)] + (isset($t['ele']) && is_numeric($t['ele']) ? ['e' => (int)$t['ele']] : []);
        }
        return $r;
    }, $force);
    $nu = ch_stage('numeros', function () use ($bb) {
        $els = ch_overpass("[out:json][timeout:120];nwr[\"addr:housenumber\"]($bb);out center tags;");
        if ($els === null) return null;
        $r = []; $seen = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null;
            if ($lat === null) continue;
            $x = ch_proj((float)$lat, (float)$lon);
            $k = $x[0] . ',' . $x[1] . $t['addr:housenumber']; if (isset($seen[$k])) continue; $seen[$k] = 1;
            $r[] = ['n' => $t['addr:housenumber'], 'x' => round($x[0], 1), 'z' => round($x[1], 1)];
        }
        return $r;
    }, $force);
    $fu = ch_stage('mobilier2', function () use ($bb) {   // feux tricolores, passages piétons, stops, arrêts de bus, abris (t : ts, cr, st, bs, sh)
        $els = ch_overpass("[out:json][timeout:120];(node[\"highway\"~\"^(traffic_signals|crossing|stop|bus_stop)$\"]($bb);node[\"public_transport\"=\"platform\"][\"bus\"=\"yes\"]($bb);node[\"amenity\"=\"shelter\"]($bb);way[\"amenity\"=\"shelter\"]($bb);node[\"crossing\"=\"traffic_signals\"]($bb););out center tags;");
        if ($els === null) return null;
        $r = []; $seen = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null;
            if ($lat === null) continue;
            $h = $t['highway'] ?? '';
            if ($h === 'traffic_signals' || ($t['crossing'] ?? '') === 'traffic_signals') $ty = 'ts';
            elseif ($h === 'crossing') { if (($t['crossing'] ?? '') === 'no') continue; $ty = 'cr'; }
            elseif ($h === 'stop') $ty = 'st';
            elseif ($h === 'bus_stop' || ($t['public_transport'] ?? '') === 'platform') $ty = 'bs';
            elseif (($t['amenity'] ?? '') === 'shelter') { $sh = $t['shelter_type'] ?? ''; if ($sh !== '' && $sh !== 'public_transport' && $sh !== 'bus_stop' && ($t['bus'] ?? '') !== 'yes' && ($t['public_transport'] ?? '') === '') continue; $ty = 'sh'; }
            else continue;
            $x = ch_proj((float)$lat, (float)$lon); $k = $ty . round($x[0] / 2) . ',' . round($x[1] / 2); if (isset($seen[$k])) continue; $seen[$k] = 1;
            $r[] = ['t' => $ty, 'x' => round($x[0], 1), 'z' => round($x[1], 1)] + ($ty === 'bs' && (($t['shelter'] ?? '') === 'yes' || ($t['covered'] ?? '') === 'yes') ? ['h' => 1] : []);
        }
        return $r;
    }, $force);
    $m3 = ch_stage('mobilier3', function () use ($bb) {   // fontaines, statues/monuments, bacs à fleurs, bancs, poubelles, stationnements vélos, points d'eau
        $els = ch_overpass("[out:json][timeout:120];(node[\"amenity\"~\"^(fountain|bench|waste_basket|bicycle_parking|drinking_water|bicycle_rental|recycling)$\"]($bb);nwr[\"amenity\"=\"fountain\"]($bb);nwr[\"water\"=\"fountain\"]($bb);nwr[\"fountain\"]($bb);nwr[\"man_made\"=\"fountain\"]($bb);nwr[\"natural\"=\"water\"][\"name\"~\"ontaine|ountain\"]($bb);node[\"tourism\"=\"artwork\"]($bb);node[\"historic\"~\"^(memorial|monument|statue|wayside_cross|fountain)$\"]($bb);nwr[\"historic\"~\"^(monument|fountain)$\"]($bb);node[\"barrier\"=\"planter\"]($bb);way[\"barrier\"=\"planter\"]($bb);way[\"landuse\"=\"flowerbed\"]($bb);node[\"leisure\"=\"picnic_table\"]($bb););out center tags;");
        if ($els === null) return null;
        $r = []; $seen = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; $lat = $el['center']['lat'] ?? $el['lat'] ?? null; $lon = $el['center']['lon'] ?? $el['lon'] ?? null; if ($lat === null) continue;
            $am = $t['amenity'] ?? ''; $hi = $t['historic'] ?? ''; $ty = null; $ex = [];
            if ($am === 'fountain' || $hi === 'fountain' || ($t['water'] ?? '') === 'fountain' || isset($t['fountain']) || ($t['man_made'] ?? '') === 'fountain' || preg_match('/ontaine|ountain/', $t['name'] ?? '') && ($t['natural'] ?? '') === 'water') $ty = 'fo';
            elseif ($am === 'bench' || ($t['leisure'] ?? '') === 'picnic_table') $ty = 'bn';
            elseif ($am === 'waste_basket' || $am === 'recycling') $ty = 'wb';
            elseif ($am === 'bicycle_parking' || $am === 'bicycle_rental') $ty = 'bk';
            elseif ($am === 'drinking_water') $ty = 'dw';
            elseif (($t['barrier'] ?? '') === 'planter' || ($t['landuse'] ?? '') === 'flowerbed') $ty = 'pl';
            elseif (($t['tourism'] ?? '') === 'artwork' || in_array($hi, ['memorial', 'monument', 'statue', 'wayside_cross'], true)) { $ty = 'sa'; $at = $t['artwork_type'] ?? ($t['memorial'] ?? $hi); $ex['k'] = in_array($at, ['statue', 'bust', 'sculpture', 'monument', 'obelisk', 'cross', 'wayside_cross', 'stele', 'plaque'], true) ? $at : 'sculpture'; }
            if ($ty === null) continue;
            $x = ch_proj((float)$lat, (float)$lon); $k = $ty . round($x[0]) . ',' . round($x[1]); if (isset($seen[$k])) continue; $seen[$k] = 1;
            $r[] = ['t' => $ty, 'x' => round($x[0], 1), 'z' => round($x[1], 1)] + $ex;
        }
        return $r;
    }, $force);
    $tx = ch_stage('arbres', function () use ($bb) {   // arbres OSM avec attributs : espèce/genre, feuillage, hauteur, diamètre de couronne
        $els = ch_overpass("[out:json][timeout:120];(node[\"natural\"=\"tree\"]($bb););out tags center;");
        if ($els === null) return null;
        $r = [];
        foreach ($els as $el) {
            $t = $el['tags'] ?? []; if (!isset($el['lat'])) continue; $x = ch_proj((float)$el['lat'], (float)$el['lon']);
            $o = ['x' => round($x[0], 1), 'z' => round($x[1], 1)];
            $g = strtolower($t['genus'] ?? $t['species'] ?? ''); if ($g !== '') $o['g'] = explode(' ', $g)[0];
            if (isset($t['leaf_type'])) $o['lt'] = $t['leaf_type'][0];
            if (($h = ch_num($t['height'] ?? null)) !== null && $h > 1 && $h < 60) $o['h'] = round($h, 1);
            if (($d = ch_num($t['diameter_crown'] ?? null)) !== null && $d > 0.5 && $d < 40) $o['cr'] = round($d, 1);
            if (($c = ch_num($t['circumference'] ?? null)) !== null && $c > 0.05 && $c < 15) $o['tr'] = round($c / M_PI, 2);
            $r[] = $o;
        }
        return $r;
    }, $force);
    ch_log('[relief] tuiles AWS Terrarium…');
    $dem = ch_fetch_dem();
    ch_log('[orthophoto] tuiles IGN…');
    $ortho = ch_fetch_ortho();

    if (!$bt) { ch_log("Impossible d'obtenir les bâtiments : arrêt."); return false; }
    $buildings = $bt[0]; $roads = $ro ?? [];
    $cad = ch_cadastral_check($buildings, $roads, $force);   // recalage cadastre/BD TOPO (générique, valable pour toute commune française) ; renvoie null (sans rien modifier) si les couches officielles n'ont pas de données sur l'emprise (hors de France, etc.)
    $data = ['source' => 'osm', 'name' => CH_NAME, 'cp' => CH_CP, 'center' => [CH_LAT, CH_LON], 'bbox' => CH_BBOX, 'demRadius' => CH_DEM_RADIUS,
             'buildings' => $buildings, 'trees' => $bt[1], 'roads' => $roads, 'areas' => array_merge($ar ?? [], $co ?? []), 'places' => $pl ?? ch_places_from([]), 'labels' => $lb ?? [], 'numbers' => $nu ?? [], 'furn' => $fu ?? [], 'street' => $m3 ?? [], 'treesx' => $tx ?? [], 'shops' => $sh ?? [], 'peaks' => $pk ?? [], 'dem' => $dem, 'ortho' => $ortho, 'cadastreCheck' => $cad];
    file_put_contents(CH_FILE, json_encode($data, JSON_UNESCAPED_UNICODE));
    ch_log(sprintf('OK : %d bâtiments, %d arbres, %d routes/rails/cours d\'eau, %d zones, relief %s',
        count($data['buildings']), count($data['trees']), count($data['roads']), count($data['areas']), $dem ? 'oui' : 'NON'));
    if ($ro === null) ch_log('ATTENTION : routes non téléchargées, relancez la commande.');
    if ($ar === null) ch_log('ATTENTION : zones (forêts, eau…) non téléchargées, relancez la commande.');
    if ($co === null) ch_log('ATTENTION : littoral non téléchargé, relancez la commande.');
    if ($dem === null) ch_log('ATTENTION : relief non téléchargé, relancez la commande.');
    return true;
}

// Jeu de secours fictif (aucune donnée téléchargée).
function ch_placeholder(): array {
    mt_srand(73000); $b = []; $t = [];
    for ($i = -10; $i <= 10; $i++) for ($j = -10; $j <= 10; $j++) {
        $cx = $i * 62; $cz = $j * 62;
        for ($k = 0, $c = mt_rand(2, 4); $k < $c; $k++) {
            $w = mt_rand(10, 24); $d = mt_rand(10, 24);
            $x = $cx - 24 + ($k % 2) * 26; $z = $cz - 24 + intdiv($k, 2) * 26;
            $b[] = ['h' => mt_rand(8, 18), 'p' => [[$x, $z], [$x + $w, $z], [$x + $w, $z + $d], [$x, $z + $d]]];
        }
    }
    return ['source' => 'placeholder', 'center' => [CH_LAT, CH_LON], 'buildings' => $b, 'trees' => $t, 'roads' => [], 'areas' => [], 'dem' => null];
}

// Catégorie lisible (français) d'un commerce ou service OSM, '' si inconnue
function ch_shop_cat(array $t): string {
    static $S = ['bakery' => 'Boulangerie', 'butcher' => 'Boucherie', 'supermarket' => 'Supermarché', 'convenience' => 'Supérette', 'greengrocer' => 'Primeur', 'hairdresser' => 'Coiffeur', 'clothes' => 'Vêtements', 'shoes' => 'Chaussures', 'florist' => 'Fleuriste', 'car_repair' => 'Garage', 'car' => 'Concession auto', 'hardware' => 'Bricolage', 'doityourself' => 'Bricolage', 'books' => 'Librairie', 'jewelry' => 'Bijouterie', 'optician' => 'Opticien', 'beauty' => 'Beauté', 'mobile_phone' => 'Téléphonie', 'electronics' => 'Électronique', 'furniture' => 'Meubles', 'pastry' => 'Pâtisserie', 'chemist' => 'Droguerie', 'tobacco' => 'Tabac', 'newsagent' => 'Presse', 'alcohol' => 'Cave à vins', 'wine' => 'Cave à vins', 'bicycle' => 'Vélos', 'sports' => 'Sport', 'gift' => 'Cadeaux', 'stationery' => 'Papeterie', 'pet' => 'Animalerie', 'laundry' => 'Pressing', 'mall' => 'Centre commercial', 'department_store' => 'Grand magasin', 'bag' => 'Maroquinerie', 'toys' => 'Jouets', 'variety_store' => 'Bazar', 'kiosk' => 'Kiosque', 'tyres' => 'Pneus', 'travel_agency' => 'Agence de voyage', 'estate_agent' => 'Agence immobilière', 'garden_centre' => 'Jardinerie', 'organic' => 'Bio', 'seafood' => 'Poissonnerie', 'cheese' => 'Fromagerie', 'deli' => 'Traiteur', 'photo' => 'Photo', 'copyshop' => 'Reprographie', 'second_hand' => 'Occasion', 'craft' => 'Artisanat', 'interior_decoration' => 'Décoration', 'fabric' => 'Tissus', 'art' => 'Art', 'music' => 'Musique', 'video_games' => 'Jeux vidéo', 'massage' => 'Massage', 'tattoo' => 'Tatouage'];
    static $A = ['pharmacy' => 'Pharmacie', 'bank' => 'Banque', 'restaurant' => 'Restaurant', 'cafe' => 'Café', 'bar' => 'Bar', 'fast_food' => 'Restauration rapide', 'pub' => 'Pub', 'post_office' => 'Poste', 'dentist' => 'Dentiste', 'doctors' => 'Médecin', 'clinic' => 'Clinique', 'veterinary' => 'Vétérinaire', 'school' => 'École', 'college' => 'Collège', 'kindergarten' => 'Crèche', 'library' => 'Bibliothèque', 'townhall' => 'Mairie', 'police' => 'Police', 'fire_station' => 'Pompiers', 'place_of_worship' => 'Lieu de culte', 'fuel' => 'Station-service', 'cinema' => 'Cinéma', 'theatre' => 'Théâtre', 'marketplace' => 'Marché', 'ice_cream' => 'Glacier', 'nightclub' => 'Discothèque', 'hospital' => 'Hôpital', 'car_wash' => 'Lavage auto', 'community_centre' => 'Salle communale'];
    $sp = $t['shop'] ?? ''; if ($sp !== '') return $S[$sp] ?? 'Commerce';
    $am = $t['amenity'] ?? ''; if ($am !== '' && isset($A[$am])) return $A[$am];
    $to = $t['tourism'] ?? ''; if ($to === 'hotel') return 'Hôtel'; if ($to === 'guest_house') return "Chambre d'hôtes"; if ($to === 'museum') return 'Musée';
    return '';
}

// Préchargement de l'orthophoto haute définition (z18, ~0,6 m/px) sur toute la zone de données, en parallèle (reprend où il s'est arrêté)
function ch_fetch_ortho_hi(int $z = 18): bool {
    $n = 2 ** $z; [$s, $w, $nn, $e] = CH_BBOX;
    $x0 = (int)floor(($w + 180) / 360 * $n); $x1 = (int)floor(($e + 180) / 360 * $n);
    $ty = function ($lat) use ($n) { $l = deg2rad($lat); return (int)floor((1 - log(tan($l) + 1 / cos($l)) / M_PI) / 2 * $n); };
    $y0 = $ty($nn); $y1 = $ty($s);
    $todo = [];
    for ($x = $x0; $x <= $x1; $x++) for ($y = $y0; $y <= $y1; $y++) { $f = CH_DIR . "/orthophoto/$z/$x/$y.jpg"; if (!is_file($f) || filesize($f) < 500) $todo[] = [$x, $y, $f]; }
    ch_log("[orthophoto z$z] " . count($todo) . ' tuiles à télécharger');
    $done = 0; $fail = 0;
    foreach (array_chunk($todo, 8) as $chunk) {
        for ($try = 0; $try < 3 && $chunk; $try++) {
            $mh = curl_multi_init(); $hs = [];
            foreach ($chunk as $i => [$x, $y, $f]) {
                $ch = curl_init("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=$z&TILEROW=$y&TILECOL=$x");
                curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'chambery-3d/1.0']);
                curl_multi_add_handle($mh, $ch); $hs[$i] = $ch;
            }
            do { curl_multi_exec($mh, $act); if ($act) curl_multi_select($mh, 1); } while ($act);
            $left = [];
            foreach ($chunk as $i => [$x, $y, $f]) {
                $img = curl_multi_getcontent($hs[$i]); curl_multi_remove_handle($mh, $hs[$i]); curl_close($hs[$i]);
                if ($img !== null && $img !== false && strlen($img) > 500) { @mkdir(dirname($f), 0777, true); file_put_contents($f, $img); $done++; } else $left[] = [$x, $y, $f];
            }
            curl_multi_close($mh); $chunk = $left; if ($chunk) usleep(500000);
        }
        $fail += count($chunk);
        if ($done % 80 < 8) ch_log("  z$z : $done ok, $fail échecs");
    }
    ch_log("[orthophoto z$z] terminé : $done ok, $fail échecs");
    return $fail === 0;
}
