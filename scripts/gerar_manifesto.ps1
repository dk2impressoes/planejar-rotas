# © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
# Gera site/dados/manifesto.json (versão, tamanho e SHA-256 de cada arquivo publicado).
# Equivalente local de scripts/gerar_manifesto.py, para máquinas sem Python.
param([string]$Site = (Join-Path $PSScriptRoot '..\site'))
$Site = (Resolve-Path $Site).Path
$sha = [System.Security.Cryptography.SHA256]::Create()
$arquivos = @()
$hashDados = ''
Get-ChildItem -Path $Site -Recurse -File | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($Site.Length + 1).Replace('\', '/')
  if ($rel -eq 'dados/manifesto.json' -or $rel -eq 'sw.js' -or $rel.StartsWith('.well-known/')) { return }
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  $h = -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
  $tipo = if ($rel.StartsWith('dados/') -or $rel.StartsWith('esquemas/')) { 'dados' } else { 'app' }
  $item = [ordered]@{ caminho = $rel; tipo = $tipo; tamanho = $bytes.Length; sha256 = $h }
  if ($rel.StartsWith('dados/')) {
    $nome = [System.IO.Path]::GetFileNameWithoutExtension($rel)
    $item.esquema = "esquemas/$nome.schema.json"
    $hashDados += $h
  }
  $arquivos += $item
}
$hashApp = -join ($arquivos | Where-Object { $_.tipo -eq 'app' } | ForEach-Object { $_.sha256 })
$build = -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hashApp)) | Select-Object -First 6 | ForEach-Object { $_.ToString('x2') })
$cacheApp = "app-v13.0.0-$build"
$swArq = Join-Path $Site 'sw.js'
$sw = [System.IO.File]::ReadAllText($swArq) -replace "const CACHE = '[^']*';", "const CACHE = '$cacheApp';"
[System.IO.File]::WriteAllText($swArq, $sw, (New-Object System.Text.UTF8Encoding($false)))
$conjunto = -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hashDados)) | Select-Object -First 6 | ForEach-Object { $_.ToString('x2') })
$manifesto = [ordered]@{
  versao_app = '13.0.0'
  versao_conjunto = "$(Get-Date -Format 'yyyy.MM.dd')-$conjunto"
  cache_app = $cacheApp
  gerado_em = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  arquivos = $arquivos
}
$json = $manifesto | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $Site 'dados\manifesto.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Manifesto: $($arquivos.Count) arquivos, conjunto $($manifesto.versao_conjunto)"
