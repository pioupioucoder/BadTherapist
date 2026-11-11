<?php
// assets.php – liste automatique de tous les fichiers du jeu pour loader.js (plus besoin de manifest).
// À placer dans le même dossier que loader.js et index.html. Rien à lancer : le loader l'appelle tout seul.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = realpath(__DIR__);
$skipDir = '#(^|/)(\.git|node_modules|\.vscode|\.idea|backups?|saves?)(/|$)#i';
$skipExt = ['php','ps1','bat','md','psd','blend','blend1','zip','rar','7z','bak','log','tmp','map','sh','sql','ini'];

$out = [];
$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);
foreach ($it as $f) {
    if (!$f->isFile()) continue;
    $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
    if (preg_match($skipDir, $rel)) continue;
    if (in_array(strtolower($f->getExtension()), $skipExt, true)) continue;
    $out[] = ['path' => $rel, 'size' => $f->getSize()];
}
echo json_encode(['files' => $out]);
