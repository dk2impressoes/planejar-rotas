// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Leitura de datas e horas digitadas do jeito que as pessoas escrevem (dd/mm/aaaa, 25/12, 25122026,
// "hoje", "amanhã", 8, 8h30, 0830...). Guarda sempre no formato interno: AAAA-MM-DD e HH:MM.
import { dataValida } from '../dominio/tempo.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const EXEMPLO_DATA = 'dia/mês/ano, por exemplo 25/12/2026';
export const EXEMPLO_HORA = 'hora:minutos, por exemplo 08:30';

/**
 * opcoes.passado: true para datas que já passaram (nascimento): ano com 2 dígitos vira 19xx ou 20xx
 * e não se aceita data sem ano. Sem passado, data sem ano é a próxima ocorrência a partir de hoje.
 * Retorna { vazio } | { iso } | { erro }.
 */
export function interpretarData(texto, { hoje = new Date(), passado = false } = {}) {
  const t = semAcento(String(texto || '').trim().toLowerCase());
  if (!t) return { vazio: true };
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (!passado && t === 'hoje') return { iso: isoDe(base) };
  if (!passado && (t === 'amanha' || t === 'amanha.')) return { iso: isoDe(new Date(base.getTime() + 86400000)) };

  let partes = t.split(/[\/\-. ]+/).filter(Boolean);
  if (partes.length === 1 && /^\d+$/.test(partes[0])) {
    const s = partes[0];
    if (s.length === 8) partes = [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
    else if (s.length === 6) partes = [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
    else if (s.length === 4) partes = [s.slice(0, 2), s.slice(2)];
    else return { erro: `Data incompleta. Use ${EXEMPLO_DATA}.` };
  }
  if (!partes.every((p) => /^\d+$/.test(p)) || partes.length < 2 || partes.length > 3) {
    return { erro: `Não entendi a data. Use ${EXEMPLO_DATA}.` };
  }
  const dia = Number(partes[0]), mes = Number(partes[1]);
  let ano;
  if (partes.length === 2) {
    if (passado) return { erro: 'Falta o ano. Exemplo: 25/12/1990.' };
    ano = base.getFullYear();
    if (`${ano}-${pad(mes)}-${pad(dia)}` < isoDe(base)) ano += 1; // sem ano: a próxima vez que a data acontece
  } else if (partes[2].length === 2) {
    const yy = Number(partes[2]);
    const seculoAtual = Math.floor(base.getFullYear() / 100) * 100;
    ano = seculoAtual + yy;
    if (passado && ano > base.getFullYear()) ano -= 100;
  } else if (partes[2].length === 4) {
    ano = Number(partes[2]);
  } else {
    return { erro: `Ano inválido. Use ${EXEMPLO_DATA}.` };
  }
  if (mes < 1 || mes > 12) return { erro: 'O mês vai de 1 a 12.' };
  const iso = `${ano}-${pad(mes)}-${pad(dia)}`;
  if (!dataValida(iso)) return { erro: `Essa data não existe (o mês ${pad(mes)} não tem dia ${dia}).` };
  if (passado && iso > isoDe(base)) return { erro: 'A data de nascimento não pode ser no futuro.' };
  return { iso };
}

/** Retorna { vazio } | { hhmm } | { erro }. Aceita 8, 08, 830, 0830, 8:30, 8h, 8h30, 8 30. */
export function interpretarHora(texto) {
  let t = semAcento(String(texto || '').trim().toLowerCase()).replace(/\s*(horas?|hs?)\s*$/, 'h');
  if (!t) return { vazio: true };
  if (t === 'meio-dia' || t === 'meio dia' || t === 'meiodia') return { hhmm: '12:00' };
  if (t === 'meia-noite' || t === 'meia noite') return { hhmm: '00:00' };
  t = t.replace(/h$/, '').replace(/[h.\s]/g, ':');
  let h, m;
  if (t.includes(':')) {
    const [a, b = '0'] = t.split(':');
    if (!/^\d{1,2}$/.test(a) || !/^\d{0,2}$/.test(b)) return { erro: `Não entendi a hora. Use ${EXEMPLO_HORA}.` };
    h = Number(a); m = Number(b || 0);
  } else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) { h = Number(t); m = 0; } else if (t.length === 3) { h = Number(t[0]); m = Number(t.slice(1)); } else { h = Number(t.slice(0, 2)); m = Number(t.slice(2)); }
  } else {
    return { erro: `Não entendi a hora. Use ${EXEMPLO_HORA}.` };
  }
  if (h > 23) return { erro: 'A hora vai de 0 a 23.' };
  if (m > 59) return { erro: 'Os minutos vão de 0 a 59.' };
  return { hhmm: `${pad(h)}:${pad(m)}` };
}

/** Barra automática enquanto a pessoa digita: "25" → "25/", "25/12" → "25/12/". */
export function mascararData(texto, inserindo) {
  if (!inserindo) return texto;
  if (/^\d{2}$/.test(texto) || /^\d{1,2}\/\d{2}$/.test(texto)) return `${texto}/`;
  if (/^\d{5}$/.test(texto)) return `${texto.slice(0, 2)}/${texto.slice(2, 4)}/${texto.slice(4)}`;
  if (/^\d{3}$/.test(texto)) return `${texto.slice(0, 2)}/${texto.slice(2)}`;
  return texto;
}

/** Dois-pontos automáticos: "08" → "08:", "083" → "08:3". */
export function mascararHora(texto, inserindo) {
  if (!inserindo) return texto;
  if (/^([01]\d|2[0-3])$/.test(texto)) return `${texto}:`;
  if (/^([01]\d|2[0-3])\d$/.test(texto)) return `${texto.slice(0, 2)}:${texto.slice(2)}`;
  return texto;
}

export function isoParaBr(iso) {
  if (!dataValida(iso)) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

const extenso = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "segunda-feira, 15 de março de 2027" — confirma por escrito o que foi entendido. */
export function dataPorExtenso(iso) {
  return dataValida(iso) ? extenso.format(new Date(`${iso}T12:00:00Z`)) : '';
}
