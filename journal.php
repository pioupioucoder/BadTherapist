<?php
// journal.php – réécrit json/book.json à chaque modification du livre (XAMPP / réseau maison).
// À placer à côté de world_base.html. Le dossier json/ est créé s'il n'existe pas.
//
// Aucune base de données, aucun mot de passe. Par sécurité :
//  - il n'accepte que les appels venant de cet ordinateur ou du réseau maison (wifi),
//    jamais d'internet : poussé sur GitHub, il ne sert à rien et ne peut rien écrire ;
//  - il n'écrit que dans json/book.json ;
//  - il refuse d'écraser un fichier plus récent que ce qu'on lui envoie.

const BOOK_DIR  = __DIR__ . '/json';
const BOOK_FILE = BOOK_DIR . '/book.json';
const MAX_BODY  = 2000000;   // 2 Mo
const MAX_PAGES = 400;
const MAX_CHARS = 3000;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

// Une adresse publique (internet) est refusée ; localhost et réseau privé passent
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false) {
    out(403, ['error' => 'local only']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'POST only']);

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) out(413, ['error' => 'too large']);

$in = json_decode($raw, true);
if (!is_array($in) || !isset($in['pages']) || !is_array($in['pages'])) out(400, ['error' => 'bad json']);

$pages = [];
foreach (array_slice($in['pages'], 0, MAX_PAGES) as $t) {
    $pages[] = is_string($t) ? mb_substr($t, 0, MAX_CHARS) : '';
}
while (count($pages) < 2 || count($pages) % 2) $pages[] = '';

$updated = (int)($in['updated'] ?? 0);
if ($updated <= 0) $updated = (int)round(microtime(true) * 1000);

// Ne jamais écraser un fichier plus récent (ex. un autre appareil, ou un fichier qu'on vient de coller)
if (is_file(BOOK_FILE)) {
    $old = json_decode((string)file_get_contents(BOOK_FILE), true);
    if (is_array($old) && (int)($old['updated'] ?? 0) > $updated) out(409, ['error' => 'file is newer']);
}

if (!is_dir(BOOK_DIR) && !mkdir(BOOK_DIR, 0775, true) && !is_dir(BOOK_DIR)) out(500, ['error' => 'cannot create json/']);

// JSON lisible : les modifications se voient bien dans git
$json = json_encode(
    ['version' => 1, 'pages' => $pages, 'updated' => $updated],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);

// Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un fichier à moitié écrit
$tmp = tempnam(BOOK_DIR, 'book');
if ($tmp === false || file_put_contents($tmp, $json . "\n", LOCK_EX) === false) out(500, ['error' => 'write failed']);
@chmod($tmp, 0644);
if (!rename($tmp, BOOK_FILE)) {
    @unlink($tmp);
    out(500, ['error' => 'rename failed']);
}

out(200, ['ok' => true]);
