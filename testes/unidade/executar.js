// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
import { testes } from './testes.js';

const lista = document.getElementById('lista');
let ok = 0;
const falhas = [];
for (const t of testes) {
  const li = document.createElement('li');
  try {
    await t.fn();
    ok++;
    li.textContent = `✔ ${t.nome}`;
  } catch (e) {
    falhas.push({ nome: t.nome, erro: e.message });
    li.textContent = `✖ ${t.nome} — ${e.message}`;
    li.style.color = '#a4161a';
  }
  lista.append(li);
}
document.getElementById('resumo').textContent = `${ok} de ${testes.length} testes passaram.`;
window.resultadoTestes = { total: testes.length, ok, falhas };
