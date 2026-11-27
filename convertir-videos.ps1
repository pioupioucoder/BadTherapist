# convertir-videos.ps1 - rend les mp4 de videos\ légers et rapides à démarrer (H.264 + AAC, 720p max, "faststart").
# Pourquoi : les mp4 téléchargés depuis YouTube sont souvent en VP9/AV1 (lourds à décoder -> ça rame / ça se fige)
# ou ont leur index en fin de fichier (le navigateur doit télécharger/chercher avant de démarrer).
# Nécessite ffmpeg (https://www.gyan.dev/ffmpeg/builds/ -> "release essentials", puis ajoute son dossier "bin" au PATH).
# À lancer depuis la racine du projet :   powershell -NoProfile -ExecutionPolicy Bypass -File convertir-videos.ps1
# ATTENTION : les fichiers sont REMPLACÉS. Fais une copie du dossier videos\ avant.
# Les vidéos déjà en H.264 <= 720p sont seulement "réarrangées" (très rapide, sans perte).

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Host 'ffmpeg / ffprobe introuvables : installe ffmpeg et ajoute son dossier bin au PATH, puis relance.'; exit
}
if (-not (Test-Path 'videos')) { Write-Host 'Lance ce script depuis la racine du projet (il doit y avoir un dossier videos).'; exit }

$files = @(Get-ChildItem -Path 'videos' -Recurse -Filter *.mp4 | Where-Object { $_.Name -notlike '*.tmp.mp4' })
$i = 0
foreach ($f in $files) {
    $i++
    $info = (& ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,height -of csv=p=0 -i $f.FullName) -split ','
    $codec = $info[0]; $h = 0; [void][int]::TryParse($info[1], [ref]$h)
    $tmp = Join-Path $f.DirectoryName ($f.BaseName + '.tmp.mp4')
    if ($codec -eq 'h264' -and $h -gt 0 -and $h -le 720) {
        $mode = 'remux (déjà H.264)'
        $ff = @('-y', '-v', 'error', '-i', $f.FullName, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', $tmp)
    } else {
        $mode = "conversion ($codec ${h}p -> H.264 720p)"
        $ff = @('-y', '-v', 'error', '-i', $f.FullName, '-vf', 'scale=-2:min(720\,ih)', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
                  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', $tmp)
    }
    Write-Host ("[{0}/{1}] {2} : {3}" -f $i, $files.Count, $f.Name, $mode)
    & ffmpeg @ff
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $tmp) -and (Get-Item -LiteralPath $tmp).Length -gt 0) {
        Move-Item -LiteralPath $tmp -Destination $f.FullName -Force
    } else {
        Write-Host "   ECHEC (fichier laissé tel quel) : $($f.FullName)"
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
    }
}
Write-Host 'Terminé. Vide le cache du navigateur (Ctrl+F5) avant de retester.'
