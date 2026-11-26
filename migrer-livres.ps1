# migrer-livres.ps1 - à lancer depuis le dossier racine du projet (C:\xampp\htdocs\projet\Illusion)
#   powershell -NoProfile -ExecutionPolicy Bypass -File migrer-livres.ps1
# Avant : copie les 2 nouveaux fichiers (journal.js, bookreader.js) dans objects\ et fais un commit Git.

$utf8 = New-Object Text.UTF8Encoding $false
function Patch($file, $pairs) {
    if (-not (Test-Path $file)) { Write-Host "ABSENT  $file"; return }
    $t = [IO.File]::ReadAllText((Resolve-Path $file).Path)
    $n = $t
    foreach ($p in $pairs) {
        if ($p.regex) { $n = [regex]::Replace($n, $p.from, $p.to) } else { $n = $n.Replace($p.from, $p.to) }
    }
    if ($n -ne $t) { [IO.File]::WriteAllText((Resolve-Path $file).Path, $n, $utf8); Write-Host "MODIFIE $file" }
    else { Write-Host "inchange $file (rien à changer ou déjà fait)" }
}

# 1) evelyn-house.js : propriétaire 'evelyn' pour ses livres et son carnet
Patch 'places\evelyn-house.js' @(
    @{ from = "import { createBookReader } from '../objects/bookreader.js';"; to = "import { createBookReader, bookDir } from '../objects/bookreader.js';" },
    @{ from = "const BOOK_DIR = 'json/livredetherapeute/';"; to = "const BOOK_DIR = bookDir('evelyn');" },
    @{ from = "createBookReader()"; to = "createBookReader({ id: 'evelyn' })" },
    @{ regex = $true; from = "(?s)createJournal\(\{\s*key: 'bt_evelyn_journal'.*?\}\)"; to = "createJournal({ id: 'evelyn' })" }
)

# 2) nightstand.js : ton carnet = propriétaire 'player'
Patch 'objects\nightstand.js' @(
    @{ from = "createJournal({})"; to = "createJournal({ id: 'player' })" }
)

# 3) dossiers de livres : un dossier par identifiant
if (-not (Test-Path 'json\books')) { New-Item -ItemType Directory 'json\books' | Out-Null }
if ((Test-Path 'json\livredetherapeute') -and -not (Test-Path 'json\books\evelyn')) { Move-Item 'json\livredetherapeute' 'json\books\evelyn'; Write-Host 'DEPLACE json\livredetherapeute -> json\books\evelyn' }
if ((Test-Path 'json\livredebedroom') -and -not (Test-Path 'json\books\player')) { Move-Item 'json\livredebedroom' 'json\books\player'; Write-Host 'DEPLACE json\livredebedroom -> json\books\player' }

# 4) vérification : anciens noms qui traînent encore (à m'envoyer s'il y en a)
Write-Host ''
Write-Host '--- Références restantes aux anciens dossiers / clés ---'
Get-ChildItem -Recurse -Include *.js,*.html,*.json,*.php | Where-Object { $_.FullName -notmatch 'node_modules|\\\.git\\|\\videos\\|\\avatars\\' } |
    Select-String -Pattern 'livredetherapeute','livredebedroom' | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
Write-Host '--- fin ---'
