// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Testes de unidade do núcleo (Seção 15, "Cálculos"). Rodam no navegador: testes/unidade/index.html
import { derivados, simularTanque, validarVeiculo, compararFlex, estimativaSimplificada } from '../../site/js/dominio/combustivel.js';
import { diasDaViagem, localParaUTC, calcularItinerario, formatarDataHora, dataLocal } from '../../site/js/dominio/tempo.js';
import { verificarRodizio } from '../../site/js/dominio/rodizio.js';
import { identificarPedagios, avisosFreeFlow, aplicarSentidoProvavel } from '../../site/js/dominio/pedagios.js';
import { documentosDoViajante, idadeNaViagem, situacaoDocumentos } from '../../site/js/dominio/documentos.js';
import { regraVigente, SITUACAO, COBRANCA } from '../../site/js/dominio/situacao.js';
import { novaViagem, chaveRota, validarTela, novaParada, registrarAlteracao } from '../../site/js/dominio/viagem.js';
import { calcularViagem } from '../../site/js/dominio/calculo.js';
import { exportar, conferirImportacao } from '../../site/js/armazenamento/exportacao.js';
import { validar } from '../../site/js/servicos/esquema.js';
import { registrarResultado, disjuntorAberto } from '../../site/js/servicos/http.js';
import { sugerirDescansos } from '../../site/js/dominio/descanso.js';
import { retencaoInfantil } from '../../site/js/dominio/documentos.js';
import { resumoAlternativas } from '../../site/js/dominio/calculo.js';
import { urlGoogleMaps, urlWaze, linkOficial } from '../../site/js/interface/revisao.js';
import { interpretarData, interpretarHora, mascararData, mascararHora } from '../../site/js/interface/datas.js';
import { campo, explicar, el, anexar, escrever, textoSeguro } from '../../site/js/interface/dom.js';
import { seletorLugar } from '../../site/js/interface/telas.js';
import { modeloListaIndividual, separadorDaLista, migrarViagem, TELA } from '../../site/js/dominio/viagem.js';
import { precoAutomatico, ondeFica } from '../../site/js/dominio/calculo.js';
import { dePhoton, ufPorNome } from '../../site/js/servicos/buscador.js';
import { custosDaViagem, gruposParaComparar, custosDoAno, anosComViagem, chaveDestino } from '../../site/js/dominio/comparacao.js';

export const testes = [];
const teste = (nome, fn) => testes.push({ nome, fn });
const igual = (a, b, msg = '') => { if (a !== b) throw new Error(`${msg} esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
const perto = (a, b, tol = 1e-9, msg = '') => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg} esperado ≈${b}, obtido ${a}`); };
const verdade = (x, msg = 'condição falsa') => { if (!x) throw new Error(msg); };

const veic = (o = {}) => ({ categoria: 'Automóvel', combustivel: 'Gasolina comum', flex: 'Não', consumo: 12, tanque: 50, saida: 100, reserva: 15, perda: 10, finalPlaca: '', ...o });

// ---------- Combustível ----------
teste('Consumo zero é recusado', () => verdade(validarVeiculo(veic({ consumo: 0 })).consumo));
teste('Exemplo da Seção 4.3 dá 459 km', () => {
  const d = derivados(veic());
  perto(d.ajustado, 10.8, 1e-12); perto(d.reservaL, 7.5); perto(d.autonomiaInicial, 459, 1e-9);
});
teste('Saída abaixo da reserva: autonomia 0 e alerta imediato', () => {
  const v = veic({ saida: 10 });
  igual(derivados(v).autonomiaInicial, 0);
  const s = simularTanque({ veiculo: v, trechos: [{ km: 1 }], custoInicial: { valor: 6, situacao: 'manual' } });
  igual(s.alertas[0].km, 0);
});
teste('50 L sem compra: desembolso 0, custo > 0, sobra correta', () => {
  const v = veic({ perda: 0 }); // 12 km/L
  const s = simularTanque({ veiculo: v, trechos: [{ km: 120 }, { km: 120 }], custoInicial: { valor: 6, situacao: 'manual' } });
  igual(s.desembolso, 0); perto(s.custoConsumido, 20 * 6); perto(s.sobraL, 30); perto(s.sobraValor, 180);
});
teste('Custo médio ponderado com duas compras (conferido à mão)', () => {
  const v = veic({ perda: 0, consumo: 10, tanque: 50, saida: 100, reserva: 0 });
  // Saldo 50 L a R$ 5. Trecho 1: 300 km = 30 L -> saldo 20. Compra completar 30 L a R$ 6:
  //   médio = (20*5 + 30*6)/50 = 5,6. Trecho 2: 200 km = 20 L -> saldo 30. Compra parcial 10 L a R$ 7:
  //   médio = (30*5,6 + 10*7)/40 = 5,95. Trecho 3: 100 km = 10 L -> saldo 30.
  const s = simularTanque({
    veiculo: v, trechos: [{ km: 300 }, { km: 200 }, { km: 100 }], custoInicial: { valor: 5, situacao: 'manual' },
    compras: { 0: { modo: 'completar', preco: 6, situacaoPreco: 'manual' }, 1: { modo: 'parcial', litros: 10, preco: 7, situacaoPreco: 'manual' } },
  });
  perto(s.custoConsumido, 30 * 5 + 20 * 5.6 + 10 * 5.95, 1e-9, 'custo consumido');
  perto(s.desembolso, 30 * 6 + 10 * 7, 1e-9, 'desembolso');
  perto(s.sobraL, 30); perto(s.sobraValor, 30 * 5.95, 1e-9);
});
teste('Reserva atingida e plano inviável', () => {
  const v = veic({ perda: 0, consumo: 10, tanque: 50, reserva: 20 }); // reserva 10 L
  const s = simularTanque({ veiculo: v, trechos: [{ km: 450 }, { km: 100 }], custoInicial: { valor: 5, situacao: 'manual' } });
  igual(s.alertas[0].tipo, 'reserva'); perto(s.alertas[0].km, 400);
  verdade(s.inviavel, 'deveria ser inviável'); perto(s.inviavel.km, 500); igual(s.custoConsumido, null);
});
teste('Compra acima do espaço livre é recusada', () => {
  const s = simularTanque({ veiculo: veic(), trechos: [{ km: 10 }, { km: 10 }], compras: { 0: { modo: 'parcial', litros: 40, preco: 6 } }, custoInicial: { valor: 6 } });
  verdade(s.erros.length === 1, 'erro esperado'); igual(s.desembolso, 0);
});
teste('Preço sem fonte deixa o desembolso indisponível, sem inventar', () => {
  const s = simularTanque({ veiculo: veic(), trechos: [{ km: 300 }, { km: 10 }], compras: { 0: { modo: 'completar', preco: null } }, custoInicial: { valor: 6 } });
  igual(s.desembolso, null); igual(s.custoConsumido, null);
});
teste('Flex: custo por km com dois consumos; 70% com um', () => {
  const a = compararFlex({ precoEtanol: 4, precoGasolina: 6, consumoEtanol: 7, consumoGasolina: 10 });
  igual(a.metodo, 'custo por km'); igual(a.vence, 'Etanol');
  const b = compararFlex({ precoEtanol: 4.5, precoGasolina: 6 });
  igual(b.metodo, 'referência de 70%'); igual(b.vence, 'Gasolina comum');
});
teste('Estimativa simplificada usa o preço da origem e fica "estimado"', () => {
  const e = estimativaSimplificada(108, veic(), 6);
  perto(e.litros, 10); perto(e.valor, 60); igual(e.situacao, SITUACAO.ESTIMADO);
});

// ---------- Tempo ----------
teste('Contagem inclusiva: 12/01 a 14/01 = 3 dias', () => {
  igual(diasDaViagem(localParaUTC('2027-01-12', '08:00', 'America/Sao_Paulo'), 'America/Sao_Paulo', localParaUTC('2027-01-14', '20:00', 'America/Sao_Paulo'), 'America/Sao_Paulo'), 3);
});
teste('Ida e volta no mesmo dia = 1 dia', () => {
  igual(diasDaViagem(localParaUTC('2027-01-12', '06:00', 'America/Sao_Paulo'), 'America/Sao_Paulo', localParaUTC('2027-01-12', '22:00', 'America/Sao_Paulo'), 'America/Sao_Paulo'), 1);
});
teste('Fuso: São Paulo → Cuiabá mostra cada horário no fuso local', () => {
  const partida = localParaUTC('2027-01-12', '08:00', 'America/Sao_Paulo');
  igual(partida, '2027-01-12T11:00:00.000Z');
  const it = calcularItinerario(partida, [{ duracao_s: 3600 * 20 }]);
  igual(it.chegadaFinal, '2027-01-13T07:00:00.000Z');
  verdade(formatarDataHora(it.chegadaFinal, 'America/Cuiaba').startsWith('13/01/2027 03:00'), formatarDataHora(it.chegadaFinal, 'America/Cuiaba'));
});
teste('Pernoite com saída agendada não soma o tempo de novo; virada de dia', () => {
  const p = localParaUTC('2027-01-12', '20:00', 'America/Sao_Paulo');
  const it = calcularItinerario(p, [{ duracao_s: 5 * 3600 }, { duracao_s: 3600 }], [{ saidaAgendadaUTC: localParaUTC('2027-01-13', '08:00', 'America/Sao_Paulo') }]);
  igual(it.erros.length, 0);
  igual(dataLocal(it.etapas[0].chegadaUTC, 'America/Sao_Paulo'), '2027-01-13');
  igual(it.chegadaFinal, localParaUTC('2027-01-13', '09:00', 'America/Sao_Paulo'));
});
teste('Saída agendada antes da chegada e duração negativa geram erro', () => {
  const p = localParaUTC('2027-01-12', '08:00', 'America/Sao_Paulo');
  igual(calcularItinerario(p, [{ duracao_s: 7200 }, { duracao_s: 60 }], [{ saidaAgendadaUTC: localParaUTC('2027-01-12', '09:00', 'America/Sao_Paulo') }]).erros.length, 1);
  igual(calcularItinerario(p, [{ duracao_s: 7200 }, { duracao_s: 60 }], [{ duracaoMin: -5 }]).erros.length, 1);
  igual(calcularItinerario(p, [{ duracao_s: 0 }, { duracao_s: 60 }], [{ duracaoMin: 0 }]).erros.length, 0);
});
teste('Tela 1: volta antes da ida é recusada', () => {
  const v = novaViagem();
  v.datas = { ida: { data: '2027-01-14', hora: '08:00' }, volta: { data: '2027-01-12', hora: '08:00' } };
  verdade(validarTela(v, 1)['volta.data'].includes('depois'));
  v.datas.volta = { data: '2027-01-14', hora: '18:00' };
  igual(Object.keys(validarTela(v, 1)).length, 0);
});

// ---------- Rodízio ----------
const quadrado = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-46.70, -23.60], [-46.60, -23.60], [-46.60, -23.50], [-46.70, -23.50], [-46.70, -23.60]]] } }] };
const regraRod = { fuso: 'America/Sao_Paulo', tabela: { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 0] }, horarios: [{ inicio: '07:00', fim: '10:00' }, { inicio: '17:00', fim: '20:00' }], margem_min_padrao: 30, nivel_verificacao: 'primaria', vigente_de: '2026-01-01', revisar_ate: '2099-01-01' };
// Segunda-feira, 15/03/2027: atravessa o quadrado de oeste a leste em 20 min.
const travessia = (hora) => {
  const t0 = Date.parse(localParaUTC('2027-03-15', hora, 'America/Sao_Paulo'));
  return [{ c: [-46.75, -23.55], t: t0 }, { c: [-46.65, -23.55], t: t0 + 10 * 60000 }, { c: [-46.55, -23.55], t: t0 + 20 * 60000 }];
};
const rod = (o) => verificarRodizio({ amostras: travessia('08:00'), finalPlaca: 1, regra: regraRod, area: quadrado, nivelArea: 'primaria', feriados: new Set(), suspensoes: [], hojeISO: '2027-01-01T00:00:00Z', ...o });
teste('Rodízio: final 1 na segunda às 8h gera alerta', () => igual(rod().alertas[0].tipo, 'rodizio'));
teste('Rodízio: final 3 na segunda não gera alerta', () => igual(rod({ finalPlaca: 3 }).alertas.length, 0));
teste('Rodízio: 6h20 a 6h40 fica na margem (risco)', () => igual(rod({ amostras: travessia('06:20') }).alertas[0].tipo, 'risco'));
teste('Rodízio: margem 0 em 6h20 não gera alerta', () => igual(rod({ amostras: travessia('06:20'), margemMin: 0 }).alertas.length, 0));
// A borda oeste fica a 2,5 min do início da travessia.
teste('Rodízio: entrar na área às 9h57 é restrição; às 10h01, só risco', () => {
  igual(rod({ amostras: travessia('09:55') }).alertas[0].tipo, 'rodizio');
  igual(rod({ amostras: travessia('09:59') }).alertas[0].tipo, 'risco');
});
teste('Rodízio: feriado e suspensão não geram alerta', () => {
  igual(rod({ feriados: new Set(['2027-03-15']) }).alertas.length, 0);
  igual(rod({ suspensoes: [{ inicio: '2027-03-15', fim: '2027-03-15' }] }).alertas.length, 0);
});
teste('Rodízio: passagem fora da área não gera alerta', () => {
  const t0 = Date.parse(localParaUTC('2027-03-15', '08:00', 'America/Sao_Paulo'));
  igual(rod({ amostras: [{ c: [-46.80, -23.70], t: t0 }, { c: [-46.50, -23.70], t: t0 + 600000 }] }).alertas.length, 0);
});
teste('Rodízio: sem placa fica indisponível com pedido do dígito', () => {
  const r = rod({ finalPlaca: '' });
  igual(r.situacao, SITUACAO.INDISPONIVEL); verdade(r.mensagem.includes('final da placa'));
});
teste('Rodízio: rota manual e área não verificada dão "Possível restrição"', () => {
  igual(rod({ rotaManual: true }).alertas[0].tipo, 'possivel');
  igual(rod({ nivelArea: 'nao_verificado' }).alertas[0].tipo, 'possivel');
});
teste('Regra com revisar_ate vencido aparece como desatualizado', () => {
  igual(regraVigente({ ...regraRod, revisar_ate: '2026-01-01' }, '2027-03-15', '2027-01-01T00:00:00Z').situacao, SITUACAO.DESATUALIZADO);
});

// ---------- Pedágios ----------
const ponto = (o = {}) => ({ id: 'p1', tipo: 'praca', rodovia: 'SP-160', km: 30, coordenadas: { lat: -23.80, lon: -46.50 }, coordenadas_verificadas: true, sentido: 180, regras_acesso: [], vigencias: [{ inicio: '2026-01-01', fim: null, estado: 'confirmada', nivel_verificacao: 'primaria', categorias: { automovel: 10 } }], ...o });
const descendo = (lon = -46.50, t0 = Date.parse('2027-03-15T12:00:00Z'), via = 'SP-160; Rodovia dos Imigrantes') => [
  { c: [lon, -23.78], t: t0, via }, { c: [lon, -23.80], t: t0 + 60000, via }, { c: [lon, -23.82], t: t0 + 120000, via }];
const subindo = (t0) => descendo(-46.50, t0).reverse().map((a, i) => ({ ...a, t: t0 + i * 60000 }));
const ped = (amostras, pontos, veiculo = veic()) => identificarPedagios({ amostras, base: { pontos, cobertura_completa: true }, parametros: { distancia_m: 150, angulo_graus: 45 }, veiculo });
teste('Pedágio: via e sentido conferidos = confirmada', () => {
  const r = ped(descendo(), [ponto()]);
  igual(r.confirmadas.length, 1); igual(r.totalConfirmado, 10); igual(r.rotulo, 'Total confirmado conhecido');
});
teste('Pedágio: coordenada não verificada = possível, fora do total', () => {
  const r = ped(descendo(), [ponto({ coordenadas_verificadas: false })]);
  igual(r.possiveis.length, 1); igual(r.totalConfirmado, 0); verdade(r.coberturaParcial);
  verdade(!r.textoVazio.toLowerCase().startsWith('sem pedágio'));
});
teste('Pedágio: sentido oposto não cobra', () => igual(ped(subindo(Date.parse('2027-03-15T12:00:00Z')), [ponto()]).cobrancas.length, 0));
teste('Pedágio: pista paralela a 500 m não cobra', () => igual(ped(descendo(-46.495), [ponto()]).cobrancas.length, 0));
teste('Pedágio: via diferente no ponto (marginal) fica possível', () => igual(ped(descendo(-46.50, undefined, 'Marginal'), [ponto()]).possiveis.length, 1));
teste('Pedágio: retorno ao mesmo ponto cobra de novo', () => {
  const t0 = Date.parse('2027-03-15T12:00:00Z');
  const ida = descendo(-46.50, t0);
  const longe = { c: [-46.50, -23.90], t: t0 + 600000, via: 'SP-160' };
  const outra = descendo(-46.50, t0 + 3600000).map((a) => ({ ...a }));
  const volta = [{ ...longe, c: [-46.50, -23.70], t: t0 + 3500000 }];
  igual(ped([...ida, longe, ...volta, ...outra], [ponto()]).confirmadas.length, 2);
});
teste('Pedágio: tarifa desconhecida para motocicleta', () => igual(ped(descendo(), [ponto()], veic({ categoria: 'Motocicleta' })).desconhecidas.length, 1));
teste('Pedágio: vigência prevista nunca entra como confirmada (Anchieta-Imigrantes)', () => {
  const ff = ponto({ id: 'ff', tipo: 'free_flow', sentido: 'ambos', vigencias: [{ inicio: '2026-12-01', estado: 'prevista', nivel_verificacao: 'secundaria', categorias: { automovel: 20.3 } }] });
  const r = ped(descendo(-46.50, Date.parse('2026-12-05T12:00:00Z')), [ff]);
  igual(r.possiveis.length, 1); igual(r.totalConfirmado, 0);
  igual(ped(descendo(-46.50, Date.parse('2026-11-25T12:00:00Z')), [ff]).desconhecidas.length, 1);
});
teste('Valor secundário aparece como estimado', () => igual(ped(descendo(), [ponto({ vigencias: [{ inicio: '2026-01-01', estado: 'confirmada', nivel_verificacao: 'secundaria', categorias: { automovel: 10 } }] })]).confirmadas[0].situacaoValor, SITUACAO.ESTIMADO));
teste('Free flow: regra de regras.json muda o aviso; vencida dá texto genérico', () => {
  const regras = { free_flow: { periodos: [{ vigente_de: '2026-01-01', nivel_verificacao: 'secundaria', revisar_ate: '2099-01-01', prazo_dias: 45, multa_reais: 100, pontos: 3, orgao: 'X', tipo_ato: 'Res', numero_ato: '1', consultado_em: 'hoje' }] } };
  verdade(avisosFreeFlow(regras, '2027-01-01', '2027-01-01').textos.some((t) => t.includes('45 dias')));
  regras.free_flow.periodos[0].revisar_ate = '2026-06-01';
  verdade(avisosFreeFlow(regras, '2027-01-01', '2027-01-01').textos[0].startsWith('Pagamento eletrônico'));
});

// ---------- Documentos ----------
teste('Faixa "15 anos" pede a data de nascimento', () => verdade(idadeNaViagem({ faixa: '15 anos' }, '2027-01-10', '2027-01-20').precisaNascimento));
teste('Faz 16 durante a viagem: autorização exigida na ida', () => {
  const r = documentosDoViajante({ nome: 'A', nascimento: '2011-01-15' }, '2027-01-10', '2027-01-20');
  verdade(r.itens.some((i) => i.id === 'autorizacao'));
});
teste('Condutor com 17 anos é recusado; lista geral só conclui com tudo confirmado', () => {
  igual(documentosDoViajante({ nome: 'B', nascimento: '2010-01-01', condutor: true }, '2027-02-01', '2027-02-02').erros.length, 1);
  const p = [{ id: 'x', nome: 'C', faixa: '18 anos ou mais', condutor: true }];
  igual(situacaoDocumentos(p, { x: { 'documento-foto': true, cnh: true } }, '2027-02-01', '2027-02-02').concluida, false);
  igual(situacaoDocumentos(p, { x: { 'documento-foto': true, cnh: true, crlv: true } }, '2027-02-01', '2027-02-02').concluida, true);
});

// ---------- Invalidação, rota manual e núcleo ----------
const lugar = (lat, lon, uf = 'SP') => ({ nome: 'L', uf, lat, lon, fuso: 'America/Sao_Paulo', rotulo: 'L' });
teste('Invalidação: placa não muda a chave da rota; parada muda', () => {
  const v = novaViagem(); v.origem = lugar(-23.5, -46.6); v.destino = lugar(-22.9, -47.0);
  const k = chaveRota(v, 'ida');
  v.veiculo.finalPlaca = '5'; igual(chaveRota(v, 'ida'), k);
  v.paradas.ida.push({ ...novaParada(), lugar: lugar(-23.2, -46.8) });
  verdade(chaveRota(v, 'ida') !== k);
});
teste('Alteração depois da preparação marca "desatualizada"', () => {
  const v = novaViagem(); v.preparacao = { estado: 'pronto', revisao: v.revisao };
  registrarAlteracao(v); igual(v.preparacao.desatualizada, true);
});
teste('Rota manual: sem pedágio nem rodízio confirmado; nenhuma distância inventada', () => {
  const v = novaViagem(); v.origem = lugar(-23.5, -46.6); v.destino = lugar(-22.9, -47.0);
  v.datas = { ida: { data: '2027-03-15', hora: '08:00' }, volta: { data: '2027-03-16', hora: '08:00' } };
  Object.assign(v.veiculo, { consumo: 10, tanque: 50, finalPlaca: '1' });
  let r = calcularViagem(v, null, '2027-01-01T00:00:00Z');
  igual(r.sentidos.ida.km, 0); igual(r.sentidos.ida.etapas.length, 0);
  v.manual = { ida: [{ km: 100, horas: 1.5 }], volta: [{ km: 100, horas: 1.5 }] };
  r = calcularViagem(v, null, '2027-01-01T00:00:00Z');
  igual(r.sentidos.ida.situacao, SITUACAO.MANUAL); igual(r.pedagios.situacao, SITUACAO.INDISPONIVEL);
  igual(r.rodizio.alertas[0].tipo, 'possivel'); igual(r.dias, 2);
});
teste('Volta antes da chegada da ida é acusada no núcleo', () => {
  const v = novaViagem(); v.origem = lugar(-23.5, -46.6); v.destino = lugar(-22.9, -47.0);
  v.datas = { ida: { data: '2027-03-15', hora: '08:00' }, volta: { data: '2027-03-15', hora: '09:00' } };
  v.manual = { ida: [{ km: 100, horas: 2 }], volta: [{ km: 100, horas: 2 }] };
  verdade(calcularViagem(v, null).voltaAntesDaChegada);
});

// ---------- Importação e segurança ----------
teste('Exportação válida é restaurada', async () => {
  const v = novaViagem(); v.nome = 'Teste';
  const r = await conferirImportacao(await exportar([v]));
  igual(r.viagens[0].nome, 'Teste');
});
teste('Arquivo alterado, malicioso ou grande é recusado', async () => {
  const v = novaViagem();
  const txt = await exportar([v]);
  const falha = async (t) => { try { await conferirImportacao(t); return false; } catch { return true; } };
  verdade(await falha(txt.replace('"revisao": 1', '"revisao": 2')), 'alterado');
  verdade(await falha(txt.replace('"nome": ""', '"nome": "", "__proto__": {"x": 1}')), 'prototype');
  verdade(await falha('x'.repeat(5 * 1024 * 1024 + 1)), 'grande');
  verdade(await falha('{"formato":"outro"}'), 'formato');
});
teste('Campos desconhecidos são descartados na importação', async () => {
  const v = { ...novaViagem(), campoEstranho: '<img src=x onerror=alert(1)>' };
  const r = await conferirImportacao(await exportar([v]));
  igual(r.viagens[0].campoEstranho, undefined);
});
teste('Base fora do esquema é recusada', () => verdade(validar({ versao: 1 }, { type: 'object', required: ['pontos'], properties: { versao: { type: 'string' } } }).length === 2));
// ---------- Trazido do v5 ----------
teste('Descanso: sugestão a cada 2 h ao volante; parada longa zera a contagem', () => {
  const t0 = '2027-03-15T11:00:00.000Z';
  const e = (dur, saidaParada) => ({ saidaUTC: t0, chegadaUTC: new Date(Date.parse(t0) + dur * 1000).toISOString(), duracao_s: dur, saidaParadaUTC: saidaParada, amostras: [{ c: [-46, -23], dt: 0 }, { c: [-47, -22], dt: dur }] });
  const s1 = sugerirDescansos([e(5 * 3600)]);
  igual(s1.length, 2); igual(s1[0].segundosNoTrecho, 7200); igual(s1[1].segundosNoTrecho, 14400);
  // 1h30 + parada de 30 min + 1h30: sem sugestão. Com parada de 5 min: sugestão no segundo trecho.
  const longa = e(5400, new Date(Date.parse(t0) + 5400000 + 30 * 60000).toISOString());
  igual(sugerirDescansos([longa, e(5400)]).length, 0);
  const curta = e(5400, new Date(Date.parse(t0) + 5400000 + 5 * 60000).toISOString());
  const s3 = sugerirDescansos([curta, e(5400)]);
  igual(s3.length, 1); igual(s3[0].trecho, 2); igual(s3[0].segundosNoTrecho, 1800);
});
teste('Descanso: trecho de exatamente 2 h não trava (bug do laço infinito)', () => {
  const t0 = '2027-03-15T11:00:00.000Z';
  const e = (dur) => ({ saidaUTC: t0, chegadaUTC: new Date(Date.parse(t0) + dur * 1000).toISOString(), duracao_s: dur, saidaParadaUTC: null, amostras: [] });
  const s = sugerirDescansos([e(7200), e(3600), e(3600), e(7200)]);
  // 2 h exatas: descanso no início do 2º trecho; depois 1 h + 1 h = 2 h: descanso no início do 4º.
  igual(s.map((x) => `${x.trecho}@${x.segundosNoTrecho}`).join(' '), '2@0 4@0');
  igual(sugerirDescansos([e(7200)], { intervaloH: 0 }).length, 0);
});
teste('Cadeirinha: faixa pela idade em meses no início da viagem; regra só vem da base', () => {
  const regra = { orgao: 'Contran', tipo_ato: 'Resolução', numero_ato: 'X', nivel_verificacao: 'secundaria', url_oficial: 'https://www.planalto.gov.br/', faixas: [{ ate_meses: 12, texto: 'Bebê-conforto.' }, { ate_meses: 48, texto: 'Cadeirinha.' }, { ate_meses: 90, texto: 'Assento de elevação.' }, { ate_meses: 120, texto: 'Cinto.' }] };
  verdade(retencaoInfantil({ nascimento: '2026-06-01' }, '2027-03-15', regra).item.texto.startsWith('Bebê-conforto'));
  verdade(retencaoInfantil({ nascimento: '2020-01-01' }, '2027-03-15', regra).item.texto.startsWith('Assento'));  // 7 anos e 2 meses
  igual(retencaoInfantil({ nascimento: '2010-01-01' }, '2027-03-15', regra), null);
  verdade(retencaoInfantil({ faixa: '0 a 14 anos' }, '2027-03-15', regra).pendencia);
  igual(retencaoInfantil({ nascimento: '2026-06-01' }, '2027-03-15', null), null);
});
teste('Pedágio: coordenada imprecisa amplia a busca, mas só gera "possível"', () => {
  const longe = ponto({ coordenadas: { lat: -23.80, lon: -46.509 }, coordenadas_verificadas: false, tolerancia_m: 1500 }); // ~900 m
  const r = ped(descendo(), [longe]);
  igual(r.possiveis.length, 1); igual(r.totalConfirmado, 0); perto(r.totalPossivel, 10);
  igual(ped(descendo(), [ponto({ coordenadas: { lat: -23.80, lon: -46.509 } })]).cobrancas.length, 0);
});
teste('Pedágio: praça só do sentido oposto (pela ordem dos km) sai dos possíveis', () => {
  const t0 = Date.parse('2027-03-15T12:00:00Z');
  const c = (km, sentido_texto, i) => ({ km, sentido_texto, rodovia: 'BR-116', sentidoViagem: 'ida', t: t0 + i * 60000, situacao: COBRANCA.POSSIVEL, motivo: '' });
  const lista = [c(204.8, 'decrescente', 0), c(182.4, 'decrescente', 1), c(180.7, 'crescente', 2), c(87, 'ambos', 3)];
  // a rota passa do km 204 ao km 87: sentido decrescente
  const r = lista.map((x) => ({ ...x }));
  aplicarSentidoProvavel(r);
  igual(r[2].situacao, COBRANCA.FORA_DO_SENTIDO);
  igual(r[1].situacao, COBRANCA.POSSIVEL); igual(r[3].situacao, COBRANCA.POSSIVEL);
  // poucos km de diferença: não dá para deduzir, nada muda
  const curto = [c(182.4, 'decrescente', 0), c(180.7, 'crescente', 1)];
  aplicarSentidoProvavel(curto);
  igual(curto[1].situacao, COBRANCA.POSSIVEL);
});
teste('Pedágio: praça "sul" não cobra de quem passa indo para o norte (Caieiras × Campo Limpo)', () => {
  const t0 = Date.parse('2027-03-15T12:00:00Z');
  const subindo = [{ c: [-46.50, -23.82], t: t0, via: 'SP-160' }, { c: [-46.50, -23.80], t: t0 + 60000, via: 'SP-160' }, { c: [-46.50, -23.78], t: t0 + 120000, via: 'SP-160' }];
  const sul = ponto({ id: 'sul', sentido: 'ambos', sentido_texto: 'sul', coordenadas_verificadas: false });
  const norte = ponto({ id: 'norte', sentido: 'ambos', sentido_texto: 'norte', coordenadas_verificadas: false });
  const r = ped(subindo, [sul, norte]);
  igual(r.possiveis.map((c) => c.id).join(), 'norte');
  igual(r.foraDoSentido.map((c) => c.id).join(), 'sul');
  perto(r.totalPossivel, 10);                                  // só a praça do sentido certo entra na soma
});
teste('Pedágio: a cobrança diz de qual fonte veio o valor e traz as alternativas', () => {
  const p = ponto({
    vigencias: [{ inicio: '2026-07-01', estado: 'confirmada', nivel_verificacao: 'secundaria', categorias: { automovel: 14.5 }, tipo_fonte: 'pesquisa' }],
    alternativas: [{ valor: 13.7, inicio: '2025-07-01', tipo_fonte: 'oficial', fonte: 'tabela oficial' }],
  });
  const c = ped(descendo(-46.50, Date.parse('2026-11-28T12:00:00Z')), [p]).cobrancas[0];
  igual(c.tipoFonte, 'pesquisa'); igual(c.valor, 14.5); igual(c.alternativas[0].valor, 13.7);
});
teste('Pedágio: tabela oficial antiga, depois do reajuste anual, aparece como "pode ter reajuste"', () => {
  const p = ponto({ vigencias: [{ inicio: '2025-07-01', estado: 'confirmada', nivel_verificacao: 'primaria', categorias: { automovel: 13.7 }, revisar_desde: '2026-07-01', tipo_fonte: 'oficial' }] });
  const antes = ped(descendo(-46.50, Date.parse('2026-03-10T12:00:00Z')), [p]).cobrancas[0];
  const depois = ped(descendo(-46.50, Date.parse('2026-11-28T12:00:00Z')), [p]).cobrancas[0];
  igual(antes.situacaoValor, SITUACAO.CONFIRMADO); igual(antes.valorAntigo, undefined);
  igual(depois.situacaoValor, SITUACAO.DESATUALIZADO); verdade(depois.valorAntigo.includes('2025'));
});
teste('Rotas alternativas: resumo com km, tempo e pedágios de cada opção', () => {
  const v = novaViagem(); v.origem = lugar(-23.78, -46.50); v.destino = lugar(-23.82, -46.50);
  v.datas = { ida: { data: '2027-03-15', hora: '08:00' }, volta: { data: '2027-03-16', hora: '08:00' } };
  const legA = { km: 5, duracao_s: 600, amostras: descendo().map((a, i) => ({ c: a.c, dt: i * 60, via: a.via })) };
  const legB = { km: 9, duracao_s: 900, amostras: descendo(-46.40).map((a, i) => ({ c: a.c, dt: i * 60, via: a.via })) };
  v.rotas.ida = { chave: chaveRota(v, 'ida'), legs: [legA], alternativas: [{ legs: [legA] }, { legs: [legB] }], escolhida: 0 };
  const alts = resumoAlternativas(v, { pedagios: { pontos: [ponto()] }, regras: { pedagios_identificacao: { distancia_m: 150, angulo_graus: 45 } } }, 'ida');
  igual(alts.length, 2); igual(alts[0].pedagios.confirmados, 10); igual(alts[1].pedagios.confirmados, 0); verdade(alts[0].escolhida);
  v.paradas.ida.push({ ...novaParada(), lugar: lugar(-23.8, -46.45) });
  igual(resumoAlternativas(v, null, 'ida').length, 0); // trajeto mudou: alternativas antigas não valem
});
teste('Google Maps e Waze: só coordenadas, sem nomes', () => {
  const u = urlGoogleMaps([{ lat: -23.5, lon: -46.6, nome: 'Casa da Ana' }, { lat: -23.2, lon: -46.8 }, { lat: -22.9, lon: -47.0 }]);
  verdade(u.startsWith('https://www.google.com/maps/dir/?api=1'));
  verdade(!u.includes('Ana') && u.includes('waypoints=-23.20000%2C-46.80000'));
  igual(urlWaze({ lat: -22.9, lon: -47 }), 'https://waze.com/ul?ll=-22.90000,-47.00000&navigate=yes');
});
teste('Link de tarifa: só https em gov.br', () => {
  verdade(linkOficial('https://www.gov.br/antt/x'));
  igual(linkOficial('http://www.gov.br/antt/x'), null);
  igual(linkOficial('https://gov.br.exemplo.com/x'), null);
  igual(linkOficial('javascript:alert(1)'), null);
});
teste('Exportação deixa de fora as rotas alternativas', async () => {
  const v = novaViagem();
  v.rotas.ida = { chave: 'k', legs: [], alternativas: [{ legs: [] }, { legs: [] }], escolhida: 1 };
  const r = await conferirImportacao(await exportar([v]));
  igual(r.viagens[0].rotas.ida.alternativas.length, 0);
  igual(v.rotas.ida.alternativas.length, 2); // o original não é alterado
});
teste('Base inicial de pedágios passa no esquema e tem tarifas', async () => {
  const [dados, esquema] = await Promise.all(['../../site/dados/pedagios.json', '../../site/esquemas/pedagios.schema.json'].map((u) => fetch(u).then((r) => r.json())));
  igual(validar(dados, esquema).length, 0);
  verdade(dados.pontos.length > 300);
  verdade(dados.pontos.filter((p) => p.vigencias.length).length > 200);
  verdade(dados.pontos.every((p) => p.coordenadas_verificadas === false), 'nenhum ponto pode ser confirmado sem conferência');
});

// ---------- Abastecimento recomendado e registrado ----------
const v10 = () => veic({ perda: 0, consumo: 10, tanque: 50, saida: 100, reserva: 20 }); // reserva 10 L; anda 400 km até a reserva
const auto = (o = {}) => ({ margemKm: 0, preco: () => ({ preco: 6, situacaoPreco: 'estimado' }), ...o });
teste('Recomendação: completa o tanque onde chegaria à reserva, quantas vezes precisar', () => {
  const s = simularTanque({ veiculo: v10(), trechos: [{ km: 1000 }], custoInicial: { valor: 6 }, automatico: auto() });
  igual(s.recomendados.map((x) => x.km).join(','), '400,800');
  perto(s.recomendados[0].litros, 40); igual(s.inviavel, null); igual(s.alertas.length, 0);
  perto(s.sobraL, 30);                                    // 50 L depois do km 800, gasta 20 L até o km 1000
  perto(s.desembolso, 80 * 6); perto(s.custoConsumido, 100 * 6);
});
teste('Recomendação: margem antecipa o ponto; distância máxima entre abastecimentos é respeitada', () => {
  igual(simularTanque({ veiculo: v10(), trechos: [{ km: 500 }], custoInicial: { valor: 6 }, automatico: auto({ margemKm: 50 }) }).recomendados[0].km, 350);
  igual(simularTanque({ veiculo: v10(), trechos: [{ km: 500 }], custoInicial: { valor: 6 }, automatico: auto({ distanciaMaxima: 150 }) }).recomendados.map((x) => x.km).join(','), '150,300,450');
});
teste('Recomendação: tanque pequeno demais para a margem não trava e avisa', () => {
  const s = simularTanque({ veiculo: v10(), trechos: [{ km: 510 }], custoInicial: { valor: 6 }, automatico: auto({ margemKm: 450 }) });
  igual(s.recomendados.length, 0); verdade(s.erros.length === 1); verdade(s.inviavel);
});
teste('Abasteci de verdade: o plano recomeça a partir dali', () => {
  // Abasteceu 20 L no km 300 (saldo 20 L → 40 L): a reserva agora chega no km 300 + 300 = 600.
  const s = simularTanque({
    veiculo: v10(), trechos: [{ km: 900 }], custoInicial: { valor: 6 }, automatico: auto(),
    abastecidos: [{ id: 'a1', trecho: 0, kmNoTrecho: 300, modo: 'parcial', litros: 20, preco: 7, situacaoPreco: 'manual' }],
  });
  igual(s.reais.length, 1); igual(s.reais[0].km, 300);
  igual(s.recomendados.map((x) => x.km).join(','), '600');
  perto(s.desembolso, 20 * 7 + 40 * 6);
});
teste('Parada marcada "vou abastecer aqui" é contada mesmo quando a reserva viria antes', () => {
  // Antes: o combustível "acabava" no caminho e a parada nunca era alcançada. Agora o app recomenda antes e a parada conta.
  const s = simularTanque({
    veiculo: v10(), trechos: [{ km: 450 }, { km: 100 }], custoInicial: { valor: 6 }, automatico: auto(),
    compras: { 0: { modo: 'completar', preco: 5, situacaoPreco: 'manual' } },
  });
  igual(s.compras.length, 1); verdade(s.compras[0].litros > 0); igual(s.inviavel, null);
});

// ---------- Lista individual e explicações ----------
teste('Lista individual já vem com o básico; criança ganha itens a mais', () => {
  const adulto = modeloListaIndividual({ id: 'a', nome: 'Ana' }, 35);
  verdade(adulto.itens.length >= 10); igual(adulto.viajanteId, 'a'); igual(adulto.titulo, 'Lista de Ana');
  verdade(!adulto.itens.some((i) => i.texto.includes('Fraldas')));
  const bebe = modeloListaIndividual({ id: 'b', nome: 'Bia' }, 1);
  verdade(bebe.itens.some((i) => i.texto.includes('Fraldas')) && bebe.itens.length > adulto.itens.length);
});
teste('Lista individual: roupas vêm com a quantidade de dias', () => {
  const l = modeloListaIndividual({ id: 'a', nome: 'Ana' }, 35, 4);
  igual(l.itens.find((i) => i.texto.startsWith('Roupas para')).quantidade, '4');
  igual(l.itens.find((i) => i.texto.startsWith('Escova')).quantidade, '');
});
teste('Preço da ANP: usa a média da cidade quando existe, senão a do estado', () => {
  const v = novaViagem(); v.origem = { ...lugar(-20.8, -49.4), cidade: 'São José do Rio Preto' }; v.destino = lugar(-23.5, -46.6);
  v.datas = { ida: { data: '2027-03-15', hora: '08:00' }, volta: { data: '2027-03-16', hora: '08:00' } };
  Object.assign(v.veiculo, { combustivel: 'Etanol', consumo: 10, tanque: 50 });
  v.manual = { ida: [{ km: 100, horas: 1 }], volta: [{ km: 100, horas: 1 }] };
  const bases = { anp: {
    precos: [{ uf: 'SP', combustivel: 'Etanol', preco: 4.05, periodo_inicio: '2026-11-08', periodo_fim: '2026-11-14' }],
    precos_municipios: [{ uf: 'SP', municipio: 'Sao Jose Do Rio Preto', chave: 'SAO JOSE DO RIO PRETO', combustivel: 'Etanol', preco: 3.641, postos: 19 }],
  } };
  const r = calcularViagem(v, bases);
  perto(r.combustivel.precoOrigem.valor, 3.641); igual(r.combustivel.precoOrigem.ambito, 'cidade');
  v.origem.cidade = 'Bálsamo';                              // cidade sem pesquisa da ANP: média do estado
  perto(calcularViagem(v, bases).combustivel.precoOrigem.valor, 4.05);
});
teste('Botão "?" abre e fecha a explicação e tem nome acessível', () => {
  const [b, painel] = explicar('t-x', 'Consumo', 'Texto simples');
  verdade(painel.hidden); igual(b.getAttribute('aria-label'), 'O que é: Consumo');
  b.click(); igual(painel.hidden, false); igual(b.getAttribute('aria-expanded'), 'true');
  b.click(); igual(painel.hidden, true);
  igual(explicar('t-y', 'Sem', null)[0], null);
});

// ---------- Datas e horas digitadas ----------
teste('Data digitada: formatos aceitos e erros claros', () => {
  const hoje = new Date(2026, 10, 23);
  igual(interpretarData('15/03/2027', { hoje }).iso, '2027-03-15');
  igual(interpretarData('15032027', { hoje }).iso, '2027-03-15');
  igual(interpretarData('15-3-27', { hoje }).iso, '2027-03-15');
  igual(interpretarData('25/12', { hoje }).iso, '2026-12-25');      // sem ano: próxima ocorrência
  igual(interpretarData('10/01', { hoje }).iso, '2027-01-10');
  igual(interpretarData('amanhã', { hoje }).iso, '2026-11-24');
  verdade(interpretarData('31/02/2027', { hoje }).erro.includes('não existe'));
  verdade(interpretarData('15/13/2027', { hoje }).erro);
});
teste('Nascimento: ano com 2 dígitos vai para o passado; sem ano e futuro são recusados', () => {
  const hoje = new Date(2026, 10, 23);
  igual(interpretarData('16/05/84', { hoje, passado: true }).iso, '1984-05-16');
  igual(interpretarData('16/05/19', { hoje, passado: true }).iso, '2019-05-16');
  verdade(interpretarData('16/05', { hoje, passado: true }).erro);
  verdade(interpretarData('16/05/2030', { hoje, passado: true }).erro);
});
teste('Hora digitada: 8, 830, 8h30, 0830, meio-dia', () => {
  igual(interpretarHora('8').hhmm, '08:00');
  igual(interpretarHora('830').hhmm, '08:30');
  igual(interpretarHora('8h30').hhmm, '08:30');
  igual(interpretarHora('0830').hhmm, '08:30');
  igual(interpretarHora('meio-dia').hhmm, '12:00');
  verdade(interpretarHora('25:00').erro);
  verdade(interpretarHora('8:75').erro);
});
teste('Máscara: barra e dois-pontos automáticos só ao inserir', () => {
  igual(mascararData('15', true), '15/');
  igual(mascararData('15/03', true), '15/03/');
  igual(mascararData('15/0', false), '15/0');   // apagando: não mexe
  igual(mascararData('1/5', true), '1/5');      // quem digita a barra não é atrapalhado
  igual(mascararHora('08', true), '08:');
  igual(mascararHora('083', true), '08:3');
});
teste('Campo de data: ano de 2 dígitos não completa enquanto a pessoa digita (bug "15/03/19" → 2019)', async () => {
  const mudancas = [];
  const raiz = campo({ id: 'teste-nasc', rotulo: 'Nascimento', tipo: 'data', passado: true, valor: '', aoMudar: (x) => mudancas.push(x) });
  document.body.append(raiz);
  const i = raiz.querySelector('input[type="text"]');
  for (const ch of '15031990') {
    i.value += ch;
    i.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch }));
  }
  igual(i.value, '15/03/1990');
  igual(mudancas.join(','), '1990-03-15'); // nada de 2019 no meio do caminho
  // Atalho de 2 dígitos continua valendo ao sair do campo.
  i.value = '16/05/84';
  i.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: '4' }));
  igual(mudancas.length, 1);
  i.dispatchEvent(new Event('blur'));
  igual(mudancas[mudancas.length - 1], '1984-05-16');
  igual(i.value, '16/05/1984');
  raiz.remove();
});

teste('Disjuntor: 3 falhas seguidas pausam o serviço', () => {
  const s = 'teste-disjuntor';
  registrarResultado(s, false); registrarResultado(s, false); igual(disjuntorAberto(s), false);
  registrarResultado(s, false); igual(disjuntorAberto(s), true);
});
teste('Quem separa: cada um, uma pessoa, sem resposta e responsável removido', () => {
  const v = novaViagem();
  v.viajantes = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Beto' }];
  const la = modeloListaIndividual(v.viajantes[0]), coletiva = v.listas[0];
  igual(separadorDaLista(v, la), null, 'sem resposta');
  v.separacao = { modo: 'cada_um', responsavelId: null };
  igual(separadorDaLista(v, la), 'Ana'); igual(separadorDaLista(v, coletiva), null);
  v.separacao = { modo: 'uma_pessoa', responsavelId: 'b' };
  igual(separadorDaLista(v, la), 'Beto'); igual(separadorDaLista(v, coletiva), 'Beto');
  v.separacao.responsavelId = 'x';
  igual(separadorDaLista(v, la), null, 'responsável que não está na viagem');
});
// ---------- Nunca mostrar null / undefined / NaN (bug da tela 2, 24/11/2026) ----------
teste('Texto seguro: null, undefined e NaN viram vazio', () => {
  igual(textoSeguro(null), ''); igual(textoSeguro(undefined), ''); igual(textoSeguro(NaN), ''); igual(textoSeguro(false), '');
  igual(textoSeguro(0), '0'); igual(textoSeguro('ok'), 'ok');
  const p = anexar(document.createElement('p'), 'a', null, undefined, NaN, el('b', {}, 'b'));
  igual(p.textContent, 'ab');
  igual(escrever(document.createElement('p'), null).textContent, '');
});
teste('Tela de lugares vazia (origem e destino) não escreve "null"', () => {
  const ctx = { lugaresUsados: () => [] };
  for (const geo of [true, false]) {
    const n = seletorLugar({ id: `t-${geo}`, rotulo: 'X', valor: null, erro: null, ctx, comGeolocalizacao: geo, aoEscolher: () => {} });
    verdade(!/\b(null|undefined|NaN)\b/.test(n.textContent), n.textContent);
  }
});

// ---------- Preço automático: lugar sem UF ou sem cidade ----------
const basesPreco = {
  anp: {
    precos: [{ uf: 'SP', combustivel: 'Etanol', preco: 4.05, periodo_inicio: '2026-11-08', periodo_fim: '2026-11-14' }],
    precos_municipios: [
      { uf: 'SP', chave: 'SAO PAULO', combustivel: 'Etanol', preco: 4.09, postos: 210 },
      { uf: 'SP', chave: 'SAO JOSE DO RIO PRETO', combustivel: 'Etanol', preco: 3.64, postos: 19 },
      { uf: 'SP', chave: 'BOM JESUS', combustivel: 'Etanol', preco: 4.5, postos: 2 },
      { uf: 'PI', chave: 'BOM JESUS', combustivel: 'Etanol', preco: 5.1, postos: 3 },
    ],
  },
};
teste('Preço: estado "São Paulo" escolhido sem sigla ainda acha o preço (bug relatado)', () => {
  // Como a busca devolvia o estado: nome "São Paulo", sem cidade e sem UF.
  igual(precoAutomatico(basesPreco, 'Etanol', { nome: 'São Paulo', cidade: '', uf: '', rotulo: 'São Paulo' })?.valor, 4.09);
  // Cidade só no rótulo (ex.: "São José do Rio Preto — SP" sem o campo cidade).
  igual(precoAutomatico(basesPreco, 'Etanol', { nome: 'São José do Rio Preto', cidade: '', uf: 'SP', rotulo: 'São José do Rio Preto — SP' })?.valor, 3.64);
  // Rua: cidade nas partes do rótulo.
  igual(precoAutomatico(basesPreco, 'Etanol', { nome: 'Avenida Paulista', cidade: '', uf: 'SP', rotulo: 'Avenida Paulista, São Paulo — SP' })?.valor, 4.09);
  // Sigla só no rótulo.
  igual(precoAutomatico(basesPreco, 'Etanol', { nome: 'Rua X', cidade: '', uf: '', rotulo: 'Rua X — SP' })?.ambito, 'estado');
  // Nome que existe em dois estados, sem UF: não chuta.
  igual(precoAutomatico(basesPreco, 'Etanol', { nome: 'Bom Jesus', cidade: 'Bom Jesus', uf: '' }), null);
  igual(ondeFica(basesPreco, { cidade: 'Bom Jesus', uf: 'PI' }).uf, 'PI');
});
teste('Busca: o estado vem com a sigla e rótulo claro; cidade sem "city" vira a cidade', () => {
  igual(ufPorNome('Sao Paulo'), 'SP'); igual(ufPorNome('Estado de São Paulo'), 'SP'); igual(ufPorNome('xyz'), null);
  const estado = dePhoton({ geometry: { coordinates: [-48, -22] }, properties: { name: 'São Paulo', type: 'state', osm_value: 'state', countrycode: 'BR' } });
  igual(estado.uf, 'SP'); verdade(estado.estado); verdade(estado.rotulo.includes('o estado inteiro'));
  const cidade = dePhoton({ geometry: { coordinates: [-46.6, -23.5] }, properties: { name: 'São Paulo', type: 'city', osm_value: 'municipality', state: 'São Paulo', countrycode: 'BR' } });
  igual(cidade.cidade, 'São Paulo'); igual(cidade.uf, 'SP');
});

// ---------- Ordem das telas: carro antes das paradas ----------
teste('Ordem das telas: carro é a 3, paradas a 4, e cada uma valida o seu', () => {
  igual(TELA.CARRO, 3); igual(TELA.PARADAS, 4);
  const v = novaViagem();
  v.veiculo.consumo = 0;
  v.paradas.ida.push(novaParada()); // parada sem lugar
  verdade(validarTela(v, TELA.CARRO).consumo, 'carro valida o consumo');
  verdade(!validarTela(v, TELA.CARRO)['ida.0.lugar'], 'carro não valida paradas');
  verdade(validarTela(v, TELA.PARADAS)['ida.0.lugar'], 'paradas valida o lugar');
});
teste('Migração v1 → v2: quem parou nas paradas (3) vai para a 4 e no carro (4) para a 3', async () => {
  const antiga = (tela) => ({ ...novaViagem(), versao_esquema: 1, tela });
  igual(migrarViagem(antiga(3)).tela, 4); igual(migrarViagem(antiga(4)).tela, 3);
  igual(migrarViagem(antiga(5)).tela, 5); igual(migrarViagem(antiga(3)).versao_esquema, 2);
  igual(migrarViagem({ ...novaViagem(), tela: 3 }).tela, 3, 'viagem nova não muda');
  // Cópia exportada pela versão antiga também chega migrada.
  const txt = await exportar([antiga(3)]);
  igual((await conferirImportacao(txt)).viagens[0].tela, 4);
});

// ---------- Comparação e custos do ano ----------
const resultadoFalso = ({ km = 200, comb = 100, ped = 20, possivel = 0, semValor = 0, simplificada = null } = {}) => () => ({
  sentidos: { ida: { km: km / 2, trechos: [{ duracao_s: 3600 }] }, volta: { km: km / 2, trechos: [{ duracao_s: 5400 }] } },
  combustivel: { simulacao: comb === null ? null : { custoConsumido: comb }, simplificada: simplificada === null ? null : { valor: simplificada } },
  pedagios: { totalConfirmado: ped, totalManual: 0, totalPossivel: possivel, desconhecidas: Array(semValor).fill({}) },
});
const viagemEm = (data, cidade = 'Campinas', uf = 'SP', nome = '') => ({ ...novaViagem(), nome, datas: { ida: { data, hora: '08:00' }, volta: { data, hora: '18:00' } }, destino: { cidade, uf, lat: -22.9, lon: -47.06 } });
teste('Comparação: total = combustível + pedágios; sem preço fica sem valor (nunca zero)', () => {
  const a = custosDaViagem(viagemEm('2026-03-01'), null, resultadoFalso({ possivel: 5, semValor: 1 }));
  igual(a.total, 125); igual(a.km, 200); perto(a.horas, 2.5); perto(a.porKm, 0.625); igual(a.pracasSemValor, 1);
  const b = custosDaViagem(viagemEm('2026-03-01'), null, resultadoFalso({ comb: null }));
  igual(b.total, null); igual(b.combustivel, null);
  igual(custosDaViagem(viagemEm('2026-03-01'), null, resultadoFalso({ comb: null, simplificada: 80 })).total, 100);
  igual(custosDaViagem(viagemEm('2026-03-01'), null, resultadoFalso({ km: 0 })).total, null, 'sem caminho');
});
teste('Comparação: mesmo destino (acento e caixa não importam), mais barata e diferença', () => {
  igual(chaveDestino(viagemEm('2026-01-01', 'São Paulo')), chaveDestino(viagemEm('2026-01-01', 'sao paulo', 'sp')));
  const itens = [
    custosDaViagem(viagemEm('2026-01-10'), null, resultadoFalso({ comb: 150 })),
    custosDaViagem(viagemEm('2026-05-10'), null, resultadoFalso({ comb: 90 })),
    custosDaViagem(viagemEm('2026-06-10', 'Santos'), null, resultadoFalso()),
  ];
  const g = gruposParaComparar(itens);
  igual(g.length, 1, 'Santos tem uma viagem só'); igual(g[0].viagens.length, 2);
  igual(g[0].maisBarataId, itens[1].id); igual(g[0].media, 140);
  // Praça sem valor: fica fora do ranking (senão pareceria mais barata).
  itens.push(custosDaViagem(viagemEm('2026-08-10'), null, resultadoFalso({ comb: 10, semValor: 3 })));
  const g2 = gruposParaComparar(itens)[0];
  igual(g2.maisBarataId, itens[1].id); igual(g2.semValor, 1);
});
teste('Custos do ano: soma só o ano, por mês e destino; sem valor fica à parte', () => {
  const itens = [
    custosDaViagem(viagemEm('2026-01-10'), null, resultadoFalso()),
    custosDaViagem(viagemEm('2026-01-20', 'Santos'), null, resultadoFalso({ comb: 50, ped: 0 })),
    custosDaViagem(viagemEm('2026-07-01'), null, resultadoFalso({ comb: null })),
    custosDaViagem(viagemEm('2025-12-31'), null, resultadoFalso()),
  ];
  igual(anosComViagem(itens).join(','), '2026,2025');
  const c = custosDoAno(itens, '2026');
  igual(c.viagens, 3); igual(c.semValor, 1); igual(c.total, 170); igual(c.combustivel, 150); igual(c.pedagios, 20);
  igual(c.meses[0].total, 170); igual(c.meses[0].viagens, 2); igual(c.meses[6].viagens, 1); igual(c.meses[6].total, 0);
  igual(c.porDestino[0].destino, 'Campinas/SP'); igual(c.porDestino[0].semValor, 1); igual(c.mediaPorViagem, 85);
});
teste('Quem separa: sobrevive à exportação e limpa responsável inexistente', async () => {
  const v = novaViagem();
  v.viajantes = [{ id: 'a', nome: 'Ana', nascimento: '', faixa: '18 anos ou mais', condutor: true }];
  v.separacao = { modo: 'uma_pessoa', responsavelId: 'a' };
  igual((await conferirImportacao(await exportar([v]))).viagens[0].separacao.responsavelId, 'a');
  v.separacao.responsavelId = 'fantasma';
  igual((await conferirImportacao(await exportar([v]))).viagens[0].separacao.responsavelId, null);
});
