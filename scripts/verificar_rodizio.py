# © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
"""Verificação diária do rodízio e da saúde das bases (Seções 11, 11.5 e 11.6).

* Publica site/dados/rodizio-suspensoes.json a partir de dados-curados/rodizio-suspensoes.json.
  A Prefeitura não publica base aberta: nos períodos em que suspensões são comuns (fim de dezembro,
  início de janeiro, vésperas de feriado), abre um aviso lembrando o mantenedor de conferir a CET.
* Avisa regras de regras.json com revisar_ate vencido ou perto de vencer.
* Avisa bases com validade vencida.
"""
from __future__ import annotations

from datetime import date, timedelta

from coleta_comum import CONFIG, CURADOS, DADOS, Anomalia, avisar, cabecalho, executar, gravar_base, hoje, ler_json

CFG = CONFIG["rodizio"]


def suspensoes_validas(lista: list[dict]) -> list[dict]:
    saida = []
    for i, s in enumerate(lista):
        try:
            ini, fim = date.fromisoformat(s["inicio"]), date.fromisoformat(s["fim"])
        except (KeyError, ValueError) as e:
            raise Anomalia(f"Suspensão {i + 1} com data inválida: {e}") from e
        if fim < ini:
            raise Anomalia(f"Suspensão {i + 1}: fim antes do início.")
        if not str(s.get("fonte", "")).startswith("http"):
            raise Anomalia(f"Suspensão {i + 1} sem link da fonte oficial.")
        if fim >= hoje() - timedelta(days=60):  # antigas saem da base publicada
            saida.append({k: s[k] for k in ("inicio", "fim", "area", "fonte", "anunciado_em") if k in s})
    return sorted(saida, key=lambda s: s["inicio"])


def periodo_sensivel(h: date, feriados_sp: set[str]) -> str | None:
    md = h.strftime("%m-%d")
    for ini, fim in CFG["periodos_sensiveis"]:
        if ini <= md <= fim:
            return "fim de ano"
    for n in range(1, CFG["dias_antes_de_feriado"] + 1):
        d = (h + timedelta(days=n)).isoformat()
        if d in feriados_sp:
            return f"véspera do feriado de {d}"
    return None


def regras_a_revisar(regras: dict, h: date) -> list[str]:
    """Percorre regras.json e lista os itens com revisar_ate vencido ou perto."""
    achados = []
    limite = (h + timedelta(days=CFG["regras_avisar_dias_antes"])).isoformat()

    def visitar(obj, caminho):
        if isinstance(obj, dict):
            r = obj.get("revisar_ate")
            if isinstance(r, str) and r <= limite:
                achados.append(f"{caminho}: revisar até {r}{' (VENCIDO — o app já mostra como desatualizado)' if r < h.isoformat() else ''}")
            for k, v in obj.items():
                visitar(v, f"{caminho}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                visitar(v, f"{caminho}[{i}]")

    visitar(regras, "regras")
    return achados


def coletar() -> bool:
    h = hoje()
    curado = ler_json(CURADOS / "rodizio-suspensoes.json")
    if curado is None:
        raise Anomalia("dados-curados/rodizio-suspensoes.json ausente.")
    dados = cabecalho("Prefeitura de São Paulo/CET e Diário Oficial do Município (curadoria manual; sem base aberta)", h.isoformat(), CFG["validade_dias"])
    dados["suspensoes"] = suspensoes_validas(curado.get("suspensoes", []))
    mudou = gravar_base("rodizio-suspensoes.json", dados)

    feriados = ler_json(DADOS / "feriados.json", {}).get("feriados", [])
    sp = {f["data"] for f in feriados if f["jurisdicao"] in ("nacional", "SP", "São Paulo/SP")}
    motivo = periodo_sensivel(h, sp)
    if motivo:
        semana = (h - timedelta(days=h.weekday())).isoformat()
        avisar(f"Conferir suspensão do rodízio — semana de {semana}",
               f"Período sensível ({motivo}). Confira os anúncios da CET e do Diário Oficial do Município e, se houver suspensão, "
               "inclua em dados-curados/rodizio-suspensoes.json. O app já mostra 'Confira se há suspensão anunciada pela CET'.")

    pendentes = regras_a_revisar(ler_json(DADOS / "regras.json", {}), h)
    if pendentes:
        avisar(f"Regras para revisar — {h:%Y-%m}", "\n".join(f"* {p}" for p in pendentes))

    for arq in sorted(DADOS.iterdir()):
        if arq.name == "manifesto.json" or arq.suffix not in (".json", ".geojson"):
            continue
        base = ler_json(arq, {})
        if str(base.get("validade", "9999")) < h.isoformat():
            avisar(f"Base vencida: {arq.name}", f"Validade {base.get('validade')}. O app mostra a base como 'desatualizado'.")
    return mudou


if __name__ == "__main__":
    raise SystemExit(executar("rodizio", coletar))
