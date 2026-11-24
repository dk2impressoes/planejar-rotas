# © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
"""Valida cada base contra o esquema e bloqueia anomalias (Seções 11.1 a 11.3).
Implementa o mesmo subconjunto de JSON Schema de site/js/servicos/esquema.js. Sai com código 1 se algo falhar."""
import json
import re
import sys
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"
PROIBIDAS = {"__proto__", "constructor", "prototype"}


def tipo_de(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, int):
        return "integer"
    if isinstance(v, float):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "array"
    return "object"


def confere(v, t):
    if isinstance(t, list):
        return any(confere(v, x) for x in t)
    real = tipo_de(v)
    return real == t or (t == "number" and real == "integer")


def validar(v, e, caminho="$", erros=None):
    erros = [] if erros is None else erros
    if "type" in e and not confere(v, e["type"]):
        erros.append(f"{caminho}: esperado {e['type']}")
        return erros
    if "enum" in e and v not in e["enum"]:
        erros.append(f"{caminho}: fora da lista")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if "minimum" in e and v < e["minimum"]:
            erros.append(f"{caminho}: menor que {e['minimum']}")
        if "maximum" in e and v > e["maximum"]:
            erros.append(f"{caminho}: maior que {e['maximum']}")
    if isinstance(v, str):
        if "maxLength" in e and len(v) > e["maxLength"]:
            erros.append(f"{caminho}: longo demais")
        if "pattern" in e and not re.search(e["pattern"], v):
            erros.append(f"{caminho}: formato inválido")
    if isinstance(v, list):
        if "maxItems" in e and len(v) > e["maxItems"]:
            erros.append(f"{caminho}: itens demais")
        for i, x in enumerate(v):
            if "items" in e:
                validar(x, e["items"], f"{caminho}[{i}]", erros)
    elif isinstance(v, dict):
        for k in v:
            if k in PROIBIDAS:
                erros.append(f"{caminho}: chave proibida")
        for k in e.get("required", []):
            if k not in v:
                erros.append(f"{caminho}: falta {k}")
        for k, sub in e.get("properties", {}).items():
            if k in v:
                validar(v[k], sub, f"{caminho}.{k}", erros)
        extra = e.get("additionalProperties")
        if isinstance(extra, dict):
            for k in v:
                if k not in e.get("properties", {}):
                    validar(v[k], extra, f"{caminho}.{k}", erros)
    return erros


def main() -> int:
    falhas = 0
    for p in sorted((SITE / "dados").iterdir()):
        if p.name == "manifesto.json":
            continue
        esquema = json.loads((SITE / "esquemas" / f"{p.stem}.schema.json").read_text(encoding="utf-8"))
        texto = p.read_text(encoding="utf-8")
        if not texto.strip():
            print(f"✖ {p.name}: arquivo vazio")
            falhas += 1
            continue
        dados = json.loads(texto)
        erros = validar(dados, esquema)
        if dados.get("validade", "9999") < date.today().isoformat():
            # Indicador da Seção 11.6: alerta para o mantenedor, sem bloquear a publicação.
            print(f"⚠ {p.name}: validade vencida ({dados.get('validade')})")
        print(("✔ " if not erros else "✖ ") + p.name + ("" if not erros else ": " + "; ".join(erros[:5])))
        falhas += bool(erros)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
