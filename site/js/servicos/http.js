// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Consultas com espera máxima, nova tentativa, intervalo mínimo e disjuntor (Seção 9.3).

const estados = new Map();
export const LIMITES = { esperaMs: 10000, intervaloMs: 1000, falhasParaAbrir: 3, abertoMs: 5 * 60000, novaTentativaMs: 1500 };

export function configurarLimites(regras) {
  const s = regras?.servicos;
  if (!s) return;
  if (s.espera_maxima_s) LIMITES.esperaMs = s.espera_maxima_s * 1000;
  if (s.intervalo_minimo_s) LIMITES.intervaloMs = s.intervalo_minimo_s * 1000;
  if (s.disjuntor_falhas) LIMITES.falhasParaAbrir = s.disjuntor_falhas;
  if (s.disjuntor_minutos) LIMITES.abertoMs = s.disjuntor_minutos * 60000;
}

function estado(servico) {
  if (!estados.has(servico)) estados.set(servico, { falhas: 0, abertoAte: 0, ultima: 0, fila: Promise.resolve() });
  return estados.get(servico);
}

export function disjuntorAberto(servico, agora = Date.now()) {
  return estado(servico).abertoAte > agora;
}

export function registrarResultado(servico, ok, agora = Date.now()) {
  const e = estado(servico);
  if (ok) { e.falhas = 0; return; }
  e.falhas++;
  if (e.falhas >= LIMITES.falhasParaAbrir) { e.abertoAte = agora + LIMITES.abertoMs; e.falhas = 0; }
}

export class ErroServico extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

const dormir = (ms, sinal) => new Promise((ok, erro) => {
  const t = setTimeout(ok, ms);
  sinal?.addEventListener('abort', () => { clearTimeout(t); erro(new ErroServico('cancelado', 'Consulta cancelada.')); }, { once: true });
});

async function umaTentativa(url, opcoes, sinal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), LIMITES.esperaMs);
  const cancelar = () => ctl.abort();
  sinal?.addEventListener('abort', cancelar, { once: true });
  try {
    const r = await fetch(url, { ...opcoes, signal: ctl.signal, referrerPolicy: 'strict-origin-when-cross-origin', credentials: 'omit' });
    if (!r.ok) throw new ErroServico(`http_${r.status}`, `Serviço respondeu ${r.status}.`);
    return await r.json();
  } catch (e) {
    if (sinal?.aborted) throw new ErroServico('cancelado', 'Consulta cancelada.');
    if (e instanceof ErroServico) throw e;
    throw new ErroServico(ctl.signal.aborted ? 'tempo_esgotado' : 'rede', ctl.signal.aborted ? 'Tempo de espera esgotado.' : 'Falha de rede.');
  } finally {
    clearTimeout(t);
    sinal?.removeEventListener('abort', cancelar);
  }
}

/** Consulta JSON a um serviço externo, respeitando o intervalo mínimo e o disjuntor. */
export function consultarJSON(servico, url, { opcoes = {}, sinal } = {}) {
  const e = estado(servico);
  const tarefa = e.fila.then(async () => {
    if (disjuntorAberto(servico)) throw new ErroServico('disjuntor', `${servico} pausado após falhas seguidas.`);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const espera = e.ultima + LIMITES.intervaloMs - Date.now();
      if (espera > 0) await dormir(espera, sinal);
      e.ultima = Date.now();
      try {
        const json = await umaTentativa(url, opcoes, sinal);
        registrarResultado(servico, true);
        return json;
      } catch (err) {
        if (err.codigo === 'cancelado') throw err;
        registrarResultado(servico, false);
        if (tentativa === 0 && !disjuntorAberto(servico) && !String(err.codigo).startsWith('http_4')) {
          await dormir(LIMITES.novaTentativaMs, sinal);
          continue;
        }
        throw err;
      }
    }
    throw new ErroServico('falha', 'Falha no serviço.');
  });
  e.fila = tarefa.catch(() => {});
  return tarefa;
}

export function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
