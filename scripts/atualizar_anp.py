"""Coleta o preço médio semanal por UF do Levantamento de Preços de Combustíveis da ANP (Seção 4.6).

Como a ANP já mudou o nome dos arquivos e o layout das planilhas, o coletor não depende de posições fixas:
1. lê a página "últimas semanas pesquisadas" e procura links do resumo semanal (padrão em config_coleta.json);
2. abre a planilha mais recente e procura a linha de cabeçalho pelos nomes das colunas;
3. confere faixas de preço, cobertura de UFs e variação contra a semana anterior.
Qualquer surpresa vira Anomalia: nada é publicado e o mantenedor recebe um aviso.
"""
from __future__ import annotations

import html
import io
import os
import re
from datetime import date, datetime
from urllib.parse import unquote, urljoin

from coleta_comum import CONFIG, DADOS, Anomalia, avisar, baixar, cabecalho, executar, gravar_base, ler_json, normalizar, uf_de

CFG = CONFIG["anp"]
PADRAO = re.compile(CFG["padrao_arquivo"], re.IGNORECASE)
COLUNAS = {
    "estado": ("ESTADO", "ESTADOS", "UF"),
    "produto": ("PRODUTO",),
    "preco": ("PRECO MEDIO REVENDA",),
    "unidade": ("UNIDADE DE MEDIDA",),
    "inicio": ("DATA INICIAL",),
    "fim": ("DATA FINAL",),
}


PADRAO_POSTOS = re.compile(CFG["padrao_postos"], re.IGNORECASE)


def achar_links(pagina_html: str, base: str, padrao: re.Pattern = PADRAO) -> list[tuple[date, date, str]]:
    """Links de planilhas semanais na página (resumo por estado ou por posto), do mais recente ao mais antigo."""
    achados = {}
    for href in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', pagina_html, re.IGNORECASE):
        url = urljoin(base, html.unescape(href))
        m = padrao.search(unquote(url))
        if not m:
            continue
        g = list(map(int, m.groups()))
        inicio, fim = date(g[0], g[1], g[2]), date(g[3], g[4], g[5])
        achados.setdefault((inicio, fim), url)
    return sorted(((i, f, u) for (i, f), u in achados.items()), key=lambda x: x[1], reverse=True)


def _como_data(v) -> str | None:
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", str(v or ""))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _como_numero(v) -> float | None:
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v or "").strip().replace("R$", "").replace(" ", "")
    if not t or t in ("-", "–"):
        return None
    t = t.replace(".", "").replace(",", ".") if "," in t else t
    try:
        return float(t)
    except ValueError:
        return None


def localizar_tabela(linhas: list[tuple]) -> dict[str, int] | None:
    """Acha a linha de cabeçalho com estado, produto e preço médio de revenda."""
    for n, linha in enumerate(linhas[:40]):
        nomes = [normalizar(c) for c in linha]
        cols = {}
        for chave, aceitos in COLUNAS.items():
            for i, nome in enumerate(nomes):
                if nome in aceitos or (chave == "preco" and nome.startswith("PRECO MEDIO REVENDA")):
                    cols.setdefault(chave, i)
        if {"estado", "produto", "preco"} <= cols.keys():
            cols["_linha"] = n
            return cols
    return None


def ler_planilha(conteudo: bytes) -> list[tuple]:
    """Devolve as linhas da aba com dados por estado (exige openpyxl)."""
    try:
        import openpyxl
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("Instale as dependências: pip install -r scripts/requirements.txt") from e
    try:
        livro = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001 - ex.: formato Strict Open XML
        raise Anomalia(f"Planilha da ANP não pôde ser aberta ({e}); o formato pode ter mudado.") from e
    abas = sorted(livro.worksheets, key=lambda a: 0 if "ESTADO" in normalizar(a.title) else 1)
    for aba in abas:
        linhas = [tuple(r) for r in aba.iter_rows(values_only=True)]
        if localizar_tabela(linhas):
            return linhas
    raise Anomalia("Nenhuma aba da planilha da ANP tem as colunas ESTADO, PRODUTO e PREÇO MÉDIO REVENDA.")


def extrair_precos(linhas: list[tuple], inicio: date, fim: date, url: str) -> list[dict]:
    cols = localizar_tabela(linhas)
    if not cols:
        raise Anomalia("Cabeçalho da tabela por estado não encontrado.")
    produtos = {normalizar(k): v for k, v in CFG["produtos"].items()}
    precos, ignorados = [], set()
    for linha in linhas[cols["_linha"] + 1:]:
        if not linha or len(linha) <= max(v for k, v in cols.items() if k != "_linha"):
            continue
        uf = uf_de(linha[cols["estado"]])
        combustivel = produtos.get(normalizar(linha[cols["produto"]]))
        if not uf or not combustivel:
            if linha[cols["estado"]]:
                ignorados.add(normalizar(linha[cols["produto"]]))
            continue
        preco = _como_numero(linha[cols["preco"]])
        if preco is None:
            continue  # UF sem pesquisa do produto na semana: fica sem preço ("não disponível" no app)
        if not (CFG["preco_min"] <= preco <= CFG["preco_max"]):
            raise Anomalia(f"Preço fora da faixa esperada: {uf} {combustivel} = {preco}")
        precos.append({
            "uf": uf, "combustivel": combustivel, "preco": round(preco, 3),
            "unidade": str(linha[cols["unidade"]]).strip() if "unidade" in cols and linha[cols["unidade"]] else "R$/l",
            "periodo_inicio": (_como_data(linha[cols["inicio"]]) if "inicio" in cols else None) or inicio.isoformat(),
            "periodo_fim": (_como_data(linha[cols["fim"]]) if "fim" in cols else None) or fim.isoformat(),
            "fonte": url,
        })
    vistos = {}
    for p in precos:
        if (p["uf"], p["combustivel"]) in vistos:
            raise Anomalia(f"Linha repetida para {p['uf']} {p['combustivel']}.")
        vistos[(p["uf"], p["combustivel"])] = p
    for combustivel in CFG["produtos"].values():
        n = sum(1 for p in precos if p["combustivel"] == combustivel)
        if n < 20:
            raise Anomalia(f"Só {n} UFs com preço de {combustivel}: o layout pode ter mudado. Produtos não reconhecidos: {sorted(ignorados)[:10]}")
    return sorted(precos, key=lambda p: (p["uf"], p["combustivel"]))


def precos_por_municipio(linhas: list[tuple]) -> list[dict]:
    """Média simples do preço de revenda por município (como a ANP calcula), a partir da planilha por posto."""
    cab = None
    for n, linha in enumerate(linhas[:40]):
        nomes = [normalizar(c) for c in linha]
        if "MUNICIPIO" in nomes and "ESTADO" in nomes and "PRODUTO" in nomes and any(x.startswith("PRECO DE REVENDA") for x in nomes):
            cab = {"municipio": nomes.index("MUNICIPIO"), "estado": nomes.index("ESTADO"), "produto": nomes.index("PRODUTO"),
                   "preco": next(i for i, x in enumerate(nomes) if x.startswith("PRECO DE REVENDA")), "_linha": n}
            break
    if not cab:
        raise Anomalia("Planilha por posto sem as colunas MUNICÍPIO, ESTADO, PRODUTO e PREÇO DE REVENDA.")
    produtos = {normalizar(k): v for k, v in CFG["produtos_postos"].items()}
    soma: dict[tuple, list] = {}
    for linha in linhas[cab["_linha"] + 1:]:
        if not linha or len(linha) <= max(v for k, v in cab.items() if k != "_linha"):
            continue
        uf = uf_de(linha[cab["estado"]])
        combustivel = produtos.get(normalizar(linha[cab["produto"]]))
        preco = _como_numero(linha[cab["preco"]])
        municipio = str(linha[cab["municipio"]] or "").strip()
        if not uf or not combustivel or preco is None or not municipio:
            continue
        if not (CFG["preco_min"] <= preco <= CFG["preco_max"]):
            continue  # preço de um posto fora da faixa: descartado (erro de digitação na fonte), sem derrubar a base
        chave = (uf, normalizar(municipio), combustivel)
        soma.setdefault(chave, [municipio, 0.0, 0])
        soma[chave][1] += preco
        soma[chave][2] += 1
    saida = [{"uf": uf, "municipio": nome.title(), "chave": chave_mun, "combustivel": comb, "preco": round(total / n, 3), "postos": n}
             for (uf, chave_mun, comb), (nome, total, n) in soma.items()]
    municipios = {(p["uf"], p["chave"]) for p in saida}
    if len(municipios) < CFG["municipios_minimo"]:
        raise Anomalia(f"Planilha por posto com só {len(municipios)} municípios: o layout pode ter mudado.")
    return sorted(saida, key=lambda p: (p["uf"], p["chave"], p["combustivel"]))


def conferir_variacao(novos: list[dict], anteriores: list[dict]) -> None:
    antes = {(p["uf"], p["combustivel"]): p["preco"] for p in anteriores}
    suspeitos = []
    for p in novos:
        a = antes.get((p["uf"], p["combustivel"]))
        if a and abs(p["preco"] - a) / a * 100 > CFG["variacao_maxima_pct"]:
            suspeitos.append(f"{p['uf']} {p['combustivel']}: {a} → {p['preco']}")
    if suspeitos:
        raise Anomalia("Variação semanal acima de {}%: {}".format(CFG["variacao_maxima_pct"], "; ".join(suspeitos[:10])))


def coletar() -> bool:
    links, links_postos = [], []
    for pagina in CFG["paginas"]:
        texto = baixar(pagina).decode("utf-8", "replace")
        links += achar_links(texto, pagina)
        links_postos += achar_links(texto, pagina, PADRAO_POSTOS)
    if not links:
        raise Anomalia("Nenhum link de resumo semanal encontrado na página da ANP (o nome do arquivo pode ter mudado; ajuste 'padrao_arquivo').")
    inicio, fim, url = max(links, key=lambda x: x[1])
    anterior = ler_json(DADOS / "anp.json", {})
    if anterior.get("referencia_em") == fim.isoformat() and anterior.get("precos") and anterior.get("precos_municipios"):
        return False
    precos = extrair_precos(ler_planilha(baixar(url)), inicio, fim, url)
    # Preço médio por cidade, da planilha por posto da mesma semana. Opcional: se falhar, publica só o resumo por estado.
    municipios, url_postos = [], None
    mesma_semana = [u for (i, f, u) in links_postos if i == inicio and f == fim]
    if mesma_semana:
        url_postos = mesma_semana[0]
        try:
            municipios = precos_por_municipio(ler_planilha_postos(baixar(url_postos)))
        except Anomalia as e:
            avisar("Preço por cidade (ANP) não publicado", f"{e}\n\nO preço médio por estado foi publicado normalmente.")
            municipios = []
    else:
        avisar("Planilha por posto da ANP não encontrada", f"Semana {inicio:%d/%m} a {fim:%d/%m/%Y}: só o resumo por estado foi publicado.")
    # Variação real e grande (ex.: mudança de imposto): o mantenedor confere e roda de novo com ACEITAR_VARIACAO=1.
    if anterior.get("precos") and os.environ.get("ACEITAR_VARIACAO") != "1":
        conferir_variacao(precos, anterior["precos"])
    dados = cabecalho(f"ANP — Levantamento de Preços de Combustíveis, semana de {inicio:%d/%m/%Y} a {fim:%d/%m/%Y}", fim.isoformat(), CFG["validade_dias"])
    dados["nivel_verificacao"] = "primaria"
    dados["precos"] = precos
    if municipios:
        dados["fonte_municipios"] = url_postos
        dados["precos_municipios"] = municipios
    return gravar_base("anp.json", dados)


def ler_planilha_postos(conteudo: bytes) -> list[tuple]:
    """Linhas da planilha por posto (aba única "POSTOS REVENDEDORES")."""
    import openpyxl
    try:
        livro = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001
        raise Anomalia(f"Planilha por posto não pôde ser aberta ({e}).") from e
    aba = max(livro.worksheets, key=lambda a: a.max_row or 0)
    return [tuple(r) for r in aba.iter_rows(values_only=True)]


if __name__ == "__main__":
    raise SystemExit(executar("anp", coletar))
