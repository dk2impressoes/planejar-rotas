// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Adaptador Buscador (Seção 9.4): Photon para autocompletar; Nominatim só no botão "Buscar".
import { consultarJSON } from './http.js';
import { fusoDaUF } from '../dominio/tempo.js';

const UF_POR_NOME = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF',
  'espírito santo': 'ES', 'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR', 'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
};

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const UF_SEM_ACENTO = Object.fromEntries(Object.entries(UF_POR_NOME).map(([k, v]) => [semAcento(k), v]));

/** Sigla da UF pelo nome do estado ("São Paulo", "Sao Paulo", "Estado de São Paulo"). */
export function ufPorNome(nome) {
  const t = semAcento(nome).replace(/^estado d[aeo] /, '');
  return UF_SEM_ACENTO[t] || null;
}

function lugar({ nome, cidade, uf, lat, lon, precisao, servico }) {
  const partes = [nome, cidade && cidade !== nome ? cidade : null].filter(Boolean).join(', ');
  return { nome: nome || cidade || 'Local', cidade: cidade || '', uf: uf || '', lat, lon, fuso: fusoDaUF(uf), precisao, servico, rotulo: uf ? `${partes} — ${uf}` : partes };
}

export function dePhoton(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  // O próprio estado (ex.: "São Paulo" o estado) vem sem o campo "state": a sigla sai do nome,
  // e o rótulo deixa claro que não é a cidade.
  if (p.type === 'state' || p.osm_value === 'state') {
    const uf = ufPorNome(p.name);
    return { ...lugar({ nome: `Estado de ${p.name}`, cidade: '', uf, lat, lon, precisao: 'state', servico: 'Photon' }), estado: true,
      rotulo: `Estado de ${p.name} (o estado inteiro, não a cidade)${uf ? ` — ${uf}` : ''}` };
  }
  // Uma cidade vem sem "city" (ela é a cidade): o nome é a cidade.
  const ehCidade = ['city', 'town', 'village', 'municipality'].includes(p.osm_value) || p.type === 'city';
  return lugar({ nome: p.name || p.street, cidade: p.city || p.town || p.village || (ehCidade ? p.name : '') || p.county || '', uf: ufPorNome(p.state), lat, lon, precisao: p.osm_value || p.type || '', servico: 'Photon' });
}

/** Autocompletar a partir de 3 caracteres (a espera de 300 ms fica na interface). */
export async function autocompletar(texto, { sinal } = {}) {
  const q = texto.trim();
  if (q.length < 3) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&bbox=-74.1,-33.9,-28.6,5.4`;
  const j = await consultarJSON('photon', url, { sinal });
  const lista = semRepetidos((j.features || []).filter((f) => (f.properties?.countrycode || '').toUpperCase() === 'BR').map(dePhoton));
  // O estado inteiro vai para o fim: quase sempre a pessoa quer a cidade de mesmo nome.
  return [...lista.filter((l) => !l.estado), ...lista.filter((l) => l.estado)];
}

// Resultados com o mesmo rótulo (ex.: trechos da mesma avenida) aparecem uma vez só.
function semRepetidos(lista) {
  const vistos = new Set();
  return lista.filter((l) => !vistos.has(l.rotulo) && vistos.add(l.rotulo));
}

/** Busca completa, só quando o usuário toca em "Buscar" (política do Nominatim). */
export async function buscar(texto, { sinal } = {}) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=8&accept-language=pt-BR&q=${encodeURIComponent(texto.trim())}`;
  const j = await consultarJSON('nominatim', url, { sinal });
  return semRepetidos((j || []).map((r) => {
    const a = r.address || {};
    const iso = a['ISO3166-2-lvl4'] || '';
    if (r.addresstype === 'state') {
      const uf = iso.startsWith('BR-') ? iso.slice(3) : ufPorNome(r.name);
      return { ...lugar({ nome: `Estado de ${r.name}`, cidade: '', uf, lat: Number(r.lat), lon: Number(r.lon), precisao: 'state', servico: 'Nominatim' }), estado: true,
        rotulo: `Estado de ${r.name} (o estado inteiro, não a cidade)${uf ? ` — ${uf}` : ''}` };
    }
    return lugar({
      nome: r.name || a.road || a.city || a.town, cidade: a.city || a.town || a.village || a.municipality || '',
      uf: iso.startsWith('BR-') ? iso.slice(3) : ufPorNome(a.state), lat: Number(r.lat), lon: Number(r.lon),
      precisao: r.type || '', servico: 'Nominatim',
    });
  }));
}

/** Endereço de uma coordenada (geolocalização e sugestão de abastecimento). */
export async function reverso(lat, lon, { sinal } = {}) {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`;
  const j = await consultarJSON('photon', url, { sinal });
  const f = (j.features || [])[0];
  return f ? { ...dePhoton(f), lat, lon } : null;
}

/** Nomes iguais em UFs diferentes exigem que o usuário escolha (Seção 2, tela 2). */
export function temNomeRepetido(resultados) {
  const porNome = new Map();
  for (const r of resultados) {
    const k = (r.cidade || r.nome).toLowerCase();
    if (!porNome.has(k)) porNome.set(k, new Set());
    porNome.get(k).add(r.uf);
  }
  return [...porNome.values()].some((s) => s.size > 1);
}
