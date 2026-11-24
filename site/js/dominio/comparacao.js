// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Comparação de viagens para o mesmo destino e custos por ano.
// Tudo é estimativa: usa o mesmo cálculo da revisão (combustível gasto + pedágios) e nunca inventa valor:
// o que não se sabe fica null e é contado à parte.
import { calcularViagem } from './calculo.js';

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Chave do destino: cidade + UF; sem cidade, a coordenada arredondada (cerca de 1 km). */
export function chaveDestino(v) {
  const d = v.destino;
  if (!d) return null;
  if (d.cidade) return `${normalizar(d.cidade)}|${normalizar(d.uf)}`;
  if (Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lon))) return `${Number(d.lat).toFixed(2)},${Number(d.lon).toFixed(2)}`;
  return null;
}

export function nomeDestino(v) {
  const d = v.destino;
  if (!d) return 'Destino não informado';
  return d.cidade ? `${d.cidade}${d.uf ? `/${d.uf}` : ''}` : (d.nome || d.rotulo || 'Destino');
}

/** Números de uma viagem (calcular é opcional nos testes). */
export function custosDaViagem(v, bases, calcular = calcularViagem) {
  const base = { id: v.id, nome: v.nome || '', data: v.datas?.ida?.data || '', destino: nomeDestino(v), chave: chaveDestino(v), pessoas: (v.viajantes || []).length };
  let r;
  try { r = calcular(v, bases); } catch { return { ...base, semCaminho: true, km: null, horas: null, combustivel: null, pedagioConfirmado: 0, pedagioAConfirmar: 0, pracasSemValor: 0, total: null }; }
  const km = (r.sentidos?.ida?.km || 0) + (r.sentidos?.volta?.km || 0);
  const hIda = r.sentidos?.ida ? horasAoVolante(r.sentidos.ida) : null;
  const hVolta = r.sentidos?.volta ? horasAoVolante(r.sentidos.volta) : null;
  const sim = r.combustivel?.simulacao;
  let combustivel = null;
  if (sim && !sim.inviavel && sim.custoConsumido !== null && sim.custoConsumido !== undefined) combustivel = sim.custoConsumido;
  else if (r.combustivel?.simplificada?.valor !== null && r.combustivel?.simplificada?.valor !== undefined) combustivel = r.combustivel.simplificada.valor;
  const p = r.pedagios || {};
  const pedagioConfirmado = p.indisponivel ? 0 : (p.totalConfirmado || 0) + (p.totalManual || 0);
  const pedagioAConfirmar = p.indisponivel ? 0 : (p.totalPossivel || 0);
  const pracasSemValor = p.indisponivel ? 0 : (p.desconhecidas?.length || 0);
  const semCaminho = !km;
  const total = semCaminho || combustivel === null ? null : combustivel + pedagioConfirmado + pedagioAConfirmar;
  return {
    ...base, semCaminho, km: km || null,
    horas: hIda !== null || hVolta !== null ? (hIda || 0) + (hVolta || 0) : null, // tempo ao volante, ida + volta
    combustivel, pedagioConfirmado, pedagioAConfirmar, pracasSemValor, total,
    porKm: total !== null && km ? total / km : null,
    porPessoa: total !== null && base.pessoas ? total / base.pessoas : null,
  };
}

// Tempo ao volante (sem as paradas): soma dos trechos.
function horasAoVolante(s) {
  const t = (s.trechos || []).reduce((acc, x) => acc + (Number(x.duracao_s) || 0), 0);
  return t ? t / 3600 : null;
}

/** Agrupa por destino. Só entram grupos com 2 ou mais viagens (é o que dá para comparar). */
export function gruposParaComparar(itens) {
  const grupos = new Map();
  for (const it of itens) {
    if (!it.chave) continue;
    if (!grupos.has(it.chave)) grupos.set(it.chave, { chave: it.chave, destino: it.destino, viagens: [] });
    grupos.get(it.chave).viagens.push(it);
  }
  return [...grupos.values()]
    .filter((g) => g.viagens.length >= 2)
    .map((g) => {
      const viagens = [...g.viagens].sort((a, b) => a.data.localeCompare(b.data));
      // Só entram no ranking as viagens com tudo conhecido: praça sem valor deixaria a viagem "barata" por engano.
      const comTotal = viagens.filter((x) => x.total !== null && !x.pracasSemValor);
      const maisBarata = comTotal.length ? comTotal.reduce((m, x) => (x.total < m.total ? x : m)) : null;
      const media = comTotal.length ? comTotal.reduce((s, x) => s + x.total, 0) / comTotal.length : null;
      return { ...g, viagens, maisBarataId: maisBarata?.id || null, media, semValor: viagens.length - comTotal.length };
    })
    .sort((a, b) => a.destino.localeCompare(b.destino, 'pt-BR'));
}

/** Anos que têm viagem (do mais recente para o mais antigo). */
export function anosComViagem(itens) {
  return [...new Set(itens.map((x) => x.data.slice(0, 4)).filter((a) => /^\d{4}$/.test(a)))].sort().reverse();
}

/** Custos de um ano: totais, por mês e por destino. Viagens sem valor são contadas à parte, nunca como zero. */
export function custosDoAno(itens, ano) {
  const doAno = itens.filter((x) => x.data.startsWith(`${ano}-`));
  const soma = (lista, k) => lista.reduce((s, x) => s + (x[k] || 0), 0);
  const comValor = doAno.filter((x) => x.total !== null);
  const meses = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const l = comValor.filter((x) => x.data.slice(5, 7) === m);
    return { mes: i + 1, viagens: doAno.filter((x) => x.data.slice(5, 7) === m).length, total: soma(l, 'total') };
  });
  const porDestino = new Map();
  for (const x of doAno) {
    const k = x.chave || x.destino;
    if (!porDestino.has(k)) porDestino.set(k, { destino: x.destino, viagens: 0, total: 0, semValor: 0 });
    const d = porDestino.get(k);
    d.viagens += 1;
    if (x.total === null) d.semValor += 1; else d.total += x.total;
  }
  return {
    ano, viagens: doAno.length, semValor: doAno.length - comValor.length,
    km: soma(doAno, 'km'), combustivel: soma(comValor, 'combustivel'),
    pedagios: soma(comValor, 'pedagioConfirmado') + soma(comValor, 'pedagioAConfirmar'),
    pracasSemValor: soma(doAno, 'pracasSemValor'),
    total: soma(comValor, 'total'),
    mediaPorViagem: comValor.length ? soma(comValor, 'total') / comValor.length : null,
    meses,
    porDestino: [...porDestino.values()].sort((a, b) => b.total - a.total || a.destino.localeCompare(b.destino, 'pt-BR')),
  };
}
