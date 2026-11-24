# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
# Planejar Rotas — instalador para Windows (sem administrador).
# Copia o app para a pasta do usuário, cria os atalhos e abre o app.
param(
  [string]$Destino = (Join-Path $env:LOCALAPPDATA 'PlanejarRotas'),
  [switch]$SemAtalhos,
  [switch]$SemAbrir
)
$ErrorActionPreference = 'Stop'
$origem = $PSScriptRoot
Write-Host ''
Write-Host '  Planejar Rotas com Checklist - instalação' -ForegroundColor Cyan
Write-Host '  ----------------------------------------'

if (-not (Test-Path (Join-Path $origem 'app\index.html'))) { throw 'Pasta "app" não encontrada ao lado do instalador. Extraia o arquivo .zip inteiro antes de instalar.' }

# Para o servidor antigo, se estiver rodando (atualização por cima).
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$Destino*servidor.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Force $Destino | Out-Null
# App: troca a pasta inteira (os dados da viagem ficam no navegador, não aqui, e não são apagados).
$appDestino = Join-Path $Destino 'app'
if (Test-Path $appDestino) { Remove-Item -Recurse -Force $appDestino }
Copy-Item (Join-Path $origem 'app') $appDestino -Recurse
foreach ($f in 'servidor.ps1', 'iniciar.ps1', 'desinstalar.ps1', 'Desinstalar.cmd', 'planejar-rotas.ico', 'LEIA-ME.txt') {
  Copy-Item (Join-Path $origem $f) (Join-Path $Destino $f) -Force
}
# Configuração: mantém a existente (endereço do site já informado não se perde).
$cfg = Join-Path $Destino 'config.json'
if (-not (Test-Path $cfg)) { Copy-Item (Join-Path $origem 'config.json') $cfg }
Write-Host "  App copiado para: $Destino"

if (-not $SemAtalhos) {
  $shell = New-Object -ComObject WScript.Shell
  $alvo = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $argumentos = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $Destino 'iniciar.ps1')`""
  $locais = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Planejar Rotas.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Planejar Rotas.lnk')
  )
  foreach ($lnk in $locais) {
    $a = $shell.CreateShortcut($lnk)
    $a.TargetPath = $alvo
    $a.Arguments = $argumentos
    $a.WorkingDirectory = $Destino
    $a.IconLocation = Join-Path $Destino 'planejar-rotas.ico'
    $a.Description = 'Planejar Rotas com Checklist'
    $a.WindowStyle = 7
    $a.Save()
  }
  Write-Host '  Atalhos criados: Área de Trabalho e menu Iniciar ("Planejar Rotas").'
}

Write-Host ''
Write-Host '  Pronto! Para abrir, use o atalho "Planejar Rotas".' -ForegroundColor Green
Write-Host '  Para atualizar sozinho pela internet, coloque o endereço do site em:'
Write-Host "  $cfg  (campo endereco_site)."
if (-not $SemAbrir) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Destino 'iniciar.ps1')
}
