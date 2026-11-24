// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Tempo e itinerário (Seção 3). Instantes em UTC (ISO 8601) + fuso IANA separado.

export const FUSO_PADRAO = 'America/Sao_Paulo';

// Fuso por UF. Exceções dentro de uma UF (oeste do AM e do PA, Noronha) são pendência (revisão B3).
const UF_FUSO = {
  AC: 'America/Rio_Branco', AL: 'America/Maceio', AM: 'America/Manaus', AP: 'America/Belem',
  BA: 'America/Bahia', CE: 'America/Fortaleza', MA: 'America/Fortaleza', MS: 'America/Campo_Grande',
  MT: 'America/Cuiaba', PA: 'America/Belem', PB: 'America/Fortaleza', PE: 'America/Recife',
  PI: 'America/Fortaleza', RN: 'America/Fortaleza', RO: 'America/Porto_Velho', RR: 'America/Boa_Vista',
  SE: 'America/Maceio', TO: 'America/Araguaina',
};

export function fusoDaUF(uf) {
  return UF_FUSO[uf] || FUSO_PADRAO;
}

const pad = (n) => String(n).padStart(2, '0');
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatadores = new Map();

function formatador(tz) {
  if (!formatadores.has(tz)) {
    formatadores.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return formatadores.get(tz);
}

// Partes locais de um instante (ms ou ISO) num fuso. diaSemana: 0 = domingo.
export function partesLocais(instante, tz) {
  const ms = typeof instante === 'number' ? instante : Date.parse(instante);
  const o = {};
  for (const p of formatador(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return {
    ano: +o.year, mes: +o.month, dia: +o.day,
    hora: +o.hour, minuto: +o.minute, segundo: +o.second,
    diaSemana: DIAS.indexOf(o.weekday),
  };
}

export function dataLocal(instante, tz) {
  const p = partesLocais(instante, tz);
  return `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`;
}

export function horaLocal(instante, tz) {
  const p = partesLocais(instante, tz);
  return `${pad(p.hora)}:${pad(p.minuto)}`;
}

export function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return false;
  const [a, m, d] = data.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function horaValida(hora) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora || '');
}

// Data e hora locais de um fuso -> instante UTC (ISO).
export function localParaUTC(data, hora, tz) {
  if (!dataValida(data) || !horaValida(hora)) return null;
  const [a, m, d] = data.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const alvo = Date.UTC(a, m - 1, d, h, mi);
  let t = alvo;
  for (let i = 0; i < 3; i++) {
    const p = partesLocais(t, tz);
    t += alvo - Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  }
  return new Date(t).toISOString();
}

// Contagem inclusiva de dias (12/01 a 14/01 = 3 dias), pelas datas locais.
export function diasDaViagem(inicioISO, tzInicio, fimISO, tzFim) {
  const a = Date.parse(dataLocal(inicioISO, tzInicio) + 'T00:00:00Z');
  const b = Date.parse(dataLocal(fimISO, tzFim) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000) + 1;
}

export function duracaoHoras(inicioISO, fimISO) {
  return (Date.parse(fimISO) - Date.parse(inicioISO)) / 3600000;
}

const NOMES_FUSO = {
  'America/Sao_Paulo': 'Brasília', 'America/Bahia': 'Brasília', 'America/Fortaleza': 'Brasília',
  'America/Recife': 'Brasília', 'America/Maceio': 'Brasília', 'America/Belem': 'Brasília',
  'America/Araguaina': 'Brasília', 'America/Cuiaba': 'Cuiabá', 'America/Campo_Grande': 'Campo Grande',
  'America/Manaus': 'Manaus', 'America/Porto_Velho': 'Porto Velho', 'America/Boa_Vista': 'Boa Vista',
  'America/Rio_Branco': 'Rio Branco',
};

export function formatarDataHora(instante, tz) {
  const p = partesLocais(instante, tz);
  return `${pad(p.dia)}/${pad(p.mes)}/${p.ano} ${pad(p.hora)}:${pad(p.minuto)} (horário de ${NOMES_FUSO[tz] || tz})`;
}

export function formatarData(data) {
  if (!dataValida(data)) return '';
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDuracao(segundos) {
  const min = Math.round(segundos / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${pad(m)} min` : `${m} min`;
}

/**
 * Itinerário de um sentido (Seção 3).
 * trechos: [{ duracao_s }] (n trechos); paradas: [{ duracaoMin, saidaAgendadaUTC }] (n - 1 paradas).
 * Retorna horários de saída e chegada de cada trecho e os erros encontrados.
 */
export function calcularItinerario(partidaUTC, trechos, paradas = []) {
  const erros = [];
  const etapas = [];
  if (!partidaUTC) return { etapas, erros: ['Partida sem data ou hora válida.'], chegadaFinal: null };
  if (paradas.length !== Math.max(0, trechos.length - 1)) {
    erros.push('Número de paradas não confere com o número de trechos.');
  }
  let saida = Date.parse(partidaUTC);
  for (let i = 0; i < trechos.length; i++) {
    const dur = Number(trechos[i].duracao_s);
    if (!Number.isFinite(dur) || dur < 0) {
      erros.push(`Trecho ${i + 1}: duração inválida.`);
      return { etapas, erros, chegadaFinal: null };
    }
    const chegada = saida + dur * 1000;
    const etapa = { ordem: i + 1, saidaUTC: new Date(saida).toISOString(), chegadaUTC: new Date(chegada).toISOString() };
    etapas.push(etapa);
    if (i < trechos.length - 1) {
      const p = paradas[i] || {};
      let proxima;
      if (p.saidaAgendadaUTC) {
        proxima = Date.parse(p.saidaAgendadaUTC);
        if (proxima < chegada) {
          erros.push(`Parada ${i + 1}: a saída agendada é antes da chegada prevista.`);
          proxima = chegada;
        }
      } else {
        const durMin = Number(p.duracaoMin ?? 0);
        if (!Number.isFinite(durMin) || durMin < 0) {
          erros.push(`Parada ${i + 1}: a duração não pode ser negativa.`);
          proxima = chegada;
        } else {
          proxima = chegada + durMin * 60000;
        }
      }
      etapa.saidaParadaUTC = new Date(proxima).toISOString();
      saida = proxima;
    }
  }
  return { etapas, erros, chegadaFinal: etapas.length ? etapas[etapas.length - 1].chegadaUTC : null };
}
