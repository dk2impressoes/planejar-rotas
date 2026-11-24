// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Rodízio municipal de São Paulo (Seção 6). Nenhum valor fixo: tudo vem de regras.json e das bases.
import { pontoNaArea, densificar } from './geo.js';
import { dataLocal, localParaUTC, partesLocais, horaLocal, formatarData } from './tempo.js';
import { SITUACAO, regraVigente } from './situacao.js';

const MSG_POSSIVEL = 'Possível restrição — confirme na CET';
const NOMES_DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// Trechos contínuos da rota dentro da área: [{ entrada, saida }] em ms.
export function passagensPelaArea(amostras, area) {
  const pts = densificar(amostras, 150);
  const runs = [];
  let atual = null;
  for (const a of pts) {
    if (pontoNaArea(a.c, area)) {
      if (!atual) atual = { entrada: a.t, saida: a.t };
      else atual.saida = a.t;
    } else if (atual) {
      runs.push(atual);
      atual = null;
    }
  }
  if (atual) runs.push(atual);
  return runs;
}

function sobrepoe(a1, a2, b1, b2) {
  return a1 <= b2 && b1 <= a2;
}

function diasLocais(inicio, fim, tz) {
  const dias = [];
  let d = dataLocal(inicio, tz);
  const ultimo = dataLocal(fim, tz);
  while (d <= ultimo) {
    dias.push(d);
    const t = new Date(Date.parse(d + 'T12:00:00Z') + 86400000);
    d = t.toISOString().slice(0, 10);
  }
  return dias;
}

function periodoSensivel(dia, feriados) {
  const md = dia.slice(5);
  if (md >= '12-20' || md <= '01-10') return true;
  const amanha = new Date(Date.parse(dia + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  return feriados.has(amanha);
}

/**
 * Verifica o rodízio para uma lista de passagens.
 * entrada: { amostras, finalPlaca, regra, area, nivelArea, feriados: Set('YYYY-MM-DD'), suspensoes, margemMin, rotaManual, hojeISO }
 */
export function verificarRodizio(e) {
  const resultado = { situacao: SITUACAO.INDISPONIVEL, alertas: [], avisos: [], fonte: e.regra?.url_oficial || null };
  if (e.rotaManual || !e.amostras?.length) {
    resultado.alertas.push({ tipo: 'possivel', mensagem: `${MSG_POSSIVEL} (sem traçado calculado).` });
    return resultado;
  }
  if (e.finalPlaca === '' || e.finalPlaca === null || e.finalPlaca === undefined) {
    resultado.mensagem = 'Informe o final da placa para verificar o rodízio.';
    return resultado;
  }
  const inicioViagem = new Date(e.amostras[0].t).toISOString();
  const vig = regraVigente(e.regra, inicioViagem, e.hojeISO);
  if (!e.area || !vig.ok) {
    resultado.alertas.push({ tipo: 'possivel', mensagem: `${MSG_POSSIVEL} (regra ou área sem dado válido).` });
    return resultado;
  }
  const confiavel = e.nivelArea === 'primaria' && vig.situacao === SITUACAO.CONFIRMADO;
  const tz = e.regra.fuso;
  const digito = Number(e.finalPlaca);
  const margem = (Number.isFinite(e.margemMin) ? e.margemMin : e.regra.margem_min_padrao) * 60000;
  const suspensoes = e.suspensoes || [];
  const runs = passagensPelaArea(e.amostras, e.area);

  for (const run of runs) {
    for (const dia of diasLocais(run.entrada, run.saida, tz)) {
      const ds = partesLocais(Date.parse(dia + 'T12:00:00Z'), 'UTC').diaSemana;
      const finais = e.regra.tabela[String(ds)];
      if (!finais || !finais.includes(digito)) continue;
      if (e.feriados?.has(dia)) continue;
      if (suspensoes.some((s) => dia >= s.inicio && dia <= s.fim)) continue;
      if (periodoSensivel(dia, e.feriados || new Set())) {
        resultado.avisos.push('Confira se há suspensão anunciada pela CET.');
      }
      for (const h of e.regra.horarios) {
        const ini = Date.parse(localParaUTC(dia, h.inicio, tz));
        const fim = Date.parse(localParaUTC(dia, h.fim, tz));
        const quando = `${NOMES_DIA[ds]}, ${formatarData(dia)}, passagem prevista das ${horaLocal(run.entrada, tz)} às ${horaLocal(run.saida, tz)}`;
        if (sobrepoe(run.entrada, run.saida, ini, fim)) {
          resultado.alertas.push({
            tipo: confiavel ? 'rodizio' : 'possivel', entrada: run.entrada, saida: run.saida,
            mensagem: `${confiavel ? 'Rodízio' : MSG_POSSIVEL}: final ${digito} restrito das ${h.inicio} às ${h.fim} (${quando}).`,
          });
        } else if (margem > 0 && sobrepoe(run.entrada, run.saida, ini - margem, fim + margem)) {
          resultado.alertas.push({
            tipo: 'risco', entrada: run.entrada, saida: run.saida,
            mensagem: `Risco de rodízio: passagem a menos de ${margem / 60000} min da restrição das ${h.inicio} às ${h.fim} (${quando}). A margem é só um aviso.`,
          });
        }
      }
    }
  }
  resultado.avisos = [...new Set(resultado.avisos)];
  resultado.passagens = runs.length;
  if (resultado.alertas.length) {
    resultado.situacao = confiavel ? vig.situacao : SITUACAO.ESTIMADO;
  } else {
    resultado.situacao = confiavel ? vig.situacao : SITUACAO.ESTIMADO;
    resultado.mensagem = runs.length
      ? 'Nenhuma restrição encontrada nos horários de passagem pela área.'
      : 'O percurso calculado não passa pelo Centro Expandido.';
    if (!confiavel) resultado.mensagem += ' A área desta versão é aproximada: confirme na CET.';
  }
  return resultado;
}

// Sugestões de horário: desloca a partida até sair da restrição (Seção 6.2.9). O desvio exige rota alternativa calculada.
export function sugerirHorarios(e, passosMin = [-180, -120, -60, -30, 30, 60, 120, 180]) {
  const sugestoes = [];
  for (const p of passosMin) {
    const desl = p * 60000;
    const r = verificarRodizio({ ...e, amostras: e.amostras.map((a) => ({ ...a, t: a.t + desl })) });
    if (!r.alertas.some((a) => a.tipo === 'rodizio' || a.tipo === 'possivel' || a.tipo === 'risco')) {
      sugestoes.push({ deslocamentoMin: p });
    }
  }
  return sugestoes;
}
