# Planejar Rotas — abre o app (chamado pelo atalho da Área de Trabalho e do menu Iniciar).
# 1) Se houver internet e o endereço do site estiver configurado, baixa a versão e os dados novos.
# 2) Liga o servidor local, se ainda não estiver ligado.
# 3) Abre o app numa janela própria.
param([switch]$SemAbrir)
$ErrorActionPreference = 'Stop'
$pasta = $PSScriptRoot
$app = Join-Path $pasta 'app'
$config = Get-Content (Join-Path $pasta 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$porta = [int]$config.porta
$url = "http://localhost:$porta/"
$registro = Join-Path $pasta 'atualizacao.log'

function Escrever-Registro($texto) {
  Add-Content -Path $registro -Value ("{0:yyyy-MM-dd HH:mm} {1}" -f (Get-Date), $texto) -Encoding UTF8
}

function Get-Sha256($caminho) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { -join ($sha.ComputeHash([IO.File]::ReadAllBytes($caminho)) | ForEach-Object { $_.ToString('x2') }) } finally { $sha.Dispose() }
}

# ---------- 1) Atualização a partir do site publicado ----------
function Update-App {
  $site = [string]$config.endereco_site
  if (-not $site) { return }
  $site = $site.TrimEnd('/') + '/'
  if ($site -notmatch '^https://') { Escrever-Registro 'endereço do site precisa começar com https://'; return }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $web = New-Object Net.WebClient
    $web.Headers.Add('User-Agent', 'PlanejarRotas-Windows')
    $manifestoTexto = $web.DownloadString($site + 'dados/manifesto.json')
    $manifesto = $manifestoTexto | ConvertFrom-Json
  } catch {
    Escrever-Registro "sem atualização agora (sem internet ou site fora do ar): $($_.Exception.Message)"
    return
  }
  $temp = Join-Path $env:TEMP ('planejar-rotas-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Force $temp | Out-Null
  $novos = @()
  try {
    foreach ($a in $manifesto.arquivos) {
      $local = Join-Path $app $a.caminho
      if ((Test-Path $local) -and ((Get-Sha256 $local) -eq $a.sha256)) { continue }
      $destTemp = Join-Path $temp $a.caminho
      New-Item -ItemType Directory -Force (Split-Path $destTemp) | Out-Null
      $web.DownloadFile($site + $a.caminho, $destTemp)
      # Só aceita arquivo íntegro: o código de verificação tem de bater com o manifesto.
      if ((Get-Sha256 $destTemp) -ne $a.sha256) { throw "arquivo corrompido: $($a.caminho)" }
      $novos += $a.caminho
    }
    $web.DownloadFile($site + 'sw.js', (Join-Path $temp 'sw.js'))
    # Tudo conferido: troca de uma vez (nunca mistura versões).
    foreach ($c in $novos) {
      $dest = Join-Path $app $c
      New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
      Copy-Item (Join-Path $temp $c) $dest -Force
    }
    Copy-Item (Join-Path $temp 'sw.js') (Join-Path $app 'sw.js') -Force
    [IO.File]::WriteAllText((Join-Path $app 'dados\manifesto.json'), $manifestoTexto, (New-Object Text.UTF8Encoding($false)))
    Escrever-Registro ("atualizado: {0} arquivo(s) novos, conjunto {1}" -f $novos.Count, $manifesto.versao_conjunto)
  } catch {
    Escrever-Registro "atualização cancelada, nada foi trocado: $($_.Exception.Message)"
  } finally {
    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
  }
}

# ---------- 2) Servidor local ----------
function Test-Servidor {
  try { (Invoke-WebRequest -UseBasicParsing -Uri ($url + '__planejar-rotas') -TimeoutSec 2).Content -eq 'ok' } catch { $false }
}

Update-App
if (-not (Test-Servidor)) {
  Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $pasta 'servidor.ps1')`"", '-Raiz', "`"$app`"", '-Porta', $porta)
  for ($i = 0; $i -lt 30 -and -not (Test-Servidor); $i++) { Start-Sleep -Milliseconds 300 }
}

# ---------- 3) Abre o app ----------
if ($SemAbrir) { return }
$navegadores = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ }
if ($navegadores) {
  Start-Process -FilePath $navegadores[0] -ArgumentList "--app=$url"   # janela própria, sem barra de endereço
} else {
  Start-Process $url                                                    # navegador padrão
}
