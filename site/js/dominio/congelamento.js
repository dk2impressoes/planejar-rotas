// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Viagem terminada fica com os valores daquela época: atualizações de preços e pedágios não mudam mais
// o resumo nem o histórico de gastos dela.
//
// Guarda duas coisas na viagem:
// * basesCongeladas: recorte das bases do dia (preços da ANP dos estados da viagem, praças perto do caminho,
//   regras, feriados, rodízio). Fica só no aparelho (não vai no arquivo exportado) e refaz o resumo igualzinho.
// * congelado: os totais (combustível, pedágios, total, km, horas). Pequeno, vai na exportação e garante o
//   histórico mesmo numa viagem importada.
// Se a pessoa mudar o caminho depois (origem, destino ou paradas), o congelamento antigo deixa de valer e
// a viagem é congelada de novo com os dados do momento.
import { viagemConcluida, chaveRota } from './viagem.js';

const chaves = (v) => ({ ida: chaveRota(v, 'ida'), volta: chaveRota(v, 'volta') });
const mesmasChaves = (a, b) => !!a && !!b && a.ida === b.ida && a.volta === b.volta;

/** O congelamento ainda vale para o caminho atual da viagem? */
export function congelamentoValido(v) {
  return mesmasChaves(v?.congelado?.chaves, chaves(v));
}

/** Bases para calcular esta viagem: as do fim da viagem, se congeladas; senão, as atuais. */
export function basesDaViagem(v, bases) {
  return v?.basesCongeladas && congelamentoValido(v) ? v.basesCongeladas : bases;
}

/** Recorte pequeno das bases com tudo o que o cálculo desta viagem usa. */
export function recorteDasBases(bases, v) {
  if (!bases) return null;
  const ufs = new Set();
  const lugares = [v.origem, v.destino, ...(v.paradas?.ida || []).map((p) => p.lugar), ...(v.paradas?.volta || []).map((p) => p.lugar),
    ...Object.values(v.lugaresSugeridos || {})];
  for (const l of lugares) if (l?.uf) ufs.add(l.uf);
  // Retângulo do caminho (com folga de ~11 km): as praças de fora não são usadas.
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90, temCaminho = false;
  for (const s of ['ida', 'volta']) {
    const todas = [v.rotas?.[s]?.legs || [], ...(v.rotas?.[s]?.alternativas || []).map((a) => a.legs || [])].flat();
    for (const leg of todas) {
      for (const a of leg.amostras || []) {
        temCaminho = true;
        x0 = Math.min(x0, a.c[0]); x1 = Math.max(x1, a.c[0]); y0 = Math.min(y0, a.c[1]); y1 = Math.max(y1, a.c[1]);
      }
    }
  }
  const pontos = (bases.pedagios?.pontos || []).filter((p) => temCaminho
    && p.coordenadas.lon >= x0 - 0.1 && p.coordenadas.lon <= x1 + 0.1 && p.coordenadas.lat >= y0 - 0.1 && p.coordenadas.lat <= y1 + 0.1);
  return {
    ...bases,
    anp: bases.anp ? { ...bases.anp, precos_municipios: (bases.anp.precos_municipios || []).filter((m) => ufs.has(m.uf)) } : bases.anp,
    pedagios: bases.pedagios ? { ...bases.pedagios, pontos } : bases.pedagios,
  };
}

/**
 * Congela a viagem se ela já terminou e ainda não foi congelada (ou o caminho mudou depois).
 * custos(v, bases) devolve os totais (custosDaViagem). Retorna true se mudou algo na viagem.
 */
export function congelarSeTerminou(v, bases, custos, agora = new Date()) {
  if (!bases || !viagemConcluida(v, agora) || congelamentoValido(v)) return false;
  // Sem o caminho calculado não há o que congelar: espera até ele existir (senão os pedágios ficariam de fora).
  if (!['ida', 'volta'].every((s) => v.rotas?.[s]?.chave === chaveRota(v, s) && v.rotas[s].legs?.length)) return false;
  const recorte = recorteDasBases(bases, v);
  const c = custos(v, recorte);
  v.basesCongeladas = recorte;
  v.congelado = {
    em: agora.toISOString(), versao_bases: bases.versao || null, chaves: chaves(v),
    custos: { km: c.km, horas: c.horas, combustivel: c.combustivel, pedagioConfirmado: c.pedagioConfirmado,
      pedagioAConfirmar: c.pedagioAConfirmar, pracasSemValor: c.pracasSemValor, total: c.total, semCaminho: !!c.semCaminho },
  };
  return true;
}
