// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Telas 1 a 5 do assistente (Seção 2), em linguagem simples para quem não tem prática com apps:
// uma pergunta por bloco, valores padrão já preenchidos e o que é opcional ou técnico recolhido.
import { el, campo, botao, anunciar, escolha, recolhido, explicar, reais, anexar, escrever } from './dom.js';
import { derivados, validarVeiculo } from '../dominio/combustivel.js';
import { novaParada, novoViajante, novoId, modeloListaIndividual, separadorDaLista, chaveItemLista, TELA } from '../dominio/viagem.js';
import { FAIXAS, documentosDoViajante, idadeNaViagem, podeDirigirNaSaida, AVISO_FIXO } from '../dominio/documentos.js';
import { EXPLICA } from './explicacoes.js';
import { diasDaViagem, localParaUTC, dataValida, horaValida } from '../dominio/tempo.js';
import { autocompletar, buscar, reverso, temNomeRepetido } from '../servicos/buscador.js';
import { online } from '../servicos/http.js';

// ---------- Tela 1: Quando ----------
export function tela1(ctx) {
  const { v, erros } = ctx;
  const resumo = el('p', { class: 'resumo', 'aria-live': 'polite' });
  const atualizarResumo = () => {
    const d = v.datas;
    resumo.textContent = '';
    if (dataValida(d.ida.data) && horaValida(d.ida.hora) && dataValida(d.volta.data) && horaValida(d.volta.hora)) {
      const a = localParaUTC(d.ida.data, d.ida.hora, 'America/Sao_Paulo');
      const b = localParaUTC(d.volta.data, d.volta.hora, 'America/Sao_Paulo');
      if (b > a) {
        const dias = diasDaViagem(a, 'America/Sao_Paulo', b, 'America/Sao_Paulo');
        resumo.textContent = `✔ Sua viagem terá ${dias} ${dias === 1 ? 'dia' : 'dias'}.`;
      }
    }
  };
  atualizarResumo();
  const mudar = (sentido, k) => (x) => ctx.alterar((vv) => { vv.datas[sentido][k] = x; }, { depois: atualizarResumo });
  const bloco = (s, titulo, rotData, rotHora) => el('fieldset', { class: 'grupo' },
    el('legend', {}, titulo),
    el('div', { class: 'linha' },
      campo({ id: `${s}.data`, explicacao: s === 'ida' ? EXPLICA.diaIda : EXPLICA.diaVolta, rotulo: rotData, tipo: 'data', valor: v.datas[s].data, erro: erros[`${s}.data`], aoMudar: mudar(s, 'data') }),
      campo({ id: `${s}.hora`, explicacao: s === 'ida' ? EXPLICA.horaIda : EXPLICA.horaVolta, rotulo: rotHora, tipo: 'hora', valor: v.datas[s].hora, erro: erros[`${s}.hora`], aoMudar: mudar(s, 'hora') })));
  return el('div', {},
    bloco('ida', '🚗 Ida', 'Dia da ida', 'Hora de sair de casa'),
    bloco('volta', '🏠 Volta', 'Dia da volta', 'Hora de sair para voltar'),
    resumo,
    el('p', { class: 'ajuda' }, 'Use o horário do lugar de onde você sai. Se não souber a hora exata, deixe 08:00 e mude depois.'),
    recolhido('r-nome', 'Dar um nome para a viagem (opcional)',
      campo({ id: 'nome', explicacao: EXPLICA.nome, rotulo: 'Nome da viagem', valor: v.nome, erro: erros.nome, ajuda: 'Exemplo: Férias na praia.', attrs: { maxlength: 80 }, aoMudar: (x) => ctx.alterar((vv) => { vv.nome = x; }) })));
}

// ---------- Escolha de lugar (telas 2 e 3) ----------
export function seletorLugar({ id, rotulo, valor, erro, aoEscolher, ctx, comGeolocalizacao, ajuda, explicacao }) {
  const [btExplica, painelExplica] = explicar(id, rotulo, explicacao);
  const caixa = el('div', { class: 'campo seletor-lugar' });
  if (valor) {
    anexar(caixa, 
      el('p', { class: 'rotulo-campo', id: `${id}-rotulo` }, rotulo),
      el('div', { class: 'lugar-escolhido' }, el('span', {}, `📍 ${valor.rotulo || valor.nome}`),
        botao('Trocar', () => aoEscolher(null), { classe: 'secundario pequeno', rotuloAcessivel: `Trocar: ${rotulo}` })));
    return caixa;
  }
  const lista = el('ul', { class: 'resultados', id: `${id}-resultados`, 'aria-label': `Resultados: ${rotulo}` });
  const estado = el('p', { class: 'ajuda', 'aria-live': 'polite' });
  let controle = null, espera = null;

  const mostrar = (res, origem) => {
    lista.replaceChildren();
    if (!res.length) {
      escrever(estado, origem === 'local' ? 'Sem internet: nenhum lugar já usado confere com o que você digitou.' : 'Não encontramos. Confira o nome ou toque em "Procurar".');
      return;
    }
    escrever(estado, temNomeRepetido(res)
      ? 'Atenção: há cidades com o mesmo nome em estados diferentes. Confira a sigla do estado antes de tocar.'
      : 'Toque no lugar certo:');
    for (const r of res) {
      anexar(lista, el('li', {}, botao(`📍 ${r.rotulo || r.nome}`, () => { aoEscolher(r); anunciar(`${rotulo} ${r.rotulo}`); }, { classe: 'resultado' })));
    }
  };
  const consultar = async (texto, completo) => {
    controle?.abort();
    if (!online()) {
      const t = texto.toLowerCase();
      mostrar(ctx.lugaresUsados().filter((l) => (l.rotulo || '').toLowerCase().includes(t)), 'local');
      return;
    }
    controle = new AbortController();
    escrever(estado, 'Procurando…');
    try {
      mostrar(completo ? await buscar(texto, { sinal: controle.signal }) : await autocompletar(texto, { sinal: controle.signal }));
    } catch (e) {
      if (e.codigo !== 'cancelado') escrever(estado, 'A busca não funcionou agora. Toque em "Procurar" para tentar de novo.');
    }
  };
  const entrada = el('input', {
    id, type: 'search', autocomplete: 'off', enterkeyhint: 'search', placeholder: 'Cidade ou endereço',
    'aria-describedby': `${id}-ajuda${erro ? ` ${id}-erro` : ''}`, 'aria-invalid': erro ? 'true' : null, 'aria-controls': `${id}-resultados`,
  });
  entrada.addEventListener('input', () => {
    clearTimeout(espera);
    if (entrada.value.trim().length >= 3) espera = setTimeout(() => consultar(entrada.value, false), 300);
  });
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); consultar(entrada.value, true); } });

  const geo = comGeolocalizacao ? botao('📍 Usar onde estou agora', async () => {
    if (!navigator.geolocation) { escrever(estado, 'Este aparelho não informa a localização. Digite o endereço.'); return; }
    escrever(estado, 'O aparelho vai pedir permissão para usar a sua localização…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const l = await reverso(pos.coords.latitude, pos.coords.longitude);
        if (l) mostrar([{ ...l, precisao: `GPS ±${Math.round(pos.coords.accuracy)} m` }]);
        else escrever(estado, 'Não achamos o endereço. Digite onde você está.');
      } catch { escrever(estado, 'Não achamos o endereço. Digite onde você está.'); }
    }, () => { escrever(estado, 'Sem permissão para usar a localização. Sem problema: digite o endereço.'); }, { timeout: 15000, maximumAge: 60000 });
  }, { classe: 'secundario largo' }) : null;

  anexar(caixa, 
    el('div', { class: 'rotulo-linha' }, el('label', { for: id, class: 'rotulo-grande' }, rotulo), btExplica), painelExplica,
    el('p', { class: 'ajuda', id: `${id}-ajuda` }, online() ? (ajuda || 'Digite pelo menos 3 letras e toque no resultado certo.') : 'Sem internet: só aparecem lugares que você já usou.'),
    geo,
    el('div', { class: 'linha-busca' }, entrada, botao('Procurar', () => entrada.value.trim() && consultar(entrada.value, true))),
    estado, lista,
    erro ? el('p', { class: 'erro', id: `${id}-erro`, role: 'alert' }, `✖ ${erro}`) : null);
  return caixa;
}

// ---------- Tela 2: Caminho ----------
export function tela2(ctx) {
  const { v, erros } = ctx;
  return el('div', {},
    seletorLugar({ id: 'origem', explicacao: EXPLICA.origem, rotulo: 'De onde você sai?', valor: v.origem, erro: erros.origem, ctx, comGeolocalizacao: true, aoEscolher: (l) => ctx.alterar((vv) => { vv.origem = l; }, { render: true }) }),
    seletorLugar({ id: 'destino', explicacao: EXPLICA.destino, rotulo: 'Para onde você vai?', valor: v.destino, erro: erros.destino, ctx, aoEscolher: (l) => ctx.alterar((vv) => { vv.destino = l; }, { render: true }) }),
    el('p', { class: 'ajuda' }, '🔒 Para achar o lugar, o que você digita vai para um serviço de mapas gratuito. Seu nome e a placa do carro nunca são enviados.'));
}

// ---------- Tela 4: Paradas (depois do carro) ----------
const TIPOS = [
  { valor: 'Parada rápida', texto: 'Parada rápida', ajuda: 'Lanche, banheiro, abastecer' },
  { valor: 'Pernoite', texto: 'Pernoite', ajuda: 'Dormir na cidade e seguir no outro dia' },
];

function blocoParada(ctx, sentido, p, i, total) {
  const { erros } = ctx;
  const k = `${sentido}.${i}`;
  const mudar = (fn, render = false) => ctx.alterar((vv) => fn(vv.paradas[sentido][i]), { render });
  const pernoite = p.tipo === 'Pernoite';
  return el('li', { class: 'cartao' },
    el('h3', {}, `Parada ${i + 1}`),
    escolha({ id: `${k}.tipo`, explicacao: EXPLICA.tipoParada, rotulo: 'Que tipo de parada?', opcoes: TIPOS, valor: p.tipo, erro: erros[`${k}.tipo`], aoMudar: (x) => mudar((pp) => {
      pp.tipo = x;
      pp.saidaAgendada = x === 'Pernoite' ? (pp.saidaAgendada || { data: '', hora: '08:00' }) : null;
    }, true) }),
    seletorLugar({ id: `${k}.lugar`, explicacao: EXPLICA.lugarParada, rotulo: 'Em qual cidade?', valor: p.lugar, erro: erros[`${k}.lugar`], ctx, aoEscolher: (l) => mudar((pp) => { pp.lugar = l; }, true) }),
    pernoite && p.saidaAgendada
      ? el('fieldset', { class: 'grupo' }, el('legend', {}, 'Quando vai seguir viagem?'),
        el('div', { class: 'linha' },
          campo({ id: `${k}.saida.data`, explicacao: EXPLICA.saidaPernoite, rotulo: 'Dia', tipo: 'data', valor: p.saidaAgendada.data, erro: erros[`${k}.saida`], aoMudar: (x) => mudar((pp) => { pp.saidaAgendada.data = x; }) }),
          campo({ id: `${k}.saida.hora`, rotulo: 'Hora', tipo: 'hora', valor: p.saidaAgendada.hora, aoMudar: (x) => mudar((pp) => { pp.saidaAgendada.hora = x; }) })))
      : campo({ id: `${k}.duracao`, explicacao: EXPLICA.duracaoParada, rotulo: 'Quantos minutos vai ficar?', tipo: 'number', valor: p.duracaoMin, erro: erros[`${k}.duracao`], attrs: { inputmode: 'numeric' }, aoMudar: (x) => mudar((pp) => { pp.duracaoMin = x; }) }),
    campo({ id: `${k}.abastecer`, explicacao: EXPLICA.abastecerParada, rotulo: '⛽ Já sei que vou abastecer aqui (opcional)', tipo: 'checkbox', valor: !!p.abastecer, aoMudar: (x) => mudar((pp) => { pp.abastecer = x ? { modo: 'completar', litros: null } : null; }, true) }),
    p.abastecer ? precoDaParada(ctx, p, k, mudar) : null,
    p.abastecer ? recolhido(`r-abast-${p.id}`, 'Mais opções do abastecimento (pode pular)',
      campo({ id: `${k}.parcial`, rotulo: 'Não vou completar: vou pôr só alguns litros', tipo: 'checkbox', valor: p.abastecer.modo === 'parcial', aoMudar: (x) => mudar((pp) => { pp.abastecer = { modo: x ? 'parcial' : 'completar', litros: pp.abastecer?.litros ?? null }; }, true) }),
      p.abastecer.modo === 'parcial' ? campo({ id: `${k}.litros`, rotulo: 'Quantos litros?', tipo: 'number', valor: p.abastecer.litros, erro: erros[`${k}.litros`], aoMudar: (x) => mudar((pp) => { pp.abastecer.litros = x; }) }) : null,
      p.lugar && ctx.precoAutomatico(p.lugar)
        ? campo({ id: `${k}.preco`, rotulo: 'Vai pagar outro preço? Informe (R$ por litro)', tipo: 'dinheiro', valor: p.preco, erro: erros[`${k}.preco`], ajuda: 'Deixe em branco para usar o preço automático.', aoMudar: (x) => mudar((pp) => { pp.preco = x; }) })
        : null) : null,
    erros[`${k}.litros`] && !p.abastecer ? null : null,
    el('div', { class: 'acoes' },
      total > 1 ? botao('↑', () => ctx.alterar((vv) => trocar(vv.paradas[sentido], i, i - 1), { render: true }), { classe: 'secundario pequeno', desativado: i === 0, rotuloAcessivel: `Mover a parada ${i + 1} para antes` }) : null,
      total > 1 ? botao('↓', () => ctx.alterar((vv) => trocar(vv.paradas[sentido], i, i + 1), { render: true }), { classe: 'secundario pequeno', desativado: i === total - 1, rotuloAcessivel: `Mover a parada ${i + 1} para depois` }) : null,
      botao('Tirar esta parada', () => ctx.alterar((vv) => { vv.paradas[sentido].splice(i, 1); }, { render: true }), { classe: 'perigo pequeno', rotuloAcessivel: `Tirar a parada ${i + 1}` })));
}

// Preço do abastecimento numa parada: automático (média da cidade ou do estado) ou, sem ele, obrigatório.
function precoDaParada(ctx, p, k, mudar) {
  if (!p.lugar) return el('p', { class: 'ajuda' }, 'Escolha a cidade para ver o preço do combustível.');
  const auto = ctx.precoAutomatico(p.lugar);
  if (auto) {
    return el('p', { class: 'preco-auto' }, `⛽ Preço: ${reais(auto.valor)} por litro — ${auto.rotulo} (automático, ANP).`);
  }
  return el('div', { class: 'preco-manual' },
    el('p', { class: 'aviso' }, '⚠ Não há preço automático para esta cidade. Informe o preço do litro.'),
    campo({ id: `${k}.preco`, rotulo: 'Preço do litro (R$)', tipo: 'dinheiro', valor: p.preco, erro: ctx.erros[`${k}.preco`], ajuda: 'Exemplo: 6,29.', aoMudar: (x) => mudar((pp) => { pp.preco = x; }) }));
}

function trocar(lista, a, b) {
  if (b < 0 || b >= lista.length) return;
  [lista[a], lista[b]] = [lista[b], lista[a]];
}

export function telaParadas(ctx) {
  const { v } = ctx;
  const nenhuma = !v.paradas.ida.length && !v.paradas.volta.length;
  if (nenhuma) {
    return el('div', {},
      el('p', { class: 'intro' }, 'Paradas são opcionais. Você pode seguir direto ou marcar onde vai parar para comer, abastecer ou dormir.'),
      el('div', { class: 'botoes-grandes' },
        botao('Não, vou direto', () => ctx.irPara(TELA.PESSOAS), { classe: 'largo' }),
        botao('Sim, quero marcar paradas', () => ctx.alterar((vv) => { vv.paradas.ida.push(novaParada()); }, { render: true }), { classe: 'secundario largo' })));
  }
  const secao = (s, titulo) => el('section', { 'aria-labelledby': `titulo-paradas-${s}`, class: 'secao' },
    el('h2', { id: `titulo-paradas-${s}` }, titulo),
    v.paradas[s].length ? el('ol', { class: 'lista-cartoes' }, ...v.paradas[s].map((p, i) => blocoParada(ctx, s, p, i, v.paradas[s].length))) : el('p', { class: 'ajuda' }, 'Nenhuma parada.'),
    s === 'volta' && !v.paradas.volta.length && v.paradas.ida.length
      ? botao('Usar as mesmas paradas da ida, na ordem contrária', () => ctx.alterar((vv) => {
        vv.paradas.volta = [...vv.paradas.ida].reverse().map((p) => ({ ...structuredClone(p), id: novoId(), saidaAgendada: p.saidaAgendada ? { data: '', hora: p.saidaAgendada.hora } : null }));
      }, { render: true }), { classe: 'secundario largo' })
      : null,
    botao(`+ Adicionar parada na ${s}`, () => ctx.alterar((vv) => { vv.paradas[s].push(novaParada()); }, { render: true }), { classe: 'secundario largo' }));
  return el('div', {},
    el('p', { class: 'ajuda' }, 'Mudou alguma parada? Os horários são refeitos sozinhos.'),
    secao('ida', 'Paradas na ida'),
    secao('volta', 'Paradas na volta'));
}

// ---------- Tela 3: Carro (antes das paradas) ----------
const CATEGORIAS = [
  { valor: 'Automóvel', texto: 'Carro' },
  { valor: 'Automóvel com reboque', texto: 'Carro com reboque' },
  { valor: 'Motocicleta', texto: 'Moto' },
];
const COMBUSTIVEIS = [
  { valor: 'Diesel S10', texto: 'Diesel S10' },
  { valor: 'Etanol', texto: 'Etanol' },
  { valor: 'Gasolina comum', texto: 'Gasolina' },
];

export function telaCarro(ctx) {
  const { v, erros } = ctx;
  const ve = v.veiculo;
  const mudar = (k, render = false) => (x) => ctx.alterar((vv) => { vv.veiculo[k] = x; }, { render, depois: atualizar });
  const info = el('p', { class: 'resumo', 'aria-live': 'polite' });
  function atualizar() {
    if (Object.keys(validarVeiculo(v.veiculo)).length) { info.textContent = ''; return; }
    const d = derivados(v.veiculo);
    info.textContent = d.abaixoDaReservaNaSaida
      ? '⚠ Você vai sair com o tanque abaixo da reserva: abasteça antes de pegar a estrada.'
      : `✔ Com o tanque como você vai sair, o carro anda cerca de ${Math.round(d.autonomiaInicial)} km antes de entrar na reserva.`;
  }
  atualizar();
  return el('div', {},
    escolha({ id: 'v.categoria', explicacao: EXPLICA.veiculo, rotulo: 'Qual é o veículo?', opcoes: CATEGORIAS, valor: ve.categoria, erro: erros.categoria, aoMudar: mudar('categoria', true) }),
    ve.categoria === 'Automóvel com reboque' ? campo({ id: 'v.eixos', explicacao: EXPLICA.eixos, rotulo: 'Quantos eixos tem o conjunto (carro + reboque)?', tipo: 'number', valor: ve.eixos, erro: erros.eixos, ajuda: 'Cada eixo é um par de rodas. Carro com reboque comum: 3 eixos.', attrs: { inputmode: 'numeric' }, aoMudar: mudar('eixos') }) : null,
    escolha({ id: 'v.flex', explicacao: EXPLICA.flex, rotulo: 'O carro é flex (aceita etanol e gasolina)?', opcoes: [{ valor: 'Não', texto: 'Não' }, { valor: 'Sim', texto: 'Sim' }], valor: ve.flex, aoMudar: mudar('flex', true) }),
    escolha({ id: 'v.combustivel', explicacao: EXPLICA.combustivel, rotulo: ve.flex === 'Sim' ? 'Com qual combustível vai abastecer?' : 'Qual combustível ele usa?', opcoes: ve.flex === 'Sim' ? COMBUSTIVEIS.filter((c) => c.valor !== 'Diesel S10') : COMBUSTIVEIS, valor: ve.combustivel, erro: erros.combustivel, aoMudar: mudar('combustivel', true) }),
    ve.flex === 'Sim'
      ? el('div', { class: 'linha' },
        campo({ id: 'v.consumoEtanol', explicacao: EXPLICA.consumo, rotulo: 'Km por litro com etanol, na estrada', tipo: 'number', valor: ve.consumoEtanol, erro: erros.consumoEtanol, ajuda: 'Não sabe? Use 8.', aoMudar: mudar('consumoEtanol') }),
        campo({ id: 'v.consumoGasolina', explicacao: EXPLICA.consumo, rotulo: 'Km por litro com gasolina, na estrada', tipo: 'number', valor: ve.consumoGasolina, erro: erros.consumoGasolina, ajuda: 'Não sabe? Use 11.', aoMudar: mudar('consumoGasolina') }))
      : campo({ id: 'v.consumo', explicacao: EXPLICA.consumo, rotulo: 'Quantos km o carro faz com 1 litro, na estrada?', tipo: 'number', valor: ve.consumo, erro: erros.consumo, ajuda: 'Está no manual ou no painel. Não sabe? Use 10.', aoMudar: mudar('consumo') }),
    campo({ id: 'v.tanque', explicacao: EXPLICA.tanque, rotulo: 'Quantos litros cabem no tanque?', tipo: 'number', valor: ve.tanque, erro: erros.tanque, ajuda: 'Está no manual. Carro pequeno: cerca de 45 litros.', aoMudar: mudar('tanque') }),
    campo({ id: 'v.finalPlaca', explicacao: EXPLICA.placa, rotulo: 'Último número da placa (opcional)', valor: ve.finalPlaca, erro: erros.finalPlaca, ajuda: 'Só serve para avisar sobre o rodízio de São Paulo. Não pedimos a placa inteira.', attrs: { inputmode: 'numeric', maxlength: 1, pattern: '[0-9]' }, aoMudar: mudar('finalPlaca') }),
    info,
    blocoPrecoCarro(ctx, mudar),
    recolhido('r-carro-mais', 'Mais opções (pode pular)',
      campo({ id: 'v.saida', explicacao: EXPLICA.saida, rotulo: 'Quanto de combustível terá ao sair (% do tanque)', tipo: 'number', valor: ve.saida, erro: erros.saida, ajuda: '100 = tanque cheio; 50 = meio tanque.', aoMudar: mudar('saida') }),
      campo({ id: 'v.reserva', explicacao: EXPLICA.reserva, rotulo: 'Reserva que quer guardar (% do tanque)', tipo: 'number', valor: ve.reserva, erro: erros.reserva, ajuda: 'Padrão: 15%. O app avisa antes de chegar nela.', aoMudar: mudar('reserva') }),
      campo({ id: 'v.perda', explicacao: EXPLICA.perda, rotulo: 'Carro carregado ou com bagageiro: quanto gasta a mais (%)', tipo: 'number', valor: ve.perda, erro: erros.perda, ajuda: 'Padrão: 0. É uma estimativa sua.', aoMudar: mudar('perda') }),
      ctx.precoAutomatico(v.origem) ? campoPrecoUltimo(ctx, mudar, false) : null));
}

// Preço do combustível no passo do carro: automático (ANP) quando existe; senão, obrigatório digitar.
function campoPrecoUltimo(ctx, mudar, obrigatorio) {
  const ve = ctx.v.veiculo;
  return campo({
    id: 'v.precoUltimo', explicacao: EXPLICA.precoUltimo,
    rotulo: obrigatorio ? 'Preço do litro (R$)' : 'Preço que pagou no último abastecimento (R$ por litro)',
    tipo: 'dinheiro', valor: ve.precoUltimo, erro: ctx.erros.precoUltimo,
    ajuda: obrigatorio ? 'O último que você pagou ou o que espera pagar. Exemplo: 6,29.' : 'Opcional. Ajuda a calcular o custo do combustível que já está no tanque.',
    aoMudar: mudar('precoUltimo'),
  });
}

function blocoPrecoCarro(ctx, mudar) {
  const { v } = ctx;
  if (!v.origem) return null;
  const auto = ctx.precoAutomatico(v.origem);
  if (auto) {
    return el('p', { class: 'preco-auto' },
      `⛽ Preço do litro de ${v.veiculo.combustivel.toLowerCase()}: ${reais(auto.valor)} — ${auto.rotulo}. `,
      el('span', { class: 'ajuda' }, 'Preenchido automaticamente com o preço médio da ANP. Você não precisa digitar.'));
  }
  return el('div', { class: 'preco-manual' },
    el('p', { class: 'aviso' }, `⚠ Não conseguimos o preço automático de ${v.veiculo.combustivel.toLowerCase()} agora. Para calcular o gasto, informe o preço do litro.`),
    campoPrecoUltimo(ctx, mudar, true));
}

// ---------- Tela 5: Pessoas e listas (duas partes na mesma tela) ----------
// Parte "Quem vai": só a pessoa em edição fica aberta; as outras viram uma linha com "Editar".
// Parte "O que levar": as listas, separadas do cadastro para a tela não ficar comprida.
let pessoaAberta = null;

function resumoPessoa(p, docs, conf) {
  const partes = [];
  if (docs.idade?.idadeMin !== undefined && docs.idade.idadeMin !== null) {
    partes.push(p.nascimento ? `${docs.idade.idadeMin} ${docs.idade.idadeMin === 1 ? 'ano' : 'anos'}` : p.faixa);
  } else if (p.faixa) partes.push(p.faixa);
  if (p.condutor && docs.idade?.idadeMin >= 18) partes.push('🚗 dirige');
  const exigidos = docs.itens.filter((x) => x.obrigatorio);
  if (exigidos.length) partes.push(`documentos ${exigidos.filter((x) => conf[x.id]).length} de ${exigidos.length}`);
  return partes.join(' · ');
}

export function tela5(ctx) {
  const { v, erros, parteTela5 } = ctx;
  const comErro = v.viajantes.findIndex((_, i) => Object.keys(erros).some((k) => k.startsWith(`viajante.${i}.`)));
  if (comErro >= 0) pessoaAberta = v.viajantes[comErro].id;
  // Ao entrar na tela: abre a última pessoa (ou nenhuma, se a pessoa tocou em "Pronto").
  if (pessoaAberta !== '__nenhuma__' && !v.viajantes.some((p) => p.id === pessoaAberta)) {
    pessoaAberta = v.viajantes.length ? v.viajantes[v.viajantes.length - 1].id : null;
  }

  const abas = el('div', { class: 'abas', role: 'group', 'aria-label': 'Partes desta tela' },
    botao(`👨‍👩‍👧 Quem vai (${v.viajantes.length})`, () => ctx.selecionarParteTela5('pessoas'), { classe: parteTela5 === 'pessoas' ? 'aba ativa' : 'aba' }),
    botao('🧳 O que levar', () => ctx.selecionarParteTela5('listas'), { classe: parteTela5 === 'listas' ? 'aba ativa' : 'aba' }));
  abas.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (parteTela5 === 'pessoas'))));
  return el('div', {}, abas, parteTela5 === 'pessoas' ? parteQuemVai(ctx) : parteOQueLevar(ctx));
}

function parteQuemVai(ctx) {
  const { v, erros } = ctx;
  const inicio = v.datas.ida.data, fim = v.datas.volta.data;
  const pessoas = v.viajantes.map((p, i) => {
    const mudar = (k, render = false) => (x) => ctx.alterar((vv) => { vv.viajantes[i][k] = x; }, { render });
    const docs = documentosDoViajante(p, inicio, fim, ctx.bases?.regras?.retencao_infantil);
    const conf = v.documentosConfirmados[p.id] || {};
    if (p.id !== pessoaAberta) {
      return el('li', { class: 'cartao pessoa-compacta' },
        el('div', {}, el('strong', {}, p.nome || `Pessoa ${i + 1}`), el('span', { class: 'ajuda' }, ` ${resumoPessoa(p, docs, conf)}`),
          docs.pendencia ? el('span', { class: 'aviso-mini' }, ' ⚠ falta informação') : null),
        botao('Editar', () => { pessoaAberta = p.id; ctx.render(); }, { classe: 'pequeno secundario', rotuloAcessivel: `Editar ${p.nome || `pessoa ${i + 1}`}` }));
    }
    return el('li', { class: 'cartao pessoa-aberta' },
      el('h3', {}, p.nome || `Pessoa ${i + 1}`),
      campo({ id: `p.${p.id}.nome`, explicacao: EXPLICA.nomePessoa, rotulo: 'Nome ou apelido', valor: p.nome, erro: erros[`viajante.${i}.nome`], attrs: { maxlength: 80, autocomplete: 'off' }, aoMudar: mudar('nome') }),
      campo({ id: `p.${p.id}.nasc`, explicacao: EXPLICA.nascimento, rotulo: 'Data de nascimento', tipo: 'data', passado: true, valor: p.nascimento, erro: erros[`viajante.${i}.nascimento`] || (p.nascimento ? null : erros[`viajante.${i}.faixa`]), ajuda: 'Serve para saber quais documentos e cadeirinha levar. Fica só neste aparelho.', aoMudar: mudar('nascimento', true) }),
      p.nascimento ? null : recolhido(`r-faixa-${p.id}`, 'Prefere não informar a data? Escolha a idade aproximada',
        campo({ id: `p.${p.id}.faixa`, explicacao: EXPLICA.faixa, rotulo: 'Idade aproximada', tipo: 'select', lista: FAIXAS, valor: p.faixa, aoMudar: mudar('faixa', true) })),
      podeDirigirNaSaida(p, inicio) ? campo({ id: `p.${p.id}.condutor`, explicacao: EXPLICA.condutor, rotulo: '🚗 Esta pessoa vai dirigir', tipo: 'checkbox', valor: p.condutor, aoMudar: mudar('condutor', true) }) : null,
      docs.pendencia ? el('p', { class: 'aviso' }, `⚠ ${docs.pendencia}`) : null,
      ...docs.erros.map((x) => el('p', { class: 'erro' }, `✖ ${x}`)),
      docs.itens.length ? el('div', { class: 'docs' },
        el('h4', {}, 'Para levar (marque quando separar):'),
        ...docs.itens.map((item) => el('div', { class: 'doc-item' },
          campo({ id: `doc.${p.id}.${item.id}`, rotulo: item.texto, tipo: 'checkbox', valor: !!conf[item.id], aoMudar: (x) => ctx.alterar((vv) => {
            vv.documentosConfirmados[p.id] = { ...(vv.documentosConfirmados[p.id] || {}), [item.id]: x };
          }) }),
          el('a', { href: item.fonte, target: '_blank', rel: 'noopener noreferrer', class: 'fonte' }, 'Onde está a regra')))) : null,
      el('div', { class: 'acoes' },
        botao('✔ Pronto', () => { pessoaAberta = '__nenhuma__'; ctx.render(); }, { classe: 'pequeno', rotuloAcessivel: `Terminar de preencher ${p.nome || 'esta pessoa'}` }),
        botao('Tirar esta pessoa', () => ctx.alterar((vv) => {
          vv.viajantes.splice(i, 1);
          delete vv.documentosConfirmados[p.id];
          vv.listas = vv.listas.filter((l) => l.viajanteId !== p.id);
          if (vv.separacao?.responsavelId === p.id) vv.separacao.responsavelId = null;
        }, { render: true }), { classe: 'perigo pequeno', rotuloAcessivel: `Tirar ${p.nome || 'esta pessoa'} da viagem` })));
  });
  return el('div', {},
    erros.viajantes ? el('p', { class: 'erro', role: 'alert' }, `✖ ${erros.viajantes}`) : null,
    erros.condutor ? el('p', { class: 'erro', role: 'alert' }, `✖ ${erros.condutor}`) : null,
    v.viajantes.length ? el('ol', { class: 'lista-cartoes' }, ...pessoas) : el('p', { class: 'intro' }, 'Comece por você: toque no botão abaixo.'),
    botao(v.viajantes.length ? '+ Adicionar outra pessoa' : '+ Adicionar pessoa', () => {
      const nova = novoViajante();
      ctx.alterar((vv) => {
        vv.viajantes.push(nova);
      });
      pessoaAberta = nova.id; // só a nova fica aberta; as outras ficam compactas
      ctx.render({ foco: `p.${nova.id}.nome` });
    }, { classe: 'largo' }),
    el('p', { class: 'ajuda' }, `Nunca pedimos CPF, número ou foto de documento. ${AVISO_FIXO}`),
    v.viajantes.length ? botao('Próximo: o que levar →', () => ctx.selecionarParteTela5('listas'), { classe: 'secundario largo' }) : null);
}

// Pergunta "quem separa": cada um a sua lista, ou uma pessoa para todos (com a escolha do responsável).
function perguntaQuemSepara(ctx) {
  const { v } = ctx;
  if (v.viajantes.length < 2) return null; // viajando sozinho: a pergunta não faz sentido
  const s = v.separacao || { modo: '', responsavelId: null };
  const mudar = (k) => (x) => ctx.alterar((vv) => {
    vv.separacao = { modo: '', responsavelId: null, ...(vv.separacao || {}), [k]: x };
  }, { render: true, foco: k === 'modo' ? `separacao.modo-op${x === 'cada_um' ? 0 : 1}` : null });
  const pessoas = [...v.viajantes].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  return el('div', { class: 'cartao' },
    escolha({
      id: 'separacao.modo', rotulo: 'Quem separa as coisas de cada pessoa?', explicacao: EXPLICA.separacao, valor: s.modo,
      opcoes: [
        { valor: 'cada_um', texto: 'Cada pessoa separa as próprias coisas', ajuda: 'Cada um confere a sua lista.' },
        { valor: 'uma_pessoa', texto: 'Uma pessoa separa tudo para todos', ajuda: 'Ex.: alguém arruma as malas da família.' },
      ],
      aoMudar: mudar('modo'),
    }),
    s.modo === 'uma_pessoa' ? escolha({
      id: 'separacao.responsavel', rotulo: 'Quem vai separar?', valor: s.responsavelId,
      opcoes: pessoas.map((p) => ({ valor: p.id, texto: p.nome || 'pessoa sem nome' })),
      aoMudar: mudar('responsavelId'),
    }) : null);
}

function parteOQueLevar(ctx) {
  const { v } = ctx;
  return el('section', { 'aria-labelledby': 't-listas', class: 'secao' },
    el('h2', { id: 't-listas', tabindex: '-1' }, '🧳 O que levar'),
    perguntaQuemSepara(ctx),
    el('p', { class: 'ajuda' }, 'Revise a lista e escolha se quer usá-la ou ignorá-la. Você pode marcar os itens depois.'),
    ...v.listas.map((l, li) => blocoLista(ctx, l, li)),
    // Uma lista por pessoa, já com o básico. Quem já tem lista não ganha outra (evita duplicar).
    ...v.viajantes.filter((p) => !v.listas.some((l) => l.viajanteId === p.id)).map((p) => botao(
      `🧳 Criar a lista de ${p.nome || 'pessoa sem nome'} (já vem com o básico)`,
      () => criarListaIndividual(ctx, p.id), { classe: 'secundario largo' })),
    botao('← Voltar para quem vai', () => ctx.selecionarParteTela5('pessoas'), { classe: 'secundario' }));
}

function diasDaViagemSimples(v) {
  const a = Date.parse(`${v.datas.ida.data}T12:00:00Z`), b = Date.parse(`${v.datas.volta.data}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : null;
}

function criarListaIndividual(ctx, viajanteId) {
  ctx.alterar((vv) => {
    if (vv.listas.some((l) => l.viajanteId === viajanteId)) return; // já existe: não duplica
    const p = vv.viajantes.find((x) => x.id === viajanteId);
    if (!p) return;
    const idade = idadeNaViagem(p, vv.datas.ida.data, vv.datas.ida.data);
    vv.listas.push(modeloListaIndividual(p, idade.idadeMin ?? null, diasDaViagemSimples(vv)));
  }, { render: true });
}

export function imprimirListaIndividual(v, lista) {
  const pessoa = v.viajantes.find((p) => p.id === lista.viajanteId);
  const folha = el('section', { class: 'folha-checklist' },
    el('h1', {}, pessoa?.nome ? 'Checklist de ' + pessoa.nome : lista.titulo),
    v.nome ? el('p', {}, v.nome) : null,
    lista.itens.length ? el('ul', {}, ...lista.itens.map((item) => el('li', {},
      el('span', { class: 'marca-checklist' }, item.feito ? '✓' : ''),
      el('span', {}, item.texto),
      item.quantidade ? el('span', { class: 'quantidade-checklist' }, 'Qtd. ' + item.quantidade) : null)))
      : el('p', {}, 'Nenhum item nesta lista.'));
  document.body.append(folha);
  document.body.classList.add('imprimindo-checklist');
  const limpar = () => {
    folha.remove();
    document.body.classList.remove('imprimindo-checklist');
  };
  addEventListener('afterprint', limpar, { once: true });
  try {
    window.print();
  } catch (e) {
    removeEventListener('afterprint', limpar);
    limpar();
    throw e;
  }
}

export function blocoLista(ctx, l, li) {
  const nova = el('input', { id: `lista.${l.id}.novo`, type: 'text', maxlength: 300, autocomplete: 'off', placeholder: 'Ex.: protetor solar', enterkeyhint: 'done' });
  const adicionar = () => {
    const t = nova.value.trim();
    if (!t) return;
    if (l.itens.some((i) => chaveItemLista(i.texto) === chaveItemLista(t))) {
      anunciar('Este item já está na lista. Ajuste a quantidade se precisar.');
      nova.focus();
      return;
    }
    ctx.alterar((vv) => { vv.listas[li].itens.push({ id: novoId(), texto: t, feito: false }); }, { render: true, foco: `lista.${l.id}.novo` });
  };
  nova.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } });
  const feitos = l.itens.filter((x) => x.feito).length;
  const quem = separadorDaLista(ctx.v, l);
  return el('div', { class: 'cartao' },
    el('h3', {}, `${l.titulo} — ${feitos} de ${l.itens.length} separados`),
    quem ? el('p', { class: 'ajuda' }, `👤 Quem separa: ${quem}`) : null,
    l.escopo === 'individual' ? botao('Imprimir checklist', () => imprimirListaIndividual(ctx.v, l),
      { classe: 'secundario pequeno nao-imprimir', rotuloAcessivel: 'Imprimir checklist: ' + l.titulo }) : null,
    el('ul', { class: 'checklist' }, ...l.itens.map((item, ii) => {
      // Quantidade opcional ("5", "2 pares"…), salva enquanto a pessoa digita.
      const qtd = el('input', {
        id: `qtd.${item.id}`, type: 'text', class: 'qtd', value: item.quantidade || '', maxlength: 10, autocomplete: 'off',
        inputmode: 'numeric', placeholder: 'Qtd.', 'aria-label': `Quantidade: ${item.texto}`,
      });
      qtd.addEventListener('input', () => ctx.alterar((vv) => { vv.listas[li].itens[ii].quantidade = qtd.value.trim(); }));
      return el('li', {},
        campo({ id: `item.${item.id}`, rotulo: item.texto, tipo: 'checkbox', valor: item.feito, aoMudar: (x) => ctx.alterar((vv) => { vv.listas[li].itens[ii].feito = x; }, { render: true, foco: `item.${item.id}` }) }),
        qtd,
        botao('✖', () => ctx.alterar((vv) => { vv.listas[li].itens.splice(ii, 1); }, { render: true }), { classe: 'pequeno icone', rotuloAcessivel: `Apagar o item ${item.texto}` }));
    })),
    el('label', { for: `lista.${l.id}.novo`, class: 'rotulo-campo' }, 'Acrescentar item'),
    el('div', { class: 'linha-busca' }, nova, botao('Acrescentar', adicionar)),
    l.escopo === 'individual' ? botao('Apagar esta lista', () => ctx.alterar((vv) => { vv.listas.splice(li, 1); }, { render: true }), { classe: 'perigo pequeno' }) : null);
}
