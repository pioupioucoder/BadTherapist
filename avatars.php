<?php
// avatars.php
header('Content-Type: application/json');

$baseDir = __DIR__ . '/avatars/';
// Seule Evelyn a un vrai avatar (FBX). Les autres PNJ sont des corps simples (engine/npc-body.js).
$ONLY = ['evelyn'];
$avatars = [];

if (is_dir($baseDir)) {
    // Liste les dossiers dans /avatars/
    $dirs = array_filter(scandir($baseDir), function($item) use ($baseDir) {
        return is_dir($baseDir . $item) && $item !== '.' && $item !== '..' && $item !== '_shared' && in_array($item, $ONLY);
    });

    foreach ($dirs as $dir) {
        $path = $baseDir . $dir . '/';
        $files = scandir($path);
        $model = null;
        $animations = [];

        foreach ($files as $file) {
            if (pathinfo($file, PATHINFO_EXTENSION) === 'fbx') {
                // Si le fichier .fbx porte le même nom que le dossier, c'est le modèle principal
                if (strtolower(pathinfo($file, PATHINFO_FILENAME)) === strtolower($dir)) {
                    $model = $file;
                } else {
                    $animations[] = $file;
                }
            }
        }

        if ($model) {
            $avatars[$dir] = [
                'model' => $model,
                'animations' => $animations
            ];
        }
    }
}

echo json_encode($avatars);