// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Botão "Preparar para Viagem" (Seção 8.3). Estados: não preparado → preparando → verificando → pronto | incompleto.
import { atualizarBases, carregarBases, baixarManifesto } from '../servicos/bases.js';
import { obter, gravar, meta } from '../armazenamento/db.js';
import { exportar } from '../armazenamento/exportacao.js';
import { sha256 } from '../servicos/esquema.js';
import { calcularViagem } from '../dominio/calculo.js';

export const VERSAO_APP = '13.0.0';

// Nome do cache em uso: o mesmo do sw.js, publicado no manifesto e guardado na preparação.
async function nomeDoCache() {
  const salvo = await meta('cacheApp');
  if (salvo && (await caches.has(salvo))) return salvo;
  const nomes = (await caches.keys()).filter((k) => k.startsWith('app-v'));
  return nomes[nomes.length - 1] || null;
}

export const FUNCIONA_OFFLINE = ['Roteiro com trechos, horários, km, custos, pedágios e alertas', 'Checklists e documentos', 'Cálculos locais (combustível, horários, rodízio)', 'Exportação e impressão'];
export const NAO_FUNCIONA_OFFLINE = ['Cálculo de novas rotas', 'Mapa', 'Busca livre de endereços'];

/**
 * Executa a preparação. aoAtualizar(inventario, estado) é chamado a cada passo.
 * calcularRotas(): recalcula ida e volta (online) e devolve a viagem atualizada.
 */
export async function preparar(viagemId, { calcularRotas, aoAtualizar }) {
  const inv = [];
  let estado = 'preparando';
  const item = (nome, obrigatorio = true) => {
    const i = { nome, obrigatorio, ok: null, detalhe: '' };
    inv.push(i);
    aoAtualizar(inv, estado);
    return i;
  };
  const marcar = (i, ok, detalhe = '') => { i.ok = ok; i.detalhe = detalhe; aoAtualizar(inv, estado); };

  if (!navigator.onLine) {
    const i = item('Conexão com a internet');
    marcar(i, false, 'A preparação exige internet. Os dados já salvos continuam disponíveis.');
    return concluir(viagemId, inv, 'incompleto', aoAtualizar);
  }

  // 1. Bases
  const iBases = item('Bases de dados');
  try {
    const r = await atualizarBases({ progresso: (t) => marcar(iBases, null, t) });
    marcar(iBases, true, r.motivo);
  } catch (e) {
    const locais = await carregarBases();
    marcar(iBases, !!locais, locais ? `Atualização falhou (${e.message}); usando a última versão local íntegra.` : `Sem base válida: ${e.message}`);
  }

  // 2. Rotas e cálculos
  const iRotas = item('Rotas de ida e volta');
  try {
    const v = await calcularRotas();
    const ok = ['ida', 'volta'].every((s) => v.rotas?.[s]);
    marcar(iRotas, ok, ok ? 'Calculadas e salvas.' : 'Não foi possível calcular uma das rotas.');
  } catch (e) {
    marcar(iRotas, false, e.message);
  }

  // 3. Roteiro e geometria salvos
  const iSalvo = item('Roteiro e geometria salvos no aparelho');
  const viagem = await obter('viagens', viagemId);
  const tamanho = new Blob([JSON.stringify(viagem || {})]).size;
  marcar(iSalvo, !!viagem, `${(tamanho / 1024).toFixed(0)} KB`);

  // 4. Arquivos do app no cache, pelo manifesto
  const iCache = item('Arquivos do app');
  try {
    const manifesto = await baixarManifesto();
    await meta('cacheApp', manifesto.cache_app);
    const cache = await caches.open(manifesto.cache_app);
    let faltam = 0, total = 0, bytes = 0;
    for (const a of manifesto.arquivos.filter((x) => x.tipo === 'app')) {
      total++;
      let resp = await cache.match(a.caminho);
      if (!resp) {
        try { await cache.add(a.caminho); resp = await cache.match(a.caminho); } catch { /* conta como falta */ }
      }
      if (!resp) { faltam++; continue; }
      const buf = await resp.clone().arrayBuffer();
      bytes += buf.byteLength;
      if (await sha256(new Uint8Array(buf)) !== a.sha256) {
        await cache.delete(a.caminho);
        try { await cache.add(a.caminho); } catch { /* idem */ }
        const novo = await cache.match(a.caminho);
        if (!novo || await sha256(new Uint8Array(await novo.arrayBuffer())) !== a.sha256) faltam++;
      }
    }
    if (!(await cache.match('./'))) { try { await cache.add('./'); } catch { faltam++; } }
    marcar(iCache, faltam === 0, `${total - faltam} de ${total} arquivos conferidos (${(bytes / 1024).toFixed(0)} KB).`);
  } catch (e) {
    marcar(iCache, false, `Não foi possível conferir: ${e.message}`);
  }

  // 5. Armazenamento persistente e espaço
  const iEspaco = item('Armazenamento persistente', false);
  try {
    const persistente = navigator.storage?.persist ? await navigator.storage.persist() : false;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const livre = est ? (est.quota - est.usage) / 1048576 : null;
    marcar(iEspaco, persistente, `${persistente ? 'Concedido' : 'Não concedido pelo navegador (os dados podem ser apagados se faltar espaço)'}${livre !== null ? `; ${livre.toFixed(0)} MB livres` : ''}.`);
  } catch {
    marcar(iEspaco, false, 'O navegador não informou.');
  }

  // 7. Autoteste sem rede
  estado = 'verificando';
  const iTeste = item('Autoteste sem internet');
  try {
    marcar(iTeste, null, 'Lendo só do armazenamento local…');
    const falhas = await autoteste(viagemId);
    marcar(iTeste, falhas.length === 0, falhas.length ? falhas.join(' ') : 'Roteiro, checklist, cálculos e exportação funcionaram sem rede.');
  } catch (e) {
    marcar(iTeste, false, e.message);
  }

  const ok = inv.filter((i) => i.obrigatorio).every((i) => i.ok);
  return concluir(viagemId, inv, ok ? 'pronto' : 'incompleto', aoAtualizar);
}

/** Lê tudo apenas do armazenamento local (IndexedDB e Cache Storage), sem fetch. */
export async function autoteste(viagemId) {
  const falhas = [];
  const v = await obter('viagens', viagemId);
  if (!v) return ['Roteiro não encontrado no aparelho.'];
  const bases = await carregarBases();
  if (!bases) falhas.push('Bases ausentes.');
  // Checklist: grava e lê um item de teste (fora dos dados do usuário).
  const marca = `teste-${Date.now()}`;
  await gravar('meta', { chave: 'autoteste', valor: marca });
  if ((await meta('autoteste')) !== marca) falhas.push('Falha ao gravar o checklist.');
  try {
    const r = calcularViagem(v, bases);
    if (!r.sentidos.ida.etapas.length || !r.sentidos.volta.etapas.length) falhas.push('Roteiro sem horários.');
  } catch (e) { falhas.push(`Cálculo local falhou: ${e.message}`); }
  try { if (!(await exportar([v])).length) falhas.push('Exportação vazia.'); } catch (e) { falhas.push(`Exportação falhou: ${e.message}`); }
  const nome = await nomeDoCache();
  if (!nome) return [...falhas, 'Arquivos do app fora do cache.'];
  const cache = await caches.open(nome);
  for (const essencial of ['./', 'js/app.js', 'estilos.css']) if (!(await cache.match(essencial))) falhas.push(`Arquivo ${essencial} fora do cache.`);
  return falhas;
}

async function concluir(viagemId, inv, estado, aoAtualizar) {
  const v = await obter('viagens', viagemId);
  if (v) {
    const anterior = v.preparacao || {};
    // Com falha, o pacote anterior válido é preservado (só o estado da tentativa muda).
    v.preparacao = estado === 'pronto'
      ? { estado, preparado_em: new Date().toISOString(), revisao: v.revisao, desatualizada: false }
      : { ...anterior, estado: anterior.estado === 'pronto' ? 'pronto' : 'incompleto', ultimaTentativa: 'incompleto' };
    await gravar('viagens', v);
  }
  aoAtualizar(inv, estado);
  return { estado, inventario: inv };
}
