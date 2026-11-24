// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Pedágios e free flow (Seção 5).
import { distanciaAoSegmentoM, rumo, diferencaAngular } from './geo.js';
import { COBRANCA, SITUACAO, situacaoPorNivel, regraVigente } from './situacao.js';

const CARDEAIS = { norte: 0, leste: 90, sul: 180, oeste: 270 };
const normalizar = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Categoria de tarifa a partir do veículo.
export function categoriaTarifa(veiculo) {
  if (veiculo.categoria === 'Motocicleta') return 'motocicleta';
  if (veiculo.categoria === 'Automóvel com reboque') return `automovel_${Number(veiculo.eixos) || 3}_eixos`;
  return 'automovel';
}

function viaConfere(ponto, vias) {
  const alvo = normalizar(ponto.rodovia);
  if (!alvo) return false;
  return vias.some((v) => normalizar(v).split(/[;,]/).some((x) => x.includes(alvo)) || normalizar(v).includes(alvo));
}

// Vigências que valem no instante (ms). Devolve a confirmada, se houver, e a prevista.
function vigencias(ponto, ms) {
  const d = new Date(ms).toISOString().slice(0, 10);
  const valem = (ponto.vigencias || []).filter((v) => (!v.inicio || d >= v.inicio) && (!v.fim || d <= v.fim));
  return {
    confirmada: valem.find((v) => v.estado === 'confirmada') || null,
    prevista: valem.find((v) => v.estado === 'prevista') || null,
  };
}

/**
 * Identifica cobranças ao longo das amostras ({ c:[lon,lat], t, via }).
 * Cada passagem contínua perto de um ponto conta uma vez; nova passagem (retorno, volta) conta de novo.
 */
export function identificarPedagios({ amostras, base, parametros, veiculo, ajustes = {} }) {
  const limiteM = parametros?.distancia_m ?? 150;
  const limiteAng = parametros?.angulo_graus ?? 45;
  const categoria = categoriaTarifa(veiculo);
  const cobrancas = [];
  if (!amostras?.length || !base?.pontos) return resumo(cobrancas, true);

  // Retângulo do traçado (com folga de ~6 km): pontos de fora nem são testados.
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  for (const a of amostras) { x0 = Math.min(x0, a.c[0]); x1 = Math.max(x1, a.c[0]); y0 = Math.min(y0, a.c[1]); y1 = Math.max(y1, a.c[1]); }
  for (const ponto of base.pontos) {
    const p = [ponto.coordenadas.lon, ponto.coordenadas.lat];
    if (p[0] < x0 - 0.06 || p[0] > x1 + 0.06 || p[1] < y0 - 0.06 || p[1] > y1 + 0.06) continue;
    // Coordenada imprecisa amplia a busca, mas sem coordenada verificada o ponto nunca é confirmado.
    const raio = Math.max(limiteM, Number(ponto.tolerancia_m) || 0);
    let passagem = null;
    const fechar = () => {
      if (passagem) cobrancas.push(avaliar(ponto, passagem, categoria, ajustes));
      passagem = null;
    };
    for (let i = 0; i < amostras.length - 1; i++) {
      const a = amostras[i].c, b = amostras[i + 1].c;
      const dist = distanciaAoSegmentoM(p, a, b);
      const perto = dist <= raio;
      const r = rumo(a, b);
      // Sentido em graus: só conta passando nesse rumo. Em texto ("ambos", "crescente"…): conta e o
      // sentido da quilometragem é tratado depois, em aplicarSentidoProvavel.
      const sentidoOk = typeof ponto.sentido !== 'number' || diferencaAngular(r, ponto.sentido) <= limiteAng;
      if (perto && sentidoOk) {
        if (!passagem) passagem = { t: amostras[i].t, vias: [], sentidoViagem: amostras[i].sentido || '', dist: Infinity, rumo: null };
        if (dist < passagem.dist) { passagem.dist = dist; passagem.rumo = r; } // rumo do carro no ponto mais perto da praça
        if (amostras[i].via) passagem.vias.push(amostras[i].via);
      } else if (passagem && !perto) {
        fechar();
      }
    }
    fechar();
  }
  cobrancas.sort((x, y) => x.t - y.t);
  aplicarSentidoProvavel(cobrancas);
  return resumo(cobrancas, base.cobertura_completa !== true);
}

/**
 * Praças que cobram só no sentido "crescente" ou "decrescente" (da quilometragem): o sentido da viagem é
 * deduzido pela ordem em que a rota passa pelas praças da mesma rodovia (km subindo ou descendo).
 * Uma praça do sentido oposto sai da lista de possíveis, mas continua visível à parte.
 */
export function aplicarSentidoProvavel(cobrancas, minimoKm = 5) {
  const grupos = new Map();
  for (const c of cobrancas) {
    if (!Number.isFinite(c.km)) continue;
    const k = `${c.sentidoViagem}|${c.rodovia}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.t - b.t);
    const delta = g[g.length - 1].km - g[0].km;
    if (Math.abs(delta) < minimoKm) continue;
    const provavel = delta > 0 ? 'crescente' : 'decrescente';
    for (const c of g) {
      if (!['crescente', 'decrescente'].includes(c.sentido_texto) || c.sentido_texto === provavel) continue;
      if (c.situacao !== COBRANCA.POSSIVEL && c.situacao !== COBRANCA.DESCONHECIDA) continue;
      c.situacao = COBRANCA.FORA_DO_SENTIDO;
      c.motivo = `A rota segue no sentido ${provavel} da ${c.rodovia} (pela ordem das praças) e esta praça cobra só no sentido ${c.sentido_texto}.`;
    }
  }
}

function avaliar(ponto, passagem, categoria, ajustes) {
  // A correção do usuário fica presa à praça e ao sentido (não à hora: mudar a saída não a apaga).
  const chave = `${ponto.id}@${passagem.sentidoViagem || 'ida'}`;
  // Formato antigo (praça + horário): continua valendo, para não perder correções já feitas.
  const chaveAntiga = `${ponto.id}@${new Date(passagem.t).toISOString().slice(0, 16)}`;
  const base = {
    chave, chaveAntiga, id: ponto.id, tipo: ponto.tipo, nome: ponto.nome || null, rodovia: ponto.rodovia, km: ponto.km,
    concessionaria: ponto.concessionaria, t: passagem.t, fonte: ponto.fonte,
    canal_pagamento: ponto.canal_pagamento || null, url_tarifa_oficial: ponto.url_tarifa_oficial || null,
    regras_acesso: ponto.regras_acesso || [], sentido_texto: ponto.sentido_texto || null,
    alternativas: ponto.alternativas || [], tipoFonte: null,
    sentidoViagem: passagem.sentidoViagem || '', valor: null, situacaoValor: SITUACAO.INDISPONIVEL,
  };
  // Praça que cobra só "norte", "sul", "leste" ou "oeste": se o carro passa indo para o lado oposto
  // (mais de 95° de diferença), não cobra nesta passagem. Ex.: Caieiras (sul) e Campo Limpo (norte), na SP-348.
  const cardeal = CARDEAIS[ponto.sentido_texto];
  if (cardeal !== undefined && Number.isFinite(passagem.rumo) && diferencaAngular(passagem.rumo, cardeal) > 95) {
    return {
      ...base, situacao: COBRANCA.FORA_DO_SENTIDO,
      motivo: `Esta praça cobra só no sentido ${ponto.sentido_texto}, e o caminho passa por ela no sentido oposto.`,
    };
  }
  const ajuste = ajustes[chave] ?? ajustes[chaveAntiga];
  if (ajuste !== undefined && ajuste !== null && Number(ajuste) >= 0) {
    return { ...base, situacao: COBRANCA.MANUAL, valor: Number(ajuste), situacaoValor: SITUACAO.MANUAL, motivo: 'Valor corrigido pelo usuário nesta viagem.' };
  }
  const { confirmada, prevista } = vigencias(ponto, passagem.t);
  const tarifa = confirmada || prevista;
  const valor = tarifa?.categorias?.[categoria];
  const temValor = Number.isFinite(valor);
  const passagemConfirmada = ponto.coordenadas_verificadas === true
    && viaConfere(ponto, passagem.vias)
    && !(ponto.regras_acesso && ponto.regras_acesso.length);

  if (!tarifa || !temValor) {
    return { ...base, situacao: COBRANCA.DESCONHECIDA, motivo: 'Ponto sem tarifa conhecida para esta categoria na data da passagem.' };
  }
  const resultado = { ...base, valor, situacaoValor: situacaoPorNivel(tarifa.nivel_verificacao), vigencia: tarifa, tipoFonte: tarifa.tipo_fonte || null };
  // Tabela oficial anterior ao último reajuste anual: o valor pode ter subido (mostrado como "desatualizado").
  const diaPassagem = new Date(passagem.t).toISOString().slice(0, 10);
  if (tarifa.revisar_desde && diaPassagem >= tarifa.revisar_desde) {
    resultado.situacaoValor = SITUACAO.DESATUALIZADO;
    resultado.valorAntigo = `valor de ${tarifa.inicio.slice(0, 4)}, pode ter reajuste`;
  }
  if (!confirmada) {
    return { ...resultado, situacao: COBRANCA.POSSIVEL, motivo: `Tarifa prevista a partir de ${tarifa.inicio}, ainda sem publicação oficial.` };
  }
  if (!passagemConfirmada) {
    const extra = (ponto.regras_acesso || []).join(' ');
    return { ...resultado, situacao: COBRANCA.POSSIVEL, motivo: `Ponto perto do traçado, mas sem confirmação da via, do sentido e dos acessos.${extra ? ' ' + extra : ''}` };
  }
  return { ...resultado, situacao: COBRANCA.CONFIRMADA, motivo: prevista ? `Nova tarifa prevista a partir de ${prevista.inicio}.` : '' };
}

function resumo(cobrancas, coberturaParcial) {
  const confirmadas = cobrancas.filter((c) => c.situacao === COBRANCA.CONFIRMADA);
  const manuais = cobrancas.filter((c) => c.situacao === COBRANCA.MANUAL);
  const possiveis = cobrancas.filter((c) => c.situacao === COBRANCA.POSSIVEL);
  const desconhecidas = cobrancas.filter((c) => c.situacao === COBRANCA.DESCONHECIDA);
  const foraDoSentido = cobrancas.filter((c) => c.situacao === COBRANCA.FORA_DO_SENTIDO);
  const totalConfirmado = confirmadas.reduce((s, c) => s + c.valor, 0);
  const totalManual = manuais.reduce((s, c) => s + c.valor, 0);
  // Soma dos possíveis com valor conhecido: mostrada à parte, nunca somada ao total confirmado.
  const totalPossivel = possiveis.filter((c) => Number.isFinite(c.valor)).reduce((s, c) => s + c.valor, 0);
  const parcial = coberturaParcial || possiveis.length > 0 || desconhecidas.length > 0;
  return {
    cobrancas, confirmadas, manuais, possiveis, desconhecidas, foraDoSentido,
    totalConfirmado, totalManual, totalPossivel,
    coberturaParcial: parcial,
    rotulo: 'Total confirmado conhecido',
    // Nunca "sem pedágio" quando faltam dados (Seção 5.3.6).
    textoVazio: parcial ? 'Nenhum pedágio confirmado — cobertura parcial dos dados' : 'Nenhum pedágio encontrado',
    situacao: confirmadas.length
      ? (confirmadas.every((c) => c.situacaoValor === SITUACAO.CONFIRMADO) ? SITUACAO.CONFIRMADO : SITUACAO.ESTIMADO)
      : (manuais.length ? SITUACAO.MANUAL : SITUACAO.INDISPONIVEL),
  };
}

/** Avisos de free flow (Seção 5.5) montados a partir de regras.json. */
export function avisosFreeFlow(regras, dataPassagemISO, hojeISO) {
  const ff = regras?.free_flow;
  const generico = ['Pagamento eletrônico — consulte o prazo no canal oficial da concessionária.'];
  if (!ff) return { textos: generico, situacao: SITUACAO.INDISPONIVEL };
  const periodo = (ff.periodos || []).find((p) => regraVigente(p, dataPassagemISO, hojeISO).ok);
  if (!periodo) return { textos: generico, situacao: SITUACAO.INDISPONIVEL };
  const v = regraVigente(periodo, dataPassagemISO, hojeISO);
  if (v.situacao === SITUACAO.DESATUALIZADO || periodo.nivel_verificacao === 'nao_verificado') {
    return { textos: generico, situacao: v.situacao === SITUACAO.DESATUALIZADO ? SITUACAO.DESATUALIZADO : SITUACAO.INDISPONIVEL };
  }
  const textos = ['Cobrança eletrônica sem cabine. Quem tem TAG paga automaticamente.'];
  textos.push(`Sem TAG, o prazo é de até ${periodo.prazo_dias} dias após a passagem. Pague pelos canais oficiais da concessionária.`);
  if (periodo.autuacao_suspensa === true) {
    textos.push(periodo.texto_transicao || 'Regime de transição: autuações temporariamente suspensas.');
  } else {
    textos.push(`O não pagamento gera multa de R$ ${fmt(periodo.multa_reais)} e ${periodo.pontos} pontos na CNH.`);
    if (periodo.texto_transicao) textos.push(periodo.texto_transicao);
  }
  textos.push(`Fonte: ${periodo.orgao}, ${periodo.tipo_ato} ${periodo.numero_ato}. Conferido em ${periodo.consultado_em}.`);
  return { textos, situacao: v.situacao };
}

const fmt = (n) => Number(n).toFixed(2).replace('.', ',');
