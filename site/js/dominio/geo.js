// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Geometria simples em coordenadas [lon, lat].

const R = 6371008.8;
const rad = (g) => (g * Math.PI) / 180;

export function distanciaM(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Rumo de a para b, em graus (0 = norte, 90 = leste).
export function rumo(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function diferencaAngular(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Distância de um ponto p ao segmento ab (projeção local, adequada para centenas de metros).
export function distanciaAoSegmentoM(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111320;
  const ky = 110540;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : -(ax * dx + ay * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

// Ponto dentro de polígono (anel externo e buracos), regra par-ímpar. Pontos sobre a borda contam como dentro.
export function pontoNoPoligono(p, aneis) {
  let dentro = false;
  for (let k = 0; k < aneis.length; k++) {
    const anel = aneis[k];
    let noAnel = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i], [xj, yj] = anel[j];
      if (distanciaAoSegmentoM(p, anel[i], anel[j]) < 1) return true;
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) noAnel = !noAnel;
    }
    if (k === 0) dentro = noAnel;
    else if (noAnel) dentro = false;
  }
  return dentro;
}

export function pontoNaArea(p, geojson) {
  const feats = geojson?.type === 'FeatureCollection' ? geojson.features : [geojson];
  for (const f of feats) {
    const g = f?.geometry || f;
    if (!g) continue;
    if (g.type === 'Polygon' && pontoNoPoligono(p, g.coordinates)) return true;
    if (g.type === 'MultiPolygon' && g.coordinates.some((poli) => pontoNoPoligono(p, poli))) return true;
  }
  return false;
}

// Distâncias acumuladas da geometria, em km, ajustadas ao km oficial do trecho (a geometria simplificada
// é um pouco mais curta que a distância informada pelo serviço de rota).
function acumulado(amostras, kmTrecho) {
  const acc = [0];
  for (let i = 1; i < amostras.length; i++) acc.push(acc[i - 1] + distanciaM(amostras[i - 1].c, amostras[i].c) / 1000);
  const total = acc[acc.length - 1] || 0;
  const escala = total > 0 && kmTrecho > 0 ? kmTrecho / total : 1;
  return acc.map((x) => x * escala);
}

/** Ponto da geometria a `kmAlvo` km do início do trecho: { c: [lon, lat] | null, dt (s desde a saída do trecho) }. */
export function pontoNoPercurso(amostras, kmTrecho, duracaoS, kmAlvo) {
  if (!amostras?.length) return { c: null, dt: kmTrecho > 0 ? (duracaoS * kmAlvo) / kmTrecho : 0 };
  const acc = acumulado(amostras, kmTrecho);
  const i = acc.findIndex((x) => x >= kmAlvo);
  const a = amostras[i >= 0 ? i : amostras.length - 1];
  return { c: a.c, dt: a.dt ?? 0 };
}

/**
 * Onde a pessoa está no caminho (para registrar um abastecimento pelo GPS).
 * trechos: [{ amostras, km }]. Retorna { trecho (índice), kmNoTrecho, distanciaM } do ponto mais próximo.
 */
export function localizarNaRota(trechos, coord) {
  let melhor = null;
  trechos.forEach((t, ti) => {
    if (!t.amostras?.length) return;
    const acc = acumulado(t.amostras, t.km);
    for (let i = 0; i < t.amostras.length; i++) {
      const d = distanciaM(coord, t.amostras[i].c);
      if (!melhor || d < melhor.distanciaM) melhor = { trecho: ti, kmNoTrecho: acc[i], distanciaM: d };
    }
  });
  return melhor;
}

// Chave de ~1 km para guardar a cidade descoberta de um ponto.
export const chavePonto = (c) => (c ? `${c[1].toFixed(2)},${c[0].toFixed(2)}` : null);

// Densifica uma linha para que nenhum segmento passe de maxM metros (necessário para o teste de área).
export function densificar(amostras, maxM = 200) {
  const out = [];
  for (let i = 0; i < amostras.length; i++) {
    const a = amostras[i];
    out.push(a);
    const b = amostras[i + 1];
    if (!b) break;
    const d = distanciaM(a.c, b.c);
    const n = Math.floor(d / maxM);
    for (let k = 1; k <= n; k++) {
      const f = k / (n + 1);
      out.push({
        c: [a.c[0] + (b.c[0] - a.c[0]) * f, a.c[1] + (b.c[1] - a.c[1]) * f],
        t: a.t + (b.t - a.t) * f,
        via: a.via,
      });
    }
  }
  return out;
}
