"""Gera site/dados/feriados.json para o ano corrente e os seguintes (Seção 11).
Não depende de rede: datas fixas e móveis (Páscoa) vêm das regras em dados-curados/feriados.json."""
from __future__ import annotations

from datetime import date, timedelta

from coleta_comum import CONFIG, CURADOS, Anomalia, cabecalho, executar, gravar_base, hoje, ler_json


def pascoa(ano: int) -> date:
    """Domingo de Páscoa (algoritmo gregoriano de Meeus/Jones/Butcher)."""
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    mes = (h + l_ - 7 * m + 114) // 31
    dia = (h + l_ - 7 * m + 114) % 31 + 1
    return date(ano, mes, dia)


def feriados_do_ano(ano: int, regras: list[dict]) -> list[dict]:
    lista = []
    for r in regras:
        if "dia" in r:
            mes, dia = map(int, r["dia"].split("-"))
            d = date(ano, mes, dia)
        elif "pascoa" in r:
            d = pascoa(ano) + timedelta(days=int(r["pascoa"]))
        else:
            raise Anomalia(f"Regra sem data: {r.get('nome')}")
        lista.append({"data": d.isoformat(), "nome": r["nome"], "jurisdicao": r["jurisdicao"]})
    return lista


def gerar() -> dict:
    curado = ler_json(CURADOS / "feriados.json")
    if not curado or not curado.get("regras"):
        raise Anomalia("dados-curados/feriados.json ausente ou sem regras")
    ano = hoje().year
    feriados = []
    for a in range(ano, ano + 1 + CONFIG["feriados"]["anos_a_frente"]):
        feriados += feriados_do_ano(a, curado["regras"])
    feriados.sort(key=lambda f: (f["data"], f["jurisdicao"]))
    atos = sorted({r["ato"] for r in curado["regras"]})
    dados = cabecalho("Calendário legal: " + "; ".join(atos), hoje().isoformat(), CONFIG["feriados"]["validade_dias"])
    # A validade não passa do último ano gerado.
    dados["validade"] = min(dados["validade"], f"{ano + CONFIG['feriados']['anos_a_frente']}-12-31")
    dados["nivel_verificacao"] = curado.get("nivel_verificacao", "secundaria")
    dados["feriados"] = feriados
    return dados


if __name__ == "__main__":
    raise SystemExit(executar("feriados", lambda: gravar_base("feriados.json", gerar())))
