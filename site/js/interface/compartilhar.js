// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
import { pontosDaRota } from '../dominio/viagem.js';
import { urlGoogleMaps } from './revisao.js';
import { isoParaBr } from './datas.js';

export const SITE_APP = 'https://dk2impressoes.github.io/planejar-rotas/';
export const PREFIXO_ROTA = '#rota=';
const MAX_LINK = 24000;
const nomeLugar = (l = {}) => (l || {}).cidade && l.uf ? l.cidade + '/' + l.uf : (l?.rotulo || l?.nome || 'Local');
const dataValida = (v) => typeof v === 'string' && /^(?:\d{4}-\d{2}-\d{2})?$/.test(v);
const horaValida = (v) => typeof v === 'string' && /^(?:(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(v);
const coordenada = (n, limite) => Number.isFinite(n) && Math.abs(n) <= limite;

export function textoDaRota(v) {
  const titulo = (v.nome || nomeLugar(v.origem) + ' → ' + nomeLugar(v.destino)).slice(0, 120);
  const trechos = ['ida', 'volta'].flatMap((sentido) => {
    const pontos = pontosDaRota(v, sentido);
    if (pontos.length > 32 || pontos.some((p) => !p || !coordenada(p.lat, 90) || !coordenada(p.lon, 180))) return [];
    const { data = '', hora = '' } = v.datas?.[sentido] || {};
    return [[sentido, data, hora, pontos.map((p) => [nomeLugar(p).slice(0, 120), +p.lat.toFixed(5), +p.lon.toFixed(5)])]];
  });
  if (!trechos.length) return { titulo, texto: '', url: '' };
  const bytes = new TextEncoder().encode(JSON.stringify([1, titulo, trechos]));
  const codigo = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (codigo.length > MAX_LINK) return { titulo, texto: '', url: '' };
  const url = SITE_APP + PREFIXO_ROTA + codigo;
  return { titulo, url, texto: [
    '🧭 ' + titulo,
    'Abrir roteiro no Planejar Rotas: ' + url,
    ...trechos.map(([s, data, hora, pontos]) => (s === 'ida' ? 'Ida' : 'Volta')
      + (data ? ' (' + isoParaBr(data) + (hora ? ' às ' + hora : '') + ')' : '')
      + ': ' + pontos.map(([nome]) => nome).join(' → ')),
  ].join('\n') };
}

export function lerRotaCompartilhada(hash) {
  if (!hash.startsWith(PREFIXO_ROTA)) return null;
  const codigo = hash.slice(PREFIXO_ROTA.length);
  if (codigo.length > MAX_LINK || !/^[a-zA-Z0-9_-]+$/.test(codigo)) return null;
  try {
    const bytes = Uint8Array.from(atob(codigo.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
    const [versao, titulo, trechos] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (versao !== 1 || typeof titulo !== 'string' || titulo.length > 120 || !Array.isArray(trechos) || !trechos.length || trechos.length > 2) return null;
    const sentidos = new Set();
    const rotas = trechos.map(([sentido, data, hora, pontos]) => {
      if (!['ida', 'volta'].includes(sentido) || sentidos.has(sentido) || !dataValida(data) || !horaValida(hora)
          || !Array.isArray(pontos) || pontos.length < 2 || pontos.length > 32) throw new Error('Roteiro inválido');
      sentidos.add(sentido);
      const lugares = pontos.map(([nome, lat, lon]) => {
        if (typeof nome !== 'string' || nome.length > 120 || !coordenada(lat, 90) || !coordenada(lon, 180)) throw new Error('Local inválido');
        return { nome, lat, lon };
      });
      return { sentido, data, hora, lugares, mapa: urlGoogleMaps(lugares) };
    });
    return { titulo, rotas };
  } catch {
    return null;
  }
}

export async function compartilharRota(v) {
  const { titulo, texto } = textoDaRota(v);
  if (!texto) return 'rota-invalida';
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto });
      return 'compartilhado';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch {
    return 'indisponivel';
  }
}
