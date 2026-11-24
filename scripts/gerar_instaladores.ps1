# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
# Gera os pacotes para entregar (pasta dist/), com nomes fáceis de reconhecer por quem não é da área:
#   "Planejar Rotas - INSTALAR no Windows.exe"                          instalador de um arquivo só
#   "Planejar Rotas - INSTALAR no Windows (se o exe for bloqueado).zip" mesmo instalador, em .zip
#   "Planejar Rotas - Guia como manter online.pdf"                      guia simples (docs/como-manter-online.html)
#   PlanejarRotas-Repositorio.zip                                       projeto completo para publicar no GitHub
# e copia os instaladores para site/baixar/ (página "Baixar e instalar" do app; fora do cache offline).
$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $raiz 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
# Limpa o que for possível (uma pasta aberta no Explorer não impede a geração).
Get-ChildItem $dist | ForEach-Object { try { Remove-Item -Recurse -Force $_.FullName -ErrorAction Stop } catch { } }
$utf8Bom = New-Object Text.UTF8Encoding($true)
$nomeExe = 'Planejar Rotas - INSTALAR no Windows.exe'
$nomeZip = 'Planejar Rotas - INSTALAR no Windows (se o exe for bloqueado).zip'
$nomePdf = 'Planejar Rotas - Guia como manter online.pdf'

# 1) Manifesto atualizado (versão do cache e códigos de verificação).
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'gerar_manifesto.ps1')

# 2) Ícone .ico (PNG de 256 px dentro do .ico, aceito pelo Windows Vista em diante).
Add-Type -AssemblyName System.Drawing
$png = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($png)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage([System.Drawing.Image]::FromFile((Join-Path $raiz 'site\icons\icon-512.png')), 0, 0, 256, 256)
$ms = New-Object IO.MemoryStream
$png.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bytesPng = $ms.ToArray()
$ico = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)                  # cabeçalho: 1 imagem
$w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0)     # 256x256, sem paleta
$w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$bytesPng.Length); $w.Write([uint32]22)
$w.Write($bytesPng); $w.Flush()

# 3) Pacote Windows.
$win = Join-Path $env:TEMP ('pr-windows-' + [guid]::NewGuid())   # montado fora de dist/ e apagado no fim
New-Item -ItemType Directory -Force $win | Out-Null
foreach ($f in Get-ChildItem (Join-Path $raiz 'instalador-windows') -File) {
  if ($f.Extension -eq '.ps1') {
    [IO.File]::WriteAllText((Join-Path $win $f.Name), [IO.File]::ReadAllText($f.FullName), $utf8Bom)  # PowerShell 5.1 precisa de BOM
  } elseif ($f.Name -eq 'Instalar.cmd') {
    Copy-Item $f.FullName (Join-Path $win 'INSTALAR (clique duas vezes).cmd')   # o que o leigo procura
  } else {
    Copy-Item $f.FullName $win
  }
}
[IO.File]::WriteAllBytes((Join-Path $win 'planejar-rotas.ico'), $ico.ToArray())
Copy-Item (Join-Path $raiz 'site') (Join-Path $win 'app') -Recurse
Remove-Item -Recurse -Force (Join-Path $win 'app\baixar') -ErrorAction SilentlyContinue   # instaladores não vão dentro do instalador

# 4) PDF "Como manter online" (Edge sem janela imprime o HTML em PDF).
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$pdf = Join-Path $dist $nomePdf
$html = (Join-Path $raiz 'docs\como-manter-online.html')
$perfil = Join-Path $env:TEMP ('pr-edge-' + [guid]::NewGuid())
& $edge --headless=new --disable-gpu --no-pdf-header-footer "--user-data-dir=$perfil" "--print-to-pdf=$pdf" ("file:///" + $html.Replace('\', '/')) | Out-Null
for ($i = 0; $i -lt 40 -and -not (Test-Path $pdf); $i++) { Start-Sleep -Milliseconds 500 }
Remove-Item -Recurse -Force $perfil -ErrorAction SilentlyContinue
if (-not (Test-Path $pdf)) { throw 'PDF não foi gerado.' }
Copy-Item $pdf $win

Compress-Archive -Path (Join-Path $win '*') -DestinationPath (Join-Path $dist $nomeZip) -Force

# 4b) Instalador .exe: o mesmo pacote embutido num programa (compilador C# que já vem no Windows).
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pacote = Join-Path $env:TEMP ('pr-pacote-' + [guid]::NewGuid() + '.zip')
[IO.Compression.ZipFile]::CreateFromDirectory($win, $pacote)
$icoTemp = Join-Path $win 'planejar-rotas.ico'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$exe = Join-Path $dist $nomeExe
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$exe" "/win32icon:$icoTemp" "/resource:$pacote,pacote.zip" `
  /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll `
  (Join-Path $raiz 'instalador-exe\Instalador.cs')
Remove-Item $pacote -Force
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) { throw 'O instalador .exe não foi gerado.' }
Remove-Item -Recurse -Force $win

# 4c) Cópias para o site (página "Baixar e instalar"): endereços simples; o nome amigável vem no download.
$baixar = Join-Path $raiz 'site\baixar'
New-Item -ItemType Directory -Force $baixar | Out-Null
Copy-Item $exe (Join-Path $baixar 'planejar-rotas-windows.exe') -Force
Copy-Item (Join-Path $dist $nomeZip) (Join-Path $baixar 'planejar-rotas-windows.zip') -Force
Copy-Item $pdf (Join-Path $baixar 'planejar-rotas-guia.pdf') -Force

# 5) Repositório completo para publicar (sem pastas locais e sem avisos temporários).
$repo = Join-Path $dist 'repositorio'
New-Item -ItemType Directory -Force $repo | Out-Null
foreach ($item in Get-ChildItem $raiz -Force) {
  if ($item.Name -in @('dist', '.claude', '__pycache__')) { continue }
  Copy-Item $item.FullName (Join-Path $repo $item.Name) -Recurse -Force
}
Get-ChildItem $repo -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Remove-Item (Join-Path $repo 'dados-estado\avisos.md') -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $repo '*') -DestinationPath (Join-Path $dist 'PlanejarRotas-Repositorio.zip') -Force
Remove-Item -Recurse -Force $repo

Get-ChildItem $dist -File | ForEach-Object { "{0,-66} {1,8:N0} KB" -f $_.Name, ($_.Length / 1KB) }
