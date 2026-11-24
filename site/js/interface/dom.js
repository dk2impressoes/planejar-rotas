// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Componentes acessíveis. Texto do usuário só com textContent (Seção 12.3).
import { simbolo } from '../dominio/situacao.js';
import { interpretarData, interpretarHora, mascararData, mascararHora, isoParaBr, dataPorExtenso, EXEMPLO_DATA, EXEMPLO_HORA } from './datas.js';

let contador = 0;
export const novoIdDom = (p = 'c') => `${p}-${++contador}`;

/**
 * Texto seguro para a tela: null, undefined, false e NaN viram texto vazio.
 * O usuário nunca pode ver "null", "undefined" ou "NaN".
 */
export function textoSeguro(valor) {
  if (valor === null || valor === undefined || valor === false) return '';
  if (typeof valor === 'number' && !Number.isFinite(valor)) return '';
  return String(valor);
}

/** Escreve um texto num elemento (sempre por aqui, nunca textContent com valor solto). */
export function escrever(no, valor) {
  if (no) no.textContent = textoSeguro(valor);
  return no;
}

/** Acrescenta filhos a um elemento pulando os vazios (o append do navegador escreveria "null"). */
export function anexar(no, ...filhos) {
  for (const f of filhos.flat()) {
    if (f instanceof Node) { no.append(f); continue; }
    const t = textoSeguro(f);
    if (t) no.append(document.createTextNode(t));
  }
  return no;
}

/** el('div', { class: 'x', onclick: fn }, 'texto', filho) */
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  return anexar(n, ...filhos);
}

export function limpar(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

const regiao = () => document.getElementById('anuncio');
export function anunciar(texto) {
  const r = regiao();
  if (!r) return;
  r.textContent = '';
  setTimeout(() => { r.textContent = texto; }, 50);
}

/** Selo de situação: símbolo + texto (nunca só a cor). */
export function selo(situacao, texto) {
  return el('span', { class: `selo selo-${String(situacao).replace(/[^a-z]/gi, '')}` }, `${simbolo(situacao)} ${texto || situacao}`);
}

/**
 * Botão "?" que mostra uma explicação simples (para quem não tem prática). Retorna [botão, painel].
 * O painel fica logo abaixo do rótulo e é lido pelo leitor de tela quando aberto.
 */
const explicacoesAbertas = new Set();
export function explicar(id, rotulo, texto) {
  if (!texto) return [null, null];
  const idPainel = `${id}-explica`;
  const aberto = explicacoesAbertas.has(idPainel);
  const painel = el('div', { class: 'explicacao', id: idPainel, role: 'note', hidden: aberto ? null : true }, ...[].concat(texto).map((t) => el('p', {}, t)));
  const b = el('button', {
    type: 'button', class: 'botao-explica', 'aria-expanded': aberto ? 'true' : 'false', 'aria-controls': idPainel,
    'aria-label': `O que é: ${rotulo}`, title: 'Explicação',
  }, '?');
  b.addEventListener('click', () => {
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    b.setAttribute('aria-expanded', String(abrir));
    if (abrir) explicacoesAbertas.add(idPainel); else explicacoesAbertas.delete(idPainel);
  });
  return [b, painel];
}

/**
 * Campo com rótulo, ajuda e erro ao lado.
 * opcoes: { rotulo, tipo, valor, aoMudar, erro, ajuda, attrs, lista (para select, já em ordem alfabética) }
 */
export function campo({ rotulo, tipo = 'text', valor = '', aoMudar, erro, ajuda, attrs = {}, lista, id = novoIdDom('f'), passado = false, explicacao }) {
  if (tipo === 'data' || tipo === 'hora') return campoDataHora({ rotulo, tipo, valor, aoMudar, erro, ajuda, id, passado, explicacao });
  const [btExplica, painelExplica] = explicar(id, rotulo, explicacao);
  const idErro = `${id}-erro`, idAjuda = `${id}-ajuda`;
  const descr = [ajuda ? idAjuda : null, erro ? idErro : null].filter(Boolean).join(' ') || null;
  let entrada;
  const comum = { id, 'aria-describedby': descr, 'aria-invalid': erro ? 'true' : null, ...attrs };
  if (tipo === 'select') {
    entrada = el('select', comum,
      el('option', { value: '' }, 'Escolha…'),
      ...lista.map((o) => el('option', { value: o, selected: o === valor ? true : null }, o)));
    entrada.addEventListener('change', () => aoMudar(entrada.value));
  } else if (tipo === 'checkbox') {
    entrada = el('input', { ...comum, type: 'checkbox', checked: !!valor });
    entrada.addEventListener('change', () => aoMudar(entrada.checked));
    return el('div', { class: 'campo campo-check' }, entrada, el('label', { for: id }, rotulo), btExplica, painelExplica,
      ajuda ? el('p', { class: 'ajuda', id: idAjuda }, ajuda) : null,
      erro ? el('p', { class: 'erro', id: idErro, role: 'alert' }, `✖ ${erro}`) : null);
  } else {
    const numerico = tipo === 'number';
    entrada = el('input', {
      ...comum, type: numerico ? 'text' : tipo, value: valor ?? '',
      inputmode: numerico ? 'decimal' : attrs.inputmode, autocomplete: attrs.autocomplete || 'off',
    });
    entrada.addEventListener('input', () => aoMudar(numerico ? lerNumero(entrada.value) : entrada.value));
  }
  return el('div', { class: 'campo' }, el('div', { class: 'rotulo-linha' }, el('label', { for: id }, rotulo), btExplica), painelExplica,
    ajuda ? el('p', { class: 'ajuda', id: idAjuda }, ajuda) : null,
    entrada,
    erro ? el('p', { class: 'erro', id: idErro, role: 'alert' }, `✖ ${erro}`) : null);
}

// O que a pessoa digitou e ainda não é uma data/hora válida sobrevive aos redesenhos da tela.
const digitados = new Map();

/**
 * Data ou hora para digitar (o calendário/relógio do aparelho é só uma opção).
 * Guarda AAAA-MM-DD ou HH:MM; texto inválido não é salvo como valor e mostra o erro ao lado.
 */
function campoDataHora({ rotulo, tipo, valor, aoMudar, erro, ajuda, id, passado, explicacao }) {
  const [btExplica, painelExplica] = explicar(id, rotulo, explicacao);
  const ehData = tipo === 'data';
  const idErro = `${id}-erro`, idAjuda = `${id}-ajuda`, idEco = `${id}-eco`;
  const ler = (t) => (ehData ? interpretarData(t, { passado }) : interpretarHora(t));
  const formatado = ehData ? isoParaBr(valor) : (valor || '');
  const rascunho = digitados.get(id);
  // Texto digitado inválido só é reexibido se o campo está sem valor salvo (senão é de outra viagem ou antigo).
  const texto = !valor && rascunho !== undefined && !(ler(rascunho).iso || ler(rascunho).hhmm) ? rascunho : formatado;
  const eco = el('p', { class: 'eco', id: idEco, 'aria-live': 'polite' });
  const erroLocal = el('p', { class: 'erro', id: idErro, role: 'alert', hidden: true });
  const entrada = el('input', {
    id, type: 'text', value: texto, autocomplete: 'off', inputmode: 'numeric', enterkeyhint: 'next',
    placeholder: ehData ? 'dd/mm/aaaa' : 'hh:mm', maxlength: ehData ? 10 : 5,
    'aria-describedby': [idAjuda, idEco, idErro].join(' '),
  });
  const mostrarErro = (msg) => {
    erroLocal.hidden = !msg;
    erroLocal.textContent = msg ? `✖ ${msg}` : '';
    entrada.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const atualizarEco = (r) => {
    eco.textContent = r.iso ? `✔ ${dataPorExtenso(r.iso)}` : r.hhmm ? `✔ ${r.hhmm}` : '';
  };
  // Só avisa a tela quando o valor guardado muda de verdade. Sem isso, um campo que redesenha a tela
  // (ex.: nascimento) entrava em ciclo: redesenho → campo removido perde o foco → salva → redesenho…
  let ultimoEnviado = valor || '';
  const enviar = (x) => {
    if (x === ultimoEnviado) return;
    ultimoEnviado = x;
    aoMudar(x);
  };
  const aplicar = (final) => {
    if (!entrada.isConnected) return; // campo já saiu da tela (redesenho): nada a fazer
    digitados.set(id, entrada.value);
    // Enquanto a pessoa digita, só vale o formato completo (dd/mm/aaaa ou hh:mm). Atalhos como ano com
    // 2 dígitos, data sem ano ou "8h" são lidos ao sair do campo — senão "15/03/19" virava 2019 antes
    // de a pessoa terminar de digitar 1990.
    if (!final && !(ehData ? /^\d{1,2}\/\d{1,2}\/\d{4}$/ : /^\d{1,2}:\d{2}$/).test(entrada.value.trim())) {
      atualizarEco({}); mostrarErro('');
      return;
    }
    const r = ler(entrada.value);
    if (r.vazio) { atualizarEco(r); mostrarErro(final ? erro : ''); enviar(''); return; }
    if (r.erro) { atualizarEco({}); if (final) mostrarErro(r.erro); enviar(''); return; }
    atualizarEco(r); mostrarErro('');
    if (final) entrada.value = ehData ? isoParaBr(r.iso) : r.hhmm; // mostra no formato completo ao sair do campo
    enviar(ehData ? r.iso : r.hhmm);
  };
  entrada.addEventListener('input', (e) => {
    const inserindo = e.inputType === 'insertText';
    entrada.value = ehData ? mascararData(entrada.value, inserindo) : mascararHora(entrada.value, inserindo);
    aplicar(false);
  });
  entrada.addEventListener('blur', () => aplicar(true));

  // Estado inicial: confirmação por extenso e erro (de digitação ou da validação da tela).
  const inicial = ler(texto);
  atualizarEco(inicial);
  if (inicial.erro) mostrarErro(inicial.erro);
  else if (erro) mostrarErro(erro);

  // Calendário ou relógio do aparelho, para quem preferir tocar em vez de digitar.
  const seletor = el('input', { type: ehData ? 'date' : 'time', class: 'seletor-nativo', tabindex: '-1', 'aria-hidden': 'true', value: valor || '' });
  seletor.addEventListener('change', () => {
    if (!seletor.value) return;
    entrada.value = ehData ? isoParaBr(seletor.value) : seletor.value;
    aplicar(true);
  });
  const abrir = botao(ehData ? '📅' : '🕗', () => {
    seletor.value = valor || '';
    try { seletor.showPicker(); } catch { seletor.focus(); seletor.click(); }
  }, { classe: 'secundario icone', rotuloAcessivel: ehData ? `Escolher no calendário: ${rotulo}` : `Escolher no relógio: ${rotulo}` });

  return el('div', { class: 'campo' },
    el('div', { class: 'rotulo-linha' }, el('label', { for: id }, rotulo), btExplica), painelExplica,
    el('p', { class: 'ajuda', id: idAjuda }, ajuda || (ehData ? `Digite ${EXEMPLO_DATA}.` : `Digite ${EXEMPLO_HORA}.`)),
    el('div', { class: 'linha-busca' }, entrada, abrir, seletor),
    eco, erroLocal);
}

/**
 * Escolha com botões grandes (rádios acessíveis), para quem não está acostumado com listas suspensas.
 * opcoes: [{ valor, texto, ajuda? }] — já na ordem desejada (alfabética, salvo ordem natural).
 */
export function escolha({ id, rotulo, opcoes, valor, aoMudar, erro, ajuda, explicacao }) {
  const idErro = `${id}-erro`;
  const [btExplica, painelExplica] = explicar(id, rotulo, explicacao);
  return el('fieldset', { class: 'escolha', id, 'aria-describedby': erro ? idErro : null },
    el('legend', {}, rotulo, btExplica), painelExplica,
    ajuda ? el('p', { class: 'ajuda' }, ajuda) : null,
    el('div', { class: 'escolha-opcoes' }, ...opcoes.map((o, i) => {
      const idOp = `${id}-op${i}`;
      const r = el('input', { type: 'radio', name: id, id: idOp, value: o.valor, checked: o.valor === valor });
      r.addEventListener('change', () => { if (r.checked) aoMudar(o.valor); });
      return el('label', { for: idOp, class: 'escolha-opcao' }, r,
        el('span', { class: 'escolha-texto' }, o.texto, o.ajuda ? el('small', {}, o.ajuda) : null));
    })),
    erro ? el('p', { class: 'erro', id: idErro, role: 'alert' }, `✖ ${erro}`) : null);
}

/** Seção recolhida com título claro (para o que é opcional ou técnico). Lembra se estava aberta entre redesenhos. */
const abertos = new Set();
export function recolhido(id, titulo, ...conteudo) {
  const d = el('details', { class: 'recolhido', id, open: abertos.has(id) ? true : null },
    el('summary', {}, titulo), el('div', { class: 'recolhido-corpo' }, ...conteudo));
  d.addEventListener('toggle', () => { if (d.open) abertos.add(id); else abertos.delete(id); });
  return d;
}

export function lerNumero(texto) {
  const t = String(texto).trim().replace(/\s/g, '');
  if (t === '') return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : t; // texto inválido fica como está e a validação acusa
}

export function botao(texto, aoClicar, { classe = '', rotuloAcessivel, tipo = 'button', desativado } = {}) {
  return el('button', { type: tipo, class: `botao ${classe}`.trim(), 'aria-label': rotuloAcessivel, disabled: desativado ? true : null, onclick: aoClicar }, texto);
}

export const reais = (n) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
export const km = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('pt-BR')} km` : '—');
export const litros = (n) => (Number.isFinite(n) ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : '—');
