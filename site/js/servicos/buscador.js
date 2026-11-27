// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
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

function lugar({ nome, cidade, uf, lat, lon, precisao, servico, rua, numero, bairro, cep }) {
  const logradouro = [rua, numero].filter(Boolean).join(', ');
  const partes = [nome, logradouro, bairro, cidade].filter(Boolean);
  const vistos = new Set();
  const endereco = partes.filter((p) => !vistos.has(semAcento(p)) && vistos.add(semAcento(p))).join(', ');
  const digitos = String(cep || '').replace(/\D/g, '');
  const codPostal = digitos.length === 8 ? digitos.slice(0, 5) + '-' + digitos.slice(5) : '';
  return {
    nome: String(nome || rua || cidade || 'Local').slice(0, 200), cidade: cidade || '', uf: uf || '', lat, lon,
    fuso: fusoDaUF(uf), precisao, servico, rua: rua || '', numero: numero || '', bairro: bairro || '', cep: codPostal,
    rotulo: (endereco + (uf ? ' — ' + uf : '') + (codPostal ? ' · CEP ' + codPostal : '')).slice(0, 300),
  };
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
  return lugar({ nome: semAcento(p.name) === semAcento(p.street) ? '' : p.name, rua: p.street, numero: p.housenumber, bairro: p.district || p.locality, cep: p.postcode, cidade: p.city || p.town || p.village || (ehCidade ? p.name : '') || p.county || '', uf: ufPorNome(p.state), lat, lon, precisao: p.osm_value || p.type || '', servico: 'Photon' });
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

/**
 * Busca completa, só quando o usuário toca em "Buscar" (política do Nominatim).
 * Se o Nominatim falhar ou não achar nada, tenta o Photon (fonte alternativa) antes de desistir.
 */
export async function buscar(texto, { sinal } = {}) {
  let lista = [];
  let erro = null;
  try {
    lista = await buscarNominatim(texto, { sinal });
  } catch (e) {
    if (e?.codigo === 'cancelado') throw e;
    erro = e;
  }
  if (lista.length) return lista;
  try {
    const alternativa = await autocompletar(texto, { sinal });
    if (alternativa.length || !erro) return alternativa;
  } catch (e) {
    if (e?.codigo === 'cancelado') throw e;
  }
  if (erro) throw erro;
  return [];
}

async function buscarNominatim(texto, { sinal } = {}) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=8&accept-language=pt-BR&q=${encodeURIComponent(texto.trim())}`;
  const j = await consultarJSON('nominatim', url, { sinal });
  return semRepetidos((j || []).map(deNominatim));
}

function deNominatim(r) {
  const a = r.address || {};
  const iso = a['ISO3166-2-lvl4'] || '';
  const uf = iso.startsWith('BR-') ? iso.slice(3) : ufPorNome(a.state || (r.addresstype === 'state' ? r.name : ''));
  const pos = { lat: Number(r.lat), lon: Number(r.lon), servico: 'Nominatim' };
  if (r.addresstype === 'state') {
    return { ...lugar({ ...pos, nome: 'Estado de ' + r.name, uf, precisao: 'state' }), estado: true,
      rotulo: 'Estado de ' + r.name + ' (o estado inteiro, não a cidade)' + (uf ? ' — ' + uf : '') };
  }
  const rua = a.road || a.pedestrian || a.residential || a.street;
  return lugar({ ...pos, nome: semAcento(r.name) === semAcento(rua) ? '' : r.name,
    cidade: a.city || a.town || a.village || a.municipality || '', uf, rua, numero: a.house_number,
    bairro: a.suburb || a.city_district || a.neighbourhood || a.quarter, cep: a.postcode,
    precisao: r.addresstype || r.type || '' });
}

/** Endereço de uma coordenada (geolocalização e sugestão de abastecimento). Photon; se falhar, Nominatim. */
export async function reverso(lat, lon, { sinal, enderecoCompleto = false } = {}) {
  let candidato = null;
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`;
    const j = await consultarJSON('photon', url, { sinal });
    const f = (j.features || [])[0];
    if (f) {
      candidato = { ...dePhoton(f), lat, lon };
      if (!enderecoCompleto || (candidato.rua && candidato.numero)) return candidato;
    }
  } catch (e) {
    if (e?.codigo === 'cancelado') throw e;
  }
  const zoom = enderecoCompleto ? 18 : 14;
  const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=' + zoom
    + '&accept-language=pt-BR&lat=' + lat + '&lon=' + lon;
  try {
    const r = await consultarJSON('nominatim', url, { sinal });
    if (!r || r.error) return candidato;
    const local = { ...deNominatim(r), lat, lon };
    if (candidato?.rua && !local.rua) return candidato;
    return local;
  } catch (e) {
    if (!candidato || e?.codigo === 'cancelado') throw e;
    return candidato;
  }
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
