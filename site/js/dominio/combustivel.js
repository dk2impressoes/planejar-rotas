// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Combustível e abastecimento (Seção 4). Precisão completa; arredondar só na exibição.
import { SITUACAO, piorSituacao } from './situacao.js';

export const CATEGORIAS = ['Automóvel', 'Automóvel com reboque', 'Motocicleta'];
export const COMBUSTIVEIS = ['Diesel S10', 'Etanol', 'Gasolina comum'];

export const VEICULO_PADRAO = Object.freeze({
  categoria: 'Automóvel', combustivel: 'Gasolina comum', flex: 'Não',
  consumo: null, consumoEtanol: null, consumoGasolina: null,
  tanque: null, saida: 100, reserva: 15, perda: 0,
  finalPlaca: '', eixos: 3, precoUltimo: null, distanciaMaxima: null, margemKm: 0,
});

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// Consumo usado nos cálculos: no flex, o do combustível escolhido.
export function consumoBase(v) {
  if (v.flex === 'Sim') return num(v.combustivel === 'Etanol' ? v.consumoEtanol : v.consumoGasolina);
  return num(v.consumo);
}

/** Validações da Seção 4.2. Retorna { campo: mensagem }. */
export function validarVeiculo(v) {
  const e = {};
  if (!CATEGORIAS.includes(v.categoria)) e.categoria = 'Escolha a categoria.';
  if (!COMBUSTIVEIS.includes(v.combustivel)) e.combustivel = 'Escolha o combustível.';
  if (v.flex === 'Sim') {
    if (!(num(v.consumoEtanol) > 0)) e.consumoEtanol = 'Informe o consumo com etanol (maior que zero).';
    if (!(num(v.consumoGasolina) > 0)) e.consumoGasolina = 'Informe o consumo com gasolina (maior que zero).';
  } else if (!(num(v.consumo) > 0)) {
    e.consumo = 'O consumo deve ser maior que zero.';
  }
  if (!(num(v.tanque) > 0)) e.tanque = 'A capacidade do tanque deve ser maior que zero.';
  const s = num(v.saida);
  if (!(s >= 0 && s <= 100)) e.saida = 'O combustível na saída deve ficar entre 0% e 100%.';
  const r = num(v.reserva);
  if (!(r >= 0 && r < 100)) e.reserva = 'A reserva deve ficar entre 0% e menos de 100%.';
  const p = num(v.perda);
  if (!(p >= 0 && p < 100)) e.perda = 'A perda deve ficar entre 0% e menos de 100%.';
  if (v.finalPlaca !== '' && v.finalPlaca !== null && !/^\d$/.test(String(v.finalPlaca))) {
    e.finalPlaca = 'Informe só o último dígito da placa (0 a 9).';
  }
  if (v.precoUltimo !== null && v.precoUltimo !== '' && !(num(v.precoUltimo) >= 0)) {
    e.precoUltimo = 'O preço não pode ser negativo.';
  }
  if (v.categoria === 'Automóvel com reboque' && !(Number.isInteger(num(v.eixos)) && num(v.eixos) >= 3)) {
    e.eixos = 'Informe o total de eixos do conjunto (3 ou mais).';
  }
  return e;
}

/** Fórmulas 1 a 5 da Seção 4.3. */
export function derivados(v) {
  const consumo = consumoBase(v);
  const ajustado = consumo * (1 - num(v.perda) / 100);
  const reservaL = num(v.tanque) * num(v.reserva) / 100;
  const litrosSaida = num(v.tanque) * num(v.saida) / 100;
  return {
    ajustado,
    reservaL,
    litrosSaida,
    autonomiaInicial: Math.max(0, litrosSaida - reservaL) * ajustado,
    autonomiaCheia: (num(v.tanque) - reservaL) * ajustado,
    abaixoDaReservaNaSaida: litrosSaida < reservaL,
  };
}

/**
 * Simulação do tanque (fórmulas 6 a 11), em sequência, trecho por trecho.
 * trechos: [{ km, rotulo }]
 * compras: { [indiceDoTrechoAnterior]: { modo: 'completar'|'parcial', litros, preco, uf, origemPreco, situacaoPreco } }
 *   A compra de índice i acontece na parada ao fim do trecho i.
 * custoInicial: { valor, situacao, premissa } — custo médio do que já está no tanque.
 */
export function simularTanque({ veiculo, trechos, compras = {}, custoInicial, automatico = null, abastecidos = [] }) {
  const d = derivados(veiculo);
  const tanque = num(veiculo.tanque);
  const erros = [];
  const alertas = [];
  const comprasFeitas = [];
  const situacoes = [];
  let saldo = d.litrosSaida;
  let custoMedio = custoInicial && Number.isFinite(custoInicial.valor) ? custoInicial.valor : null;
  if (custoInicial) situacoes.push(custoInicial.situacao);
  let custoConsumido = custoMedio === null ? null : 0;
  let desembolso = 0;
  let desembolsoConhecido = true;
  let kmAcumulado = 0;
  let inviavel = null;
  let reservaAvisada = false;
  const passos = [];

  if (d.abaixoDaReservaNaSaida) {
    alertas.push({ tipo: 'reserva', km: 0, trecho: 0, mensagem: 'Reserva atingida já na saída: o tanque começa abaixo da reserva.' });
    reservaAvisada = true;
  }

  // Registra uma compra (manual ou recomendada) e atualiza custo médio, desembolso e saldo (fórmulas 7 a 10).
  const comprar = (litros, c, extra) => {
    const preco = num(c.preco);
    const temPreco = Number.isFinite(preco) && preco >= 0;
    if (litros > 0) {
      if (temPreco) {
        desembolso += litros * preco;
        if (saldo <= 0) custoMedio = preco; // tanque vazio: a compra define o custo médio
        else if (custoMedio !== null) custoMedio = (saldo * custoMedio + litros * preco) / (saldo + litros);
        situacoes.push(c.situacaoPreco || SITUACAO.MANUAL);
      } else {
        desembolsoConhecido = false;
        custoMedio = null;
        custoConsumido = null;
        situacoes.push(SITUACAO.INDISPONIVEL);
      }
    }
    const registro = {
      ...extra, litros, saldoAntes: saldo, saldoDepois: saldo + litros,
      preco: temPreco ? preco : null, uf: c.uf || null, origemPreco: c.origemPreco || null,
      situacao: temPreco ? (c.situacaoPreco || SITUACAO.MANUAL) : SITUACAO.INDISPONIVEL,
    };
    saldo += litros;
    return registro;
  };

  // Abastecimentos recomendados pelo sistema (Seção 4.4): antes de entrar na reserva (menos a margem) ou ao
  // chegar à distância máxima entre abastecimentos, o plano completa o tanque naquele ponto.
  const auto = automatico || null;
  const margem = Math.max(0, num(auto?.margemKm) || 0);
  const dmax = num(auto?.distanciaMaxima) > 0 ? num(auto.distanciaMaxima) : Infinity;
  const recomendados = [];
  const reaisFeitos = [];
  // Abastecimentos feitos de verdade na viagem: { id, trecho (índice 0..n-1), kmNoTrecho, modo, litros, preco, ... }.
  const reais = Array.isArray(abastecidos) ? abastecidos : [];
  let autoLigado = !!auto;
  if (autoLigado && !(Math.min((tanque - d.reservaL) * d.ajustado - margem, dmax) > 1)) {
    erros.push('Não dá para recomendar abastecimentos: com o tanque, a reserva e a margem informados, o carro quase não anda entre um abastecimento e outro.');
    autoLigado = false;
  }
  let kmDesdeAbastecer = 0;

  for (let i = 0; i < trechos.length; i++) {
    const km = num(trechos[i].km);
    if (!(km >= 0)) {
      erros.push(`Trecho ${i + 1}: distância inválida.`);
      break;
    }
    let restante = km;
    let kmNoTrecho = 0;
    // Eventos dentro do trecho, em ordem de km: abastecimentos que a pessoa registrou (reais) e os recomendados.
    const reaisDoTrecho = reais.filter((a) => a.trecho === i).sort((a, b) => a.kmNoTrecho - b.kmNoTrecho);
    let ir = 0;
    for (;;) {
      const real = reaisDoTrecho[ir];
      const posReal = real ? Math.min(Math.max(num(real.kmNoTrecho) || 0, kmNoTrecho), km) : Infinity;
      let posAuto = Infinity;
      if (autoLigado) {
        const limite = Math.min((saldo - d.reservaL) * d.ajustado - margem, dmax - kmDesdeAbastecer);
        posAuto = kmNoTrecho + Math.max(0, limite);
      }
      const proximo = Math.min(posReal, posAuto);
      if (!(proximo < km) && !(real && posReal <= km && posReal <= posAuto)) break;
      // Anda até o evento.
      const x = proximo - kmNoTrecho;
      const gasto = x / d.ajustado;
      if (saldo - gasto < 0 && !inviavel) break; // acaba antes: o trecho normal abaixo registra o "inviável"
      if (custoConsumido !== null) custoConsumido += gasto * custoMedio;
      saldo -= gasto;
      kmNoTrecho = proximo;
      restante = km - kmNoTrecho;
      kmDesdeAbastecer += x;
      if (real && posReal <= posAuto) {
        // Abastecimento registrado pela pessoa: vale o que ela informou.
        const espaco = Math.max(0, tanque - saldo);
        let litros = real.modo === 'completar' ? espaco : num(real.litros);
        if (!(litros >= 0)) litros = 0;
        if (litros > espaco + 1e-9) {
          erros.push(`Abastecimento registrado (${fmtL(litros)}) maior que o espaço livre no tanque naquele ponto (${fmtL(espaco)}). Usamos o tanque cheio.`);
          litros = espaco;
        }
        reaisFeitos.push(comprar(litros, real, { real: true, id: real.id, trecho: i + 1, kmNoTrecho, km: kmAcumulado + kmNoTrecho }));
        ir++;
      } else {
        const c = auto.preco ? auto.preco(i, kmNoTrecho) : {};
        recomendados.push(comprar(Math.max(0, tanque - saldo), c, {
          recomendado: true, trecho: i + 1, kmNoTrecho, km: kmAcumulado + kmNoTrecho,
        }));
      }
      kmDesdeAbastecer = 0;
      if (recomendados.length + reaisFeitos.length > 300) { erros.push('Abastecimentos demais: confira o consumo e o tanque.'); autoLigado = false; break; } // trava de segurança
    }
    kmDesdeAbastecer += restante;
    const consumidos = restante / d.ajustado;
    const saldoAntes = saldo;
    if (custoConsumido !== null) custoConsumido += consumidos * custoMedio;
    saldo -= consumidos;

    const inicioRestante = kmNoTrecho;
    if (!reservaAvisada && saldo < d.reservaL) {
      const kmNoTrechoR = inicioRestante + Math.max(0, (saldoAntes - d.reservaL) * d.ajustado);
      alertas.push({
        tipo: 'reserva', trecho: i + 1, km: kmAcumulado + kmNoTrechoR,
        mensagem: `Reserva atingida no trecho ${i + 1}, cerca de ${Math.round(kmNoTrechoR)} km depois do início do trecho.`,
      });
      reservaAvisada = true;
    }
    if (saldo < 0 && !inviavel) {
      const kmNoTrechoI = inicioRestante + saldoAntes * d.ajustado;
      inviavel = {
        trecho: i + 1, km: kmAcumulado + kmNoTrechoI,
        mensagem: `Plano inviável: o combustível acabaria no trecho ${i + 1}, cerca de ${Math.round(kmNoTrechoI)} km depois do início do trecho.`,
      };
    }
    kmAcumulado += km;
    passos.push({ trecho: i + 1, rotulo: trechos[i].rotulo, km, consumidos: km / d.ajustado, saldoAntes, saldoDepois: saldo, recomendados: recomendados.filter((r) => r.trecho === i + 1).length });
    if (inviavel) break;

    const c = compras[i];
    if (c && i < trechos.length - 1) {
      const espaco = tanque - saldo;
      let litros = c.modo === 'completar' ? espaco : num(c.litros);
      if (!(litros >= 0) || litros > espaco + 1e-9) {
        erros.push(`Parada ${i + 1}: a compra (${fmtL(litros)}) é maior que o espaço livre no tanque (${fmtL(espaco)}).`);
        litros = 0;
      }
      if (reservaAvisada && saldo + litros >= d.reservaL) reservaAvisada = false;
      comprasFeitas.push(comprar(litros, c, { parada: i + 1 }));
      if (litros > 0) kmDesdeAbastecer = 0;
    }
  }

  const sobraL = Math.max(0, saldo);
  return {
    derivados: d,
    passos,
    compras: comprasFeitas,
    recomendados,
    reais: reaisFeitos,
    alertas,
    inviavel,
    erros,
    kmTotal: kmAcumulado,
    custoConsumido: inviavel ? null : custoConsumido,
    desembolso: desembolsoConhecido ? desembolso : null,
    sobraL,
    sobraValor: custoMedio === null ? null : sobraL * custoMedio,
    situacao: situacoes.length ? piorSituacao(situacoes) : SITUACAO.INDISPONIVEL,
  };
}

/** Estimativa simplificada sem paradas de abastecimento (Seção 4.3). */
export function estimativaSimplificada(kmTotal, veiculo, precoOrigem) {
  const d = derivados(veiculo);
  const litros = kmTotal / d.ajustado;
  const preco = num(precoOrigem);
  return {
    litros,
    valor: Number.isFinite(preco) ? litros * preco : null,
    situacao: Number.isFinite(preco) ? SITUACAO.ESTIMADO : SITUACAO.INDISPONIVEL,
    premissa: 'Litros totais × preço médio da UF de origem. Não é um plano de abastecimento.',
  };
}

/** Comparação flex (Seção 4.5). */
export function compararFlex({ precoEtanol, precoGasolina, consumoEtanol, consumoGasolina }) {
  const pe = num(precoEtanol), pg = num(precoGasolina);
  if (!(pe >= 0 && pg > 0)) return { situacao: SITUACAO.INDISPONIVEL, mensagem: 'Faltam os preços dos dois combustíveis.' };
  const ce = num(consumoEtanol), cg = num(consumoGasolina);
  if (ce > 0 && cg > 0) {
    const kmE = pe / ce, kmG = pg / cg;
    return {
      situacao: SITUACAO.ESTIMADO, metodo: 'custo por km', custoKmEtanol: kmE, custoKmGasolina: kmG,
      vence: kmE < kmG ? 'Etanol' : (kmE > kmG ? 'Gasolina comum' : 'Empate'),
      mensagem: `Etanol R$ ${kmE.toFixed(3).replace('.', ',')} por km × gasolina R$ ${kmG.toFixed(3).replace('.', ',')} por km.`,
    };
  }
  const razao = pe / pg;
  return {
    situacao: SITUACAO.ESTIMADO, metodo: 'referência de 70%', razao,
    vence: razao <= 0.7 ? 'Etanol' : 'Gasolina comum',
    mensagem: `O etanol custa ${(razao * 100).toFixed(0)}% da gasolina. Referência aproximada: compensa até 70%.`,
  };
}

function fmtL(l) {
  return Number.isFinite(l) ? `${l.toFixed(1).replace('.', ',')} L` : 'valor inválido';
}
