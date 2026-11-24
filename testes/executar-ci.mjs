// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Roda os testes de unidade em um Chromium sem tela (GitHub Actions).
// Uso: node testes/executar-ci.mjs  (requer: npm i -D playwright@1.47.2 && npx playwright install chromium)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const raiz = normalize(join(import.meta.dirname, '..'));
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.geojson': 'application/geo+json', '.css': 'text/css' };
const servidor = createServer(async (req, res) => {
  const caminho = normalize(join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!caminho.startsWith(raiz)) { res.writeHead(403).end(); return; }
  try {
    const arq = caminho.endsWith('\\') || caminho.endsWith('/') ? join(caminho, 'index.html') : caminho;
    res.writeHead(200, { 'Content-Type': tipos[extname(arq)] || 'application/octet-stream' }).end(await readFile(arq));
  } catch { res.writeHead(404).end(); }
}).listen(8099);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ timezoneId: 'America/Sao_Paulo' });
await pagina.goto('http://localhost:8099/testes/unidade/');
const r = await pagina.waitForFunction(() => window.resultadoTestes, null, { timeout: 30000 }).then((h) => h.jsonValue());
await navegador.close();
servidor.close();
console.log(`${r.ok} de ${r.total} testes passaram.`);
for (const f of r.falhas) console.log(`✖ ${f.nome}: ${f.erro}`);
process.exit(r.falhas.length ? 1 : 0);
