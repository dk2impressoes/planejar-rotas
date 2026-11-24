# Planejar Rotas — remove o app deste computador (atalhos, servidor e pasta do programa).
# As viagens salvas ficam no navegador; para apagá-las, use antes "Menu > Salvar cópia, abrir cópia ou apagar tudo".
$pasta = $PSScriptRoot
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$pasta*servidor.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($lnk in @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Planejar Rotas.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Planejar Rotas.lnk'))) {
  Remove-Item $lnk -Force -ErrorAction SilentlyContinue
}
# Item em "Aplicativos instalados" (criado pelo instalador .exe), só se apontar para esta pasta.
$chave = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PlanejarRotas'
$reg = Get-ItemProperty $chave -ErrorAction SilentlyContinue
if ($reg -and $reg.InstallLocation -eq $pasta) { Remove-Item $chave -Force -ErrorAction SilentlyContinue }
Write-Host 'Planejar Rotas removido. Esta janela pode ser fechada.'
# A própria pasta é apagada depois que este script termina.
Start-Process -WindowStyle Hidden cmd.exe -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q `"$pasta`""
