# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
# Planejar Rotas — servidor local (só neste computador: http://localhost:PORTA/).
# Iniciado escondido pelo atalho. Não precisa de administrador nem de nada instalado além do Windows.
param(
  [Parameter(Mandatory = $true)][string]$Raiz,
  [int]$Porta = 47800
)
$Raiz = (Resolve-Path $Raiz).Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.geojson' = 'application/geo+json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
}
$ouvinte = New-Object System.Net.HttpListener
$ouvinte.Prefixes.Add("http://localhost:$Porta/")
try { $ouvinte.Start() } catch { exit 1 }   # porta em uso: outro servidor do app já está rodando
while ($ouvinte.IsListening) {
  $ctx = $ouvinte.GetContext()
  $resp = $ctx.Response
  try {
    $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($caminho -eq '/__planejar-rotas') {
      $bytes = [Text.Encoding]::UTF8.GetBytes('ok')
    } else {
      if ($caminho.EndsWith('/')) { $caminho += 'index.html' }
      $arquivo = [IO.Path]::GetFullPath((Join-Path $Raiz $caminho.TrimStart('/')))
      if (-not $arquivo.StartsWith($Raiz) -or -not (Test-Path $arquivo -PathType Leaf)) {
        $resp.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('404')
      } else {
        $ext = [IO.Path]::GetExtension($arquivo).ToLower()
        $resp.ContentType = $(if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' })
        $resp.Headers.Add('X-Content-Type-Options', 'nosniff')
        $resp.Headers.Add('Cache-Control', 'no-cache')
        $bytes = [IO.File]::ReadAllBytes($arquivo)
      }
    }
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $resp.StatusCode = 500
  } finally {
    $resp.OutputStream.Close()
  }
}
