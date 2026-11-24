// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Núcleo único de cálculos (Seção 1.9): junta itinerário, combustível, pedágios, rodízio e documentos.
// Função pura: recebe a viagem, as bases e "hoje"; não acessa rede nem armazenamento.
import { calcularItinerario, diasDaViagem, duracaoHoras, localParaUTC } from './tempo.js';
import { simularTanque, estimativaSimplificada, derivados, compararFlex } from './combustivel.js';
import { identificarPedagios, avisosFreeFlow } from './pedagios.js';
import { verificarRodizio } from './rodizio.js';
import { situacaoDocumentos, AVISO_FIXO } from './documentos.js';
import { sugerirDescansos } from './descanso.js';
import { pontoNoPercurso, chavePonto } from './geo.js';
import { SITUACAO, piorSituacao } from './situacao.js';
import { chaveRota, partidaUTC, fusoDe, pontosDaRota, TELA } from './viagem.js';

export const SENTIDOS = ['ida', 'volta'];

// Trechos de um sentido: da rota calculada (se a chave confere) ou da entrada manual.
export function trechosDoSentido(v, sentido) {
  const n = pontosDaRota(v, sentido).length - 1;
  const rota = v.rotas?.[sentido];
  if (rota && rota.chave === chaveRota(v, sentido) && rota.legs?.length === n) {
    return {
      origem: 'rota', servico: rota.servico, calculado_em: rota.calculado_em,
      situacao: rota.situacao || SITUACAO.ESTIMADO,
      trechos: rota.legs.map((l) => ({ km: l.km, duracao_s: l.duracao_s, amostras: l.amostras || [] })),
    };
  }
  const manual = v.manual?.[sentido] || [];
  if (manual.length === n && manual.every((m) => Number(m.km) >= 0 && Number(m.horas) >= 0 && m.km !== '' && m.horas !== '')) {
    return {
      origem: 'manual', servico: 'entrada manual', situacao: SITUACAO.MANUAL,
      trechos: manual.map((m) => ({ km: Number(m.km), duracao_s: Number(m.horas) * 3600, amostras: [] })),
    };
  }
  return { origem: 'nenhuma', situacao: SITUACAO.INDISPONIVEL, trechos: [], rotaAntiga: !!rota };
}

const dataBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const chaveCidade = (nome) => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Preço médio da ANP: da cidade, quando a ANP pesquisou postos nela naquela semana; senão, do estado (Seção 4.6).
 * cidade é opcional. Retorna { valor, situacao, premissa, ambito: 'cidade'|'estado', rotulo } ou null.
 */
function precoANP(bases, uf, combustivel, cidade = null) {
  const anp = bases?.anp;
  const semana = (p) => `semana de ${dataBr(p.periodo_inicio)} a ${dataBr(p.periodo_fim)}`;
  const est = anp?.precos?.find((x) => x.uf === uf && x.combustivel === combustivel);
  if (cidade && anp?.precos_municipios) {
    const ch = chaveCidade(cidade);
    const m = anp.precos_municipios.find((x) => x.uf === uf && x.chave === ch && x.combustivel === combustivel);
    if (m) {
      return {
        valor: m.preco, situacao: SITUACAO.ESTIMADO, ambito: 'cidade', rotulo: `média de ${m.postos} postos em ${cidade}`,
        premissa: `Preço médio de ${m.postos} postos em ${cidade} — ${uf}${est ? `, ${semana(est)}` : ''} (ANP). O preço na bomba pode ser diferente.`,
      };
    }
  }
  return est ? {
    valor: est.preco, situacao: SITUACAO.ESTIMADO, ambito: 'estado', rotulo: `média do estado ${uf}`,
    premissa: `Preço médio do estado ${uf}, ${semana(est)} (ANP). O preço na bomba pode ser diferente.`,
  } : null;
}

function feriadosSP(bases) {
  const lista = bases?.feriados?.feriados || [];
  return new Set(lista.filter((f) => ['nacional', 'SP', 'São Paulo/SP'].includes(f.jurisdicao)).map((f) => f.data));
}

/**
 * Cidade e UF de um lugar para buscar o preço. A busca nem sempre traz tudo:
 * sem cidade (ex.: "Avenida Paulista" ou uma cidade que veio só como nome) procura nas partes do rótulo;
 * sem UF (ex.: escolheu o estado "São Paulo", ou viagem antiga) usa a sigla do rótulo ou,
 * se o nome da cidade só existe num estado na pesquisa da ANP, esse estado.
 */
export function ondeFica(bases, lugar) {
  const mun = bases?.anp?.precos_municipios || [];
  const ufRotulo = (String(lugar?.rotulo || '').match(/—\s*([A-Z]{2})\s*$/) || [])[1] || null;
  const uf = lugar?.uf || ufRotulo;
  const partes = [lugar?.cidade, lugar?.nome, ...String(lugar?.rotulo || '').replace(/—\s*[A-Z]{2}\s*$/, '').split(',')]
    .map((s) => String(s || '').trim()).filter(Boolean);
  for (const c of partes) {
    const ch = chaveCidade(c);
    const ufs = [...new Set(mun.filter((m) => m.chave === ch).map((m) => m.uf))];
    if (uf ? ufs.includes(uf) : ufs.length === 1) return { uf: uf || ufs[0], cidade: c };
  }
  return { uf, cidade: lugar?.cidade || null };
}

/** Preço automático (ANP) do combustível do carro num lugar: da cidade ou do estado. null se não houver. */
export function precoAutomatico(bases, combustivel, lugar) {
  if (!lugar) return null;
  const { uf, cidade } = ondeFica(bases, lugar);
  return uf ? precoANP(bases, uf, combustivel, cidade) : null;
}

const informado = (x) => x !== null && x !== undefined && x !== '' && Number(x) >= 0;

/**
 * Sem preço automático (base da ANP ausente, falha ao atualizar ou cidade/estado sem pesquisa),
 * o preço passa a ser obrigatório: o app nunca calcula custo com preço inventado (Seção 1.4).
 * Retorna { campo: mensagem } no mesmo formato de validarTela.
 */
export function validarPrecos(v, tela, bases) {
  const e = {};
  const comb = v.veiculo.combustivel;
  if (tela === TELA.CARRO && v.origem && !precoAutomatico(bases, comb, v.origem) && !informado(v.veiculo.precoUltimo)) {
    e.precoUltimo = 'Não conseguimos o preço automático do combustível. Informe o preço do litro (o último que você pagou ou o que espera pagar).';
  }
  if (tela === TELA.PARADAS) {
    for (const s of ['ida', 'volta']) {
      v.paradas[s].forEach((p, i) => {
        if (p.abastecer && p.lugar && !precoAutomatico(bases, comb, p.lugar) && !informado(p.preco)) {
          e[`${s}.${i}.preco`] = 'Não há preço automático para esta cidade. Informe o preço do litro.';
        }
      });
    }
  }
  return e;
}

/** Resumo das rotas alternativas de um sentido: km, tempo e pedágios de cada uma (para o usuário escolher). */
export function resumoAlternativas(v, bases, sentido) {
  const rota = v.rotas?.[sentido];
  if (!rota?.alternativas || rota.alternativas.length < 2 || rota.chave !== chaveRota(v, sentido)) return [];
  const partida = Date.parse(partidaUTC(v, sentido) || new Date().toISOString());
  return rota.alternativas.map((alt, i) => {
    const amostras = alt.legs.flatMap((l) => (l.amostras || []).map((a) => ({ c: a.c, t: partida + a.dt * 1000, via: a.via })));
    const p = identificarPedagios({ amostras, base: bases?.pedagios, parametros: bases?.regras?.pedagios_identificacao, veiculo: v.veiculo, ajustes: v.ajustesPedagio });
    return {
      indice: i, escolhida: (rota.escolhida ?? 0) === i,
      km: alt.legs.reduce((s, l) => s + l.km, 0), duracao_s: alt.legs.reduce((s, l) => s + l.duracao_s, 0),
      pedagios: { confirmados: p.totalConfirmado, possiveis: p.possiveis.length, somaPossiveis: p.totalPossivel, desconhecidos: p.desconhecidas.length },
    };
  });
}

export function calcularViagem(v, bases, hojeISO = new Date().toISOString()) {
  const r = { revisao_entrada: v.revisao, versao_bases: bases?.versao || null, calculado_em: hojeISO, sentidos: {}, alertas: [], erros: [] };
  const amostrasTodas = [];
  const trechosCombustivel = [];
  const compras = {};

  for (const sentido of SENTIDOS) {
    const t = trechosDoSentido(v, sentido);
    const pontos = pontosDaRota(v, sentido);
    const paradas = v.paradas[sentido].map((p) => ({
      duracaoMin: p.saidaAgendada ? null : Number(p.duracaoMin),
      saidaAgendadaUTC: p.saidaAgendada ? localParaUTC(p.saidaAgendada.data, p.saidaAgendada.hora, fusoDe(p.lugar)) : null,
    }));
    const partida = partidaUTC(v, sentido);
    const it = t.trechos.length ? calcularItinerario(partida, t.trechos, paradas) : { etapas: [], erros: [], chegadaFinal: null };
    const etapas = it.etapas.map((e, i) => ({
      ...e,
      de: pontos[i], para: pontos[i + 1],
      fusoSaida: fusoDe(pontos[i]), fusoChegada: fusoDe(pontos[i + 1]),
      km: t.trechos[i].km, duracao_s: t.trechos[i].duracao_s,
      parada: v.paradas[sentido][i] || null,
    }));
    // Amostras com horário absoluto (a geometria guarda segundos desde o início do trecho).
    it.etapas.forEach((e, i) => {
      const base = Date.parse(e.saidaUTC);
      for (const a of t.trechos[i].amostras) amostrasTodas.push({ c: a.c, t: base + a.dt * 1000, via: a.via, sentido });
    });
    t.trechos.forEach((tr, i) => {
      trechosCombustivel.push({
        km: tr.km, rotulo: `${sentido} ${i + 1}`,
        sentido, indice: i, amostras: tr.amostras, duracao_s: tr.duracao_s,
        saidaUTC: it.etapas[i]?.saidaUTC || null, fuso: fusoDe(pontos[i]),
      });
      const p = v.paradas[sentido][i];
      const idx = trechosCombustivel.length - 1;
      if (p?.abastecer) {
        const anp = precoAutomatico(bases, v.veiculo.combustivel, p.lugar);
        const manual = p.preco !== null && p.preco !== '' && Number(p.preco) >= 0;
        compras[idx] = {
          modo: p.abastecer.modo, litros: p.abastecer.litros, uf: p.lugar?.uf,
          preco: manual ? Number(p.preco) : anp?.valor ?? null,
          situacaoPreco: manual ? SITUACAO.MANUAL : (anp ? SITUACAO.ESTIMADO : SITUACAO.INDISPONIVEL),
          origemPreco: manual ? 'informado por você' : (anp ? `ANP, ${anp.rotulo}` : 'não disponível'),
        };
      }
    });
    r.erros.push(...it.erros.map((e) => `${sentido === 'ida' ? 'Ida' : 'Volta'}: ${e}`));
    const km = t.trechos.reduce((s, x) => s + x.km, 0);
    const descanso = bases?.regras?.descanso;
    const descansos = sugerirDescansos(
      it.etapas.map((e, i) => ({ ...e, duracao_s: t.trechos[i].duracao_s, amostras: t.trechos[i].amostras })),
      { intervaloH: descanso?.intervalo_h ?? 2, paradaMinimaMin: descanso?.parada_minima_min ?? 15 },
    ).map((d) => ({ ...d, fuso: fusoDe(pontos[d.trecho - 1]) }));
    r.sentidos[sentido] = {
      ...t, etapas, km, descansos, partidaUTC: partida, chegadaUTC: it.chegadaFinal,
      duracao_s: it.chegadaFinal && partida ? (Date.parse(it.chegadaFinal) - Date.parse(partida)) / 1000 : null,
    };
  }

  // Volta não pode sair antes da chegada da ida (Seção 2, tela 1; revisão A1).
  const ida = r.sentidos.ida, volta = r.sentidos.volta;
  if (ida.chegadaUTC && volta.partidaUTC && Date.parse(volta.partidaUTC) < Date.parse(ida.chegadaUTC)) {
    r.erros.push('A partida da volta é antes da chegada prevista ao destino. Ajuste o horário da volta na tela 1.');
    r.voltaAntesDaChegada = true;
  }
  if (ida.partidaUTC && (volta.chegadaUTC || volta.partidaUTC)) {
    const fim = volta.chegadaUTC || volta.partidaUTC;
    r.dias = diasDaViagem(ida.partidaUTC, fusoDe(v.origem), fim, fusoDe(v.origem));
    r.duracaoHoras = duracaoHoras(ida.partidaUTC, fim);
    r.duracaoParcial = !volta.chegadaUTC;
  }

  // Combustível.
  const temTrechos = ida.trechos.length && volta.trechos.length;
  const v0 = v.veiculo;
  const anpOrigem = precoAutomatico(bases, v0.combustivel, v.origem);
  const custoInicial = v0.precoUltimo !== null && v0.precoUltimo !== '' && Number(v0.precoUltimo) >= 0
    ? { valor: Number(v0.precoUltimo), situacao: SITUACAO.MANUAL, premissa: 'Preço do último abastecimento antes da viagem, informado pelo usuário.' }
    : anpOrigem ? { ...anpOrigem, premissa: `Custo do que já está no tanque estimado pelo ${anpOrigem.premissa}` } : null;
  r.combustivel = { derivados: derivados(v0), custoInicial, precoOrigem: anpOrigem };
  if (temTrechos) {
    // Onde fica, quando passa e quanto custa cada ponto de abastecimento recomendado.
    const lugares = v.lugaresSugeridos || {};
    const localDoPonto = (gi, kmNoTrecho) => {
      const tc = trechosCombustivel[gi];
      const p = pontoNoPercurso(tc.amostras, tc.km, tc.duracao_s, kmNoTrecho);
      const chave = chavePonto(p.c);
      return { c: p.c, chave, lugar: chave ? lugares[chave] || null : null, t: tc.saidaUTC ? Date.parse(tc.saidaUTC) + p.dt * 1000 : null };
    };
    const precoNoPonto = (gi, kmNoTrecho) => {
      const { lugar } = localDoPonto(gi, kmNoTrecho);
      const doLugar = precoAutomatico(bases, v0.combustivel, lugar);
      if (doLugar) return { preco: doLugar.valor, uf: ondeFica(bases, lugar).uf, situacaoPreco: SITUACAO.ESTIMADO, origemPreco: `ANP, ${doLugar.rotulo}` };
      if (anpOrigem) return { preco: anpOrigem.valor, uf: v.origem?.uf, situacaoPreco: SITUACAO.ESTIMADO, origemPreco: `ANP, ${anpOrigem.rotulo} (cidade do ponto ainda não identificada)` };
      if (custoInicial) return { preco: custoInicial.valor, situacaoPreco: SITUACAO.MANUAL, origemPreco: 'preço do último abastecimento informado por você' };
      return { preco: null };
    };
    // Abastecimentos feitos de verdade, registrados pela pessoa durante a viagem.
    const offset = { ida: 0, volta: ida.trechos.length };
    const abastecidos = (v.abastecimentosReais || []).map((a) => ({
      ...a, trecho: offset[a.sentido] + Number(a.trechoDoSentido),
      situacaoPreco: a.preco !== null && a.preco !== '' && Number(a.preco) >= 0 ? SITUACAO.MANUAL : SITUACAO.ESTIMADO,
      ...(a.preco !== null && a.preco !== '' && Number(a.preco) >= 0 ? { preco: Number(a.preco), origemPreco: 'informado por você' } : (() => {
        const p = precoNoPonto(offset[a.sentido] + Number(a.trechoDoSentido), Number(a.kmNoTrecho));
        return { preco: p.preco, origemPreco: p.origemPreco };
      })()),
    }));
    const sim = simularTanque({
      veiculo: v0, trechos: trechosCombustivel, compras, custoInicial, abastecidos,
      automatico: { margemKm: v0.margemKm, distanciaMaxima: v0.distanciaMaxima, preco: precoNoPonto },
    });
    r.combustivel.simulacao = sim;
    const descrever = (x) => {
      const tc = trechosCombustivel[x.trecho - 1];
      const l = localDoPonto(x.trecho - 1, x.kmNoTrecho);
      return { ...x, sentido: tc.sentido, trechoDoSentido: tc.indice, fuso: tc.fuso, c: l.c, chave: l.chave, lugar: l.lugar, t: l.t };
    };
    // Preço automático num ponto qualquer do caminho (para o formulário "Abasteci" pelo GPS).
    r.combustivel.precoEm = (sentido, trechoDoSentido, kmNoTrecho) => {
      const p = precoNoPonto(offset[sentido] + Number(trechoDoSentido), Number(kmNoTrecho));
      return p.preco !== null && p.preco !== undefined && p.situacaoPreco !== SITUACAO.MANUAL ? { preco: p.preco, origemPreco: p.origemPreco } : null;
    };
    r.combustivel.recomendacoes = sim.recomendados.map(descrever);
    r.combustivel.feitos = sim.reais.map(descrever);
    r.combustivel.temCompras = Object.keys(compras).length > 0;
    // Estimativa simplificada só quando não há nenhum abastecimento no plano (nem recomendado, nem feito).
    if (!r.combustivel.temCompras && !sim.recomendados.length && !sim.reais.length) {
      if (anpOrigem) {
        r.combustivel.simplificada = estimativaSimplificada(sim.kmTotal, v0, anpOrigem.valor);
      } else {
        const s = estimativaSimplificada(sim.kmTotal, v0, custoInicial?.valor);
        r.combustivel.simplificada = custoInicial
          ? { ...s, situacao: SITUACAO.MANUAL, premissa: 'Litros totais × preço do último abastecimento informado por você (sem preço médio da ANP). Não é um plano de abastecimento.' }
          : s;
      }
    }
    for (const a of sim.alertas) r.alertas.push({ tipo: 'Combustível', nivel: 'atenção', mensagem: a.mensagem, km: a.km });
    if (sim.inviavel) r.alertas.push({ tipo: 'Combustível', nivel: 'grave', mensagem: sim.inviavel.mensagem, km: sim.inviavel.km });
    r.erros.push(...sim.erros);
  }
  if (v0.flex === 'Sim') {
    const e = precoAutomatico(bases, 'Etanol', v.origem), g = precoAutomatico(bases, 'Gasolina comum', v.origem);
    r.combustivel.flex = compararFlex({ precoEtanol: e?.valor, precoGasolina: g?.valor, consumoEtanol: v0.consumoEtanol, consumoGasolina: v0.consumoGasolina });
  }

  // Pedágios (ida e volta separadas, mesma base).
  const rotaManual = ida.origem !== 'rota' || volta.origem !== 'rota';
  if (rotaManual) {
    r.pedagios = { indisponivel: true, mensagem: 'Pedágios indisponíveis: sem traçado calculado.', situacao: SITUACAO.INDISPONIVEL, cobrancas: [], possiveis: [], desconhecidas: [], confirmadas: [], manuais: [], totalConfirmado: 0, totalManual: 0, coberturaParcial: true, rotulo: 'Total confirmado conhecido', textoVazio: 'Indisponível sem traçado' };
  } else {
    r.pedagios = identificarPedagios({ amostras: amostrasTodas, base: bases?.pedagios, parametros: bases?.regras?.pedagios_identificacao, veiculo: v0, ajustes: v.ajustesPedagio });
    if (r.pedagios.cobrancas.some((c) => c.tipo === 'free_flow')) {
      const primeira = r.pedagios.cobrancas.find((c) => c.tipo === 'free_flow');
      r.pedagios.freeFlow = avisosFreeFlow(bases?.regras, new Date(primeira.t).toISOString(), hojeISO);
    }
  }

  // Rodízio.
  r.rodizio = verificarRodizio({
    amostras: rotaManual ? [] : amostrasTodas,
    rotaManual,
    finalPlaca: v0.finalPlaca,
    regra: bases?.regras?.rodizio_sp,
    area: bases?.centroExpandido,
    nivelArea: bases?.centroExpandido?.nivel_verificacao,
    feriados: feriadosSP(bases),
    suspensoes: bases?.suspensoes?.suspensoes,
    margemMin: v0.margemRodizioMin,
    hojeISO,
  });
  for (const a of r.rodizio.alertas) r.alertas.push({ tipo: 'Rodízio', nivel: a.tipo === 'rodizio' ? 'grave' : 'atenção', mensagem: a.mensagem });

  // Documentos.
  const inicio = v.datas.ida.data, fim = v.datas.volta.data;
  r.documentos = { ...situacaoDocumentos(v.viajantes, v.documentosConfirmados, inicio, fim, bases?.regras?.retencao_infantil), aviso: AVISO_FIXO };
  r.descansoTexto = bases?.regras?.descanso?.texto || null;

  r.situacao = piorSituacao([ida.situacao, volta.situacao]);
  return r;
}
