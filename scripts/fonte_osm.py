# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
"""Praças e tarifas de pedágio do Brasil inteiro vindas do OpenStreetMap (ODbL 1.0).

O OpenStreetMap tem as cabines de pedágio de todos os estados (barrier=toll_booth e highway=toll_gantry),
quase todas com a tarifa (charge=... BRL/motorcar) e a data em que alguém conferiu (check_date).
É fonte da comunidade: o valor entra como "secundário", com a data da conferência, e só vale quando não
há valor oficial, de pesquisa ou de notícia com menos de um ano para a mesma praça.

Passos:
1. Cabines a menos de 700 m, na mesma rodovia e com a mesma tarifa viram uma praça.
2. Cabines da praça viradas para lados opostos: cobra nos dois sentidos ("ambos"). Todas para o mesmo
   lado: cobra só nesse rumo (graus), e o app só conta quando o carro passa nesse rumo.
3. A rodovia vem da via em que a cabine está (ref BR-xxx / UF-xxx); o município e a UF vêm da malha do IBGE.
4. Praça a menos de 1,5 km de uma praça da base principal é a mesma praça: só empresta a tarifa (e a
   coordenada, se a da base for imprecisa). Praça a menos de 2,5 km de uma da base que já foi ligada
   também é a mesma: nunca entra de novo (o pedágio seria somado em dobro).
"""
from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import date, timedelta

LICENCA = "ODbL 1.0"
CREDITO = "© colaboradores do OpenStreetMap (ODbL 1.0)"
CONSULTA_CABINES = ('[out:json][timeout:180];area["ISO3166-1"="BR"][admin_level=2]->.br;'
                    '(node["barrier"="toll_booth"](area.br);way["barrier"="toll_booth"](area.br);'
                    'node["highway"="toll_gantry"](area.br););out center meta;')
CONSULTA_VIAS = ('[out:json][timeout:240];area["ISO3166-1"="BR"][admin_level=2]->.br;'
                 '(node["barrier"="toll_booth"](area.br);node["highway"="toll_gantry"](area.br);)->.t;'
                 'way(bn.t)["highway"];out body;')
CONSULTA_VIAS_PERTO = ('[out:json][timeout:280];area["ISO3166-1"="BR"][admin_level=2]->.br;'
                       '(node["barrier"="toll_booth"](area.br);way["barrier"="toll_booth"](area.br);'
                       'node["highway"="toll_gantry"](area.br);)->.t;way(around.t:60)["highway"]["ref"];out tags geom;')
VIAS_DE_ESTRADA = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
                   "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
# Cobranças que não são pedágio de estrada por passagem (taxa de turismo, estacionamento, condomínio).
NAO_E_PEDAGIO = re.compile(r"\bTPA\b|PRESERVA[CÇ][AÃ]O AMBIENTAL|ESTACIONAMENTO|PARKING|CONDOM[IÍ]NIO|ASSOCIA[CÇ][AÃ]O", re.I)
DIST_PRACA_M = 700
DIST_MESMA_DA_BASE_M = 1500
DIST_ABSORVER_M = 2500


def distancia_m(a, b) -> float:
    k = math.cos(math.radians(a[0]))
    return math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * k)


def diferenca_angular(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def tarifa_carro(charge: str) -> float | None:
    """'4.20BRL/motorcar;0.00BRL/motorcycle' -> 4.2. Sem valor para carro: None."""
    for parte in str(charge or "").split(";"):
        m = re.match(r"\s*(\d+(?:[.,]\d+)?)\s*BRL\s*/\s*(motorcar|car|vehicle|motor_vehicle)\b", parte.strip(), re.I)
        if m:
            v = float(m.group(1).replace(",", "."))
            return v if 0 <= v <= 150 else None
    return None


def rumo(tags: dict) -> float | None:
    """Rumo de quem passa pela cabine e paga. No OpenStreetMap do Brasil, "direction" da cabine aponta
    para o lado de onde o carro vem (a cabine "olha" para o trânsito): conferido em 17 de 17 praças de
    sentido único da base do Sem Parar. Por isso o rumo de viagem é o oposto (+180°)."""
    t = str(tags.get("direction") or "").strip()
    cardeais = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}
    if re.fullmatch(r"\d{1,3}(\.\d+)?", t):
        graus = float(t)
    elif t.upper() in cardeais:
        graus = float(cardeais[t.upper()])
    else:
        return None
    return (graus + 180) % 360


def _dist_segmento_m(p, a, b) -> float:
    k = math.cos(math.radians(p[0]))
    ax, ay = (a[1] - p[1]) * 111320 * k, (a[0] - p[0]) * 110540
    bx, by = (b[1] - p[1]) * 111320 * k, (b[0] - p[0]) * 110540
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    return math.hypot(ax + t * dx, ay + t * dy)


class ViasPerto:
    """Rodovia mais próxima (até 60 m) para cabines desenhadas fora da linha da pista."""
    def __init__(self, vias_geom: dict):
        self.vias = []
        for w in vias_geom.get("elements", []):
            r = ref_rodovia(w.get("tags", {}).get("ref"))
            g = w.get("geometry") or []
            if r and len(g) >= 2:
                pts = [(x["lat"], x["lon"]) for x in g]
                self.vias.append((min(p[0] for p in pts) - .001, max(p[0] for p in pts) + .001,
                                  min(p[1] for p in pts) - .001, max(p[1] for p in pts) + .001, pts, r))

    def rodovia(self, lat: float, lon: float, limite_m: float = 60) -> str | None:
        melhor = None
        for y0, y1, x0, x1, pts, r in self.vias:
            if not (y0 <= lat <= y1 and x0 <= lon <= x1):
                continue
            d = min(_dist_segmento_m((lat, lon), pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            if d <= limite_m and (melhor is None or (d, not r.startswith("BR-")) < (melhor[0], not melhor[1].startswith("BR-"))):
                melhor = (d, r)
        return melhor[1] if melhor else None


def ref_rodovia(ref: str) -> str | None:
    for parte in re.split(r"[;,/]", str(ref or "")):
        m = re.match(r"^\s*([A-Z]{2,4})[- ]?(\d{2,3})\b", parte.strip().upper())
        if m:
            return f"{m.group(1)}-{int(m.group(2)):03d}"
    return None


def rodovias_das_cabines(vias: dict) -> dict[int, str]:
    """Nó da cabine -> rodovia (BR primeiro), pelas vias que passam pela cabine."""
    saida: dict[int, list[str]] = defaultdict(list)
    for w in vias.get("elements", []):
        if w.get("type") != "way":
            continue
        t = w.get("tags", {})
        r = ref_rodovia(t.get("ref")) or ref_rodovia(t.get("official_ref"))
        tipo_ok = t.get("highway") in VIAS_DE_ESTRADA
        for n in w.get("nodes", []):
            saida[n].append((r, tipo_ok))
    final = {}
    for n, lista in saida.items():
        refs = [r for r, _ in lista if r]
        refs.sort(key=lambda r: (not r.startswith("BR-"), r))
        final[n] = {"rodovia": refs[0] if refs else None, "estrada": any(ok for _, ok in lista)}
    return final


def cabines(dados: dict, vias_por_no: dict, perto: ViasPerto | None = None) -> list[dict]:
    lista = []
    for e in dados.get("elements", []):
        t = e.get("tags", {})
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lon = e.get("lon", e.get("center", {}).get("lon"))
        if lat is None or lon is None or not (-34 <= lat <= 6 and -75 <= lon <= -28):
            continue
        if t.get("access") in ("private", "no") or NAO_E_PEDAGIO.search(" ".join([t.get("operator", ""), t.get("name", ""), t.get("note", "")])):
            continue
        via = vias_por_no.get(e["id"]) if e["type"] == "node" else None
        if via is not None and not via["estrada"]:
            continue  # cabine em estacionamento ou via de serviço
        lista.append({
            "osm": f"{e['type'][0]}{e['id']}", "lat": lat, "lon": lon, "tags": t,
            "valor": tarifa_carro(t.get("charge")), "rumo": rumo(t),
            "rodovia": (via or {}).get("rodovia") or (perto.rodovia(lat, lon) if perto else None), "gantry": t.get("highway") == "toll_gantry",
            "data": (t.get("check_date") or "")[:10] if re.match(r"\d{4}-\d{2}-\d{2}", t.get("check_date") or "") else (e.get("timestamp") or "")[:10],
            "conferida": bool(re.match(r"\d{4}-\d{2}-\d{2}", t.get("check_date") or "")),
        })
    return lista


def agrupar(lista: list[dict]) -> list[dict]:
    """Cabines vizinhas da mesma rodovia e com a mesma tarifa formam uma praça."""
    grupos: list[dict] = []
    for c in sorted(lista, key=lambda c: c["osm"]):
        for g in grupos:
            if (g["valor"] == c["valor"] and (g["rodovia"] == c["rodovia"] or not g["rodovia"] or not c["rodovia"])
                    and any(distancia_m((x["lat"], x["lon"]), (c["lat"], c["lon"])) <= DIST_PRACA_M for x in g["cabines"])):
                g["cabines"].append(c)
                g["rodovia"] = g["rodovia"] or c["rodovia"]
                break
        else:
            grupos.append({"cabines": [c], "valor": c["valor"], "rodovia": c["rodovia"]})
    for g in grupos:
        cs = g["cabines"]
        g["lat"] = round(sum(c["lat"] for c in cs) / len(cs), 6)
        g["lon"] = round(sum(c["lon"] for c in cs) / len(cs), 6)
        rumos = [c["rumo"] for c in cs if c["rumo"] is not None]
        opostos = any(diferenca_angular(a, b) > 120 for a in rumos for b in rumos)
        if rumos and not opostos and len(rumos) == len(cs):
            # média circular dos rumos
            x = sum(math.cos(math.radians(r)) for r in rumos); y = sum(math.sin(math.radians(r)) for r in rumos)
            g["sentido"] = round(math.degrees(math.atan2(y, x)) % 360)
        else:
            g["sentido"] = "ambos"
        conferidas = [c for c in cs if c["conferida"]]
        g["data"] = max(c["data"] for c in (conferidas or cs)) or None
        g["conferida"] = bool(conferidas)
        g["gantry"] = all(c["gantry"] for c in cs)
        t = cs[0]["tags"]
        g["nome"] = next((c["tags"].get(k) for c in cs for k in ("name", "note") if c["tags"].get(k)), None)
        g["operadora"] = next((c["tags"].get("operator") for c in cs if c["tags"].get("operator")), None)
        g["site"] = next((c["tags"].get("website") for c in cs if c["tags"].get("website")), None)
        g["id"] = "osm-" + min(c["osm"] for c in cs)
    # Cabine desenhada duas vezes no mesmo lugar e no mesmo sentido (ex.: uma antiga, com valor velho):
    # fica só a conferida mais recentemente, para não cobrar em dobro.
    def compativeis(a, b):
        if a["sentido"] == "ambos" or b["sentido"] == "ambos":
            return True
        return diferenca_angular(a["sentido"], b["sentido"]) <= 60
    finais: list[dict] = []
    for g in sorted(grupos, key=lambda g: g["data"] or "", reverse=True):
        if any(distancia_m((g["lat"], g["lon"]), (f["lat"], f["lon"])) <= 60 and compativeis(g, f) for f in finais):
            continue
        finais.append(g)
    return sorted(finais, key=lambda g: g["id"])


# ---------- IBGE: município e UF de cada praça ----------

def _aneis(geom: dict):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        yield from geom["coordinates"]


def _dentro(lon: float, lat: float, poligono) -> bool:
    def no_anel(anel):
        dentro = False
        j = len(anel) - 1
        for i in range(len(anel)):
            xi, yi = anel[i][0], anel[i][1]; xj, yj = anel[j][0], anel[j][1]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                dentro = not dentro
            j = i
        return dentro
    return no_anel(poligono[0]) and not any(no_anel(b) for b in poligono[1:])


class Municipios:
    def __init__(self, malha: dict, nomes: list[dict]):
        self.nome = {}
        for m in nomes:
            uf = (((m.get("microrregiao") or {}).get("mesorregiao") or {}).get("UF") or {}).get("sigla") \
                or (((m.get("regiao-imediata") or {}).get("regiao-intermediaria") or {}).get("UF") or {}).get("sigla")
            self.nome[str(m["id"])] = (m["nome"], uf)
        self.areas = []
        for f in malha["features"]:
            cod = str(f["properties"].get("codarea"))
            for pol in _aneis(f["geometry"]):
                xs = [p[0] for p in pol[0]]; ys = [p[1] for p in pol[0]]
                self.areas.append((min(xs), max(xs), min(ys), max(ys), pol, cod))

    def onde(self, lat: float, lon: float) -> tuple[str | None, str | None]:
        for x0, x1, y0, y1, pol, cod in self.areas:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and _dentro(lon, lat, pol):
                return self.nome.get(cod, (None, None))
        return None, None


# ---------- junção com a base principal ----------

def tarifa_osm(g: dict, hoje_iso: str) -> list[dict]:
    if g["valor"] is None:
        return []
    quando = g["data"] or hoje_iso
    texto = "conferida em" if g["conferida"] else "editada em"
    return [{
        "inicio": quando, "fim": None, "estado": "confirmada", "nivel_verificacao": "secundaria",
        "categorias": {"automovel": g["valor"]},
        "fonte": f"OpenStreetMap — {g['operadora'] or 'concessionária não informada'}, tarifa {texto} {quando[8:]}/{quando[5:7]}/{quando[:4]} ({CREDITO})",
        "tipo_fonte": "comunidade",
    }]


def juntar(base: list[dict], grupos: list[dict], municipios: Municipios | None, hoje_iso: str, anteriores: dict | None = None):
    """Devolve (pontos novos, tarifas por id, coordenadas melhores por id)."""
    anteriores = anteriores or {}
    pares = []
    for gi, g in enumerate(grupos):
        for p in base:
            d = distancia_m((g["lat"], g["lon"]), (p["coordenadas"]["lat"], p["coordenadas"]["lon"]))
            if d <= max(DIST_MESMA_DA_BASE_M, p.get("tolerancia_m") or 0):  # coordenada imprecisa: raio maior
                # Rodovias diferentes (ex.: Anhanguera × Bandeirantes em Limeira) só se ligam se não houver par melhor.
                outra_rodovia = bool(g["rodovia"] and p.get("rodovia") and g["rodovia"] != p["rodovia"])
                pares.append((d + (5000 if outra_rodovia else 0), gi, p["id"]))
    pares.sort()
    ligado_grupo, ligado_ponto = {}, set()
    for d, gi, pid in pares:
        if gi in ligado_grupo or pid in ligado_ponto:
            continue
        ligado_grupo[gi] = pid
        ligado_ponto.add(pid)
    tarifas, coords, novos = {}, {}, []
    por_id = {p["id"]: p for p in base}
    # Segunda chance: ponto da base com coordenada suspeita (colada em outra praça ou imprecisa) e ainda sem
    # par se liga à cabine do mapa na MESMA rodovia e da mesma concessionária, até 15 km. Ex.: a base punha
    # "Limeira (Anhanguera)" no lugar da praça da Bandeirantes; a do mapa está 8 km adiante, na SP-330.
    def suspeito(p):
        if (p.get("tolerancia_m") or 150) > 150:
            return True
        return any(q is not p and distancia_m((q["coordenadas"]["lat"], q["coordenadas"]["lon"]),
                                              (p["coordenadas"]["lat"], p["coordenadas"]["lon"])) <= 200 for q in base)

    def mesma_empresa(a: str, b: str) -> bool:
        pa = {w for w in re.findall(r"[a-z0-9]{3,}", (a or "").lower()) if w not in {"ccr", "motiva", "concessionaria", "rodovias", "via"}}
        pb = {w for w in re.findall(r"[a-z0-9]{3,}", (b or "").lower()) if w not in {"ccr", "motiva", "concessionaria", "rodovias", "via"}}
        return bool(pa & pb)
    for gi, g in enumerate(grupos):
        if gi in ligado_grupo or not g["rodovia"]:
            continue
        cands = [(distancia_m((g["lat"], g["lon"]), (p["coordenadas"]["lat"], p["coordenadas"]["lon"])), p["id"]) for p in base
                 if p["id"] not in ligado_ponto and p.get("rodovia") == g["rodovia"] and mesma_empresa(g["operadora"], p.get("concessionaria")) and suspeito(p)]
        cands = [c for c in cands if c[0] <= 15000]
        if cands:
            _, pid = min(cands)
            ligado_grupo[gi] = pid
            ligado_ponto.add(pid)
            coords[pid] = {"lat": g["lat"], "lon": g["lon"]}
    for gi, g in enumerate(grupos):
        if gi in ligado_grupo:
            pid = ligado_grupo[gi]
            if g["valor"] is not None:
                tarifas[pid] = tarifa_osm(g, hoje_iso)
            # A cabine do mapa é mais precisa: troca a coordenada se a da base é imprecisa ou se as duas
            # estão na mesma rodovia (a base às vezes repete a mesma coordenada para praças vizinhas).
            if (por_id[pid].get("tolerancia_m") or 150) > 150 or (g["rodovia"] and g["rodovia"] == por_id[pid].get("rodovia")):
                coords[pid] = {"lat": g["lat"], "lon": g["lon"]}
            continue
        perto_da_base = any(distancia_m((g["lat"], g["lon"]), (p["coordenadas"]["lat"], p["coordenadas"]["lon"]))
                            <= max(DIST_ABSORVER_M, (p.get("tolerancia_m") or 0) + 1000) for p in base)
        if perto_da_base:
            continue  # quase certamente a mesma praça (outra pista, outro lado): não entra de novo
        if g["valor"] is None and not g["gantry"]:
            continue  # sem tarifa e sem certeza de que é estrada pedagiada: não vira "possível pedágio"
        municipio, uf = municipios.onde(g["lat"], g["lon"]) if municipios else (None, None)
        if not municipio and g["id"] in anteriores:
            municipio, uf = anteriores[g["id"]].get("municipio"), anteriores[g["id"]].get("uf")
        sentido_txt = "ambos" if g["sentido"] == "ambos" else f"rumo {g['sentido']}° (OpenStreetMap)"
        novos.append({
            "id": g["id"], "tipo": "free_flow" if g["gantry"] else "praca",
            "nome": g["nome"] or (f"Praça de {municipio}" if municipio else "Praça de pedágio"),
            "rodovia": g["rodovia"] or "Rodovia sem número", "uf": uf, "municipio": municipio or "", "km": None,
            "concessionaria": g["operadora"] or "",
            "coordenadas": {"lat": g["lat"], "lon": g["lon"]}, "coordenadas_verificadas": False, "tolerancia_m": 150,
            "sentido": g["sentido"], "sentido_texto": sentido_txt,
            "regras_acesso": [] if g["sentido"] == "ambos" else ["Cobra só em um sentido (pelo rumo das cabines no OpenStreetMap): confira se é o seu."],
            "canal_pagamento": None, "url_tarifa_oficial": None,
            "fonte": {"origem": f"OpenStreetMap, cabines {', '.join(c['osm'] for c in g['cabines'][:6])} ({CREDITO})",
                      "coletado_em": hoje_iso, "licenca": LICENCA},
        })
        if g["valor"] is not None:
            tarifas[g["id"]] = tarifa_osm(g, hoje_iso)
    return novos, tarifas, coords


def filtrar_comunidade(osm: dict[str, list], outras: list[dict[str, list]], hoje_iso: str) -> dict[str, list]:
    """A tarifa da comunidade só entra onde não há valor oficial, de pesquisa ou de notícia com menos de um ano."""
    limite = (date.fromisoformat(hoje_iso) - timedelta(days=365)).isoformat()
    saida = {}
    for pid, vigs in osm.items():
        recente = any(v.get("estado") == "confirmada" and (v.get("inicio") or "") >= limite
                      for mapa in outras for v in (mapa or {}).get(pid, []))
        if not recente:
            saida[pid] = vigs
    return saida
