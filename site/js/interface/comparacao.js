// Tela "Comparar viagens e custos do ano": viagens ao mesmo destino lado a lado e o gasto de cada ano.
import { el, botao, reais, km } from './dom.js';
import { isoParaBr } from './datas.js';
import { custosDaViagem, gruposParaComparar, anosComViagem, custosDoAno } from '../dominio/comparacao.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
let anoEscolhido = null;
let parte = 'ano';

const horas = (h) => {
  if (h === null || !Number.isFinite(h)) return '—';
  const t = Math.round(h * 60);
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')}`;
};
// Largura pelo CSSOM (a política de segurança não aceita style="" no HTML).
function barra(fracao) {
  const b = el('span', { class: 'barra', 'aria-hidden': 'true' });
  b.style.width = `${Math.round(Math.max(0, Math.min(1, fracao)) * 100)}%`;
  return b;
}
const valor = (x) => (x === null ? 'sem valor' : reais(x));
const titulo = (x) => x.nome || `Viagem de ${isoParaBr(x.data) || 'data não informada'}`;

function linhaPedagio(x) {
  const t = x.pedagioConfirmado + x.pedagioAConfirmar;
  return `${reais(t)}${x.pracasSemValor ? ` + ${x.pracasSemValor} sem valor` : ''}`;
}

function parteComparar(itens, abrirViagem) {
  const grupos = gruposParaComparar(itens);
  if (!grupos.length) {
    return el('div', { class: 'cartao' },
      el('p', {}, 'Ainda não há duas viagens para o mesmo destino.'),
      el('p', { class: 'ajuda' }, 'Quando você planejar outra viagem para uma cidade em que já foi (ou vai), ela aparece aqui lado a lado com as outras: distância, tempo, combustível, pedágios e total.'));
  }
  return el('div', {}, ...grupos.map((g) => {
    const barata = g.viagens.find((x) => x.id === g.maisBarataId);
    return el('section', { class: 'cartao', 'aria-label': `Viagens para ${g.destino}` },
      el('h2', {}, `📍 ${g.destino} — ${g.viagens.length} viagens`),
      barata && g.viagens.length - g.semValor >= 2
        ? el('p', { class: 'destaque-mini' }, `💚 Mais barata: ${titulo(barata)} (${reais(barata.total)}). Média: ${reais(g.media)} por viagem.`) : null,
      el('div', { class: 'tabela-rolagem', tabindex: '0', role: 'region', 'aria-label': `Tabela de comparação — ${g.destino}` },
        el('table', { class: 'tabela-comparar' },
          el('thead', {}, el('tr', {},
            ...['Viagem', 'Distância', 'Ao volante', 'Combustível', 'Pedágios', 'Total', 'Por km', 'Diferença'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', {}, ...g.viagens.map((x) => el('tr', { class: x.id === g.maisBarataId ? 'mais-barata' : null },
            el('th', { scope: 'row' }, botao(titulo(x), () => abrirViagem(x.id), { classe: 'link', rotuloAcessivel: `Abrir ${titulo(x)}` }),
              el('small', { class: 'linha-menor' }, isoParaBr(x.data) || '')),
            el('td', {}, x.km ? km(x.km) : 'sem caminho'),
            el('td', {}, horas(x.horas)),
            el('td', {}, valor(x.combustivel)),
            el('td', {}, x.semCaminho ? '—' : linhaPedagio(x)),
            el('td', {}, el('strong', {}, valor(x.total))),
            el('td', {}, x.porKm === null ? '—' : reais(x.porKm)),
            el('td', {}, x.total === null || x.pracasSemValor || !barata ? 'não comparável' : x.id === barata.id ? 'mais barata' : x.total - barata.total < 0.005 ? 'mesmo valor' : `+ ${reais(x.total - barata.total)}`)))))),
      g.semValor ? el('p', { class: 'ajuda' }, `${g.semValor} ${g.semValor === 1 ? 'viagem ficou' : 'viagens ficaram'} fora da comparação porque falta algum valor (caminho, preço do combustível ou praça de pedágio sem valor). Abra a viagem para completar.`) : null);
  }));
}

function parteAno(itens, ctx) {
  const anos = anosComViagem(itens);
  if (!anos.length) return el('p', { class: 'cartao' }, 'Nenhuma viagem com data de ida.');
  if (!anos.includes(anoEscolhido)) anoEscolhido = anos[0];
  const c = custosDoAno(itens, anoEscolhido);
  const maiorMes = Math.max(...c.meses.map((m) => m.total), 1);
  return el('div', {},
    anos.length > 1 ? el('div', { class: 'abas', role: 'group', 'aria-label': 'Ano' },
      ...anos.map((a) => {
        const b = botao(a, () => { anoEscolhido = a; ctx.render(); }, { classe: a === anoEscolhido ? 'aba ativa' : 'aba' });
        b.setAttribute('aria-pressed', String(a === anoEscolhido));
        return b;
      })) : null,
    el('section', { class: 'resumo-cartao', 'aria-labelledby': 't-ano' },
      el('h2', { id: 't-ano' }, `💰 Gastos com viagens em ${c.ano}`),
      el('dl', { class: 'resumo-numeros' },
        el('dt', {}, '🧳 Viagens'), el('dd', {}, String(c.viagens)),
        el('dt', {}, '📏 Distância'), el('dd', {}, km(c.km)),
        el('dt', {}, '⛽ Combustível'), el('dd', {}, reais(c.combustivel)),
        el('dt', {}, '🚧 Pedágios'), el('dd', {}, `${reais(c.pedagios)}${c.pracasSemValor ? ` + ${c.pracasSemValor} praças sem valor` : ''}`),
        el('dt', {}, '💰 Total'), el('dd', {}, el('strong', {}, reais(c.total))),
        el('dt', {}, '📊 Média por viagem'), el('dd', {}, c.mediaPorViagem === null ? '—' : reais(c.mediaPorViagem))),
      c.semValor ? el('p', { class: 'aviso' }, `⚠ ${c.semValor} ${c.semValor === 1 ? 'viagem ficou' : 'viagens ficaram'} fora da soma por não ter valor (caminho ou preço do combustível faltando). O gasto real é maior.`) : null,
      el('p', { class: 'ajuda' }, 'Estimativa: combustível gasto (com os preços que você registrou ou a média da ANP) mais pedágios encontrados no caminho. Não inclui hospedagem, comida nem estacionamento.')),
    el('section', { class: 'cartao', 'aria-labelledby': 't-meses' },
      el('h2', { id: 't-meses' }, 'Por mês'),
      el('ul', { class: 'barras-mes' }, ...c.meses.map((m) => el('li', {},
        el('span', { class: 'mes' }, MESES[m.mes - 1]),
        barra(m.total / maiorMes),
        el('span', { class: 'valor' }, m.viagens ? `${reais(m.total)} · ${m.viagens} ${m.viagens === 1 ? 'viagem' : 'viagens'}` : '—'))))),
    el('section', { class: 'cartao', 'aria-labelledby': 't-destinos' },
      el('h2', { id: 't-destinos' }, 'Por destino'),
      el('ul', { class: 'lista-simples' }, ...c.porDestino.map((d) => el('li', {},
        `📍 ${d.destino}: ${reais(d.total)} em ${d.viagens} ${d.viagens === 1 ? 'viagem' : 'viagens'}${d.semValor ? ` (${d.semValor} sem valor)` : ''}`)))));
}

/**
 * ctx: { viagens, bases, abrirViagem(id), render() }.
 */
export function vistaComparacao(ctx) {
  const { viagens, bases, abrirViagem } = ctx;
  const itens = viagens.map((v) => custosDaViagem(v, bases));
  const abas = el('div', { class: 'abas', role: 'group', 'aria-label': 'Partes desta tela' },
    ...[['ano', '💰 Custos do ano'], ['comparar', '📍 Mesmo destino']].map(([k, t]) => {
      const b = botao(t, () => { parte = k; ctx.render(); }, { classe: parte === k ? 'aba ativa' : 'aba' });
      b.setAttribute('aria-pressed', String(parte === k));
      return b;
    }));
  return el('div', {}, abas,
    viagens.length ? (parte === 'ano' ? parteAno(itens, ctx) : parteComparar(itens, abrirViagem)) : el('p', { class: 'cartao' }, 'Nenhuma viagem salva ainda.'));
}
