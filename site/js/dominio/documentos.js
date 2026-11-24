// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Documentos dos viajantes (Seção 7). Orientação, não parecer jurídico.
import { dataValida } from './tempo.js';

export const FAIXAS = ['0 a 14 anos', '15 anos', '16 ou 17 anos', '18 anos ou mais'];

const FONTE_ECA = 'https://www.planalto.gov.br/ccivil_03/leis/l8069.htm';
const FONTE_CTB = 'https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm';

export const AVISO_FIXO = 'As regras podem mudar. Em caso de dúvida, consulte o Tribunal de Justiça do seu estado.';

export function idadeNaData(nascimento, data) {
  if (!dataValida(nascimento) || !dataValida(data)) return null;
  const [an, mn, dn] = nascimento.split('-').map(Number);
  const [a, m, d] = data.split('-').map(Number);
  let idade = a - an;
  if (m < mn || (m === mn && d < dn)) idade--;
  return idade;
}

/**
 * Idade (ou faixa) válida em todos os dias da viagem.
 * Retorna { idadeMin, idadeMax } ou { precisaNascimento: true }.
 */
export function idadeNaViagem(viajante, inicio, fim) {
  if (dataValida(viajante.nascimento)) {
    const i = idadeNaData(viajante.nascimento, inicio);
    const f = idadeNaData(viajante.nascimento, fim);
    if (i === null || f === null || i < 0) return { erro: 'Data de nascimento depois da viagem.' };
    return { idadeMin: i, idadeMax: f };
  }
  switch (viajante.faixa) {
    case '0 a 14 anos': return { idadeMin: 0, idadeMax: 14 }; // 14 pode virar 15: mesma orientação
    case '15 anos': return { precisaNascimento: true, motivo: 'Pode fazer 16 anos durante a viagem.' };
    case '16 ou 17 anos': return { idadeMin: 16, idadeMax: 18 }; // 17 pode virar 18: só muda para condutor
    case '18 anos ou mais': return { idadeMin: 18, idadeMax: 200 };
    default: return { precisaNascimento: true, motivo: 'Informe a data de nascimento ou a faixa etária.' };
  }
}

export function mesesNaData(nascimento, data) {
  if (!dataValida(nascimento) || !dataValida(data)) return null;
  const [an, mn, dn] = nascimento.split('-').map(Number);
  const [a, m, d] = data.split('-').map(Number);
  return (a - an) * 12 + (m - mn) - (d < dn ? 1 : 0);
}

/**
 * Orientação de dispositivo de retenção (cadeirinha), pela idade no início da viagem.
 * regra: regras.json → retencao_infantil. Sem regra, nada é orientado.
 */
export function retencaoInfantil(viajante, inicio, regra) {
  if (!regra?.faixas?.length) return null;
  const meses = mesesNaData(viajante.nascimento, inicio);
  if (meses === null) {
    if (viajante.faixa === '0 a 14 anos') return { pendencia: `Informe a data de nascimento de ${viajante.nome || 'este viajante'} para a orientação da cadeirinha.` };
    return null;
  }
  const faixa = regra.faixas.find((f) => meses < f.ate_meses);
  if (!faixa) return null;
  return {
    item: {
      id: 'retencao', obrigatorio: true, fonte: regra.url_oficial,
      texto: `${faixa.texto} Fonte: ${regra.orgao}, ${regra.tipo_ato} ${regra.numero_ato}${regra.nivel_verificacao === 'primaria' ? '' : ' — regra a conferir no texto oficial'}.`,
    },
  };
}

/** Itens de documento exigidos para um viajante (e, para crianças, a cadeirinha). */
export function documentosDoViajante(viajante, inicio, fim, regraRetencao = null) {
  const idade = idadeNaViagem(viajante, inicio, fim);
  const itens = [];
  const erros = [];
  if (idade.erro) return { itens, erros: [idade.erro], idade };
  const ret = retencaoInfantil(viajante, inicio, regraRetencao);
  if (idade.precisaNascimento) {
    return { itens, erros: [], pendencia: `Informe a data de nascimento de ${viajante.nome || 'este viajante'}. ${idade.motivo}`, idade };
  }
  itens.push({ id: 'documento-foto', texto: 'Documento oficial com foto', fonte: FONTE_ECA, obrigatorio: true });
  if (ret?.item) itens.push(ret.item);
  if (idade.idadeMin < 16) {
    itens.push({
      id: 'autorizacao',
      texto: 'Autorização de viagem — obrigatória para menor de 16 anos sem pai, mãe ou responsável (ECA, art. 83, com a redação da Lei 13.812/2019). '
        + 'Não é exigida se estiver com um dos pais, com parente até o 3º grau (com prova do parentesco) ou com adulto autorizado pelos pais, '
        + 'ou se a viagem for para comarca vizinha no mesmo estado ou região metropolitana.',
      fonte: FONTE_ECA,
      obrigatorio: true,
    });
  }
  if (viajante.condutor) {
    if (idade.idadeMin < 18) erros.push(`${viajante.nome || 'O condutor'} precisa ter 18 anos ou mais em todos os dias da viagem para dirigir.`);
    itens.push({ id: 'cnh', texto: 'CNH válida', fonte: FONTE_CTB, obrigatorio: true });
    itens.push({ id: 'crlv', texto: 'Documento do veículo (CRLV)', fonte: FONTE_CTB, obrigatorio: true });
  }
  return { itens, erros, idade, pendencia: ret?.pendencia };
}

/** Situação da lista geral de documentos: concluída só com todos os obrigatórios confirmados. */
export function situacaoDocumentos(viajantes, confirmados, inicio, fim, regraRetencao = null) {
  let total = 0, feitos = 0;
  const pendencias = [];
  for (const v of viajantes) {
    const r = documentosDoViajante(v, inicio, fim, regraRetencao);
    if (r.pendencia) pendencias.push(r.pendencia);
    pendencias.push(...r.erros);
    for (const item of r.itens) {
      if (!item.obrigatorio) continue;
      total++;
      if (confirmados?.[v.id]?.[item.id]) feitos++;
    }
  }
  return { total, feitos, concluida: total > 0 && feitos === total && pendencias.length === 0, pendencias };
}
