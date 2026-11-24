// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Exportação e importação (Seção 10.3) com proteção contra XSS e prototype pollution (Seção 12.4).
import { validar, sanitizar, parseSeguro, sha256 } from '../servicos/esquema.js';
import { VERSAO_ESQUEMA, migrarViagem } from '../dominio/viagem.js';

export const LIMITE_BYTES = 5 * 1024 * 1024;
export const AVISO_EXPORTACAO = 'Este arquivo contém nomes e dados da viagem; guarde com cuidado.';

const txt = (max = 200) => ({ type: 'string', maxLength: max });
const numOuNulo = { type: ['number', 'null', 'string'], maxLength: 20 };
const dataHora = { type: 'object', properties: { data: txt(10), hora: txt(5) } };
const lugar = {
  type: ['object', 'null'],
  properties: { nome: txt(), cidade: txt(), uf: txt(2), lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 }, fuso: txt(40), precisao: txt(40), servico: txt(40), rotulo: txt(300) },
};
const parada = {
  type: 'object', required: ['id', 'tipo'],
  properties: {
    id: txt(60), tipo: txt(30), lugar, duracaoMin: numOuNulo, preco: numOuNulo,
    saidaAgendada: { type: ['object', 'null'], properties: dataHora.properties },
    abastecer: { type: ['object', 'null'], properties: { modo: { type: 'string', enum: ['completar', 'parcial'] }, litros: numOuNulo } },
  },
};
const amostra = { type: 'object', properties: { c: { type: 'array', maxItems: 2, items: { type: 'number' } }, dt: { type: 'number' }, via: txt(200) } };
const legs = { type: 'array', maxItems: 50, items: { type: 'object', properties: { km: { type: 'number', minimum: 0 }, duracao_s: { type: 'number', minimum: 0 }, amostras: { type: 'array', maxItems: 200000, items: amostra } } } };
const rota = {
  type: ['object', 'null'],
  properties: {
    chave: txt(5000), servico: txt(40), calculado_em: txt(40), revisao_entrada: { type: 'integer' }, situacao: txt(20),
    legs,
    alternativas: { type: 'array', maxItems: 3, items: { type: 'object', properties: { legs } } },
    escolhida: { type: 'integer', minimum: 0, maximum: 2 },
  },
};
const item = { type: 'object', properties: { id: txt(60), texto: txt(300), feito: { type: 'boolean' }, quantidade: txt(10) } };

export const ESQUEMA_VIAGEM = {
  type: 'object', required: ['id', 'versao_esquema', 'datas'],
  properties: {
    id: txt(60), versao_esquema: { type: 'integer', minimum: 1, maximum: VERSAO_ESQUEMA }, criado_em: txt(40), atualizado_em: txt(40),
    revisao: { type: 'integer', minimum: 0 }, tela: { type: 'integer', minimum: 1, maximum: 6 }, nome: txt(80),
    datas: { type: 'object', properties: { ida: dataHora, volta: dataHora } },
    origem: lugar, destino: lugar,
    paradas: { type: 'object', properties: { ida: { type: 'array', maxItems: 30, items: parada }, volta: { type: 'array', maxItems: 30, items: parada } } },
    veiculo: {
      type: 'object',
      properties: Object.fromEntries(['categoria', 'combustivel', 'flex'].map((k) => [k, txt(40)])
        .concat(['consumo', 'consumoEtanol', 'consumoGasolina', 'tanque', 'saida', 'reserva', 'perda', 'eixos', 'precoUltimo', 'distanciaMaxima', 'margemKm', 'margemRodizioMin'].map((k) => [k, numOuNulo]))
        .concat([['finalPlaca', { type: 'string', pattern: '^\\d?$' }]])),
    },
    viajantes: { type: 'array', maxItems: 50, items: { type: 'object', properties: { id: txt(60), nome: txt(80), nascimento: txt(10), faixa: txt(30), condutor: { type: 'boolean' } } } },
    listas: { type: 'array', maxItems: 100, items: { type: 'object', properties: { id: txt(60), escopo: { type: 'string', enum: ['geral', 'individual'] }, viajanteId: { type: ['string', 'null'], maxLength: 60 }, titulo: txt(80), itens: { type: 'array', maxItems: 300, items: item } } } },
    separacao: { type: 'object', properties: { modo: { type: 'string', enum: ['', 'cada_um', 'uma_pessoa'] }, responsavelId: { type: ['string', 'null'], maxLength: 60 } } },
    documentosConfirmados: { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'boolean' } } },
    manual: { type: 'object', properties: { ida: { type: 'array', maxItems: 50, items: { type: 'object', properties: { km: numOuNulo, horas: numOuNulo } } }, volta: { type: 'array', maxItems: 50, items: { type: 'object', properties: { km: numOuNulo, horas: numOuNulo } } } } },
    ajustesPedagio: { type: 'object', additionalProperties: { type: ['number', 'null'] } },
    abastecimentosReais: {
      type: 'array', maxItems: 100,
      items: { type: 'object', properties: { id: txt(60), sentido: { type: 'string', enum: ['ida', 'volta'] }, trechoDoSentido: { type: 'integer', minimum: 0, maximum: 50 }, kmNoTrecho: { type: 'number', minimum: 0 }, modo: { type: 'string', enum: ['completar', 'parcial'] }, litros: numOuNulo, preco: numOuNulo, quando: txt(40), lugar: txt(200) } },
    },
    lugaresSugeridos: { type: 'object', additionalProperties: { type: 'object', properties: { cidade: txt(), uf: txt(2), rotulo: txt(300) } } },
    rotas: { type: 'object', properties: { ida: rota, volta: rota } },
    congelado: {
      type: ['object', 'null'],
      properties: {
        em: txt(40), versao_bases: { type: ['string', 'null'], maxLength: 60 },
        chaves: { type: 'object', properties: { ida: txt(5000), volta: txt(5000) } },
        custos: { type: 'object', properties: Object.fromEntries(['km', 'horas', 'combustivel', 'pedagioConfirmado', 'pedagioAConfirmar', 'pracasSemValor', 'total']
          .map((k) => [k, { type: ['number', 'null'] }]).concat([['semCaminho', { type: 'boolean' }]])) },
      },
    },
    preparacao: { type: 'object', properties: { estado: txt(30), preparado_em: { type: ['string', 'null'], maxLength: 40 }, revisao: { type: ['integer', 'null'] }, desatualizada: { type: 'boolean' } } },
  },
};

export async function exportar(viagensOriginais) {
  // As rotas alternativas não escolhidas ficam fora da cópia (podem ser recalculadas) para caber no limite de 5 MB.
  // O recorte das bases congeladas também fica fora (é grande); os totais congelados vão junto.
  const viagens = viagensOriginais.map(({ basesCongeladas, ...v }) => ({
    ...v,
    rotas: Object.fromEntries(Object.entries(v.rotas || {}).map(([s, r]) => [s, r ? { ...r, alternativas: [], escolhida: 0 } : r])),
  }));
  const conteudo = JSON.stringify(viagens);
  return JSON.stringify({
    formato: 'planejar-rotas', versao_esquema: VERSAO_ESQUEMA, exportado_em: new Date().toISOString(),
    aviso: AVISO_EXPORTACAO, sha256: await sha256(conteudo), viagens,
  }, null, 1);
}

/**
 * Confere um arquivo de importação. Não grava nada: devolve o resumo para confirmação.
 * Lança Error com mensagem simples se o arquivo for inválido.
 */
export async function conferirImportacao(texto) {
  if (typeof texto !== 'string') throw new Error('Arquivo ilegível.');
  if (new Blob([texto]).size > LIMITE_BYTES) throw new Error('Arquivo maior que 5 MB.');
  let dados;
  try { dados = parseSeguro(texto); } catch (e) { throw new Error(e.message.includes('proibida') ? e.message : 'O arquivo não é um JSON válido.'); }
  if (!dados || dados.formato !== 'planejar-rotas' || !Array.isArray(dados.viagens)) throw new Error('Este arquivo não é uma exportação do Planejar Rotas.');
  if (dados.viagens.length > 200) throw new Error('Quantidade de viagens acima do limite.');
  if (await sha256(JSON.stringify(dados.viagens)) !== dados.sha256) throw new Error('O código de verificação não confere: o arquivo foi alterado ou corrompido.');
  const viagens = [];
  for (const [i, v] of dados.viagens.entries()) {
    const erros = validar(v, ESQUEMA_VIAGEM, `viagem ${i + 1}`);
    if (erros.length) throw new Error(`Dados inválidos (${erros.slice(0, 3).join('; ')}).`);
    const limpa = migrarViagem(sanitizar(v, ESQUEMA_VIAGEM)); // cópia de versão antiga chega já na ordem de telas atual
    // Referências internas: confirmações só de viajantes existentes.
    const ids = new Set((limpa.viajantes || []).map((p) => p.id));
    for (const k of Object.keys(limpa.documentosConfirmados || {})) if (!ids.has(k)) delete limpa.documentosConfirmados[k];
    if (limpa.separacao?.responsavelId && !ids.has(limpa.separacao.responsavelId)) limpa.separacao.responsavelId = null;
    viagens.push(limpa);
  }
  return { viagens, exportado_em: dados.exportado_em, resumo: `${viagens.length} viagem(ns): ${viagens.map((v) => v.nome || 'sem nome').join(', ')}` };
}
