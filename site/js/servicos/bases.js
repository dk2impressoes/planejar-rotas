// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Atualização automática das bases (Seção 11.1): conjunto completo, conferido e ativado de uma vez.
import { obter, transacao } from '../armazenamento/db.js';
import { validar, parseSeguro, sha256 } from './esquema.js';
import { SITUACAO_BASE } from '../dominio/situacao.js';

export const ARQUIVOS_BASE = {
  'dados/anp.json': 'anp',
  'dados/centro-expandido.geojson': 'centroExpandido',
  'dados/feriados.json': 'feriados',
  'dados/pedagios.json': 'pedagios',
  'dados/regras.json': 'regras',
  'dados/rodizio-suspensoes.json': 'suspensoes',
};
export const NOMES_BASE = {
  anp: 'Preços de combustível (ANP)', centroExpandido: 'Área do rodízio (Centro Expandido)', feriados: 'Feriados',
  pedagios: 'Pedágios', regras: 'Regras de trânsito e dos serviços', suspensoes: 'Suspensões do rodízio',
};
const OBRIGATORIAS = ['regras', 'pedagios', 'feriados', 'centroExpandido'];

async function baixarTexto(url) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${url}: resposta ${r.status}`);
  return r.text();
}

export async function baixarManifesto() {
  return parseSeguro(await baixarTexto('dados/manifesto.json'));
}

/**
 * Baixa, confere e ativa um novo conjunto. Em qualquer falha, o conjunto anterior continua em uso.
 * Retorna { atualizado: bool, versao, motivo }.
 */
export async function atualizarBases({ progresso } = {}) {
  const ativo = await obter('bases', 'ativo');
  const manifesto = await baixarManifesto();
  const erros = validar(manifesto, { type: 'object', required: ['versao_conjunto', 'arquivos'] });
  if (erros.length) throw new Error('Manifesto inválido.');
  if (ativo?.versao_conjunto === manifesto.versao_conjunto) {
    await transacao([{ store: 'bases', valor: { ...ativo, conferido_em: new Date().toISOString() } }]);
    return { atualizado: false, versao: ativo.versao_conjunto, motivo: 'As bases já estão na versão mais recente.' };
  }
  // Área temporária: nada é gravado até todos os arquivos passarem.
  const temporario = {};
  const itens = manifesto.arquivos.filter((a) => ARQUIVOS_BASE[a.caminho]);
  for (const [i, item] of itens.entries()) {
    progresso?.(`Baixando ${NOMES_BASE[ARQUIVOS_BASE[item.caminho]]} (${i + 1} de ${itens.length})`);
    const texto = await baixarTexto(`${item.caminho}?v=${encodeURIComponent(manifesto.versao_conjunto)}`);
    if (await sha256(texto) !== item.sha256) throw new Error(`${item.caminho}: código de verificação não confere.`);
    const dados = parseSeguro(texto);
    const esquema = parseSeguro(await baixarTexto(item.esquema));
    const errosEsquema = validar(dados, esquema);
    if (errosEsquema.length) throw new Error(`${item.caminho}: fora do esquema (${errosEsquema.slice(0, 2).join('; ')}).`);
    temporario[ARQUIVOS_BASE[item.caminho]] = dados;
  }
  for (const k of OBRIGATORIAS) if (!temporario[k]) throw new Error(`Base obrigatória ausente: ${NOMES_BASE[k]}.`);
  const agora = new Date().toISOString();
  const novo = { chave: 'ativo', versao_conjunto: manifesto.versao_conjunto, ativado_em: agora, conferido_em: agora, arquivos: temporario };
  const ops = [{ store: 'bases', valor: novo }];
  if (ativo) ops.push({ store: 'bases', valor: { ...ativo, chave: 'anterior' } });
  await transacao(ops);
  return { atualizado: true, versao: manifesto.versao_conjunto, motivo: 'Bases atualizadas.' };
}

/** Bases em uso, no formato esperado por calculo.js. */
export async function carregarBases() {
  const ativo = await obter('bases', 'ativo');
  if (!ativo) return null;
  return { versao: ativo.versao_conjunto, conferido_em: ativo.conferido_em, ...ativo.arquivos };
}

/** Situação de cada base (Seção 11.2). */
export function situacaoDasBases(bases, { conferidoNestaSessao, hojeISO = new Date().toISOString() } = {}) {
  return Object.entries(NOMES_BASE).map(([k, nome]) => {
    const b = bases?.[k];
    let situacao;
    if (!b) situacao = SITUACAO_BASE.INDISPONIVEL;
    else if (b.validade && hojeISO.slice(0, 10) > b.validade) situacao = SITUACAO_BASE.DESATUALIZADO;
    else situacao = conferidoNestaSessao ? SITUACAO_BASE.ATUALIZADO : SITUACAO_BASE.SALVO;
    return { chave: k, nome, situacao, versao: b?.versao || null, referencia_em: b?.referencia_em || null, validade: b?.validade || null, fonte: b?.fonte || null };
  });
}
