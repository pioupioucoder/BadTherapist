<?php
// videos.php — liste dynamique des cassettes (sous-dossiers de /videos) et de leurs vidéos.
// Rien à maintenir à la main : ajoute un dossier ou une vidéo, la télé la voit au prochain rafraîchissement.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = __DIR__ . DIRECTORY_SEPARATOR . 'videos';
$exts = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
$cassettes = [];

function listVideos($dir, $exts) {
    $out = [];
    foreach (scandir($dir) as $f) {
        if ($f === '.' || $f === '..') continue;
        $p = $dir . DIRECTORY_SEPARATOR . $f;
        if (is_file($p) && in_array(strtolower(pathinfo($f, PATHINFO_EXTENSION)), $exts, true)) $out[] = $f;
    }
    natcasesort($out);
    return array_values($out);
}

if (is_dir($root)) {
    foreach (scandir($root) as $d) {
        if ($d === '.' || $d === '..') continue;
        $p = $root . DIRECTORY_SEPARATOR . $d;
        if (is_dir($p)) {
            $v = listVideos($p, $exts);
            if ($v) $cassettes[] = ['name' => $d, 'videos' => $v];
        }
    }
    // vidéos posées directement dans /videos (pas dans un dossier)
    $loose = listVideos($root, $exts);
    if ($loose) $cassettes[] = ['name' => '(vrac)', 'videos' => $loose, 'root' => true];
}

echo json_encode(['cassettes' => $cassettes], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
