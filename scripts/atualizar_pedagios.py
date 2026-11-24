"""Monta site/dados/pedagios.json (Seção 5) a partir de quatro fontes:

1. Base aberta do Sem Parar (CC BY 4.0, GitHub): praças federais e estaduais, com id estável, sentido em
   texto e link da tabela oficial de tarifas. É a base principal (ids "semparar-<id_praca>").
2. ANTT, dados abertos "Praça de Pedágio" (CKAN): coordenadas oficiais das praças federais. Quando uma
   praça da ANTT está na mesma rodovia e a menos de 2 km de uma do Sem Parar, as coordenadas da ANTT
   substituem as do Sem Parar; praças só da ANTT entram com id "antt-...".
3. dados-curados/pedagios-manuais.json: pontos e correções mantidos à mão (ex.: free flow previsto).
4. dados-curados/tarifas.json: tarifas conferidas à mão. Não há base aberta estruturada de tarifas;
   ponto sem tarifa fica "desconhecida" no app — nunca com valor inventado.

Nenhuma fonte confirma via, sentido em graus e acessos. Por isso todos os pontos entram com
"coordenadas_verificadas": false ou com regra de acesso pendente: o app os mostra como "possível pedágio",
fora do "total confirmado conhecido", até a conferência do mantenedor.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
from collections import defaultdict

from coleta_comum import (CONFIG, CURADOS, DADOS, Anomalia, avisar, baixar, cabecalho, executar, gravar_base,
                          hoje, ler_json, normalizar, uf_de)

CFG = CONFIG["antt"]
SP_CFG = CONFIG["semparar"]
APELIDOS = {
    "concessionaria": ("CONCESSIONARIA",),
    "nome": ("PRACA", "NOME PRACA", "NOME DA PRACA", "PRACA DE PEDAGIO", "NOME"),
    "rodovia": ("RODOVIA",),
    "uf": ("UF",),
    "km": ("KM", "KM M", "KM PRACA"),
    "sentido": ("SENTIDO",),
    "situacao": ("SITUACAO", "STATUS"),
    "lat": ("LATITUDE", "LAT"),
    "lon": ("LONGITUDE", "LON", "LONG"),
}
OBRIGATORIAS = {"concessionaria", "nome", "rodovia", "lat", "lon"}
COLUNAS_SEMPARAR = {"id_praca", "praca", "rodovia", "uf", "km", "sentidos_cobrados", "concessao", "latitude", "longitude"}


# ---------- utilidades ----------

def numero(v) -> float | None:
    t = str(v or "").strip()
    if not t:
        return None
    t = t.replace(",", ".") if t.count(",") == 1 and "." not in t else t.replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


def rodovia_padrao(texto: str, uf: str | None = None) -> str:
    t = normalizar(texto).replace(" ", "")
    m = re.match(r"^(BR|[A-Z]{2})-?(\d{2,3})", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r"^(\d{2,3})$", t)
    return f"BR-{m.group(1)}" if m else normalizar(texto)


def slug(*partes: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalizar(" ".join(partes)).lower()).strip("-")


def tolerancia_m(lat: float, lon: float) -> int:
    """Coordenada com poucas casas decimais é imprecisa (2 casas ≈ 1 km): o raio de busca cresce,
    mas o ponto só gera "possível pedágio", nunca cobrança confirmada."""
    casas = min(len(repr(lat).split(".")[1]) if "." in repr(lat) else 0, len(repr(lon).split(".")[1]) if "." in repr(lon) else 0)
    return {0: 5000, 1: 5000, 2: 1500, 3: 400}.get(casas, 150)


def distancia_m(a: dict, b: dict) -> float:
    k = math.cos(math.radians(a["lat"]))
    return math.hypot((a["lat"] - b["lat"]) * 110540, (a["lon"] - b["lon"]) * 111320 * k)


def decodificar(conteudo: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return conteudo.decode(enc)
        except UnicodeDecodeError:
            continue
    raise Anomalia("CSV com codificação desconhecida.")


def ler_csv_texto(texto: str) -> csv.DictReader:
    amostra = texto[:5000]
    delim = ";" if amostra.count(";") > amostra.count(",") else ","
    return csv.DictReader(io.StringIO(texto), delimiter=delim)


# ---------- Sem Parar ----------

def pontos_semparar(texto: str, url: str) -> list[dict]:
    leitor = ler_csv_texto(texto)
    faltam = COLUNAS_SEMPARAR - set(leitor.fieldnames or [])
    if faltam:
        raise Anomalia(f"CSV do Sem Parar sem as colunas {sorted(faltam)}. Colunas recebidas: {leitor.fieldnames}")
    pontos, invalidos, total = [], 0, 0
    for l in leitor:
        total += 1
        lat, lon = numero(l["latitude"]), numero(l["longitude"])
        if lat is None or lon is None or not (-34 <= lat <= 6 and -75 <= lon <= -28):
            invalidos += 1
            continue
        sentido = normalizar(l["sentidos_cobrados"]).lower() or "não informado"
        regras = [] if sentido == "ambos" else [f"Cobra só no sentido {sentido}: confira se é o seu."]
        if "BLOQUEIO" in normalizar(l["praca"]):
            regras.append("Praça de bloqueio: a cobrança depende do acesso usado.")
        tarifa_url = (l.get("url_tarifa_oficial") or "").strip()
        pontos.append({
            "id": f"semparar-{l['id_praca'].strip()}",
            "tipo": "free_flow" if re.search(r"FREE ?FLOW|PORTICO", normalizar(l["praca"])) else "praca",
            "nome": l["praca"].strip(),
            "rodovia": rodovia_padrao(l["rodovia"]),
            "uf": uf_de(l["uf"]),
            "municipio": (l.get("municipio") or "").strip(),
            "km": numero(l["km"]),
            "concessionaria": l["concessao"].strip(),
            "coordenadas": {"lat": lat, "lon": lon},
            "coordenadas_verificadas": False,
            "tolerancia_m": tolerancia_m(lat, lon),
            "sentido": "ambos",
            "sentido_texto": sentido,
            "regras_acesso": regras,
            "canal_pagamento": None,
            "url_tarifa_oficial": tarifa_url if re.match(r"^https://([a-z0-9-]+\.)*gov\.br/", tarifa_url) else None,
            "fonte": {"origem": f"{SP_CFG['credito']} ({url})", "coletado_em": hoje().isoformat(),
                      "atualizado_na_fonte": (l.get("atualizado_em") or "").strip() or None, "licenca": SP_CFG["licenca"]},
        })
    if total and invalidos / total > 0.2:
        raise Anomalia(f"{invalidos} de {total} praças do Sem Parar sem coordenadas válidas.")
    if len(pontos) < 100:
        raise Anomalia(f"Base do Sem Parar com só {len(pontos)} praças válidas.")
    return pontos


# ---------- ANTT ----------

def url_do_csv(resposta_ckan: dict) -> str:
    """Escolhe o recurso CSV mais recente do conjunto de dados."""
    recursos = [r for r in resposta_ckan.get("result", {}).get("resources", [])
                if str(r.get("format", "")).upper() == "CSV" or str(r.get("url", "")).lower().endswith(".csv")]
    if not recursos:
        raise Anomalia("O conjunto 'praca-de-pedagio' da ANTT não tem recurso CSV.")
    recursos.sort(key=lambda r: r.get("last_modified") or r.get("created") or "", reverse=True)
    return recursos[0]["url"]


def ler_csv(texto: str) -> tuple[list[dict], dict[str, str]]:
    leitor = ler_csv_texto(texto)
    mapa = {}
    for original in leitor.fieldnames or []:
        n = normalizar(original.replace("_", " "))
        for chave, aceitos in APELIDOS.items():
            if n in aceitos and chave not in mapa:
                mapa[chave] = original
    faltam = OBRIGATORIAS - mapa.keys()
    if faltam:
        raise Anomalia(f"CSV da ANTT sem as colunas {sorted(faltam)}. Colunas recebidas: {leitor.fieldnames}")
    return list(leitor), mapa


def pontos_antt(linhas: list[dict], mapa: dict[str, str], url: str) -> list[dict]:
    pontos, invalidos = {}, 0
    for l in linhas:
        g = lambda k: (l.get(mapa[k]) or "").strip() if k in mapa else ""  # noqa: E731
        if any(p in normalizar(g("situacao")) for p in ("DESATIV", "INATIV", "ENCERRAD")):
            continue
        lat, lon = numero(g("lat")), numero(g("lon"))
        if lat is None or lon is None or not (-34 <= lat <= 6 and -75 <= lon <= -28):
            invalidos += 1
            continue
        nome = g("nome")
        sentido_txt = normalizar(g("sentido")).lower() or "não informado"
        pid = "antt-" + slug(g("concessionaria"), nome, sentido_txt)
        pontos[pid] = {
            "id": pid, "tipo": "free_flow" if re.search(r"FREE ?FLOW|PORTICO", normalizar(nome)) else "praca",
            "nome": nome, "rodovia": rodovia_padrao(g("rodovia")), "uf": uf_de(g("uf")),
            "km": numero(g("km")), "concessionaria": g("concessionaria"),
            "coordenadas": {"lat": round(lat, 6), "lon": round(lon, 6)},
            "coordenadas_verificadas": True,
            "tolerancia_m": 150,
            "sentido": "ambos",
            "sentido_texto": sentido_txt,
            "regras_acesso": [f"Sentido de cobrança informado pela ANTT: {sentido_txt}. Converter para graus e conferir acessos antes de confirmar."],
            "canal_pagamento": None,
            "fonte": {"origem": f"ANTT — dados abertos, Praça de Pedágio ({url})", "coletado_em": hoje().isoformat(), "licenca": "CC BY"},
        }
    total = len(linhas)
    if total and invalidos / total > 0.2:
        raise Anomalia(f"{invalidos} de {total} praças da ANTT sem coordenadas válidas.")
    return list(pontos.values())


def juntar_antt(semparar: list[dict], antt: list[dict]) -> list[dict]:
    """Coordenadas oficiais da ANTT substituem as do Sem Parar na mesma praça; o resto da ANTT entra à parte."""
    usados = set()
    saida = []
    for p in semparar:
        p = dict(p)
        perto = [a for a in antt if a["rodovia"] == p["rodovia"] and a["id"] not in usados
                 and distancia_m(a["coordenadas"], p["coordenadas"]) <= CFG["distancia_mesma_praca_m"]]
        if perto:
            a = min(perto, key=lambda a: distancia_m(a["coordenadas"], p["coordenadas"]))
            usados.add(a["id"])
            p["coordenadas"] = a["coordenadas"]
            p["tolerancia_m"] = 150
            p["fonte"] = {**p["fonte"], "coordenadas": a["fonte"]["origem"]}
        saida.append(p)
    return saida + [a for a in antt if a["id"] not in usados]


# ---------- ARTESP: tabela oficial de tarifas das rodovias estaduais de SP ----------
ART = CONFIG["artesp"]
LINHA_TARIFA = re.compile(r"(SP-\s?\d{2,3})\s*(.+?)\s+(\d{2,3})\+(\d{3})\b.*?R\$\s?(\d{1,3},\d{2})")


def link_tabela_artesp(pagina_html: str, base: str) -> str:
    """Acha o link 'Valor Atual das Tarifas' na página da ARTESP (o endereço do arquivo muda a cada publicação)."""
    import html as _html
    from urllib.parse import urljoin
    for m in re.finditer(r'<a\b[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>', pagina_html, re.I | re.S):
        if normalizar(re.sub(r"<[^>]+>", " ", m.group(2))) == normalizar(ART["texto_link"]):
            return urljoin(base, _html.unescape(m.group(1)))
    raise Anomalia(f"Link '{ART['texto_link']}' não encontrado na página da ARTESP.")


def ler_tabela_artesp(texto: str) -> tuple[str, list[dict]]:
    """Do texto do PDF: data da tabela e, por praça, rodovia, nome, km e tarifa de carro de passeio."""
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", texto)
    if not m:
        raise Anomalia("Tabela da ARTESP sem data.")
    data = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    pracas = []
    for linha in texto.splitlines():
        t = LINHA_TARIFA.search(linha)
        if not t:
            continue
        valor = float(t.group(5).replace(",", "."))
        if not 0.5 <= valor <= 80:
            continue
        nome = re.sub(r"\s*\*\s*$", "", t.group(2)).strip()
        nome = re.sub(r"\b(COBRANÇA|TARIFA)\b.*$", "", nome, flags=re.I).strip()
        pracas.append({"rodovia": rodovia_padrao(t.group(1)), "nome": nome, "km": int(t.group(3)) + int(t.group(4)) / 1000, "automovel": valor})
    if len(pracas) < ART["minimo_linhas"]:
        raise Anomalia(f"Tabela da ARTESP com só {len(pracas)} praças lidas: o formato pode ter mudado.")
    return data, pracas


def tarifas_artesp(pracas: list[dict], data: str, pontos: list[dict], url: str) -> dict[str, list]:
    """Liga cada praça da ARTESP ao ponto da base na mesma rodovia e no km mais próximo (até 2,5 km)."""
    saida, usados = {}, set()
    ano = int(data[:4])
    reajuste = f"{ano + 1}-{ART['reajuste_anual']}"
    for pr in pracas:
        candidatos = [p for p in pontos if p["rodovia"] == pr["rodovia"] and p.get("km") is not None
                      and abs(p["km"] - pr["km"]) <= ART["distancia_km"] and p["id"] not in usados]
        if not candidatos:
            continue
        p = min(candidatos, key=lambda c: abs(c["km"] - pr["km"]))
        usados.add(p["id"])
        saida[p["id"]] = [{
            "inicio": data, "fim": None, "estado": "confirmada", "nivel_verificacao": "primaria",
            "categorias": {"automovel": pr["automovel"]},
            # A ARTESP reajusta todo 1º de julho: depois dessa data o valor pode estar velho.
            "revisar_desde": reajuste,
            "fonte": f"ARTESP — Valor Atual das Tarifas, tabela de {data[8:]}/{data[5:7]}/{data[:4]} ({url})",
        }]
    return saida


def juntar_tarifas(curadas: dict[str, list], oficiais: dict[str, list]) -> dict[str, list]:
    """Compatibilidade: duas fontes (curadoria e oficial) pela mesma regra da cadeia de fontes."""
    return escolher_tarifas([("oficial", oficiais), ("curadoria", curadas)])[0]


# Ordem de desempate quando duas fontes têm a mesma data de vigência (1ª opção, 2ª, 3ª…).
PRIORIDADE = {"oficial": 1, "pesquisa": 2, "imprensa": 3, "curadoria": 4}
NOME_FONTE = {"oficial": "tabela oficial", "pesquisa": "pesquisa enviada", "imprensa": "notícia", "curadoria": "base anterior (v5)"}


def escolher_tarifas(fontes: list[tuple[str, dict[str, list]]]) -> tuple[dict[str, list], dict[str, list]]:
    """
    Cadeia de fontes por praça: vale a tarifa confirmada MAIS RECENTE; empate pela ordem
    oficial → pesquisa → imprensa → base anterior. As outras viram "alternativas" (mostradas no app).
    Vigências "previstas" (anunciadas, sem publicação oficial) são mantidas à parte, como antes.
    Retorna (tarifas escolhidas, alternativas) por id.
    """
    candidatas: dict[str, list] = {}
    for tipo, mapa in fontes:
        for pid, vigs in (mapa or {}).items():
            for v in vigs:
                candidatas.setdefault(pid, []).append({**v, "tipo_fonte": v.get("tipo_fonte") or tipo})
    escolhidas, alternativas = {}, {}
    for pid, vigs in candidatas.items():
        confirmadas = [v for v in vigs if v.get("estado") == "confirmada" and v.get("categorias", {}).get("automovel") is not None]
        previstas = [v for v in vigs if v.get("estado") == "prevista"]
        confirmadas.sort(key=lambda v: (v.get("inicio") or "", -PRIORIDADE.get(v["tipo_fonte"], 9)), reverse=True)
        escolhidas[pid] = confirmadas[:1] + previstas
        outras = []
        vistos = {(confirmadas[0]["categorias"]["automovel"], confirmadas[0].get("inicio"))} if confirmadas else set()
        for v in confirmadas[1:]:
            chave = (v["categorias"]["automovel"], v.get("inicio"))
            if chave in vistos:  # mesmo valor e data da escolhida (ou de outra alternativa): não repete
                continue
            vistos.add(chave)
            outras.append({"valor": v["categorias"]["automovel"], "inicio": v.get("inicio"), "tipo_fonte": v["tipo_fonte"],
                           "fonte": NOME_FONTE.get(v["tipo_fonte"], v["tipo_fonte"])})
        if outras:
            alternativas[pid] = outras[:3]
    return escolhidas, alternativas


def url_tabela_artesp_dam(listagem: dict) -> str:
    """Escolhe, na coleção de arquivos da ARTESP, o PDF de tarifas atuais mais recente (sem histórico/encerrados)."""
    itens = [i for i in listagem.get("contents", [])
             if re.search(ART["nome_inclui"], i.get("name", ""), re.I) and not re.search(ART["nome_exclui"], i.get("name", ""), re.I)
             and "pdf" in str(i.get("mediaType", {}).get("mimeType", "")).lower()]
    if not itens:
        raise Anomalia("Nenhum PDF de tarifas atuais na coleção de arquivos da ARTESP.")
    item = max(itens, key=lambda i: i.get("updated", ""))
    return item["self"]


def coletar_artesp(pontos: list[dict]) -> dict[str, list]:
    from pypdf import PdfReader
    # A página da ARTESP monta o link por JavaScript; a API do repositório de arquivos (DAM) é estável.
    cab = {"Accept": "application/json"}
    try:
        listagem = json.loads(baixar(f"{ART['dam']}/collections/{ART['colecao']}/items?limit=100", cab).decode("utf-8"))
        item = url_tabela_artesp_dam(listagem)
        rend = json.loads(baixar(f"{ART['dam']}{item}/renditions", cab).decode("utf-8"))
        original = next((r for r in rend.get("contents", []) if r.get("renditionType") == "Original"), rend["contents"][0])
        url = f"{ART['dam']}{original['binaryUrl']}"
    except (KeyError, IndexError, ValueError) as e:
        raise Anomalia(f"Resposta inesperada da API de arquivos da ARTESP ({e}).") from e
    leitor = PdfReader(io.BytesIO(baixar(url)))
    data, pracas = ler_tabela_artesp("\n".join((p.extract_text() or "") for p in leitor.pages))
    oficiais = tarifas_artesp(pracas, data, pontos, url)
    if hoje().isoformat() >= f"{int(data[:4]) + 1}-{ART['reajuste_anual']}":  # já passou um reajuste anual
        avisar(f"Tabela da ARTESP ainda é de {data[8:]}/{data[5:7]}/{data[:4]}",
               "O reajuste anual (1º de julho) pode não estar publicado no arquivo 'Valor Atual das Tarifas'. O app mostra esses valores como 'pode ter reajuste'.")
    print(f"ARTESP: {len(pracas)} praças lidas, {len(oficiais)} ligadas a pontos da base (tabela de {data}).")
    return oficiais


# ---------- montagem ----------

def montar(pontos_base: list[dict], manuais: list[dict], tarifas: dict[str, list]) -> dict:
    por_id = {p["id"]: p for p in pontos_base}
    for p in manuais:
        if p.get("remover"):
            por_id.pop(p["id"], None)
            continue
        por_id[p["id"]] = {**por_id.get(p["id"], {}), **p}
    pontos = []
    for p in por_id.values():
        p = dict(p)
        p["vigencias"] = tarifas.get(p["id"], [])
        pontos.append(p)
    pontos.sort(key=lambda p: (p["rodovia"], p.get("km") or 0, p["id"]))
    cobertura = defaultdict(lambda: {"pontos_conhecidos": 0, "pontos_com_tarifa": 0})
    for p in pontos:
        c = cobertura[p["rodovia"]]
        c["pontos_conhecidos"] += 1
        if p["vigencias"]:
            c["pontos_com_tarifa"] += 1
    return {"pontos": pontos, "cobertura": [{"rodovia": r, **c} for r, c in sorted(cobertura.items())]}


def lista_para_pesquisa(pontos: list[dict], hoje_iso: str, dias_velho: int = 365) -> tuple[list[str], list[str]]:
    """Praças sem tarifa e praças com tarifa de mais de um ano: a lista a mandar para a pesquisa sob pedido."""
    from datetime import date, timedelta
    limite = (date.fromisoformat(hoje_iso) - timedelta(days=dias_velho)).isoformat()
    sem, velhas = [], []
    for p in pontos:
        rotulo = f"{p.get('uf') or ''} {p.get('nome') or p['id']} ({p['rodovia']}{' km ' + str(p['km']) if p.get('km') is not None else ''})".strip()
        confirmadas = [v for v in p.get("vigencias", []) if v.get("estado") == "confirmada"]
        if not confirmadas:
            sem.append(rotulo)
        elif max(v.get("inicio") or "" for v in confirmadas) < limite:
            velhas.append(f"{rotulo}: valor de {max(v.get('inicio') or '' for v in confirmadas)}")
    return sem, velhas


def conferir(novo: dict, anterior: dict) -> None:
    # Pesquisa sob pedido (decisão do projeto): o robô não pesquisa sozinho; avisa o que precisa ser pesquisado.
    sem, velhas = lista_para_pesquisa(novo["pontos"], hoje().isoformat())
    if sem or velhas:
        corpo = "Peça uma pesquisa de tarifas (ou envie uma planilha) para estas praças. Guia: docs/tarifas-pesquisa.md\n\n"
        if sem:
            corpo += f"Sem valor ({len(sem)}):\n" + "\n".join(f"* {s}" for s in sem[:60]) + ("\n* …" if len(sem) > 60 else "") + "\n\n"
        if velhas:
            corpo += f"Valor com mais de um ano ({len(velhas)}):\n" + "\n".join(f"* {s}" for s in velhas[:60]) + ("\n* …" if len(velhas) > 60 else "")
        avisar(f"Pedir pesquisa de tarifas — {hoje():%m/%Y}", corpo)
    antes, agora = len(anterior.get("pontos", [])), len(novo["pontos"])
    if antes and agora < antes * (1 - CFG["perda_maxima_pct"] / 100):
        raise Anomalia(f"A base passou de {antes} para {agora} pontos: queda acima de {CFG['perda_maxima_pct']}%.")
    ids = {p["id"] for p in novo["pontos"]}
    orfas = sorted(set(ler_json(CURADOS / "tarifas.json", {}).get("tarifas", {})) - ids)
    if orfas:
        avisar("Tarifas sem praça correspondente", "Ids em dados-curados/tarifas.json que não existem mais na base: " + ", ".join(orfas[:30]))
    limite = CONFIG.get("pedagio_cobertura_min_pct", 80)
    for c in novo["cobertura"]:
        if c["pontos_com_tarifa"] and c["pontos_com_tarifa"] / c["pontos_conhecidos"] * 100 < limite:
            avisar(f"Cobertura de tarifas abaixo de {limite}% na {c['rodovia']}",
                   f"{c['pontos_com_tarifa']} de {c['pontos_conhecidos']} pontos com tarifa.")
    # Variação suspeita de tarifa (Seção 5.6): sinaliza revisão, não prova erro.
    velhas = {p["id"]: p.get("vigencias", []) for p in anterior.get("pontos", [])}
    for p in novo["pontos"]:
        for v in p["vigencias"]:
            for v0 in velhas.get(p["id"], []):
                for cat, valor in v.get("categorias", {}).items():
                    a = v0.get("categorias", {}).get(cat)
                    if a and v.get("inicio") != v0.get("inicio") and abs(valor - a) / a > 0.15:
                        avisar(f"Variação de tarifa acima de 15% em {p['id']}", f"{cat}: {a} → {valor}. Conferir se é reajuste oficial.")


def coletar() -> bool:
    anterior = ler_json(DADOS / "pedagios.json", {})
    try:
        semparar = pontos_semparar(decodificar(baixar(SP_CFG["csv"])), SP_CFG["csv"])
    except ConnectionError as e:
        semparar = [p for p in anterior.get("pontos", []) if p["id"].startswith("semparar-")]
        if not semparar:
            raise
        print(f"⚠ Sem Parar indisponível ({e}); mantendo as praças já publicadas.")
    try:
        url = url_do_csv(json.loads(baixar(CFG["ckan"]).decode("utf-8")))
        linhas, mapa = ler_csv(decodificar(baixar(url)))
        antt = pontos_antt(linhas, mapa, url)
    except ConnectionError as e:
        antt = []
        print(f"⚠ ANTT indisponível ({e}); seguindo só com o Sem Parar.")
    manuais = ler_json(CURADOS / "pedagios-manuais.json", {}).get("pontos", [])
    curadoria = ler_json(CURADOS / "tarifas.json", {}).get("tarifas", {})
    pesquisa = ler_json(CURADOS / "pesquisa-pedagios.json", {}).get("tarifas", {})
    imprensa = ler_json(CURADOS / "tarifas-imprensa.json", {}).get("tarifas", {})
    base = juntar_antt(semparar, antt)
    try:
        oficiais = coletar_artesp(base)
    except (ConnectionError, Anomalia) as e:
        # Sem a tabela oficial: mantém as tarifas oficiais já publicadas, para não perder valores.
        oficiais = {p["id"]: [v for v in p.get("vigencias", []) if v.get("tipo_fonte") == "oficial"] for p in anterior.get("pontos", [])}
        oficiais = {k: v for k, v in oficiais.items() if v}
        avisar("Tabela da ARTESP não lida", f"{e}\n\nAs tarifas oficiais já publicadas foram mantidas.")
    for vigs in oficiais.values():
        for v in vigs:
            v["tipo_fonte"] = "oficial"
    tarifas, alternativas = escolher_tarifas([("oficial", oficiais), ("pesquisa", pesquisa), ("imprensa", imprensa), ("curadoria", curadoria)])
    corpo = montar(base, manuais, tarifas)
    for p in corpo["pontos"]:
        if p["id"] in alternativas:
            p["alternativas"] = alternativas[p["id"]]
    conferir(corpo, anterior)
    dados = cabecalho(f"{SP_CFG['credito']}; ANTT (coordenadas das praças federais); curadoria manual de tarifas e pontos",
                      hoje().isoformat(), CFG["validade_dias"])
    dados["cobertura_completa"] = False
    dados["creditos"] = [SP_CFG["credito"], "ANTT — dados abertos (CC BY)"]
    dados.update(corpo)
    return gravar_base("pedagios.json", dados)


if __name__ == "__main__":
    raise SystemExit(executar("pedagios", coletar))
