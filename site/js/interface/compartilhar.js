// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Compartilhar a rota de uma viagem (planejada ou antiga) pelo WhatsApp, e-mail etc.
// Vai só o caminho: lugares, datas e o link do Google Maps. Nomes, datas de nascimento, placa,
// checklists e documentos nunca entram no texto.
import { pontosDaRota } from '../dominio/viagem.js';
import { urlGoogleMaps } from './revisao.js';
import { isoParaBr } from './datas.js';

export const SITE_APP = 'https://dk2impressoes.github.io/planejar-rotas/';
const nomeLugar = (l) => (l ? (l.cidade && l.uf ? `${l.cidade}/${l.uf}` : (l.rotulo || l.nome || 'local')) : '—');

/** Texto da rota para compartilhar. */
export function textoDaRota(v) {
  const titulo = v.nome || `${nomeLugar(v.origem)} → ${nomeLugar(v.destino)}`;
  const linhas = [`🧭 ${titulo}`];
  for (const [s, rotulo] of [['ida', 'Ida'], ['volta', 'Volta']]) {
    const pontos = pontosDaRota(v, s);
    if (pontos.some((p) => !p)) continue;
    const d = v.datas?.[s];
    const quando = d?.data ? ` (${isoParaBr(d.data)}${d.hora ? ` às ${d.hora}` : ''})` : '';
    linhas.push('', `${s === 'ida' ? '🚗' : '🏠'} ${rotulo}${quando}: ${pontos.map(nomeLugar).join(' → ')}`);
    linhas.push(`Caminho no Google Maps: ${urlGoogleMaps(pontos)}`);
  }
  linhas.push('', `Planejado com o Planejar Rotas com Checklist: ${SITE_APP}`);
  return { titulo, texto: linhas.join('\n') };
}

/**
 * Abre o "compartilhar" do aparelho; sem ele, copia o texto.
 * Retorna 'compartilhado' | 'cancelado' | 'copiado' | 'indisponivel'.
 */
export async function compartilharRota(v) {
  const { titulo, texto } = textoDaRota(v);
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
