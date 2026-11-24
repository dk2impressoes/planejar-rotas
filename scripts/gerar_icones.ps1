# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
# Gera os ícones do app a partir de marca/icone-fonte.png (desenho sem alteração, só redimensionado).
#   site/icons/icon-512.png, icon-192.png, apple-touch-icon-180.png, favicon-16.png, favicon-32.png
#   site/icons/icon-maskable-512.png  desenho nos 80% do centro, fundo do ícone até as bordas
#   site/favicon.ico                  16, 32 e 48 px
# Com -Original <imagem>: antes, recorta o quadrado verde da imagem enviada (que tinha margem branca)
# e pinta só os cantos arredondados com o verde do próprio fundo, gravando marca/icone-fonte.png.
param([string]$Original = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging;
public static class IconeDk2 {
  static bool Escuro(Color c) { return c.R + c.G + c.B < 400; }
  // Recorta o quadrado verde e fecha os cantos arredondados com a cor do fundo da mesma linha.
  public static Bitmap Preparar(Bitmap s, out string info) {
    int W = s.Width, H = s.Height, meio = H / 2;
    int l = 0; while (!Escuro(s.GetPixel(l, meio))) l++;
    int r = W - 1; while (!Escuro(s.GetPixel(r, meio))) r--;
    int xt = l + (r - l) / 4;   // coluna sem desenho, fora dos cantos
    int t = 0; while (!Escuro(s.GetPixel(xt, t))) t++;
    int b = H - 1; while (!Escuro(s.GetPixel(xt, b))) b--;
    const int m = 2;           // tira a borda suavizada das laterais retas
    l += m; r -= m; t += m; b -= m;
    int w = r - l + 1, h = b - t + 1, lado = Math.Min(w, h);
    int x0 = l + (w - lado) / 2, y0 = t + (h - lado) / 2;
    // raio do canto: na primeira linha, onde começa o verde
    int raio = 0; while (!Escuro(s.GetPixel(x0 + raio, y0))) raio++;
    int caixa = raio + 12;
    Bitmap o = new Bitmap(lado, lado, PixelFormat.Format24bppRgb);
    for (int y = 0; y < lado; y++) for (int x = 0; x < lado; x++) o.SetPixel(x, y, s.GetPixel(x0 + x, y0 + y));
    int trocados = 0;
    for (int y = 0; y < lado; y++) {
      bool cima = y < caixa, baixo = y >= lado - caixa;
      if (!cima && !baixo) continue;
      Color fe = o.GetPixel(caixa + 4, y), fd = o.GetPixel(lado - 1 - caixa - 4, y);
      int cy = cima ? raio : lado - 1 - raio;
      for (int x = 0; x < caixa; x++) trocados += Fechar(o, x, y, fe, raio, raio, cy);
      for (int x = lado - caixa; x < lado; x++) trocados += Fechar(o, x, y, fd, raio, lado - 1 - raio, cy);
    }
    info = string.Format("quadrado {0}x{0} a partir de ({1},{2}); raio do canto {3}px; {4} pixels dos cantos pintados", lado, x0, y0, raio, trocados);
    return o;
  }
  // Pinta o que ficou fora da curva do canto (com 9 px de folga para a borda suavizada)
  // e qualquer resto claro dentro da caixa do canto.
  static int Fechar(Bitmap o, int x, int y, Color f, int raio, int cx, int cy) {
    bool fora = (x < cx) == (cx == raio) && (y < cy) == (cy == raio)
      && Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) > raio - 9;
    Color c = o.GetPixel(x, y);
    if (fora || c.R + c.G + c.B > f.R + f.G + f.B + 12) { o.SetPixel(x, y, f); return 1; }
    return 0;
  }
  public static Bitmap Redimensionar(Image s, int lado) {
    Bitmap b = new Bitmap(lado, lado, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(b)) {
      g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
      g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
      using (ImageAttributes a = new ImageAttributes()) {
        a.SetWrapMode(System.Drawing.Drawing2D.WrapMode.TileFlipXY);
        g.DrawImage(s, new Rectangle(0, 0, lado, lado), 0, 0, s.Width, s.Height, GraphicsUnit.Pixel, a);
      }
    }
    return b;
  }
  // Desenho reduzido aos 80% do centro; fora dele, a cor do fundo da borda do ícone (linha a linha).
  public static Bitmap Maskable(Image s, int lado) {
    int d = (int)Math.Round(lado * 0.8), p = (lado - d) / 2;
    Bitmap ic = Redimensionar(s, d);
    Bitmap b = new Bitmap(lado, lado, PixelFormat.Format32bppArgb);
    for (int y = 0; y < lado; y++) {
      int yi = Math.Max(0, Math.Min(d - 1, y - p));
      Color fe = ic.GetPixel(0, yi), fd = ic.GetPixel(d - 1, yi);
      for (int x = 0; x < lado; x++) {
        if (x >= p && x < p + d && y >= p && y < p + d) b.SetPixel(x, y, ic.GetPixel(x - p, y - p));
        else b.SetPixel(x, y, x < lado / 2 ? fe : fd);
      }
    }
    ic.Dispose();
    return b;
  }
}
'@

$raiz = Resolve-Path (Join-Path $PSScriptRoot '..')
$fonte = Join-Path $raiz 'marca\icone-fonte.png'
$icons = Join-Path $raiz 'site\icons'

if ($Original) {
  $orig = New-Object System.Drawing.Bitmap (Resolve-Path $Original).Path
  $info = ''
  $prep = [IconeDk2]::Preparar($orig, [ref]$info)
  $orig.Dispose()
  $prep.Save($fonte, [System.Drawing.Imaging.ImageFormat]::Png); $prep.Dispose()
  "Preparada: $info"
}

$src = [System.Drawing.Image]::FromFile($fonte)
"Fonte: $($src.Width) x $($src.Height) px"
function Salvar($bmp, $arquivo) {
  $destino = Join-Path $icons $arquivo
  $bmp.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  '{0,-28} {1,6:N1} KB' -f $arquivo, ((Get-Item $destino).Length / 1KB)
}
Salvar ([IconeDk2]::Redimensionar($src, 512)) 'icon-512.png'
Salvar ([IconeDk2]::Redimensionar($src, 192)) 'icon-192.png'
Salvar ([IconeDk2]::Redimensionar($src, 180)) 'apple-touch-icon-180.png'
Salvar ([IconeDk2]::Redimensionar($src, 32)) 'favicon-32.png'
Salvar ([IconeDk2]::Redimensionar($src, 16)) 'favicon-16.png'
Salvar ([IconeDk2]::Maskable($src, 512)) 'icon-maskable-512.png'

# favicon.ico com 16, 32 e 48 px (imagens PNG dentro do .ico)
$tamanhos = 16, 32, 48
$pngs = foreach ($t in $tamanhos) {
  $b = [IconeDk2]::Redimensionar($src, $t); $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); , $ms.ToArray()
}
$src.Dispose()
$ico = New-Object System.IO.MemoryStream; $w = New-Object System.IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$tamanhos.Count)
$offset = 6 + 16 * $tamanhos.Count
for ($k = 0; $k -lt $tamanhos.Count; $k++) {
  $w.Write([byte]$tamanhos[$k]); $w.Write([byte]$tamanhos[$k]); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$k].Length); $w.Write([uint32]$offset)
  $offset += $pngs[$k].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
$destIco = Join-Path $raiz 'site\favicon.ico'
[System.IO.File]::WriteAllBytes($destIco, $ico.ToArray())
'{0,-28} {1,6:N1} KB' -f 'favicon.ico (16, 32, 48)', ((Get-Item $destIco).Length / 1KB)
