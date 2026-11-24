// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Controlador do app: primeira abertura, assistente, rotas, preparação e menu.
import { el, botao, limpar, anunciar, selo, campo, recolhido } from './interface/dom.js';
import { isoParaBr } from './interface/datas.js';
import { tela1, tela2, telaCarro, telaParadas, tela5 } from './interface/telas.js';
import { tela6, AVISO_CURTO } from './interface/revisao.js';
import { vistaComparacao } from './interface/comparacao.js';
import { abrir, obter, gravar, listar, remover, meta, migrar, transacao, copiaDeSeguranca, apagarTudo } from './armazenamento/db.js';
import { exportar, conferirImportacao, AVISO_EXPORTACAO } from './armazenamento/exportacao.js';
import { atualizarBases, carregarBases } from './servicos/bases.js';
import { calcularRota } from './servicos/roteador.js';
import { configurarLimites, online } from './servicos/http.js';
import { novaViagem, validarTela, registrarAlteracao, chaveRota, pontosDaRota, novoId } from './dominio/viagem.js';
import { localizarNaRota } from './dominio/geo.js';
import { reverso } from './servicos/buscador.js';
import { calcularViagem, validarPrecos, precoAutomatico } from './dominio/calculo.js';
import { formatarDataHora } from './dominio/tempo.js';
import { SITUACAO } from './dominio/situacao.js';
import { preparar, FUNCIONA_OFFLINE, NAO_FUNCIONA_OFFLINE, VERSAO_APP } from './offline/preparacao.js';

export const VERSAO_TERMOS = '0.2-rascunho';
const DATA_TERMOS = '2026-11-23';
const TITULOS = ['Quando você vai viajar?', 'De onde sai e para onde vai?', 'Sobre o carro', 'Vai parar no caminho?', 'Quem vai viajar?', 'Resumo da viagem'];
const TELAS = [tela1, tela2, telaCarro, telaParadas, tela5, tela6]; // ordem = TELA em dominio/viagem.js

const estado = {
  vista: 'carregando', viagem: null, bases: null, basesConferidas: false, tentou: {},
  estadoRota: {}, controleRota: null, inventario: null, estadoPreparo: null, importacao: null, mensagem: '',
};
const principal = () => document.getElementById('principal');

// ---------- Persistência ----------
let filaGravacao = Promise.resolve();
function salvar() {
  const copia = structuredClone(estado.viagem);
  filaGravacao = filaGravacao.then(() => gravar('viagens', copia)).catch(() => anunciar('Não foi possível salvar no aparelho. Verifique o espaço livre.'));
  return filaGravacao;
}

function alterar(fn, { render: rerender = false, depois, foco, manterPreparo = false } = {}) {
  const preparoAntes = manterPreparo ? structuredClone(estado.viagem.preparacao) : null;
  fn(estado.viagem);
  registrarAlteracao(estado.viagem);
  // Registrar um abastecimento na estrada não muda o roteiro guardado para uso sem internet.
  if (manterPreparo) estado.viagem.preparacao = preparoAntes;
  salvar();
  if (rerender) render({ foco });
  depois?.();
}

// ---------- Rotas ----------
async function calcularRotas({ forcar = false } = {}) {
  const v = estado.viagem;
  estado.controleRota?.abort();
  const controle = new AbortController();
  estado.controleRota = controle;
  estado.estadoRota = { calculando: true, mensagem: 'Calculando rotas…' };
  if (estado.vista === 'assistente') render();
  const mensagens = [];
  for (const s of ['ida', 'volta']) {
    const pontos = pontosDaRota(v, s);
    if (pontos.some((p) => !p)) { mensagens.push(`${s}: faltam origem, destino ou locais das paradas.`); continue; }
    const chave = chaveRota(v, s);
    // Cache: sem alteração, sem nova consulta (Seção 9.3) — a não ser que a pessoa peça "Recalcular".
    if (!forcar && v.rotas[s]?.chave === chave && v.rotas[s].situacao !== SITUACAO.DESATUALIZADO) continue;
    let resp;
    try {
      resp = await calcularRota(pontos, { sinal: controle.signal });
    } catch {
      estado.estadoRota = { mensagem: 'Cálculo cancelado.' };
      render();
      return estado.viagem;
    }
    // Resposta atrasada: descartada se os dados mudaram enquanto esperava.
    if (estado.viagem !== v || chaveRota(estado.viagem, s) !== chave || controle.signal.aborted) continue;
    if (resp.status === 'ok') {
      if (v.rotas[s] && v.rotas[s].chave !== chave) {
        v.historicoRotas = [...(v.historicoRotas || []), { sentido: s, chave: v.rotas[s].chave, servico: v.rotas[s].servico, calculado_em: v.rotas[s].calculado_em }].slice(-5);
      }
      const alternativas = (resp.dados.alternativas || []).length > 1 ? resp.dados.alternativas.map((legs) => ({ legs })) : [];
      v.rotas[s] = { chave, servico: resp.fonte, calculado_em: resp.obtido_em, revisao_entrada: v.revisao, situacao: SITUACAO.ESTIMADO, legs: resp.dados.legs, alternativas, escolhida: 0 };
    } else {
      if (v.rotas[s]?.chave === chave) v.rotas[s].situacao = SITUACAO.DESATUALIZADO;
      mensagens.push(`${s === 'ida' ? 'Ida' : 'Volta'}: ${resp.mensagem}`);
    }
  }
  registrarAlteracao(v);
  await salvar();
  estado.estadoRota = mensagens.length ? { erro: true, mensagem: mensagens.join(' ') } : { mensagem: '' };
  if (estado.vista === 'assistente') render();
  return v;
}

// ---------- Abastecimento: cidades recomendadas e registro na estrada ----------
const buscandoCidade = new Set();
async function buscarCidadesRecomendadas(resultado) {
  const v = estado.viagem;
  if (!online() || !resultado?.combustivel?.recomendacoes) return;
  const faltam = resultado.combustivel.recomendacoes.filter((x) => x.chave && !x.lugar && !buscandoCidade.has(x.chave)).slice(0, 10);
  if (!faltam.length) return;
  let achou = false;
  for (const x of faltam) {
    buscandoCidade.add(x.chave); // não repete a consulta, nem se falhar
    try {
      const l = await reverso(x.c[1], x.c[0]);
      if (l && estado.viagem === v) {
        v.lugaresSugeridos = { ...(v.lugaresSugeridos || {}), [x.chave]: { cidade: l.cidade || l.nome, uf: l.uf, rotulo: l.rotulo } };
        achou = true;
      }
    } catch { /* sem cidade: o ponto aparece com a distância desde a saída */ }
  }
  if (achou && estado.viagem === v) {
    await salvar(); // é só um cache: não conta como alteração da viagem
    if (estado.vista === 'assistente' && v.tela === 6) render();
  }
}

function registrarAbastecimento(dados) {
  alterar((vv) => {
    vv.abastecimentosReais = [...(vv.abastecimentosReais || []), { id: novoId(), quando: new Date().toISOString(), ...dados }];
  }, { render: true, manterPreparo: true });
  anunciar('Abastecimento registrado. Os próximos pontos foram recalculados.');
}

function desfazerAbastecimento(id) {
  alterar((vv) => { vv.abastecimentosReais = (vv.abastecimentosReais || []).filter((a) => a.id !== id); }, { render: true, manterPreparo: true });
}

/** Acha, pelo GPS, em que ponto do caminho a pessoa está. Retorna { sentido, trechoDoSentido, kmNoTrecho, distanciaM } ou lança erro. */
function ondeEstouNaRota(resultado) {
  return new Promise((ok, erro) => {
    if (!navigator.geolocation) { erro(new Error('Este aparelho não informa a localização.')); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const ida = resultado.sentidos.ida.trechos, volta = resultado.sentidos.volta.trechos;
      const achado = localizarNaRota([...ida, ...volta], [pos.coords.longitude, pos.coords.latitude]);
      if (!achado) { erro(new Error('O caminho ainda não foi calculado.')); return; }
      const ehIda = achado.trecho < ida.length;
      ok({ sentido: ehIda ? 'ida' : 'volta', trechoDoSentido: ehIda ? achado.trecho : achado.trecho - ida.length, kmNoTrecho: achado.kmNoTrecho, distanciaM: achado.distanciaM });
    }, () => erro(new Error('Sem permissão para usar a localização.')), { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true });
  });
}

// ---------- Botão "Atualizar": busca as bases publicadas mais novas (preços, pedágios, regras) ----------
// O app nunca consulta a ANP direto: o robô do repositório confere a ANP todo dia e publica no site do app.
estado.atualizacao = { andamento: false, mensagem: '' };
async function atualizarDados() {
  if (estado.atualizacao.andamento) return;
  if (!online()) {
    estado.atualizacao = { andamento: false, mensagem: 'Sem internet agora. O app continua com os dados salvos no aparelho.' };
    render();
    return;
  }
  estado.atualizacao = { andamento: true, mensagem: 'Buscando dados atualizados…' };
  render();
  let mensagem;
  try {
    const r = await atualizarBases();
    estado.bases = await carregarBases();
    estado.basesConferidas = true;
    configurarLimites(estado.bases?.regras);
    mensagem = r.atualizado ? '✔ Dados atualizados agora.' : '✔ Você já tem os dados mais recentes.';
  } catch (e) {
    mensagem = `Não foi possível buscar agora (${e.message}). Continuamos com os dados salvos.`;
  }
  const p = estado.bases?.anp?.precos?.[0];
  if (p) mensagem += ` Preços da ANP da semana de ${p.periodo_inicio.split('-').reverse().join('/')} a ${p.periodo_fim.split('-').reverse().join('/')}; a ANP publica uma vez por semana.`;
  estado.atualizacao = { andamento: false, mensagem, em: Date.now() };
  render();
}

// ---------- Bases ----------
async function iniciarBases() {
  estado.bases = await carregarBases();
  if (online()) {
    try {
      await atualizarBases();
      estado.bases = await carregarBases();
      estado.basesConferidas = true;
    } catch (e) {
      estado.mensagem = estado.bases ? `Não foi possível atualizar as bases (${e.message}). Usando a versão salva.` : `Bases indisponíveis: ${e.message}`;
    }
  }
  configurarLimites(estado.bases?.regras);
}

// ---------- Vistas ----------
function cabecalho(titulo, sub) {
  return [el('h1', { tabindex: '-1', id: 'titulo-vista' }, titulo), sub ? el('p', { class: 'ajuda' }, sub) : null];
}

function vistaTermos() {
  let marcado = false;
  const continuar = botao('Aceitar e começar', async () => {
    if (!marcado) { anunciar('Marque a caixa para continuar.'); return; }
    await meta('aceite', { versao: VERSAO_TERMOS, aceito_em: new Date().toISOString() });
    if (!(await meta('modo'))) { estado.vista = 'modo'; render(); return; }
    if (estado.viagem) { abrirAssistente(estado.viagem.tela || 1); return; } // rascunho: reabre na mesma tela
    estado.vista = 'inicio';
    render();
  }, { desativado: true, classe: 'largo' });
  return el('div', { class: 'estreito' },
    ...cabecalho('Olá! Antes de começar', 'Leia o resumo abaixo. Leva menos de um minuto.'),
    el('ul', { class: 'cartao termos lista-simples' },
      el('li', {}, '💸 O app é gratuito, não tem anúncios e não vende seus dados.'),
      el('li', {}, '📱 O que você digita sobre a viagem fica guardado só neste aparelho.'),
      el('li', {}, '🗺️ Para achar endereços e calcular o caminho, os lugares que você procura vão para serviços de mapas gratuitos. Seu nome e a placa do carro nunca são enviados.'),
      el('li', {}, '🧭 Horários, custos, pedágios e avisos são estimativas. Confira as regras e as condições da estrada antes de sair.')),
    recolhido('r-termos-completo', `Ler o texto completo (versão ${VERSAO_TERMOS}, de ${DATA_TERMOS})`,
      el('p', {}, 'TEXTO PROVISÓRIO — o texto integral está no documento jurídico do Grupo DK² e deve substituir este resumo antes da publicação.'),
      el('p', {}, 'O app é gratuito, sem anúncios e sem venda de dados. Os dados da viagem ficam neste aparelho. Para calcular rotas e buscar endereços, as coordenadas e os textos de endereço consultados são enviados a serviços públicos de mapa (OSRM e Valhalla da FOSSGIS, Photon e Nominatim), que podem ver o seu IP. Nomes, placa, checklists e documentos nunca são enviados. Os botões "Abrir no Google Maps" e "Abrir no Waze" só enviam as coordenadas do caminho a essas empresas quando você toca neles.'),
      el('p', {}, 'Os resultados são estimativas para planejamento. O aceite não exige renúncia a direitos previstos em lei.')),
    campo({ id: 'aceite', tipo: 'checkbox', rotulo: 'Li e aceito os Termos de Uso e o Aviso de Privacidade', valor: false, aoMudar: (x) => { marcado = x; continuar.disabled = !x; } }),
    continuar);
}

function vistaModo() {
  const escolher = async (modo) => {
    await meta('modo', modo);
    if (modo === 'offline') {
      if (!online()) { estado.mensagem = 'Preparar offline exige internet. Sem conexão agora: você pode ver os dados já salvos e preparar depois.'; estado.vista = 'inicio'; render(); return; }
      if (!estado.viagem) await novaViagemAtual();
      estado.mensagem = 'Preencha a viagem e toque em "Preparar para viagem" na revisão.';
    }
    estado.vista = 'inicio';
    render();
  };
  return el('div', { class: 'estreito' },
    ...cabecalho('Você vai ter internet durante a viagem?', 'Pode mudar depois, no Menu.'),
    el('div', { class: 'cartao' },
      el('h2', {}, '📶 Sim, vou ter internet'),
      el('p', {}, 'O app calcula o caminho e procura os endereços na hora. É o jeito mais simples.'),
      botao('Usar com internet', () => escolher('online'), { classe: 'largo' })),
    el('div', { class: 'cartao' },
      el('h2', {}, '📴 Talvez não'),
      el('p', {}, 'Antes de sair, ainda com internet, o app guarda o roteiro no aparelho para você consultar sem sinal na estrada.'),
      recolhido('r-offline-detalhe', 'O que funciona sem internet?',
        el('p', {}, `✔ Funciona: ${FUNCIONA_OFFLINE.join('; ').toLowerCase()}.`),
        el('p', {}, `✖ Não funciona: ${NAO_FUNCIONA_OFFLINE.join('; ').toLowerCase()}.`)),
      botao('Quero preparar para usar sem internet', () => escolher('offline'), { classe: 'secundario largo' })));
}

async function vistaInicio() {
  const viagens = (await listar('viagens')).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  const ultimoBackup = await meta('ultimoBackup');
  const primeiroUso = await meta('primeiroUso');
  const precisaBackup = viagens.length && Date.now() - Date.parse(ultimoBackup || primeiroUso || new Date().toISOString()) > 30 * 86400000;
  const nova = botao(viagens.length ? '+ Planejar outra viagem' : 'Começar a planejar', async () => { await novaViagemAtual(); abrirAssistente(1); }, { classe: 'largo' });
  return el('div', {},
    ...cabecalho(viagens.length ? 'Minhas viagens' : 'Vamos planejar sua viagem de carro'),
    estado.mensagem ? el('p', { class: 'aviso', role: 'status' }, estado.mensagem) : null,
    precisaBackup ? el('p', { class: 'aviso' }, '⚠ Faz mais de 30 dias que você não salva uma cópia. No Menu, use "Salvar cópia": se o navegador for limpo, as viagens podem ser apagadas.') : null,
    viagens.length ? null : el('p', { class: 'intro' }, 'São 6 passos curtos: quando, para onde, carro, paradas, pessoas e o resumo com horários, combustível, pedágios e o que levar. Tudo fica salvo enquanto você preenche.'),
    nova,
    viagens.length >= 2 ? botao('💰 Comparar viagens e custos do ano', () => { estado.vista = 'comparar'; render({ trocaDeTela: true }); }, { classe: 'secundario largo' }) : null,
    viagens.length ? el('ul', { class: 'lista-cartoes' }, ...viagens.map((v) => {
      const p = v.preparacao || {};
      const velha = p.preparado_em && Date.now() - Date.parse(p.preparado_em) > 7 * 86400000;
      const datas = v.datas.ida.data ? `Ida ${isoParaBr(v.datas.ida.data)}${v.datas.volta.data ? ` · volta ${isoParaBr(v.datas.volta.data)}` : ''}` : 'Datas ainda não preenchidas';
      return el('li', { class: 'cartao' },
        el('h2', {}, v.nome || `${v.origem?.cidade || v.origem?.nome || '?'} → ${v.destino?.cidade || v.destino?.nome || '?'}`),
        el('p', {}, `${datas} · ${v.tela >= 6 ? 'pronta para conferir' : `parou no passo ${v.tela} de 6`}`),
        p.estado === 'pronto' ? el('p', {}, p.desatualizada ? selo(SITUACAO.DESATUALIZADO, 'Preparação desatualizada') : selo(SITUACAO.CONFIRMADO, `Pronto para usar sem internet — preparado em ${formatarDataHora(p.preparado_em, 'America/Sao_Paulo')}`)) : null,
        velha ? el('p', { class: 'aviso' }, '⚠ Preparada há mais de 7 dias: prepare de novo antes de sair.') : null,
        el('div', { class: 'acoes' },
          botao(v.tela >= 6 ? 'Ver resumo' : 'Continuar', async () => { estado.viagem = v; await meta('viagemAtual', v.id); abrirAssistente(v.tela || 1); }, { rotuloAcessivel: `Abrir ${v.nome || 'viagem'}` }),
          botao('Apagar', async () => {
            if (!confirm('Apagar esta viagem do aparelho? Uma cópia de segurança interna é feita antes.')) return;
            await copiaDeSeguranca('antes de apagar viagem');
            await remover('viagens', v.id);
            if (estado.viagem?.id === v.id) estado.viagem = null;
            render();
          }, { classe: 'perigo', rotuloAcessivel: `Apagar ${v.nome || 'viagem'}` })));
    })) : null);
}

async function vistaComparar() {
  const viagens = await listar('viagens');
  return el('div', {},
    ...cabecalho('Comparar viagens e custos do ano', 'Valores estimados com os mesmos cálculos do resumo de cada viagem.'),
    vistaComparacao({
      viagens, bases: estado.bases, render: () => render(),
      abrirViagem: async (id) => { const v = viagens.find((x) => x.id === id); if (!v) return; estado.viagem = v; await meta('viagemAtual', v.id); abrirAssistente(v.tela || 6); },
    }),
    botao('← Minhas viagens', () => { estado.vista = 'inicio'; render({ trocaDeTela: true }); }, { classe: 'secundario' }));
}

function vistaAssistente() {
  const v = estado.viagem;
  const n = v.tela;
  const tentou = estado.tentou[n];
  const erros = tentou && n < 6 ? { ...validarTela(v, n), ...validarPrecos(v, n, estado.bases) } : {};
  const ctx = {
    v, erros, alterar, bases: estado.bases, basesConferidas: estado.basesConferidas,
    estadoRota: estado.estadoRota, calcularRotas, cancelarRotas: () => estado.controleRota?.abort(),
    irPara: (t) => abrirAssistente(t), render: (opcoes) => render(opcoes),
    lugaresUsados, salvarAgora: async () => { await salvar(); anunciar('Viagem salva no aparelho.'); },
    precoAutomatico: (lugar) => precoAutomatico(estado.bases, v.veiculo.combustivel, lugar),
    registrarAbastecimento, desfazerAbastecimento,
    atualizarDados, atualizacao: estado.atualizacao,
    ondeEstouNaRota: () => ondeEstouNaRota(ctx.resultado),
    escolherAlternativa: (s, i) => alterar((vv) => {
      const r = vv.rotas[s];
      if (!r?.alternativas?.[i]) return;
      r.legs = r.alternativas[i].legs;
      r.escolhida = i;
    }, { render: true }),
    exportar: () => baixarExportacao([v]), preparar: () => { estado.vista = 'preparacao'; render(); iniciarPreparacao(); },
  };
  if (n === 6) {
    ctx.resultado = calcularViagem(v, estado.bases);
    setTimeout(() => buscarCidadesRecomendadas(ctx.resultado), 0);
  }
  const conteudo = TELAS[n - 1](ctx);
  const nav = el('div', { class: 'navegacao nao-imprimir' },
    n > 1 ? botao('← Voltar', () => abrirAssistente(n - 1), { classe: 'secundario' }) : null,
    n < 6 ? botao('Continuar →', () => {
      const e = { ...validarTela(v, n), ...validarPrecos(v, n, estado.bases) };
      if (Object.keys(e).length) {
        estado.tentou[n] = true;
        render();
        const primeiro = document.querySelector('[aria-invalid="true"]');
        primeiro?.focus();
        anunciar(`Corrija ${Object.keys(e).length} campo(s) antes de avançar.`);
        return;
      }
      abrirAssistente(n + 1);
    }) : null);
  // Depois de uma tentativa de avançar, os erros são refeitos quando um campo perde o foco.
  const raiz = el('div', {},
    el('p', { class: 'progresso nao-imprimir' }, `Tela ${n} de 6`),
    el('progress', { max: 6, value: n, class: 'nao-imprimir', 'aria-label': `Tela ${n} de 6` }),
    ...cabecalho(TITULOS[n - 1]),
    conteudo, nav);
  if (tentou) raiz.addEventListener('change', () => render());
  return raiz;
}

function vistaPreparacao() {
  const inv = estado.inventario || [];
  const st = estado.estadoPreparo;
  const v = estado.viagem;
  const p = v?.preparacao || {};
  return el('div', { class: 'estreito' },
    ...cabecalho('Preparar para viagem', 'Exige internet. Baixa as bases, recalcula a viagem, confere os arquivos e faz um teste sem rede.'),
    el('ol', { class: 'inventario', 'aria-live': 'polite' }, ...inv.map((i) => el('li', {},
      el('strong', {}, `${i.ok === null ? '…' : i.ok ? '✔' : '✖'} ${i.nome}${i.obrigatorio ? '' : ' (opcional)'}`), i.detalhe ? ` — ${i.detalhe}` : ''))),
    st === 'pronto' ? el('p', { class: 'destaque' }, selo(SITUACAO.CONFIRMADO, `Pronto para usar sem internet — preparado em ${formatarDataHora(p.preparado_em, 'America/Sao_Paulo')}`)) : null,
    st === 'incompleto' ? [el('p', { class: 'erro', role: 'alert' }, '✖ Offline incompleto. O pacote anterior válido, se houver, foi preservado.'), botao('Tentar de novo', () => iniciarPreparacao())] : null,
    st && st !== 'pronto' && st !== 'incompleto' ? el('p', { role: 'status' }, `Estado: ${st}…`) : null,
    el('h2', {}, 'Funciona sem internet'), el('ul', {}, ...FUNCIONA_OFFLINE.map((x) => el('li', {}, `✔ ${x}`))),
    el('h2', {}, 'Não funciona sem internet'), el('ul', {}, ...NAO_FUNCIONA_OFFLINE.map((x) => el('li', {}, `✖ ${x}`))),
    el('div', { class: 'acoes' },
      st === 'pronto' ? botao('Salvar o roteiro em PDF', () => { abrirAssistente(6); setTimeout(() => window.print(), 300); }, { classe: 'secundario' }) : null,
      botao('Voltar para a revisão', () => abrirAssistente(6), { classe: 'secundario' })));
}

async function iniciarPreparacao() {
  estado.inventario = [];
  estado.estadoPreparo = 'preparando';
  await salvar();
  await preparar(estado.viagem.id, {
    calcularRotas: async () => { await iniciarBases(); return calcularRotas(); },
    aoAtualizar: (inv, st) => { estado.inventario = [...inv]; estado.estadoPreparo = st; if (estado.vista === 'preparacao') render(); },
  });
  estado.viagem = await obter('viagens', estado.viagem.id);
  render();
}

function vistaDados() {
  const imp = estado.importacao;
  const entrada = el('input', { type: 'file', id: 'arquivo', accept: 'application/json,.json' });
  entrada.addEventListener('change', async () => {
    const f = entrada.files[0];
    if (!f) return;
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error('Arquivo maior que 5 MB.');
      estado.importacao = await conferirImportacao(await f.text());
    } catch (e) { estado.importacao = { erro: e.message }; }
    render();
  });
  return el('div', { class: 'estreito' },
    ...cabecalho('Exportar e importar'),
    el('p', {}, AVISO_EXPORTACAO, ' O arquivo não é criptografado.'),
    botao('Exportar todas as viagens', async () => baixarExportacao(await listar('viagens'))),
    el('h2', {}, 'Importar'),
    el('label', { for: 'arquivo' }, 'Arquivo exportado pelo app (até 5 MB)'), entrada,
    imp?.erro ? el('p', { class: 'erro', role: 'alert' }, `✖ ${imp.erro} Nada foi alterado.`) : null,
    imp?.viagens ? el('div', { class: 'cartao' },
      el('p', {}, `Encontrado: ${imp.resumo}. Viagens com o mesmo identificador serão substituídas; as outras ficam como estão.`),
      botao('Confirmar importação', async () => {
        await copiaDeSeguranca('antes da importação');
        try {
          await transacao(imp.viagens.map((valor) => ({ store: 'viagens', valor })));
          estado.mensagem = 'Importação concluída.';
        } catch { estado.mensagem = 'A importação falhou e foi desfeita. Nada foi alterado.'; }
        estado.importacao = null;
        estado.vista = 'inicio';
        render();
      }),
      botao('Cancelar', () => { estado.importacao = null; render(); }, { classe: 'secundario' })) : null,
    el('h2', {}, 'Apagar todos os dados'),
    el('p', {}, 'Remove viagens, listas, bases, cópias de segurança e arquivos do app deste aparelho. Não dá para desfazer: exporte antes.'),
    botao('Apagar todos os dados locais', async () => {
      if (!confirm('Apagar TODOS os dados deste aparelho? Não dá para desfazer.')) return;
      await apagarTudo();
      location.reload();
    }, { classe: 'perigo' }));
}

function vistaSobre() {
  return el('div', { class: 'estreito' },
    ...cabecalho('Sobre e avisos legais', `Versão ${VERSAO_APP} · Termos ${VERSAO_TERMOS} (${DATA_TERMOS})`),
    el('p', {}, AVISO_CURTO),
    el('p', {}, 'Cláusula de responsabilidade e Termos de Uso: texto definido no documento jurídico (pendente de inclusão nesta versão).'),
    el('p', {}, 'Gratuito, sem anúncios, sem venda de dados e sem login. Nenhum dado pessoal é enviado a servidores do Grupo DK².'),
    el('h2', {}, 'Créditos'),
    el('ul', {},
      el('li', {}, 'Dados de mapa © colaboradores do OpenStreetMap (licença ODbL).'),
      el('li', {}, 'Rotas: OSRM e Valhalla, servidores públicos da FOSSGIS.'),
      el('li', {}, 'Busca de endereços: Photon (komoot) e Nominatim (OpenStreetMap).'),
      el('li', {}, 'Praças de pedágio: base aberta do Sem Parar (CC BY 4.0) e ANTT (dados abertos). Tarifas: tabelas da ANTT, da ARTESP e das concessionárias.'),
      el('li', {}, 'Preços: ANP. Rodízio: Prefeitura de São Paulo/CET.')),
    el('h2', {}, 'Privacidade'),
    el('p', {}, 'Coordenadas e textos de endereço vão aos serviços de rota e busca, que podem ver o IP. Nomes, checklists, documentos e final da placa ficam só neste aparelho. Os botões do Google Maps e do Waze enviam as coordenadas do caminho a essas empresas apenas quando tocados.'),
    el('h2', {}, 'Autoria'),
    el('div', { class: 'cartao sobre-dk2' },
      el('img', { src: 'icons/abertura-dk2.jpg', alt: 'Logo do Grupo DK²: DK² forjada para programar o futuro.', width: 240, height: 269 }),
      el('p', {}, 'Planejar Rotas com Checklist foi idealizado e desenvolvido pelo ', el('strong', {}, 'Grupo DK²'), '.'),
      el('p', { class: 'assinatura' }, '© 2026 Grupo DK² — DK² forjada para programar o futuro.')));
}

function lugaresUsados() {
  const out = new Map();
  const v = estado.viagem;
  for (const l of [v?.origem, v?.destino, ...(v?.paradas.ida || []).map((p) => p.lugar), ...(v?.paradas.volta || []).map((p) => p.lugar)]) if (l) out.set(l.rotulo, l);
  return [...out.values()];
}

async function baixarExportacao(viagens) {
  const texto = await exportar(viagens);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = el('a', { href: url, download: `planejar-rotas-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await meta('ultimoBackup', new Date().toISOString());
  anunciar(`Arquivo exportado. ${AVISO_EXPORTACAO}`);
}

async function novaViagemAtual() {
  estado.viagem = novaViagem();
  estado.tentou = {};
  estado.estadoRota = {};
  await salvar();
  await meta('viagemAtual', estado.viagem.id);
}

function abrirAssistente(tela) {
  estado.vista = 'assistente';
  estado.viagem.tela = tela;
  salvar();
  render({ trocaDeTela: true });
  if (tela === 6 && online() && ['ida', 'volta'].some((s) => estado.viagem.rotas[s]?.chave !== chaveRota(estado.viagem, s)) && !estado.estadoRota.calculando) {
    calcularRotas();
  }
}

// ---------- Render ----------
let renderizando = Promise.resolve();
function render({ foco, trocaDeTela } = {}) {
  renderizando = renderizando.then(async () => {
    const ativo = foco || document.activeElement?.id;
    const m = principal();
    let conteudo;
    switch (estado.vista) {
      case 'termos': conteudo = vistaTermos(); break;
      case 'modo': conteudo = vistaModo(); break;
      case 'inicio': conteudo = await vistaInicio(); break;
      case 'assistente': conteudo = vistaAssistente(); break;
      case 'preparacao': conteudo = vistaPreparacao(); break;
      case 'dados': conteudo = vistaDados(); break;
      case 'sobre': conteudo = vistaSobre(); break;
      case 'comparar': conteudo = await vistaComparar(); break;
      default: conteudo = el('p', {}, 'Carregando…');
    }
    limpar(m).append(conteudo);
    if (trocaDeTela) document.getElementById('titulo-vista')?.focus();
    else if (ativo && document.getElementById(ativo)) document.getElementById(ativo).focus();
  }).catch((e) => { principal().replaceChildren(el('p', { class: 'erro' }, `Erro ao exibir a tela: ${e.message}`)); });
  return renderizando;
}

function montarMenu() {
  const botaoMenu = document.getElementById('menu-botao');
  const menu = document.getElementById('menu');
  const itens = [
    ['Minhas viagens', () => { estado.vista = 'inicio'; estado.mensagem = ''; }],
    ['Viagem atual', () => { if (estado.viagem) { abrirAssistente(estado.viagem.tela || 1); return true; } estado.vista = 'inicio'; }],
    ['Preparar para viagem', () => { if (!estado.viagem) { estado.vista = 'inicio'; estado.mensagem = 'Abra uma viagem primeiro.'; return; } estado.vista = 'preparacao'; setTimeout(iniciarPreparacao); }],
    ['Comparar viagens e custos do ano', () => { estado.vista = 'comparar'; }],
    ['Modo de uso (online ou offline)', () => { estado.vista = 'modo'; }],
    ['Salvar cópia, abrir cópia ou apagar tudo', () => { estado.vista = 'dados'; }],
    ['Sobre e avisos legais', () => { estado.vista = 'sobre'; }],
  ];
  for (const [texto, acao] of itens) {
    menu.append(el('li', {}, botao(texto, () => {
      menu.hidden = true;
      botaoMenu.setAttribute('aria-expanded', 'false');
      if (!acao()) render({ trocaDeTela: true });
    }, { classe: 'item-menu' })));
  }
  botaoMenu.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    botaoMenu.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('button')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; botaoMenu.setAttribute('aria-expanded', 'false'); botaoMenu.focus(); }
  });
}

function indicadorConexao() {
  const n = document.getElementById('conexao');
  const atualizar = () => { n.textContent = online() ? '● Online' : '○ Sem internet'; };
  addEventListener('online', () => { atualizar(); if (estado.vista === 'assistente') render(); });
  addEventListener('offline', () => { atualizar(); if (estado.vista === 'assistente') render(); });
  atualizar();
}

// Versão nova do app: avisa e deixa a pessoa atualizar quando quiser (Seção 13: nunca no meio do preenchimento
// sem ela pedir). Sem o aviso, quem deixa a aba aberta continuaria vendo a versão antiga indefinidamente.
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let pediuAtualizacao = false;
  const aviso = (reg) => {
    if (document.getElementById('aviso-versao')) return;
    const caixa = el('div', { id: 'aviso-versao', class: 'aviso-versao nao-imprimir', role: 'status' },
      el('span', {}, '🔄 Há uma versão nova do app.'),
      botao('Atualizar agora', () => {
        pediuAtualizacao = true;
        reg.waiting?.postMessage('atualizar-agora');
      }, { classe: 'pequeno' }),
      botao('Depois', () => caixa.remove(), { classe: 'pequeno secundario' }));
    document.body.append(caixa);
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (pediuAtualizacao) location.reload(); });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) aviso(reg);
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      novo?.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) aviso(reg);
      });
    });
    // Procura versão nova de tempos em tempos e quando o app volta a ficar visível.
    setInterval(() => reg.update().catch(() => {}), 30 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}

// Na impressão, tudo o que está recolhido aparece; depois volta como estava.
function prepararImpressao() {
  let abertosPeloApp = [];
  addEventListener('beforeprint', () => {
    abertosPeloApp = [...document.querySelectorAll('details:not([open])')];
    for (const d of abertosPeloApp) d.open = true;
  });
  addEventListener('afterprint', () => {
    for (const d of abertosPeloApp) d.open = false;
    abertosPeloApp = [];
  });
}

async function iniciar() {
  prepararImpressao();
  montarMenu();
  // Abertura com a logo do Grupo DK²: some sozinha pelo CSS; tocar ou apertar uma tecla pula.
  const abertura = document.getElementById('abertura');
  const fecharAbertura = () => abertura?.classList.add('fechada');
  abertura?.addEventListener('click', fecharAbertura);
  addEventListener('keydown', fecharAbertura, { once: true });
  abertura?.addEventListener('animationend', fecharAbertura);
  indicadorConexao();
  registrarServiceWorker();
  try {
    await abrir();
    await migrar();
  } catch (e) {
    principal().replaceChildren(el('p', { class: 'erro' }, `Este navegador não permite guardar dados (${e.message}). Em navegação anônima, os dados podem não ser salvos.`));
    return;
  }
  if (!(await meta('primeiroUso'))) await meta('primeiroUso', new Date().toISOString());
  await iniciarBases();
  const idAtual = await meta('viagemAtual');
  if (idAtual) estado.viagem = (await obter('viagens', idAtual)) || null;
  const aceite = await meta('aceite');
  if (!aceite || aceite.versao !== VERSAO_TERMOS) estado.vista = 'termos';
  else if (!(await meta('modo'))) estado.vista = 'modo';
  else if (estado.viagem) { abrirAssistente(estado.viagem.tela || 1); return; } // rascunho: reabre na mesma tela
  else estado.vista = 'inicio';
  render({ trocaDeTela: true });
}

iniciar();
