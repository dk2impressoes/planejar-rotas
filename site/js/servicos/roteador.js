// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Adaptador Roteador (Seção 9.1/9.2): OSRM (FOSSGIS) e Valhalla (FOSSGIS) como reserva. Sem chave.
import { consultarJSON, disjuntorAberto, ErroServico } from './http.js';
import { distanciaM } from '../dominio/geo.js';

export const SERVICOS_ROTA = {
  osrm: { nome: 'OSRM (FOSSGIS)', url: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' },
  valhalla: { nome: 'Valhalla (FOSSGIS)', url: 'https://valhalla1.openstreetmap.de/route' },
};

const r5 = (n) => Math.round(n * 1e5) / 1e5;

// Reduz pontos (mínimo de ~80 m entre pontos) e arredonda, para caber no armazenamento e na exportação.
function simplificar(amostras, minM = 80) {
  const out = [];
  for (const a of amostras) {
    const ult = out[out.length - 1];
    if (!ult || ult.via !== a.via || distanciaM(ult.c, a.c) >= minM) out.push({ c: [r5(a.c[0]), r5(a.c[1])], dt: Math.round(a.dt), via: a.via });
  }
  const fim = amostras[amostras.length - 1];
  if (fim && out[out.length - 1] !== fim) out.push({ c: [r5(fim.c[0]), r5(fim.c[1])], dt: Math.round(fim.dt), via: fim.via });
  return out;
}

// Distribui o tempo de um pedaço entre os pontos, proporcional à distância.
function comTempos(coords, t0, duracao, via) {
  const dist = [0];
  for (let i = 1; i < coords.length; i++) dist.push(dist[i - 1] + distanciaM(coords[i - 1], coords[i]));
  const total = dist[dist.length - 1] || 1;
  return coords.map((c, i) => ({ c, dt: t0 + (duracao * dist[i]) / total, via }));
}

function viaDe(nome, ref) {
  return [ref, nome].filter(Boolean).join('; ');
}

async function osrm(pontos, sinal) {
  const coords = pontos.map((p) => `${p.lon},${p.lat}`).join(';');
  // Rotas alternativas só existem sem paradas intermediárias (limite do OSRM).
  const alt = pontos.length === 2 ? '3' : 'false';
  const url = `${SERVICOS_ROTA.osrm.url}${coords}?overview=false&steps=true&geometries=geojson&alternatives=${alt}`;
  const j = await consultarJSON('osrm', url, { sinal });
  if (j.code !== 'Ok' || !j.routes?.length) throw new ErroServico('sem_rota', 'OSRM não encontrou rota.');
  return j.routes.slice(0, 3).map(legsOsrm);
}

function legsOsrm(rota) {
  return rota.legs.map((leg) => {
    let t = 0;
    const amostras = [];
    for (const s of leg.steps) {
      amostras.push(...comTempos(s.geometry.coordinates, t, s.duration, viaDe(s.name, s.ref)));
      t += s.duration;
    }
    return { km: leg.distance / 1000, duracao_s: leg.duration, amostras: simplificar(amostras) };
  });
}

function decodificarPolyline6(str) {
  const out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const eixo of [0, 1]) {
      let res = 0, shift = 0, b;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (eixo === 0) lat += d; else lon += d;
    }
    out.push([lon / 1e6, lat / 1e6]);
  }
  return out;
}

async function valhalla(pontos, sinal) {
  const corpo = { locations: pontos.map((p) => ({ lat: p.lat, lon: p.lon, type: 'break' })), costing: 'auto', units: 'kilometers', directions_options: { language: 'pt-BR' } };
  const url = `${SERVICOS_ROTA.valhalla.url}?json=${encodeURIComponent(JSON.stringify(corpo))}`;
  const j = await consultarJSON('valhalla', url, { sinal });
  if (!j.trip?.legs?.length) throw new ErroServico('sem_rota', 'Valhalla não encontrou rota.');
  return [j.trip.legs.map((leg) => {
    const shape = decodificarPolyline6(leg.shape);
    const amostras = [];
    let t = 0;
    for (const m of leg.maneuvers) {
      const pedaco = shape.slice(m.begin_shape_index, m.end_shape_index + 1);
      if (pedaco.length) amostras.push(...comTempos(pedaco, t, m.time, (m.street_names || []).join('; ')));
      t += m.time;
    }
    return { km: leg.summary.length, duracao_s: leg.summary.time, amostras: simplificar(amostras) };
  })];
}

/**
 * Calcula a rota de um sentido. Resposta padronizada (Seção 9.1).
 * Tenta OSRM e depois Valhalla; a rota salva e a entrada manual são tratadas no núcleo (calculo.js).
 */
export async function calcularRota(pontos, { sinal } = {}) {
  const tentativas = [];
  for (const [id, fn] of [['osrm', osrm], ['valhalla', valhalla]]) {
    if (disjuntorAberto(id)) { tentativas.push(`${SERVICOS_ROTA[id].nome}: pausado`); continue; }
    try {
      const opcoes = await fn(pontos, sinal);
      const agora = new Date().toISOString();
      return { status: 'ok', dados: { legs: opcoes[0], alternativas: opcoes }, fonte: SERVICOS_ROTA[id].nome, obtido_em: agora, valido_ate: null, desatualizado: false, confianca: 'estimado', codigo_erro: null };
    } catch (e) {
      if (e.codigo === 'cancelado') throw e;
      tentativas.push(`${SERVICOS_ROTA[id].nome}: ${e.message}`);
    }
  }
  return {
    status: 'erro', dados: null, fonte: null, obtido_em: new Date().toISOString(), desatualizado: true, confianca: null,
    codigo_erro: 'todos_falharam', tentativas,
    mensagem: 'Não foi possível calcular a rota agora. Tente novamente em alguns minutos ou informe a distância manualmente.',
  };
}
