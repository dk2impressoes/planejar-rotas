// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Tela 6: Revisão (Seção 2) e roteiro impresso.
import { el, botao, selo, reais, km, litros, campo, recolhido, anunciar } from './dom.js';
import { formatarDataHora, formatarDuracao } from '../dominio/tempo.js';
import { SITUACAO, COBRANCA } from '../dominio/situacao.js';
import { pontosDaRota, separadorDaLista, TELA } from '../dominio/viagem.js';
import { distanciaM } from '../dominio/geo.js';
import { situacaoDasBases } from '../servicos/bases.js';
import { resumoAlternativas } from '../dominio/calculo.js';
import { reverso } from '../servicos/buscador.js';
import { online } from '../servicos/http.js';

export const AVISO_CURTO = 'Planejamento estimado. Horários, custos, pedágios e alertas podem mudar, e os dados de fontes externas não são garantidos pelo app: confira as condições e regras nas fontes oficiais antes e durante a viagem.';

function bloco(titulo, tela, ctx, ...conteudo) {
  const id = `b-${titulo.replace(/\W+/g, '-').toLowerCase()}`;
  return el('section', { class: 'bloco', 'aria-labelledby': id },
    el('div', { class: 'bloco-topo' },
      el('h2', { id }, titulo),
      tela ? botao('Editar', () => ctx.irPara(tela), { classe: 'pequeno nao-imprimir', rotuloAcessivel: `Editar ${titulo.toLowerCase()}` }) : null),
    ...conteudo);
}

function nomeLugar(l) {
  return l ? (l.rotulo || l.nome) : '—';
}

// Ponto da geometria a uma distância acumulada (para a sugestão de abastecimento).
function pontoNoKm(r, kmAlvo) {
  let acumulado = 0;
  for (const s of ['ida', 'volta']) {
    for (const t of r.sentidos[s].trechos) {
      if (acumulado + t.km < kmAlvo) { acumulado += t.km; continue; }
      let d = acumulado;
      for (let i = 1; i < t.amostras.length; i++) {
        d += distanciaM(t.amostras[i - 1].c, t.amostras[i].c) / 1000;
        if (d >= kmAlvo) return { c: t.amostras[i].c, sentido: s };
      }
      return null;
    }
  }
  return null;
}

// Abrir o caminho no Google Maps ou no Waze (trazido do v5). Só coordenadas; nada sai do app sem o toque do usuário.
export function urlGoogleMaps(pontos) {
  const c = (l) => `${Number(l.lat).toFixed(5)},${Number(l.lon).toFixed(5)}`;
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('origin', c(pontos[0]));
  u.searchParams.set('destination', c(pontos[pontos.length - 1]));
  if (pontos.length > 2) u.searchParams.set('waypoints', pontos.slice(1, -1).map(c).join('|'));
  u.searchParams.set('travelmode', 'driving');
  return u.href;
}

export function urlWaze(destino) {
  return `https://waze.com/ul?ll=${Number(destino.lat).toFixed(5)},${Number(destino.lon).toFixed(5)}&navigate=yes`;
}

function linksNavegacao(pontos) {
  if (pontos.some((p) => !p)) return null;
  const a = (href, texto) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'botao secundario' }, texto);
  return el('div', { class: 'nao-imprimir' },
    el('div', { class: 'botoes-navegar' }, a(urlGoogleMaps(pontos), '🗺️ Abrir no Google Maps'), a(urlWaze(pontos[pontos.length - 1]), '🚙 Abrir no Waze')),
    el('p', { class: 'ajuda' }, 'Para seguir o caminho no celular. Ao tocar, as coordenadas vão para o Google ou o Waze (o Waze recebe só o destino).'));
}

const cidadeDe = (l) => (l ? (l.cidade || l.nome) : '—');

// Opções de caminho como cartões para tocar, com etiquetas que ajudam a decidir.
function opcoesDeCaminho(ctx, s, alts) {
  const minDur = Math.min(...alts.map((a) => a.duracao_s));
  const minKm = Math.min(...alts.map((a) => a.km));
  const custo = (a) => a.pedagios.confirmados + a.pedagios.somaPossiveis;
  const minPed = Math.min(...alts.map(custo));
  return el('div', { class: 'opcoes-rota' },
    el('p', { class: 'rotulo-campo' }, 'Escolha o caminho:'),
    ...alts.map((a) => {
      const etiquetas = [
        a.duracao_s === minDur ? '⚡ mais rápido' : null,
        a.km === minKm ? '📏 mais curto' : null,
        alts.length > 1 && custo(a) === minPed ? '💰 menos pedágio' : null,
      ].filter(Boolean);
      const conteudo = [
        el('span', { class: 'opcao-titulo' }, `Opção ${a.indice + 1}`),
        el('span', { class: 'opcao-numeros' }, `${km(a.km)} · ${formatarDuracao(a.duracao_s)} · pedágios ${custo(a) ? `cerca de ${reais(custo(a))}` : 'nenhum encontrado'}`),
        etiquetas.length ? el('span', { class: 'opcao-etiquetas' }, ...etiquetas.map((t) => el('span', { class: 'etiqueta' }, t))) : null,
      ];
      return a.escolhida
        ? el('div', { class: 'opcao-rota escolhida', 'aria-current': 'true' }, ...conteudo, el('span', { class: 'opcao-estado' }, '✔ Caminho em uso'))
        : el('button', { type: 'button', class: 'opcao-rota', onclick: () => ctx.escolherAlternativa(s, a.indice), 'aria-label': `Usar a opção ${a.indice + 1}: ${km(a.km)}, ${formatarDuracao(a.duracao_s)}` },
          ...conteudo, el('span', { class: 'opcao-estado' }, 'Tocar para usar este'));
    }));
}

function blocoRotas(ctx, r) {
  const { v } = ctx;
  const linhas = ['ida', 'volta'].map((s) => {
    const x = r.sentidos[s];
    const pts = pontosDaRota(v, s);
    const n = pts.length - 1;
    const aoVolante = x.etapas.reduce((t, e) => t + (e.duracao_s || 0), 0);
    const filhos = [
      el('h3', { class: 'caminho-titulo' }, `${s === 'ida' ? '🚗 Ida' : '🏠 Volta'}: ${cidadeDe(pts[0])} → ${cidadeDe(pts[n])}`),
    ];
    if (x.origem === 'rota' || x.origem === 'manual') {
      filhos.push(el('p', { class: 'caminho-numeros' }, `${km(x.km)} · ${formatarDuracao(aoVolante)} dirigindo`),
        n > 1 ? el('p', {}, `Passando por: ${pts.slice(1, -1).map(cidadeDe).join(', ')}`) : null);
    }
    if (x.origem === 'rota') {
      const alts = resumoAlternativas(v, ctx.bases, s);
      if (alts.length) filhos.push(opcoesDeCaminho(ctx, s, alts));
      else if (n > 1) filhos.push(el('p', { class: 'ajuda' }, 'Com paradas no meio, o app mostra um caminho só.'));
      else filhos.push(el('p', { class: 'ajuda' }, 'O serviço de mapas encontrou só este caminho para este trecho.'));
      filhos.push(linksNavegacao(pts),
        el('p', { class: 'nota-tecnica' }, `Calculado por ${x.servico} em ${formatarDataHora(x.calculado_em, 'America/Sao_Paulo')}. `, selo(x.situacao, x.situacao), ' Sem trânsito em tempo real.'));
    } else if (x.origem === 'manual') {
      filhos.push(el('p', { class: 'nota-tecnica' }, selo(SITUACAO.MANUAL, 'manual'), ' Distância e tempo digitados por você. Pedágios e rodízio ficam indisponíveis.'));
    } else {
      filhos.push(el('p', {}, x.rotaAntiga ? 'Você mudou a viagem: o caminho precisa ser calculado de novo.' : 'O caminho ainda não foi calculado.'));
    }
    if (x.origem !== 'rota') {
      const man = v.manual[s].length === n ? v.manual[s] : Array.from({ length: n }, () => ({ km: '', horas: '' }));
      filhos.push(el('details', { class: 'nao-imprimir', open: x.origem === 'manual' ? true : null },
        el('summary', {}, 'Informar distância e tempo manualmente'),
        ...man.map((m, i) => el('div', { class: 'linha' },
          campo({ id: `man.${s}.${i}.km`, rotulo: `Trecho ${i + 1}: distância (km)`, tipo: 'number', valor: m.km, aoMudar: (val) => ctx.alterar((vv) => { vv.manual[s] = man.map((q) => ({ ...q })); vv.manual[s][i].km = val; }) }),
          campo({ id: `man.${s}.${i}.h`, rotulo: `Trecho ${i + 1}: tempo (horas)`, tipo: 'number', valor: m.horas, aoMudar: (val) => ctx.alterar((vv) => { vv.manual[s] = man.map((q) => ({ ...q })); vv.manual[s][i].horas = val; }) }))),
        botao('Usar valores manuais', () => ctx.render(), { classe: 'secundario' })));
    }
    return el('div', { class: 'cartao-caminho' }, ...filhos);
  });
  const estado = ctx.estadoRota;
  return bloco('Caminho', 2, ctx,
    ...linhas,
    estado.mensagem ? el('p', { class: estado.erro ? 'erro' : 'ajuda', role: estado.erro ? 'alert' : 'status' }, estado.mensagem) : null,
    el('div', { class: 'acoes nao-imprimir' },
      online()
        ? botao(estado.calculando ? 'Calculando…' : 'Recalcular o caminho', () => ctx.calcularRotas({ forcar: true }), { classe: 'secundario', desativado: estado.calculando })
        : el('p', { class: 'aviso' }, '⚠ Sem internet: o cálculo de novas rotas está indisponível. Use a entrada manual.'),
      estado.calculando ? botao('Cancelar', () => ctx.cancelarRotas(), { classe: 'secundario' }) : null));
}

function tabelaItinerario(r, s) {
  const x = r.sentidos[s];
  if (!x.etapas.length) return el('p', {}, 'Sem horários: falta a rota ou a entrada manual.');
  return el('table', {},
    el('caption', {}, s === 'ida' ? 'Ida' : 'Volta'),
    el('thead', {}, el('tr', {}, ...['Trecho', 'Saída', 'Chegada', 'Distância', 'Tempo', 'Parada'].map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...x.etapas.map((e) => el('tr', {},
      el('td', {}, `${nomeLugar(e.de)} → ${nomeLugar(e.para)}`),
      el('td', {}, formatarDataHora(e.saidaUTC, e.fusoSaida)),
      el('td', {}, formatarDataHora(e.chegadaUTC, e.fusoChegada)),
      el('td', {}, km(e.km)),
      el('td', {}, formatarDuracao(e.duracao_s)),
      el('td', {}, e.parada ? `${e.parada.tipo}${e.saidaParadaUTC ? `, sai ${formatarDataHora(e.saidaParadaUTC, e.fusoChegada)}` : ''}${e.parada.abastecer ? ', abastecimento' : ''}` : '—')))));
}

function blocoDescansos(r) {
  const lista = ['ida', 'volta'].flatMap((s) => (r.sentidos[s].descansos || []).map((d) => ({ ...d, s })));
  if (!lista.length) return null;
  return el('div', {},
    el('h3', {}, 'Sugestões de descanso'),
    r.descansoTexto ? el('p', { class: 'ajuda' }, r.descansoTexto) : null,
    // Só o sentido e o horário: simples de ler na estrada.
    el('ul', {}, ...lista.map((d) => el('li', {}, `${d.s === 'ida' ? 'Ida' : 'Volta'}: ${quando(new Date(d.t).toISOString(), d.fuso)}`))),
    el('p', { class: 'ajuda' }, 'Para descansar em outro lugar, adicione uma parada na tela 4: os horários são refeitos.'));
}

/** Botão "🔄 Buscar … atualizados" com a data dos dados em uso e o resultado da última busca. */
function botaoAtualizar(ctx, texto, { base = null } = {}) {
  const a = ctx.atualizacao || {};
  const bases = ctx.bases;
  let dataDosDados = '';
  if (base === 'anp' && bases?.anp?.precos?.[0]) {
    const p = bases.anp.precos[0];
    dataDosDados = `Preços da semana de ${p.periodo_inicio.split('-').reverse().join('/')} a ${p.periodo_fim.split('-').reverse().join('/')}${bases.anp.precos_municipios ? ', com média por cidade' : ''}.`;
  } else if (base === 'pedagios' && bases?.pedagios?.atualizado_em) {
    dataDosDados = `Base de pedágios de ${bases.pedagios.atualizado_em.split('-').reverse().join('/')}.`;
  }
  return el('div', { class: 'atualizar nao-imprimir' },
    dataDosDados ? el('span', { class: 'ajuda' }, `${dataDosDados} `) : null,
    botao(a.andamento ? 'Buscando…' : `🔄 ${texto}`, () => ctx.atualizarDados(), { classe: 'pequeno secundario', desativado: a.andamento }),
    a.mensagem ? el('p', { class: 'ajuda', role: 'status' }, a.mensagem) : null);
}

// ---------- Onde abastecer (recomendação do sistema) e registro do que foi feito na estrada ----------
function descreverPonto(x) {
  const lugar = x.lugar ? `perto de ${x.lugar.cidade}${x.lugar.uf ? ' — ' + x.lugar.uf : ''}` : `a cerca de ${km(x.km)} da saída`;
  return `${x.sentido === 'ida' ? 'Ida' : 'Volta'}, ${x.t ? quando(new Date(x.t).toISOString(), x.fuso) + ', ' : ''}${lugar}`;
}

/**
 * Formulário "Abasteci": a pessoa informa só os litros (ou marca "completei o tanque").
 * O preço já vem preenchido com o automático da ANP no ponto; sem ele, o preço é obrigatório.
 */
function formAbasteci(ctx, onde, fechar, sugestao) {
  const id = `ab-${Math.random().toString(36).slice(2, 8)}`;
  let completou = false, litrosInf = null;
  const temAuto = sugestao && Number.isFinite(sugestao.preco);
  let preco = temAuto ? Number(sugestao.preco.toFixed(2)) : null;
  const erroForm = el('p', { class: 'erro', role: 'alert', hidden: true });
  const campoLitros = campo({ id: `${id}-l`, rotulo: 'Quantos litros você colocou?', tipo: 'number', valor: '', ajuda: 'Está no recibo ou no visor da bomba.', aoMudar: (x) => { litrosInf = x; } });
  return el('div', { class: 'form-abasteci' },
    campoLitros,
    campo({ id: `${id}-c`, rotulo: 'Completei o tanque (não sei os litros)', tipo: 'checkbox', valor: false, aoMudar: (x) => { completou = x; campoLitros.hidden = x; } }),
    campo({
      id: `${id}-p`, rotulo: temAuto ? 'Preço do litro (R$) — já preenchido' : 'Preço do litro (R$) — obrigatório',
      tipo: 'number', valor: temAuto ? String(preco).replace('.', ',') : '',
      ajuda: temAuto ? `Preço automático: ${sugestao.origemPreco}. Se pagou outro valor, corrija.` : 'Não conseguimos o preço automático aqui. Informe quanto pagou por litro (está no recibo).',
      aoMudar: (x) => { preco = x; },
    }),
    erroForm,
    el('div', { class: 'acoes' },
      botao('Salvar abastecimento', () => {
        const falta = !completou && !(Number(litrosInf) > 0)
          ? 'Informe quantos litros colocou, ou marque "Completei o tanque".'
          : !(Number(preco) >= 0 && preco !== null && preco !== '') ? 'Informe o preço do litro.' : '';
        erroForm.hidden = !falta;
        erroForm.textContent = falta ? `✖ ${falta}` : '';
        if (falta) { anunciar(falta); return; }
        ctx.registrarAbastecimento({
          sentido: onde.sentido, trechoDoSentido: onde.trechoDoSentido, kmNoTrecho: onde.kmNoTrecho,
          modo: completou ? 'completar' : 'parcial', litros: completou ? null : Number(litrosInf),
          preco: Number(preco),
          lugar: onde.lugar ? `${onde.lugar.cidade}${onde.lugar.uf ? ' — ' + onde.lugar.uf : ''}` : '',
        });
      }),
      botao('Cancelar', fechar, { classe: 'secundario' })));
}

function blocoAbastecer(ctx, r, { resumo = false } = {}) {
  const c = r.combustivel;
  if (!c?.simulacao) return null;
  const recs = c.recomendacoes || [];
  const feitos = c.feitos || [];
  const itemRec = (x) => {
    const li = el('li', {}, el('span', {}, `⛽ ${descreverPonto(x)}`));
    const area = el('div', {});
    li.append(' ', botao('✔ Abasteci aqui', () => {
      area.replaceChildren(formAbasteci(ctx, x, () => area.replaceChildren(), x.preco !== null ? { preco: x.preco, origemPreco: x.origemPreco } : null));
      area.querySelector('input')?.focus();
    }, { classe: 'pequeno secundario nao-imprimir', rotuloAcessivel: `Registrar que abasteceu: ${descreverPonto(x)}` }), area);
    return li;
  };
  const gpsArea = el('div', {});
  const estado = el('p', { class: 'ajuda', 'aria-live': 'polite' });
  const gps = botao('📍 Abasteci agora, onde estou', async () => {
    estado.textContent = 'Procurando onde você está no caminho…';
    try {
      const onde = await ctx.ondeEstouNaRota();
      estado.textContent = onde.distanciaM > 5000
        ? `Atenção: você parece estar a ${(onde.distanciaM / 1000).toFixed(0)} km do caminho calculado. O abastecimento será registrado no ponto mais próximo do caminho.`
        : 'Achamos você no caminho. Confirme os dados:';
      gpsArea.replaceChildren(formAbasteci(ctx, onde, () => { gpsArea.replaceChildren(); estado.textContent = ''; },
        c.precoEm ? c.precoEm(onde.sentido, onde.trechoDoSentido, onde.kmNoTrecho) : null));
    } catch (e) { estado.textContent = `${e.message} Você pode usar o botão "Abasteci aqui" no ponto mais próximo.`; }
  }, { classe: 'secundario largo nao-imprimir' });
  return el('div', { class: 'abastecer' },
    resumo ? null : el('h3', {}, 'Onde abastecer'),
    recs.length
      ? [el('p', { class: 'ajuda' }, 'Recomendação do app: abasteça por volta destes pontos, antes de entrar na reserva. É uma sugestão do lugar aproximado, não garante posto aberto.'),
        el('ul', { class: 'lista-abastecer' }, ...recs.map(itemRec))]
      : el('p', {}, feitos.length ? '✔ Com o que você já abasteceu, o combustível chega até o fim sem outra parada.' : '✔ O tanque dá para a viagem toda sem abastecer (com a reserva guardada).'),
    feitos.length ? [el('p', { class: 'rotulo-campo' }, 'Já abastecido:'),
      el('ul', { class: 'lista-abastecer' }, ...feitos.map((x) => el('li', {}, `✔ ${x.real && x.litros ? litros(x.litros) : ''} — ${descreverPonto(x)}${x.preco !== null ? `, ${reais(x.preco)}/L` : ''} `,
        botao('Desfazer', () => ctx.desfazerAbastecimento(x.id), { classe: 'pequeno perigo nao-imprimir', rotuloAcessivel: 'Desfazer este abastecimento' }))))] : null,
    el('p', { class: 'ajuda nao-imprimir' }, 'Abasteceu na estrada? Registre aqui: o app refaz as contas e os próximos pontos.'),
    gps, estado, gpsArea);
}

function blocoCombustivel(ctx, r) {
  const c = r.combustivel;
  const sim = c.simulacao;
  if (!sim) return bloco('Combustível', TELA.CARRO, ctx, el('p', {}, 'Aparece depois que as duas rotas tiverem distância.'));
  const sit = (s) => selo(s, s);
  const premissa = c.custoInicial ? c.custoInicial.premissa : 'Custo do combustível que já está no tanque: não disponível (informe o preço do último abastecimento na tela 3).';
  return bloco('Combustível', TELA.CARRO, ctx,
    el('p', {}, `Autonomia inicial ${km(c.derivados.autonomiaInicial)}; com tanque cheio ${km(c.derivados.autonomiaCheia)}. Premissa: o carro não roda no destino entre a ida e a volta.`),
    el('dl', { class: 'tres-numeros' },
      el('dt', {}, '(A) Custo do combustível consumido'),
      el('dd', {}, reais(sim.custoConsumido), ' ', sit(sim.custoConsumido === null ? SITUACAO.INDISPONIVEL : sim.situacao)),
      el('dt', {}, '(B) Desembolso nos abastecimentos'),
      el('dd', {}, reais(sim.desembolso), ' ', sit(sim.desembolso === null ? SITUACAO.INDISPONIVEL : (sim.compras.length ? sim.situacao : SITUACAO.CONFIRMADO))),
      el('dt', {}, '(C) Sobra no tanque ao chegar'),
      el('dd', {}, `${litros(sim.sobraL)} · ${reais(sim.sobraValor)}`)),
    el('p', { class: 'ajuda' }, 'Os três números nunca são somados: A e B contam o mesmo combustível de formas diferentes.'),
    el('details', {}, el('summary', {}, 'Trilha do cálculo'),
      el('p', {}, premissa),
      el('ul', {}, ...sim.passos.map((p) => el('li', {}, `${p.rotulo}: ${km(p.km)}, consome ${litros(p.consumidos)}; saldo ${litros(p.saldoAntes)} → ${litros(p.saldoDepois)}`)),
        ...sim.compras.map((x) => el('li', {}, `Compra na parada ${x.parada}: ${litros(x.litros)} a ${x.preco === null ? 'preço não disponível' : reais(x.preco) + '/L'} (${x.origemPreco}${x.uf ? ', ' + x.uf : ''}); saldo ${litros(x.saldoAntes)} → ${litros(x.saldoDepois)}`)),
        ...(c.feitos || []).map((x) => el('li', {}, `Abastecido de verdade (${descreverPonto(x)}): ${litros(x.litros)} a ${x.preco === null ? 'preço não disponível' : reais(x.preco) + '/L'} (${x.origemPreco || ''}); saldo ${litros(x.saldoAntes)} → ${litros(x.saldoDepois)}`)),
        ...(c.recomendacoes || []).map((x) => el('li', {}, `Recomendado (${descreverPonto(x)}): completar ${litros(x.litros)} a ${x.preco === null ? 'preço não disponível' : reais(x.preco) + '/L'} (${x.origemPreco || ''}); saldo ${litros(x.saldoAntes)} → ${litros(x.saldoDepois)}`)))),
    ...sim.alertas.map((a) => el('p', { class: 'aviso' }, `⚠ ${a.mensagem}`)),
    sim.inviavel ? el('p', { class: 'erro' }, `✖ ${sim.inviavel.mensagem}`) : null,
    c.simplificada ? el('p', {}, `Estimativa simplificada (sem paradas de abastecimento): ${litros(c.simplificada.litros)} · ${reais(c.simplificada.valor)} `, sit(c.simplificada.situacao), ` ${c.simplificada.premissa}`) : null,
    c.precoOrigem ? el('p', { class: 'ajuda' }, c.precoOrigem.premissa) : el('p', { class: 'ajuda' }, 'Preço médio da ANP: não disponível. Informe o preço nas paradas de abastecimento.'),
    c.flex ? el('p', {}, `Flex (${c.flex.metodo || 'indisponível'}): ${c.flex.mensagem} ${c.flex.vence ? 'Mais vantajoso: ' + c.flex.vence + '.' : ''} `, sit(c.flex.situacao)) : null);
}

// Só links https de domínios gov.br (a base vem de terceiros).
export function linkOficial(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)gov\.br$/.test(x.hostname) ? x.href : null;
  } catch { return null; }
}

// Lista simples: nome da praça, estrada e valor, com uma etiqueta curta quando o valor não está confirmado.
// De onde veio o valor (cadeia de fontes: oficial → pesquisa → notícia → base anterior → OpenStreetMap).
const NOME_FONTE = { oficial: 'tabela oficial', pesquisa: 'pesquisa enviada', imprensa: 'notícia', curadoria: 'base anterior', comunidade: 'OpenStreetMap' };
const ano = (iso) => (iso ? iso.slice(0, 4) : '');

// Onde conferir quando falta valor: a página oficial da praça (se houver) e duas calculadoras públicas.
function linksConsultar(c) {
  const a = (href, texto) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'fonte' }, texto);
  return el('span', { class: 'consultar nao-imprimir' }, ' Consultar: ',
    linkOficial(c.url_tarifa_oficial) ? [a(linkOficial(c.url_tarifa_oficial), 'tabela oficial'), ' · '] : null,
    a('https://pedagiometro.webrota.com.br/', 'Pedagiômetro'), ' · ', a('https://viacusto.com.br/', 'ViaCusto'));
}

const ETIQUETA = {
  [COBRANCA.CONFIRMADA]: '',
  [COBRANCA.MANUAL]: 'valor seu',
  [COBRANCA.POSSIVEL]: 'a confirmar',
  [COBRANCA.DESCONHECIDA]: 'valor desconhecido',
};

function blocoPedagios(ctx, r) {
  const p = r.pedagios;
  if (p.indisponivel) return bloco('Pedágios', null, ctx, el('p', {}, 'Os pedágios aparecem depois que o caminho for calculado.'));
  const visiveis = [...p.confirmadas, ...p.manuais, ...p.possiveis, ...p.desconhecidas].sort((a, b) => a.t - b.t);
  const simples = (c) => el('li', { class: 'pedagio' },
    el('span', { class: 'pedagio-nome' }, `${c.tipo === 'free_flow' ? '📡' : '🚧'} ${c.nome || 'Praça'} (${c.rodovia})`),
    el('span', { class: 'pedagio-valor' }, c.valor !== null ? reais(c.valor) : '—',
      ETIQUETA[c.situacao] ? el('small', {}, ` ${ETIQUETA[c.situacao]}`) : null,
      c.valorAntigo ? el('small', {}, ` ${c.valorAntigo}`) : null,
      c.tipoFonte ? el('small', { class: 'fonte-valor' }, `fonte: ${NOME_FONTE[c.tipoFonte] || c.tipoFonte}${c.vigencia?.inicio ? ` (${c.vigencia.inicio.split('-').reverse().join('/')})` : ''}`) : null));
  const porSentido = ['ida', 'volta'].map((s) => {
    const lista = visiveis.filter((c) => (c.sentidoViagem || 'ida') === s);
    if (!lista.length) return null;
    const soma = lista.reduce((t, c) => t + (Number.isFinite(c.valor) ? c.valor : 0), 0);
    const sem = lista.filter((c) => !Number.isFinite(c.valor)).length;
    return el('div', {},
      el('h3', {}, `${s === 'ida' ? 'Ida' : 'Volta'}: cerca de ${reais(soma)}${sem ? ` + ${sem} sem valor` : ''}`),
      el('ul', { class: 'lista-pedagios' }, ...lista.map(simples)));
  });
  const total = p.totalConfirmado + p.totalManual;
  return bloco('Pedágios', null, ctx,
    visiveis.length
      ? el('p', { class: 'ajuda' }, '"A confirmar" quer dizer que a praça está no caminho, mas o app ainda não conferiu se você passa por ela nesse sentido. Confira no caminho.')
      : el('p', {}, 'Nenhuma praça encontrada no caminho. A base não tem todas as estradas: pode haver pedágio.'),
    ...porSentido,
    el('p', { class: 'ajuda' }, `${p.rotulo}: ${reais(total)} · a confirmar: ${reais(p.totalPossivel || 0)}.${p.coberturaParcial ? ' A base ainda não cobre todas as estradas.' : ''}`),
    p.freeFlow ? el('div', { class: 'aviso' }, el('strong', {}, '📡 Pedágio sem cabine (free flow)'), ...p.freeFlow.textos.map((t) => el('p', {}, t))) : null,
    botaoAtualizar(ctx, 'Buscar valores atualizados', { base: 'pedagios' }),
    recolhido('d-pedagios-mais', 'Ver detalhes e corrigir valores', blocoPedagiosDetalhado(ctx, r)));
}

/**
 * Corrigir valores: uma lista só, com todas as praças (sem valor primeiro) e UM botão "Salvar valores".
 * Vale só para esta viagem. Campo vazio = usar o valor da base.
 */
function formCorrigirPedagios(ctx, p) {
  const lista = [...p.desconhecidas, ...p.possiveis, ...p.confirmadas, ...p.manuais]
    .sort((a, b) => (a.valor === null ? 0 : 1) - (b.valor === null ? 0 : 1) || a.t - b.t);
  if (!lista.length) return null;
  const aviso = el('p', { class: 'ajuda', role: 'status' });
  const entradas = new Map();
  const linhas = lista.map((c) => {
    const id = `aj-${c.chave}`.replace(/[^\w-]/g, '_');
    const atual = ctx.v.ajustesPedagio[c.chave] ?? ctx.v.ajustesPedagio[c.chaveAntiga];
    const inp = el('input', {
      id, type: 'text', inputmode: 'decimal', class: 'valor-pedagio', autocomplete: 'off',
      value: atual !== undefined && atual !== null ? String(atual).replace('.', ',') : '',
      placeholder: c.valor !== null && c.situacao !== 'manual' ? String(c.valor.toFixed(2)).replace('.', ',') : 'R$',
    });
    entradas.set(c.chave, { inp, antiga: c.chaveAntiga });
    const outras = (c.alternativas || []).map((o) => `${reais(o.valor)} (${o.fonte}, ${ano(o.inicio)})`).join(' · ');
    return el('li', { class: c.valor === null ? 'sem-valor' : null },
      el('label', { for: id }, `${c.nome || 'Praça'} (${c.rodovia}) · ${c.sentidoViagem === 'volta' ? 'volta' : 'ida'}`,
        el('small', {}, c.situacao === 'manual' ? ` corrigido por você: ${reais(c.valor)}` : c.valor === null ? ' sem valor na base' : ` usado: ${reais(c.valor)} — ${NOME_FONTE[c.tipoFonte] || 'base'}${c.valorAntigo ? ` (${c.valorAntigo})` : ''}`),
        outras ? el('small', {}, ` outras estimativas: ${outras}`) : null,
        c.valor === null ? el('small', {}, linksConsultar(c)) : null),
      inp);
  });
  const salvar = botao('💾 Salvar valores', () => {
    let n = 0, invalidos = 0;
    const novos = {};
    for (const [chave, { inp }] of entradas) {
      const t = inp.value.trim();
      if (!t) continue;
      const num = Number(t.replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(num) && num >= 0 && num < 1000) { novos[chave] = num; n++; } else invalidos++;
    }
    if (invalidos) { aviso.textContent = `✖ ${invalidos} valor(es) inválido(s). Use números, por exemplo 14,50.`; return; }
    ctx.alterar((vv) => {
      for (const [chave, { antiga }] of entradas) { delete vv.ajustesPedagio[chave]; delete vv.ajustesPedagio[antiga]; }
      Object.assign(vv.ajustesPedagio, novos);
    }, { render: true, foco: 'salvar-pedagios' });
    anunciar(n ? `✔ ${n} valor(es) salvos. Os totais foram refeitos.` : '✔ Correções removidas: valendo os valores da base.');
  }, { classe: 'largo' });
  salvar.id = 'salvar-pedagios';
  return el('div', { class: 'corrigir-pedagios nao-imprimir' },
    el('h3', {}, 'Corrigir valores (só nesta viagem)'),
    el('p', { class: 'ajuda' }, 'Digite o valor que você sabe e toque em "Salvar valores" no final. Deixe em branco para usar o valor da base.'),
    el('ul', { class: 'lista-corrigir' }, ...linhas),
    salvar, aviso);
}

function blocoPedagiosDetalhado(ctx, r) {
  const p = r.pedagios;
  const linha = (c) => el('li', {},
    `${c.tipo === 'free_flow' ? 'Pórtico free flow' : 'Praça'}${c.nome ? ' ' + c.nome : ''} (${c.rodovia}${c.km ? ' km ' + c.km : ''}) — ${formatarDataHora(new Date(c.t).toISOString(), 'America/Sao_Paulo')}: `,
    c.valor !== null ? reais(c.valor) : 'tarifa desconhecida', ' ', selo(c.situacao, c.situacao),
    c.valor !== null ? [' ', selo(c.situacaoValor, `valor ${c.situacaoValor}`)] : null,
    c.motivo ? el('span', { class: 'ajuda' }, ` ${c.motivo}`) : null,
    linkOficial(c.url_tarifa_oficial) ? [' ', el('a', { href: linkOficial(c.url_tarifa_oficial), target: '_blank', rel: 'noopener noreferrer', class: 'fonte' }, 'Tabela oficial')] : null);
  const total = p.totalConfirmado + p.totalManual;
  return el('div', {},
    formCorrigirPedagios(ctx, p),
    el('h3', {}, 'Detalhes técnicos'),
    el('p', {}, `${p.rotulo}: `, (p.confirmadas.length || p.manuais.length) ? reais(total) : p.textoVazio, ' ', selo(p.situacao, p.situacao),
      p.manuais.length ? ` (inclui ${reais(p.totalManual)} de ajustes manuais)` : null),
    p.coberturaParcial ? el('p', { class: 'aviso' }, '⚠ Cobertura parcial: a base ainda não cobre todas as rodovias. Pode haver pedágios não listados.') : null,
    (p.confirmadas.length || p.manuais.length) ? el('ul', {}, ...[...p.confirmadas, ...p.manuais].map(linha)) : null,
    p.possiveis.length ? [
      el('h3', {}, 'Possíveis pedágios (fora do total)'),
      el('p', {}, `Soma dos possíveis com valor conhecido: ${reais(p.totalPossivel)} `, selo(SITUACAO.ESTIMADO, 'não confirmado'),
        ' — praças perto do caminho, ainda sem conferência de via, sentido e acesso.'),
      el('ul', {}, ...p.possiveis.map(linha))] : null,
    p.desconhecidas.length ? [el('h3', {}, 'Pontos sem tarifa conhecida'), el('ul', {}, ...p.desconhecidas.map(linha))] : null,
    p.foraDoSentido?.length ? el('details', {},
      el('summary', {}, `${p.foraDoSentido.length} praça(s) perto do caminho que cobram só no sentido oposto`),
      el('ul', {}, ...p.foraDoSentido.map(linha))) : null);
}

function blocoRodizio(ctx, r) {
  const z = r.rodizio;
  return bloco('Rodízio (São Paulo)', TELA.CARRO, ctx,
    el('p', {}, selo(z.situacao, z.situacao), ` ${z.mensagem || ''}`),
    ...z.alertas.map((a) => el('p', { class: a.tipo === 'rodizio' ? 'erro' : 'aviso' }, `${a.tipo === 'rodizio' ? '✖' : '⚠'} ${a.mensagem}`)),
    ...z.avisos.map((a) => el('p', { class: 'aviso' }, `⚠ ${a}`)),
    z.alertas.length ? el('p', { class: 'ajuda' }, 'Sugestão: sair mais cedo ou mais tarde (ajuste o horário na tela 1). Desvios só são sugeridos depois de calcular uma rota alternativa que não entre na área.') : null,
    ctx.bases?.regras?.rodizio_sp?.penalidade ? el('p', { class: 'ajuda' }, (() => {
      const pn = ctx.bases.regras.rodizio_sp.penalidade;
      return `Penalidade informada: ${pn.descricao}, multa de ${reais(pn.multa_reais)} e ${pn.pontos} pontos na CNH (${pn.orgao}, conferido em ${pn.consultado_em}; nível ${pn.nivel_verificacao}).`;
    })()) : null);
}

function blocoDocumentos(ctx, r) {
  const d = r.documentos;
  return bloco('Documentos', 5, ctx,
    el('p', {}, d.concluida ? selo(SITUACAO.CONFIRMADO, 'lista concluída') : selo(SITUACAO.INDISPONIVEL, 'pendente'), ` ${d.feitos} de ${d.total} documento(s) confirmados.`),
    ...d.pendencias.map((x) => el('p', { class: 'aviso' }, `⚠ ${x}`)),
    el('p', { class: 'ajuda' }, d.aviso));
}

function blocoListas(ctx) {
  const { v } = ctx;
  const s = v.separacao || {};
  const responsavel = s.modo === 'uma_pessoa' ? v.viajantes.find((p) => p.id === s.responsavelId) : null;
  const topo = s.modo === 'cada_um' ? 'Cada pessoa separa as próprias coisas.'
    : responsavel ? `${responsavel.nome || 'Uma pessoa'} separa as coisas de todos.`
      : s.modo === 'uma_pessoa' ? 'Uma pessoa separa tudo — falta escolher quem.' : null;
  return bloco('Listas', 5, ctx,
    topo ? el('p', {}, `👤 ${topo}`) : null,
    el('ul', {}, ...v.listas.map((l) => {
      const quem = s.modo === 'cada_um' ? separadorDaLista(v, l) : null; // com uma pessoa só, o nome já está no topo
      return el('li', {}, `${l.titulo}${quem ? ` (separa: ${quem})` : ''}: ${l.itens.filter((i) => i.feito).length} de ${l.itens.length}`);
    })));
}

function blocoBases(ctx) {
  const lista = situacaoDasBases(ctx.bases, { conferidoNestaSessao: ctx.basesConferidas });
  return bloco('Bases de dados', null, ctx,
    el('ul', {}, ...lista.map((b) => el('li', {}, `${b.nome}: `, selo(b.situacao, b.situacao), b.versao ? ` versão ${b.versao}` : '', b.validade ? `, válida até ${b.validade}` : ''))),
    ctx.bases?.versao ? el('p', { class: 'ajuda' }, `Conjunto ${ctx.bases.versao}.`) : null);
}

function esboco(r) {
  const pts = [];
  for (const s of ['ida', 'volta']) for (const t of r.sentidos[s].trechos) for (const a of t.amostras) pts.push({ c: a.c, s });
  if (pts.length < 2 || !online()) return null;
  const xs = pts.map((p) => p.c[0]), ys = pts.map((p) => p.c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const L = 600, H = 360, m = 12;
  const esc = Math.min((L - 2 * m) / (x1 - x0 || 1e-6), (H - 2 * m) / (y1 - y0 || 1e-6));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${L} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Esboço do traçado da ida e da volta, sem mapa de fundo');
  for (const s of ['volta', 'ida']) {
    const d = pts.filter((p) => p.s === s).map((p, i) => `${i ? 'L' : 'M'}${(m + (p.c[0] - x0) * esc).toFixed(1)},${(H - m - (p.c[1] - y0) * esc).toFixed(1)}`).join('');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `traco traco-${s}`);
    svg.append(path);
  }
  return el('figure', { class: 'esboco nao-imprimir' }, svg,
    el('figcaption', {}, 'Esboço do traçado (linha contínua: ida; tracejada: volta). Sem mapa de fundo nesta versão. Dados de rota © colaboradores do OpenStreetMap.'));
}

// Data e hora curtas para o resumo: "sáb., 28/11 às 03:00".
const curtoFmt = new Map();
function quando(iso, tz) {
  if (!iso) return '—';
  if (!curtoFmt.has(tz)) curtoFmt.set(tz, new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
  const p = Object.fromEntries(curtoFmt.get(tz).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

function linhaSentido(r, v, s) {
  const x = r.sentidos[s];
  const pts = pontosDaRota(v, s);
  const de = pts[0], para = pts[pts.length - 1];
  const nome = (l) => (l ? (l.cidade || l.nome) : '—');
  const titulo = s === 'ida' ? '🚗 Ida' : '🏠 Volta';
  if (!x.etapas.length) return el('div', { class: 'resumo-linha' }, el('strong', {}, titulo), el('span', {}, ` ${nome(de)} → ${nome(para)}: o caminho ainda não foi calculado.`));
  return el('div', { class: 'resumo-linha' },
    el('strong', {}, titulo),
    el('span', {}, ` Sai de ${nome(de)} ${quando(x.partidaUTC, x.etapas[0].fusoSaida)} e chega em ${nome(para)} ${quando(x.chegadaUTC, x.etapas[x.etapas.length - 1].fusoChegada)}.`),
    el('span', { class: 'ajuda' }, ` ${km(x.km)}${x.duracao_s ? `, cerca de ${formatarDuracao(x.duracao_s)} com as paradas` : ''}.`));
}

function resumoSimples(ctx, r) {
  const v = ctx.v;
  const c = r.combustivel;
  const sim = c?.simulacao;
  const p = r.pedagios;
  // Duas perguntas diferentes, respondidas separadamente (Seção 4.3: os números nunca são somados):
  // quanto sai do bolso nos postos durante a viagem, e quanto combustível a viagem gasta no total.
  let gasolina;
  if (sim?.inviavel) gasolina = el('span', { class: 'erro' }, 'o combustível não chega até o fim: veja "O que conferir"');
  else if (sim) {
    const nAbast = sim.compras.filter((x) => x.litros > 0).length + (sim.recomendados || []).length + (sim.reais || []).length;
    const pago = sim.desembolso !== null
      ? (nAbast ? `você paga cerca de ${reais(sim.desembolso)} nos postos (${nAbast} ${nAbast === 1 ? 'abastecimento' : 'abastecimentos'})` : 'não precisa abastecer durante a viagem')
      : 'preço do combustível não disponível';
    gasolina = el('span', {}, pago,
      sim.custoConsumido !== null ? el('small', { class: 'linha-menor' }, `A viagem gasta ${litros(sim.passos.reduce((t, p) => t + p.consumidos, 0))} de combustível, que custam cerca de ${reais(sim.custoConsumido)} — contando o que já estava no tanque na saída.`) : null);
  } else if (c?.simplificada?.valor !== null && c?.simplificada?.valor !== undefined) gasolina = `cerca de ${reais(c.simplificada.valor)}`;
  else gasolina = 'aparece depois que o caminho for calculado';
  const confirmado = (p?.totalConfirmado || 0) + (p?.totalManual || 0);
  const semValor = p?.desconhecidas?.length || 0;
  const faltam = semValor ? ` + ${semValor} ${semValor === 1 ? 'praça' : 'praças'} sem valor conhecido (o total real é maior)` : '';
  let pedagio;
  if (p?.indisponivel) pedagio = 'aparece depois que o caminho for calculado';
  else if (confirmado > 0) pedagio = `${reais(confirmado)} confirmados${p.totalPossivel ? ` + cerca de ${reais(p.totalPossivel)} a confirmar` : ''}${faltam}`;
  else if (p?.totalPossivel) pedagio = `cerca de ${reais(p.totalPossivel)} (valores a confirmar)${faltam}`;
  else if (semValor) pedagio = `${semValor} ${semValor === 1 ? 'praça' : 'praças'} no caminho, sem valor conhecido`;
  else pedagio = 'nenhum encontrado no caminho (a base não cobre todas as estradas)';
  return el('section', { class: 'resumo-cartao', 'aria-labelledby': 't-resumo' },
    el('h2', { id: 't-resumo' }, v.nome || `${v.origem?.cidade || v.origem?.nome || '?'} → ${v.destino?.cidade || v.destino?.nome || '?'}`),
    ctx.estadoRota.calculando ? el('p', { class: 'aviso', role: 'status' }, '⏳ Calculando o caminho… aguarde alguns segundos.') : null,
    linhaSentido(r, v, 'ida'),
    linhaSentido(r, v, 'volta'),
    el('dl', { class: 'resumo-numeros' },
      el('dt', {}, '📅 Duração'), el('dd', {}, r.dias ? `${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}` : '—'),
      el('dt', {}, '📏 Distância total'), el('dd', {}, r.sentidos.ida.km + r.sentidos.volta.km ? km(r.sentidos.ida.km + r.sentidos.volta.km) : '—'),
      el('dt', {}, '⛽ Combustível'), el('dd', {}, gasolina),
      el('dt', {}, '🚧 Pedágios'), el('dd', {}, pedagio)),
    el('p', { class: 'ajuda' }, 'Valores aproximados, sem trânsito em tempo real. Confira as regras e os preços antes de sair.'));
}

function oQueConferir(ctx, r) {
  const v = ctx.v;
  const itens = [];
  const add = (grave, texto, tela, acao = 'Resolver') => itens.push({ grave, texto, tela, acao });
  for (const e of r.erros) add(true, e, e.includes('volta') ? 1 : null);
  for (const a of r.alertas) {
    if (a.tipo === 'Combustível') add(a.nivel === 'grave', `${a.tipo}: ${a.mensagem}`, TELA.PARADAS, 'Marcar parada para abastecer');
    else add(a.nivel === 'grave', `${a.tipo}: ${a.mensagem}`, a.tipo === 'Rodízio' ? 1 : null, 'Mudar horário');
  }
  if (r.rodizio?.mensagem && !r.rodizio.alertas.length && r.rodizio.situacao === SITUACAO.INDISPONIVEL) add(false, `Rodízio: ${r.rodizio.mensagem}`, TELA.CARRO);
  for (const pend of r.documentos.pendencias) add(false, pend, 5);
  if (r.documentos.total && !r.documentos.concluida) add(false, `Documentos: ${r.documentos.feitos} de ${r.documentos.total} separados.`, 5);
  const listas = v.listas.reduce((s, l) => [s[0] + l.itens.filter((i) => i.feito).length, s[1] + l.itens.length], [0, 0]);
  if (listas[1] && listas[0] < listas[1]) add(false, `O que levar: ${listas[0]} de ${listas[1]} itens separados.`, 5);
  if (v.separacao?.modo === 'uma_pessoa' && !v.viajantes.some((p) => p.id === v.separacao.responsavelId)) add(false, 'O que levar: escolha quem vai separar as coisas de todos.', 5);
  const semValor = r.pedagios?.desconhecidas?.length || 0;
  if (semValor) add(false, `Pedágios: ${semValor} ${semValor === 1 ? 'praça' : 'praças'} no caminho sem valor na base, então o total de pedágios está incompleto. Se souber o valor, informe em "Pedágios → Ver detalhes e corrigir valores".`, null);
  if (v.preparacao?.desatualizada) add(false, 'Você mudou a viagem depois de preparar para usar sem internet: prepare de novo.', null);
  itens.sort((a, b) => Number(b.grave) - Number(a.grave));
  return el('section', { class: 'conferir', 'aria-labelledby': 't-conferir' },
    el('h2', { id: 't-conferir' }, itens.length ? '👀 O que conferir' : '✔ Tudo certo por enquanto'),
    itens.length
      ? el('ul', { class: 'lista-conferir' }, ...itens.map((i) => el('li', { class: i.grave ? 'erro' : 'aviso' },
        `${i.grave ? '✖' : '⚠'} ${i.texto} `,
        i.tela ? botao(i.acao, () => ctx.irPara(i.tela), { classe: 'pequeno secundario nao-imprimir' }) : null)))
      : el('p', {}, 'Nenhum aviso. Mesmo assim, confira as condições da estrada antes de sair.'));
}

export function tela6(ctx) {
  const r = ctx.resultado;
  const v = ctx.v;
  const prep = v.preparacao || {};
  return el('div', { class: 'revisao' },
    el('p', { class: 'aviso-curto' }, AVISO_CURTO),
    resumoSimples(ctx, r),
    r.combustivel?.simulacao ? el('section', { class: 'onde-abastecer', 'aria-labelledby': 't-abastecer' },
      el('h2', { id: 't-abastecer' }, '⛽ Onde abastecer'),
      blocoAbastecer(ctx, r, { resumo: true }),
      botaoAtualizar(ctx, 'Buscar preços atualizados', { base: 'anp' })) : null,
    oQueConferir(ctx, r),
    el('section', { class: 'secao-caminho' }, blocoRotas(ctx, r)),
    el('div', { class: 'acoes-principais nao-imprimir' },
      botao('🖨️ Imprimir ou salvar em PDF', () => window.print(), { classe: 'largo' }),
      botao('📴 Preparar para usar sem internet', () => ctx.preparar(), { classe: 'secundario largo' }),
      el('p', { class: 'ajuda' }, 'Sem internet: ', selo(prep.estado === 'pronto' && !prep.desatualizada ? SITUACAO.CONFIRMADO : (prep.desatualizada ? SITUACAO.DESATUALIZADO : SITUACAO.INDISPONIVEL), prep.desatualizada ? 'precisa preparar de novo' : prep.estado === 'pronto' ? 'pronto' : 'ainda não preparado'))),
    el('h2', { class: 'titulo-detalhes' }, 'Detalhes (toque para abrir)'),
    recolhido('d-desenho', '🗺️ Desenho do caminho', esboco(r) || el('p', {}, 'O desenho aparece com internet, depois que o caminho for calculado.')),
    recolhido('d-horarios', '🕒 Horários de cada trecho e descansos',
      bloco('Itinerário', TELA.PARADAS, ctx, tabelaItinerario(r, 'ida'), tabelaItinerario(r, 'volta'), el('p', { class: 'ajuda' }, 'Estimativa sem trânsito em tempo real. Cada horário está no fuso do lugar.'), blocoDescansos(r))),
    recolhido('d-combustivel', '⛽ Combustível: onde abastecer e como foi calculado', blocoCombustivel(ctx, r)),
    recolhido('d-pedagios', '🚧 Pedágios: lista das praças', blocoPedagios(ctx, r)),
    recolhido('d-rodizio', '🚦 Rodízio de São Paulo', blocoRodizio(ctx, r)),
    recolhido('d-docs', '🪪 Documentos e o que levar', blocoDocumentos(ctx, r), blocoListas(ctx)),
    recolhido('d-tecnico', '⚙️ Informações técnicas', blocoBases(ctx),
      botaoAtualizar(ctx, 'Buscar dados atualizados (preços, pedágios, feriados, rodízio)'),
      el('p', { class: 'ajuda' }, `Resultados calculados com a revisão ${r.revisao_entrada} dos dados da viagem e o conjunto de bases ${r.versao_bases || 'indisponível'}.`),
      el('div', { class: 'acoes nao-imprimir' },
        botao('Salvar agora', () => ctx.salvarAgora(), { classe: 'secundario pequeno' }),
        botao('Salvar uma cópia (arquivo)', () => ctx.exportar(), { classe: 'secundario pequeno' }))),
    el('footer', { class: 'so-imprimir' }, el('p', {}, AVISO_CURTO), el('p', {}, '© 2026 Grupo DK²')));
}

export { COBRANCA };
