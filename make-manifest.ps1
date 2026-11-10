# make-manifest.ps1 – liste TOUS les fichiers du jeu dans assets-manifest.json (lu par l'écran de chargement).
# À lancer dans le dossier du jeu (là où est index.html), à chaque fois que tu ajoutes ou retires un fichier :
#     powershell -ExecutionPolicy Bypass -File make-manifest.ps1
# Puis pousse assets-manifest.json sur GitHub avec le reste.
#
# Pour ne PAS précharger un dossier (par exemple les vidéos, si elles sont très lourdes), ajoute son nom ici :
$skipFolders = @('.git', 'node_modules')
# Extensions inutiles côté navigateur :
$skipExt = @('.php', '.ps1', '.bat', '.md', '.txt~')

$root = (Get-Location).Path.TrimEnd('\')
$files = Get-ChildItem -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    $top = $rel.Split('/')[0]
    if ($skipFolders -contains $top) { return }
    if ($skipExt -contains $_.Extension.ToLower()) { return }
    if ($rel -eq 'assets-manifest.json' -or $rel -eq '.gitignore') { return }
    [pscustomobject]@{ path = $rel; size = $_.Length }
}

$total = ($files | Measure-Object -Property size -Sum).Sum
@{ files = @($files) } | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 assets-manifest.json
Write-Host ("{0} fichiers, {1:N1} Mo au total -> assets-manifest.json" -f @($files).Count, ($total / 1MB))
