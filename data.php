<?php
ini_set('memory_limit', '1G');
require __DIR__ . '/lib/osm.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');
if (!ob_start('ob_gzhandler')) ob_start();
if (is_file(CH_FILE)) readfile(CH_FILE);
else echo json_encode(ch_placeholder());
