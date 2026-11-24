// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Situações dos resultados (Seção 1.8) e das bases (Seção 11.2).
// O símbolo e o texto acompanham sempre a cor (WCAG: nunca só a cor).

export const SITUACAO = Object.freeze({
  CONFIRMADO: 'confirmado',
  ESTIMADO: 'estimado',
  MANUAL: 'manual',
  DESATUALIZADO: 'desatualizado',
  INDISPONIVEL: 'indisponível',
});

export const SITUACAO_BASE = Object.freeze({
  ATUALIZADO: 'atualizado',
  SALVO: 'salvo',
  DESATUALIZADO: 'desatualizado',
  INDISPONIVEL: 'indisponível',
});

export const COBRANCA = Object.freeze({
  CONFIRMADA: 'confirmada',
  POSSIVEL: 'possível pedágio',
  DESCONHECIDA: 'desconhecida',
  MANUAL: 'manual',
  FORA_DO_SENTIDO: 'fora do sentido provável',
});

const SIMBOLOS = {
  'confirmado': '✔', 'confirmada': '✔', 'atualizado': '✔',
  'estimado': '≈', 'possível pedágio': '?', 'salvo': '■',
  'manual': '✎', 'fora do sentido provável': '⇄',
  'desatualizado': '⚠',
  'indisponível': '✖', 'desconhecida': '✖',
};

export function simbolo(situacao) {
  return SIMBOLOS[situacao] || '•';
}

// Situação de um valor a partir do nível de verificação (Seção 11.4).
export function situacaoPorNivel(nivel) {
  if (nivel === 'primaria') return SITUACAO.CONFIRMADO;
  if (nivel === 'secundaria') return SITUACAO.ESTIMADO;
  return SITUACAO.INDISPONIVEL;
}

// A pior situação de uma lista (para resumos).
const ORDEM = ['confirmado', 'estimado', 'manual', 'desatualizado', 'indisponível'];
export function piorSituacao(lista) {
  let pior = 0;
  for (const s of lista) pior = Math.max(pior, ORDEM.indexOf(s));
  return ORDEM[pior] || SITUACAO.INDISPONIVEL;
}

// Uma regra vale na data se está dentro da vigência e não passou do prazo de revisão.
export function regraVigente(regra, dataISO, hojeISO = new Date().toISOString()) {
  if (!regra) return { ok: false, situacao: SITUACAO.INDISPONIVEL };
  const d = dataISO.slice(0, 10);
  if (regra.vigente_de && d < regra.vigente_de) return { ok: false, situacao: SITUACAO.INDISPONIVEL };
  if (regra.vigente_ate && d > regra.vigente_ate) return { ok: false, situacao: SITUACAO.INDISPONIVEL };
  if (regra.revisar_ate && hojeISO.slice(0, 10) > regra.revisar_ate) {
    return { ok: true, situacao: SITUACAO.DESATUALIZADO };
  }
  return { ok: true, situacao: situacaoPorNivel(regra.nivel_verificacao) };
}
