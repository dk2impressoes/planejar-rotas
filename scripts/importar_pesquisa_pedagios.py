"""Importa uma planilha de pesquisa de pedágios (formato "Pedagios_Brasil_carros_e_motos") para
dados-curados/pesquisa-pedagios.json, ligando cada linha à praça da base pela UF, rodovia e km.

Uso: python scripts/importar_pesquisa_pedagios.py caminho/da/planilha.xlsx

A planilha é tratada só como dados. Linhas sem valor ("A confirmar") não viram tarifa.
Os valores entram como nível "secundaria" (pesquisa, não conferida no texto oficial pelo app).
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from coleta_comum import CURADOS, DADOS, ler_json, normalizar  # noqa: E402

COLUNAS = {
    "uf": ("UF",), "praca": ("PRACA",), "rodovia": ("RODOVIA",), "km": ("KM",),
    "concessionaria": ("CONCESSIONARIA",), "auto": ("TARIFA AUTOMOVEL (R$)", "TARIFA AUTOMOVEL"),
    "moto": ("TARIFA MOTO (R$)", "TARIFA MOTO"), "regra_moto": ("REGRA PARA MOTOS",),
    "desde": ("VIGENTE DESDE",), "situacao": ("SITUACAO",), "sentido": ("SENTIDO",),
    "fonte": ("FONTE",), "pagina": ("PAGINA OFICIAL",),
}


def numero(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).replace("R$", "").strip().replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def data_iso(v):
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", str(v or ""))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def rodovia_padrao(t):
    s = normalizar(t).replace(" ", "")
    m = re.match(r"^(BR|[A-Z]{2})-?(\d{2,3})", s)
    return f"{m.group(1)}-{m.group(2)}" if m else normalizar(t)


def ler_linhas(caminho: str) -> tuple[list[dict], str | None]:
    import openpyxl
    livro = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    aba = next((a for a in livro.worksheets if normalizar(a.title).startswith("PEDAGIO")), livro.worksheets[0])
    linhas = list(aba.iter_rows(values_only=True))
    cab = [normalizar(c) for c in linhas[0]]
    idx = {}
    for chave, nomes in COLUNAS.items():
        for i, c in enumerate(cab):
            if c in nomes:
                idx[chave] = i
                break
    faltam = {"uf", "praca", "rodovia", "km", "auto"} - idx.keys()
    if faltam:
        raise SystemExit(f"Planilha sem as colunas {sorted(faltam)}.")
    saida = []
    for l in linhas[1:]:
        g = lambda k: l[idx[k]] if k in idx and idx[k] < len(l) else None  # noqa: E731
        if not g("praca") or not g("rodovia"):
            continue
        saida.append({k: g(k) for k in COLUNAS})
    # Data da pesquisa, se houver aba de fontes.
    data_pesquisa = None
    for a in livro.worksheets:
        for l in a.iter_rows(values_only=True):
            if l and normalizar(l[0]) == "DATA DESTA PLANILHA":
                data_pesquisa = data_iso(l[1])
    return saida, data_pesquisa


def ligar(linhas: list[dict], pontos: list[dict], arquivo: str, data_pesquisa: str | None) -> tuple[dict, list]:
    tarifas, sem_par = {}, []
    usados = set()
    for r in linhas:
        auto = numero(r["auto"])
        if auto is None:
            continue
        rod, km = rodovia_padrao(r["rodovia"]), numero(r["km"])
        cands = [p for p in pontos if p["rodovia"] == rod and p.get("km") is not None and km is not None
                 and abs(p["km"] - km) <= 2.5 and (not r["uf"] or p.get("uf") in (None, str(r["uf"]).strip())) and p["id"] not in usados]
        if not cands:
            sem_par.append(f"{r['uf']} {r['praca']} ({rod} km {km})")
            continue
        nome = normalizar(r["praca"])
        p = min(cands, key=lambda c: (0 if normalizar(c.get("nome", "")) in nome or nome in normalizar(c.get("nome", "")) else 1, abs(c["km"] - km)))
        usados.add(p["id"])
        categorias = {"automovel": round(auto, 2)}
        moto = numero(r["moto"])
        if moto is not None:
            categorias["motocicleta"] = round(moto, 2)
        situacao = normalizar(r["situacao"])
        tarifas[p["id"]] = [{
            "inicio": data_iso(r["desde"]) or data_pesquisa or date.today().isoformat(),
            "fim": None,
            "estado": "confirmada" if situacao.startswith("CONFIRMADO") else "prevista",
            "nivel_verificacao": "secundaria",
            "categorias": categorias,
            "fonte": f"Pesquisa enviada pelo usuário ({Path(arquivo).name}): {r['fonte'] or 'sem fonte'}"
                     + (f" — {r['pagina']}" if r.get("pagina") else ""),
            "tipo_fonte": "pesquisa",
        }]
    return tarifas, sem_par


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    linhas, data_pesquisa = ler_linhas(sys.argv[1])
    pontos = ler_json(DADOS / "pedagios.json", {}).get("pontos", [])
    tarifas, sem_par = ligar(linhas, pontos, sys.argv[1], data_pesquisa)
    destino = CURADOS / "pesquisa-pedagios.json"
    destino.write_text(json.dumps({
        "_leia": "Gerado por scripts/importar_pesquisa_pedagios.py a partir de uma planilha de pesquisa. Não editar à mão: importe de novo.",
        "data_pesquisa": data_pesquisa, "arquivo": Path(sys.argv[1]).name, "tarifas": tarifas,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Linhas na planilha: {len(linhas)} | com valor e ligadas a praças: {len(tarifas)} | com valor e sem praça na base: {len(sem_par)}")
    for s in sem_par[:15]:
        print("  sem praça:", s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
