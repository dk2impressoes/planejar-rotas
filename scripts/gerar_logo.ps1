# © 2026 Grupo DK² — Planejar Rotas com Checklist
# Gera a abertura e os ícones do app a partir da logo do Grupo DK² (marca/logo-grupo-dk2.jpg).
#   site/icons/abertura-dk2.jpg      logo inteira com o lema (tela de abertura e "Sobre")
#   site/icons/icon-512.png, icon-192.png, apple-touch-icon-180.png   medalhão
#   site/icons/icon-maskable-512.png medalhão com margem de segurança (Android recorta em círculo)
param([string]$Logo = (Join-Path $PSScriptRoot '..\marca\logo-grupo-dk2.jpg'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$saida = Join-Path $PSScriptRoot '..\site\icons'
$src = [System.Drawing.Image]::FromFile((Resolve-Path $Logo))

function Salvar-Recorte($recorte, $largura, $altura, $arquivo, $fundo = [System.Drawing.Color]::White, $escala = 1.0, $formato = 'png') {
  $bmp = New-Object System.Drawing.Bitmap $largura, $altura
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear($fundo)
  $w = [int]($largura * $escala); $h = [int]($altura * $escala)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle ([int](($largura - $w) / 2)), ([int](($altura - $h) / 2)), $w, $h), $recorte, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $destino = Join-Path $saida $arquivo
  if ($formato -eq 'jpg') {
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    $p = New-Object System.Drawing.Imaging.EncoderParameters 1
    $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
    $bmp.Save($destino, $codec, $p)
  } else { $bmp.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
  '{0,-28} {1,6:N0} KB' -f $arquivo, ((Get-Item $destino).Length / 1KB)
}

# Proporções medidas na logo original (1376 x 768): medalhão e logo com o lema.
$k = $src.Width / 1376
$medalhao = New-Object System.Drawing.Rectangle ([int](377 * $k)), ([int](13 * $k)), ([int](620 * $k)), ([int](620 * $k))
$inteira = New-Object System.Drawing.Rectangle ([int](368 * $k)), ([int](8 * $k)), ([int](640 * $k)), ([int](716 * $k))

Salvar-Recorte $inteira 480 537 'abertura-dk2.jpg' -formato 'jpg'
Salvar-Recorte $medalhao 512 512 'icon-512.png'
Salvar-Recorte $medalhao 192 192 'icon-192.png'
Salvar-Recorte $medalhao 180 180 'apple-touch-icon-180.png'
Salvar-Recorte $medalhao 512 512 'icon-maskable-512.png' -escala 0.78
$src.Dispose()
