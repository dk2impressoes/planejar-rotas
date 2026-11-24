# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
"""Abre uma issue no GitHub para cada aviso novo de dados-estado/avisos.md (sem repetir títulos já abertos)
e fecha as issues de dados cujo aviso não apareceu mais na coleta do dia (problema resolvido).
Só fecha quando todos os coletores rodaram hoje: se a coleta quebrou no meio, nada é fechado.
Usa o GitHub CLI (gh), disponível nos runners do GitHub Actions, com GH_TOKEN no ambiente."""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
AVISOS = RAIZ / "dados-estado" / "avisos.md"
ESTADO = RAIZ / "dados-estado" / "coletas.json"
ROTULO = "dados"
COLETORES = ("feriados", "anp", "pedagios", "rodizio")


def avisos() -> list[tuple[str, str]]:
    if not AVISOS.exists():
        return []
    blocos = AVISOS.read_text(encoding="utf-8").split("\n## ")
    saida = []
    for b in blocos:
        b = b.removeprefix("## ").strip()
        if b:
            titulo, _, corpo = b.partition("\n")
            saida.append((titulo.strip(), corpo.strip()))
    return saida


def coleta_completa_hoje(estado: dict, hoje: str) -> bool:
    """Todos os coletores registraram execução hoje (mesmo os que falharam: a falha gera o seu próprio aviso)."""
    return all(str((estado.get(c) or {}).get("ultima_execucao", "")).startswith(hoje) for c in COLETORES)


def para_fechar(abertas: list[dict], titulos_de_hoje: set[str]) -> list[dict]:
    return [i for i in abertas if ROTULO in {l["name"] for l in i.get("labels", [])} and i["title"] not in titulos_de_hoje]


def gh(*args, **kw):
    return subprocess.run(["gh", *args], capture_output=True, text=True, **kw)


def main() -> int:
    lista = dict(avisos())
    abertas = json.loads(gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,title,labels", check=True).stdout)
    titulos = {i["title"] for i in abertas}
    gh("label", "create", ROTULO, "--force", "--description", "Avisos automáticos das bases")
    for titulo, corpo in lista.items():
        if titulo in titulos:
            print(f"Já aberta: {titulo}")
            continue
        gh("issue", "create", "--title", titulo, "--label", ROTULO,
           "--body", corpo + "\n\n_Aviso gerado pela automação de dados (Seção 11)._", check=True)
        print(f"Aberta: {titulo}")
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    estado = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}
    if not coleta_completa_hoje(estado, hoje):
        print("Coleta de hoje incompleta: nenhuma issue foi fechada.")
        return 0
    for i in para_fechar(abertas, set(lista)):
        gh("issue", "close", str(i["number"]), "--comment",
           f"Resolvido: este aviso não apareceu na coleta de {hoje}. Fechado pela automação; se voltar, ela abre de novo.")
        print(f"Fechada: #{i['number']} {i['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
