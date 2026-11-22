<?php
// assets.php – liste TOUS les fichiers du site (dossiers et sous-dossiers) pour le préchargement du loader.
//
// - Répond en JSON : { "count": N, "files": [ { "path": "dossier/fichier.png", "size": 1234 }, ... ] }
// - À chaque appel, réécrit aussi assets-manifest.json (si la liste a changé). Ce fichier est la copie statique
//   utilisée quand PHP n'est pas disponible (GitHub Pages) : lance le jeu une fois en local (ou ouvre
//   http://localhost/projet/BadTherapist/assets.php), puis commit assets-manifest.json.
// - Aucun fichier à lancer à la main, aucune liste à tenir à jour.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = __DIR__;

// Dossiers jamais listés
$skipDirs = array('.git', 'node_modules', '.vscode', '.idea', 'backup', 'backups', 'save', 'saves', 'notes');
// Fichiers jamais listés (code serveur, outils, archives...)
$skipExt  = array('php', 'ps1', 'bat', 'md', 'psd', 'blend', 'blend1', 'zip', 'rar', '7z', 'bak', 'log', 'tmp', 'map', 'sh', 'sql', 'ini');
$skipFiles = array('assets-manifest.json', '.gitignore');

$files = array();

$dirIt = new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS);
$filter = new RecursiveCallbackFilterIterator($dirIt, function ($cur, $key, $it) use ($skipDirs) {
    if ($it->hasChildren()) {
        return !in_array(strtolower($cur->getFilename()), $skipDirs, true);
    }
    return true;
});

foreach (new RecursiveIteratorIterator($filter) as $f) {
    if (!$f->isFile()) continue;
    $name = $f->getFilename();
    if (in_array($name, $skipFiles, true)) continue;
    if (in_array(strtolower($f->getExtension()), $skipExt, true)) continue;

    $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
    // Windows renvoie parfois des noms en ANSI : on les remet en UTF-8
    if (function_exists('mb_check_encoding') && !mb_check_encoding($rel, 'UTF-8')) {
        $rel = mb_convert_encoding($rel, 'UTF-8', 'Windows-1252');
    }
    $files[] = array('path' => $rel, 'size' => $f->getSize());
}

usort($files, function ($a, $b) { return strcmp($a['path'], $b['path']); });

$out = array('count' => count($files), 'files' => $files);
$json = json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

// Copie statique pour GitHub (écrite seulement si elle a changé)
$manifest = $root . DIRECTORY_SEPARATOR . 'assets-manifest.json';
if (!file_exists($manifest) || @file_get_contents($manifest) !== $json) {
    @file_put_contents($manifest, $json);
}

echo $json;
