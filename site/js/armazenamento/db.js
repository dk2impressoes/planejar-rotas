// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// IndexedDB (Seção 10.2), migrações e cópias de segurança (Seção 13).
import { VERSAO_ESQUEMA, migrarViagem } from '../dominio/viagem.js';

const NOME = 'planejar-rotas';
const VERSAO_DB = 1;
export const STORES = ['viagens', 'bases', 'backups', 'meta'];
let conexao = null;

export function abrir() {
  if (conexao) return Promise.resolve(conexao);
  return new Promise((ok, erro) => {
    const req = indexedDB.open(NOME, VERSAO_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('viagens')) db.createObjectStore('viagens', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bases')) db.createObjectStore('bases', { keyPath: 'chave' });
      if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'chave' });
    };
    req.onsuccess = () => {
      conexao = req.result;
      conexao.onversionchange = () => { conexao.close(); conexao = null; };
      ok(conexao);
    };
    req.onerror = () => erro(req.error);
    req.onblocked = () => erro(new Error('Banco bloqueado por outra aba aberta.'));
  });
}

function promessa(req) {
  return new Promise((ok, erro) => { req.onsuccess = () => ok(req.result); req.onerror = () => erro(req.error); });
}

function fim(tx) {
  return new Promise((ok, erro) => { tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); tx.onabort = () => erro(tx.error || new Error('Transação cancelada.')); });
}

export async function obter(store, chave) {
  const db = await abrir();
  return promessa(db.transaction(store).objectStore(store).get(chave));
}

export async function listar(store) {
  const db = await abrir();
  return promessa(db.transaction(store).objectStore(store).getAll());
}

export async function gravar(store, valor) {
  const db = await abrir();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(valor);
  return fim(tx);
}

export async function remover(store, chave) {
  const db = await abrir();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(chave);
  return fim(tx);
}

/** Várias gravações em uma única transação: tudo ou nada. ops: [{ store, tipo: 'put'|'delete'|'clear', valor, chave }] */
export async function transacao(ops) {
  const db = await abrir();
  const nomes = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(nomes, 'readwrite');
  for (const o of ops) {
    const s = tx.objectStore(o.store);
    if (o.tipo === 'delete') s.delete(o.chave);
    else if (o.tipo === 'clear') s.clear();
    else s.put(o.valor);
  }
  return fim(tx);
}

export async function meta(chave, valor) {
  if (valor === undefined) return (await obter('meta', chave))?.valor;
  return gravar('meta', { chave, valor });
}

/** Cópia de segurança das viagens; mantém as 3 últimas. */
export async function copiaDeSeguranca(motivo) {
  const viagens = await listar('viagens');
  const db = await abrir();
  const tx = db.transaction('backups', 'readwrite');
  const s = tx.objectStore('backups');
  s.add({ criado_em: new Date().toISOString(), motivo, versao_esquema: VERSAO_ESQUEMA, viagens });
  const todos = await promessa(s.getAll());
  todos.sort((a, b) => a.id - b.id);
  for (const b of todos.slice(0, Math.max(0, todos.length - 3))) s.delete(b.id);
  return fim(tx);
}

/** Migra viagens antigas depois de uma cópia de segurança; em falha, nada é gravado. */
export async function migrar() {
  const viagens = await listar('viagens');
  const antigas = viagens.filter((v) => (v.versao_esquema || 1) < VERSAO_ESQUEMA);
  if (!antigas.length) return 0;
  await copiaDeSeguranca('antes da migração');
  const novas = antigas.map(migrarViagem);
  await transacao(novas.map((valor) => ({ store: 'viagens', valor })));
  return novas.length;
}

export async function apagarTudo() {
  await transacao(STORES.map((store) => ({ store, tipo: 'clear' })));
  try { localStorage.clear(); } catch { /* sem acesso */ }
  if (self.caches) for (const k of await caches.keys()) await caches.delete(k);
}
