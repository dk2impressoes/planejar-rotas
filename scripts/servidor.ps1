# © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
# Servidor estático local para desenvolvimento (localhost conta como contexto seguro para Service Worker).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\servidor.ps1 [-Porta 8080]
# App em http://localhost:8080/site/  ·  Testes em http://localhost:8080/testes/unidade/
param([int]$Porta = 8080)
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.geojson' = 'application/geo+json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.md' = 'text/plain; charset=utf-8'
}
$ouvinte = New-Object System.Net.HttpListener
$ouvinte.Prefixes.Add("http://localhost:$Porta/")
$ouvinte.Start()
Write-Output "Servindo $raiz em http://localhost:$Porta/"
while ($ouvinte.IsListening) {
  $ctx = $ouvinte.GetContext()
  $resp = $ctx.Response
  try {
    $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($caminho.EndsWith('/')) { $caminho += 'index.html' }
    $arquivo = [System.IO.Path]::GetFullPath((Join-Path $raiz $caminho.TrimStart('/')))
    if (-not $arquivo.StartsWith($raiz) -or -not (Test-Path $arquivo -PathType Leaf)) {
      $resp.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('404')
    } else {
      $ext = [System.IO.Path]::GetExtension($arquivo).ToLower()
      $resp.ContentType = $(if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' })
      $resp.Headers.Add('X-Content-Type-Options', 'nosniff')
      $resp.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($arquivo)
    }
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $resp.StatusCode = 500
  } finally {
    $resp.OutputStream.Close()
  }
}
