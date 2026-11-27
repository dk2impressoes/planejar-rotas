// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
import { exportar, LIMITE_BYTES } from '../armazenamento/exportacao.js';
import { pontosDaRota } from '../dominio/viagem.js';
import { urlGoogleMaps } from './revisao.js';
import { isoParaBr } from './datas.js';

export const SITE_APP = 'https://dk2impressoes.github.io/planejar-rotas/';
export const PREFIXO_ROTA = '#rota=';
const MAX_LINK = 24000;
const nomeLugar = (l) => l?.rotulo || l?.nome || (l?.cidade && l.uf ? l.cidade + '/' + l.uf : 'Local');
const dataValida = (v) => typeof v === 'string' && /^(?:\d{4}-\d{2}-\d{2})?$/.test(v);
const horaValida = (v) => typeof v === 'string' && /^(?:(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(v);
const coordenada = (n, limite) => Number.isFinite(n) && Math.abs(n) <= limite;

export function textoDaRota(v) {
  const titulo = (v.nome || nomeLugar(v.origem) + ' → ' + nomeLugar(v.destino)).slice(0, 120);
  const trechos = [];
  for (const sentido of ['ida', 'volta']) {
    const pontos = pontosDaRota(v, sentido);
    if (pontos.length > 32 || pontos.some((p) => !p || !coordenada(p.lat, 90) || !coordenada(p.lon, 180))) return { titulo, texto: '', url: '' };
    const { data = '', hora = '' } = v.datas?.[sentido] || {};
    const lugares = pontos.map((p, i) => {
      const parada = i > 0 && i < pontos.length - 1 ? v.paradas[sentido][i - 1] : null;
      const ponto = [nomeLugar(p).slice(0, 300), +p.lat.toFixed(6), +p.lon.toFixed(6)];
      if (parada) {
        const saida = parada.saidaAgendada;
        ponto.push(parada.tipo === 'Pernoite' ? 1 : 0, saida?.data || '', saida?.hora || '',
          Number.isFinite(Number(parada.duracaoMin)) && parada.duracaoMin !== null && parada.duracaoMin !== '' ? Number(parada.duracaoMin) : null);
      }
      return ponto;
    });
    trechos.push([sentido, data, hora, lugares]);
  }
  // O leitor já publicado aceita os mesmos campos e ignora os detalhes adicionais da parada.
  const trechosDoLink = trechos.map(([sentido, data, hora, lugares]) =>
    [sentido, data, hora, lugares.map(([nome, ...resto]) => [nome.slice(0, 120), ...resto])]);
  const bytes = new TextEncoder().encode(JSON.stringify([1, titulo, trechosDoLink]));
  const codigo = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = codigo.length <= MAX_LINK ? SITE_APP + PREFIXO_ROTA + codigo : '';
  return { titulo, url, texto: [
    '🧭 ' + titulo,
    ...(url ? ['Abrir roteiro no Planejar Rotas:', url] : []),
    ...trechos.map(([s, data, hora, pontos]) => (s === 'ida' ? 'Ida' : 'Volta')
      + (data ? ' (' + isoParaBr(data) + (hora ? ' às ' + hora : '') + ')' : '')
      + ': ' + pontos.map(([nome, lat, lon, tipo, dia, horaSaida, minutos]) => nome
        + (tipo === 1 ? ' (pernoite' + (dia ? ', saída ' + isoParaBr(dia) + (horaSaida ? ' às ' + horaSaida : '') : '') + ')'
          : Number.isFinite(minutos) ? ' (parada de ' + minutos + ' min)' : '')).join(' → ')),
  ].join('\n') };
}

export function lerRotaCompartilhada(hash) {
  if (!hash.startsWith(PREFIXO_ROTA)) return null;
  const codigo = hash.slice(PREFIXO_ROTA.length);
  if (codigo.length > MAX_LINK || !/^[a-zA-Z0-9_-]+$/.test(codigo)) return null;
  try {
    const bytes = Uint8Array.from(atob(codigo.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
    const [versao, titulo, trechos] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (![1, 2].includes(versao) || typeof titulo !== 'string' || titulo.length > 120 || !Array.isArray(trechos) || !trechos.length || trechos.length > 2) return null;
    const sentidos = new Set();
    const rotas = trechos.map(([sentido, data, hora, pontos]) => {
      if (!['ida', 'volta'].includes(sentido) || sentidos.has(sentido) || !dataValida(data) || !horaValida(hora)
          || !Array.isArray(pontos) || pontos.length < 2 || pontos.length > 32) throw new Error('Roteiro inválido');
      sentidos.add(sentido);
      const lugares = pontos.map(([nome, lat, lon, tipo, dataSaida, horaSaida, duracao], i) => {
        if (typeof nome !== 'string' || nome.length > 300 || !coordenada(lat, 90) || !coordenada(lon, 180)) throw new Error('Local inválido');
        const parada = i > 0 && i < pontos.length - 1
          ? { tipo: tipo === 1 ? 'Pernoite' : 'Parada', data: dataValida(dataSaida) ? dataSaida : '',
            hora: horaValida(horaSaida) ? horaSaida : '', duracao: Number.isFinite(duracao) && duracao >= 0 ? duracao : null }
          : null;
        return { nome, lat, lon, parada };
      });
      return { sentido, data, hora, lugares, mapa: urlGoogleMaps(lugares) };
    });
    return { titulo, rotas };
  } catch {
    return null;
  }
}

/** A cópia completa usa o mesmo formato com verificação de integridade por hash da importação do app. */
export async function compartilharViagemCompleta(v) {
  const conteudo = await exportar([v]);
  const arquivo = new File([conteudo], 'viagem-planejar-rotas.json', { type: 'application/json' });
  if (arquivo.size > LIMITE_BYTES) return 'arquivo-grande';
  const { url } = textoDaRota(v);
  const texto = 'Abra Planejar Rotas → Configurações → Salvar, Importar ou Restaurar e escolha o arquivo recebido.'
    + (url ? '\n\nVer a rota e as paradas no app:\n' + url : '');
  return compartilharArquivo(arquivo, 'Viagem completa', texto);
}

async function compartilharArquivo(arquivo, titulo, texto) {
  if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ title: titulo, text: texto, files: [arquivo] });
      return 'compartilhado';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = endereco;
  link.download = arquivo.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 5000);
  return 'baixado';
}

export async function compartilharRota(v) {
  const { titulo, texto, url } = textoDaRota(v);
  if (!texto) return 'rota-invalida';
  if (!url) {
    const arquivo = new File([texto], 'rotas-e-paradas.txt', { type: 'text/plain' });
    const resultado = await compartilharArquivo(arquivo, titulo, 'Rotas e paradas da viagem');
    return resultado === 'baixado' ? 'baixado-roteiro' : resultado;
  }
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
