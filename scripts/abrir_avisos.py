# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
"""Abre uma issue no GitHub para cada aviso novo de dados-estado/avisos.md (sem repetir títulos já abertos).
Usa o GitHub CLI (gh), disponível nos runners do GitHub Actions, com GH_TOKEN no ambiente."""
import json
import subprocess
import sys
from pathlib import Path

AVISOS = Path(__file__).resolve().parent.parent / "dados-estado" / "avisos.md"
ROTULO = "dados"


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


def main() -> int:
    lista = avisos()
    if not lista:
        print("Nenhum aviso.")
        return 0
    abertas = json.loads(subprocess.run(["gh", "issue", "list", "--state", "open", "--limit", "200", "--json", "title"],
                                        check=True, capture_output=True, text=True).stdout)
    titulos = {i["title"] for i in abertas}
    subprocess.run(["gh", "label", "create", ROTULO, "--force", "--description", "Avisos automáticos das bases"], check=False, capture_output=True)
    for titulo, corpo in dict(lista).items():
        if titulo in titulos:
            print(f"Já aberta: {titulo}")
            continue
        subprocess.run(["gh", "issue", "create", "--title", titulo, "--label", ROTULO,
                        "--body", corpo + "\n\n_Aviso gerado pela automação de dados (Seção 11)._"], check=True)
        print(f"Aberta: {titulo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
