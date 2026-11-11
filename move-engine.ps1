# move-engine.ps1
# Range les fichiers du jeu qui ne sont pas des mondes, puis corrige les chemins partout.
#   engine/  : le moteur d'Evelyn (commun a tous les avatars)
#   workers/ : le code colle dans Cloudflare (le jeu ne l'utilise pas)
#   objects/ : les objets du jeu (telephone, vehicule, table de nuit, journal, livre)
# A lancer dans le dossier du jeu (a cote de index.html).
#   Simulation (ne change rien) : powershell -ExecutionPolicy Bypass -File move-engine.ps1
#   Pour appliquer              : powershell -ExecutionPolicy Bypass -File move-engine.ps1 -Apply
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$script:root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $script:root

# fichier -> dossier. Modifie cette liste si tu veux ranger autrement.
$script:map = [ordered]@{
    'therapist-ai.js'     = 'engine'
    'therapist-config.js' = 'engine'
    'therapist-memory.js' = 'engine'
    'therapist-secret.js' = 'engine'
    'evelyn-life.js'      = 'engine'
    'evelyn-phone.js'     = 'engine'
    'phone-item.js'       = 'engine'
    'evelyn-brain.js'     = 'workers'
    'worker.js'           = 'workers'
    'phone.js'            = 'objects'
    'vehicle.js'          = 'objects'
    'nightstand.js'       = 'objects'
    'journal.js'          = 'objects'
    'bookreader.js'       = 'objects'
}
$script:folders = @('engine', 'workers', 'objects')
$script:curFolder = ''
$script:strict = New-Object System.Text.UTF8Encoding($false, $true)

function Read-Src($path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)
    $start = 0
    if ($bom) { $start = 3 }
    try { $text = $script:strict.GetString($bytes, $start, $bytes.Length - $start) } catch { return $null }
    return @{ Text = $text; Bom = $bom }
}

function Save-Src($path, $text, $bom) {
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($bom)))
}

# 'nom.js' ou './nom.js' entre guillemets, pour un fichier deplace  ->  avec son dossier devant
$names = ($script:map.Keys | ForEach-Object { [regex]::Escape($_) }) -join '|'
$script:reRoot = New-Object System.Text.RegularExpressions.Regex("(?<q>['""])(?<dot>\./)?(?<name>$names)\k<q>")
# dans un fichier deplace : './autre.js' qui est ailleurs  ->  chemin corrige
$script:reImp = New-Object System.Text.RegularExpressions.Regex("(?<q>['""])\./(?<name>[A-Za-z0-9_\-]+\.js)\k<q>")

$script:evRoot = [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $q = $m.Groups['q'].Value
    $n = $m.Groups['name'].Value
    return $q + $m.Groups['dot'].Value + $script:map[$n] + '/' + $n + $q
}
$script:evImp = [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $n = $m.Groups['name'].Value
    $q = $m.Groups['q'].Value
    if ($script:map.Contains($n)) {
        $target = $script:map[$n]
        if ($target -eq $script:curFolder) { return $m.Value }
        return $q + '../' + $target + '/' + $n + $q
    }
    if (Test-Path (Join-Path $script:root $n)) { return $q + '../' + $n + $q }
    return $m.Value
}

function Rewrite-File($path, $regex, $ev) {
    $src = Read-Src $path
    if ($null -eq $src) { Write-Host ("  IGNORE (pas en UTF-8) : " + $path); return }
    $new = $regex.Replace($src.Text, $ev)
    if ($new -ne $src.Text) {
        Write-Host ("  corriger les chemins dans : " + $path.Substring($script:root.Length + 1))
        if ($Apply) { Save-Src $path $new $src.Bom }
    }
}

Write-Host ''
if ($Apply) { Write-Host '=== DEPLACEMENT REEL ===' } else { Write-Host '=== SIMULATION : rien n est modifie. Ajoute -Apply pour appliquer ===' }

# 1. Deplacer les fichiers
Write-Host ''
Write-Host '1. Fichiers deplaces :'
$moved = @()
foreach ($n in $script:map.Keys) {
    $src = Join-Path $script:root $n
    if (-not (Test-Path $src)) { continue }
    $folder = $script:map[$n]
    Write-Host ("  " + $n + "  ->  " + $folder + "/")
    $moved += $n
    if ($Apply) {
        $dir = Join-Path $script:root $folder
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
        $dest = Join-Path $dir $n
        if (Test-Path $dest) { throw ("Existe deja : " + $dest) }
        Move-Item -LiteralPath $src -Destination $dest
    }
}
if ($moved.Count -eq 0) { Write-Host '  (rien a deplacer : deja fait ?)' }

# 2. Dans les fichiers deplaces : les imports './x.js' vers un autre dossier sont corriges
Write-Host ''
Write-Host '2. Fichiers deplaces (leurs imports) :'
foreach ($n in $moved) {
    $script:curFolder = $script:map[$n]
    if ($Apply) { $path = Join-Path (Join-Path $script:root $script:curFolder) $n } else { $path = Join-Path $script:root $n }
    Rewrite-File $path $script:reImp $script:evImp
}

# 3. Les autres fichiers du jeu (mondes, pages) : ils pointent vers les nouveaux dossiers
Write-Host ''
Write-Host '3. Autres fichiers du jeu qui chargent les fichiers deplaces :'
$skip = '\\(\.git|avatars|audio|images|videos|engine|workers|objects|node_modules)\\'
$others = Get-ChildItem -Path $script:root -Recurse -File -Include *.js, *.html, *.php |
    Where-Object { ($_.FullName -notmatch $skip) -and (-not $script:map.Contains($_.Name)) }
foreach ($f in $others) { Rewrite-File $f.FullName $script:reRoot $script:evRoot }

# 4. Ce que le script n'a pas su corriger tout seul
Write-Host ''
Write-Host '4. Mentions restantes (a verifier a la main ; les commentaires sont normaux) :'
$left = 0
foreach ($f in $others) {
    $hits = Select-String -Path $f.FullName -Pattern $names | Where-Object { $_.Line -notmatch '(engine|workers|objects)/' }
    foreach ($h in $hits) { $left++; Write-Host ("  " + $f.Name + ":" + $h.LineNumber + ":  " + $h.Line.Trim()) }
}
if ($left -eq 0) { Write-Host '  (aucune)' }

# 5. Chemins calcules dans les fichiers deplaces : le script ne peut pas les deviner
Write-Host ''
Write-Host '5. ATTENTION : chemins calcules dans les fichiers deplaces (a verifier a la main) :'
$warn = 0
foreach ($n in $moved) {
    if ($Apply) { $path = Join-Path (Join-Path $script:root $script:map[$n]) $n } else { $path = Join-Path $script:root $n }
    $hits = Select-String -Path $path -Pattern "import\(\s*[^'""\s]", 'import\.meta', 'new URL\(' | Where-Object { $_.Line.TrimStart() -notmatch '^//' }
    foreach ($h in $hits) { $warn++; Write-Host ("  " + $n + ":" + $h.LineNumber + ":  " + $h.Line.Trim()) }
}
if ($warn -eq 0) { Write-Host '  (aucun)' }

Write-Host ''
if ($Apply) {
    Write-Host 'Termine. Ensuite : relance make-manifest.ps1, teste le jeu, puis git add -A / git commit.'
    Write-Host 'Pour tout annuler : git checkout -- .   puis   git clean -fd engine workers objects'
} else {
    Write-Host 'Simulation terminee. Si la liste te convient, relance avec -Apply.'
}
