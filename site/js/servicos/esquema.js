// Validador de um subconjunto de JSON Schema (type, required, properties, items, enum,
// minimum, maximum, minLength, maxLength, pattern, maxItems, additionalProperties).
// O mesmo subconjunto é implementado em scripts/validar_dados.py.

const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

function tipoDe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function tipoConfere(v, tipo) {
  const t = tipoDe(v);
  if (Array.isArray(tipo)) return tipo.some((x) => tipoConfere(v, x));
  return t === tipo || (tipo === 'number' && t === 'integer');
}

export function validar(valor, esquema, caminho = '$', erros = [], profundidade = 0) {
  if (profundidade > 32) { erros.push(`${caminho}: profundidade excessiva`); return erros; }
  if (esquema.type && !tipoConfere(valor, esquema.type)) {
    erros.push(`${caminho}: esperado ${esquema.type}, veio ${tipoDe(valor)}`);
    return erros;
  }
  if (esquema.enum && !esquema.enum.includes(valor)) erros.push(`${caminho}: valor fora da lista`);
  if (typeof valor === 'number') {
    if (esquema.minimum !== undefined && valor < esquema.minimum) erros.push(`${caminho}: menor que ${esquema.minimum}`);
    if (esquema.maximum !== undefined && valor > esquema.maximum) erros.push(`${caminho}: maior que ${esquema.maximum}`);
  }
  if (typeof valor === 'string') {
    if (esquema.minLength !== undefined && valor.length < esquema.minLength) erros.push(`${caminho}: texto curto demais`);
    if (esquema.maxLength !== undefined && valor.length > esquema.maxLength) erros.push(`${caminho}: texto longo demais`);
    if (esquema.pattern && !new RegExp(esquema.pattern).test(valor)) erros.push(`${caminho}: formato inválido`);
  }
  if (Array.isArray(valor)) {
    if (esquema.maxItems !== undefined && valor.length > esquema.maxItems) erros.push(`${caminho}: itens demais`);
    if (esquema.items) valor.forEach((x, i) => validar(x, esquema.items, `${caminho}[${i}]`, erros, profundidade + 1));
  } else if (valor && typeof valor === 'object') {
    for (const k of Object.keys(valor)) if (CHAVES_PROIBIDAS.has(k)) erros.push(`${caminho}: chave proibida ${k}`);
    for (const k of esquema.required || []) if (!(k in valor)) erros.push(`${caminho}: falta ${k}`);
    for (const [k, sub] of Object.entries(esquema.properties || {})) {
      if (k in valor) validar(valor[k], sub, `${caminho}.${k}`, erros, profundidade + 1);
    }
    if (esquema.additionalProperties && typeof esquema.additionalProperties === 'object') {
      for (const k of Object.keys(valor)) {
        if (!(esquema.properties || {})[k]) validar(valor[k], esquema.additionalProperties, `${caminho}.${k}`, erros, profundidade + 1);
      }
    }
  }
  return erros;
}

/** Copia só os campos conhecidos do esquema (descarta campos desconhecidos e chaves perigosas). */
export function sanitizar(valor, esquema) {
  if (Array.isArray(valor)) return esquema.items ? valor.map((x) => sanitizar(x, esquema.items)) : [];
  if (valor && typeof valor === 'object') {
    const out = {};
    const props = esquema.properties || {};
    for (const k of Object.keys(valor)) {
      if (CHAVES_PROIBIDAS.has(k)) continue;
      if (props[k]) out[k] = sanitizar(valor[k], props[k]);
      else if (esquema.additionalProperties && typeof esquema.additionalProperties === 'object') out[k] = sanitizar(valor[k], esquema.additionalProperties);
      else if (esquema.additionalProperties === true) out[k] = JSON.parse(JSON.stringify(valor[k]));
    }
    return out;
  }
  return valor;
}

/** JSON.parse que recusa chaves de protótipo. */
export function parseSeguro(texto) {
  return JSON.parse(texto, (k, v) => {
    if (CHAVES_PROIBIDAS.has(k)) throw new Error('Arquivo com chave proibida.');
    return v;
  });
}

export async function sha256(texto) {
  const dados = typeof texto === 'string' ? new TextEncoder().encode(texto) : texto;
  const h = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
