# © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
"""Testes dos coletores sem rede: python -m unittest discover -s testes/coletores -v"""
import json
import os
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
os.environ["DATA_HOJE"] = "2026-11-23"

import coleta_comum  # noqa: E402
from atualizar_anp import PADRAO_POSTOS, achar_links, conferir_variacao, extrair_precos, precos_por_municipio  # noqa: E402
from atualizar_feriados import feriados_do_ano, gerar as gerar_feriados, pascoa  # noqa: E402
from atualizar_pedagios import (juntar_antt, ler_csv, montar, pontos_antt, pontos_semparar, rodovia_padrao,  # noqa: E402
                                tolerancia_m, url_do_csv)
from verificar_rodizio import periodo_sensivel, regras_a_revisar, suspensoes_validas  # noqa: E402
from validar_dados import validar  # noqa: E402

Anomalia = coleta_comum.Anomalia
ESQUEMAS = Path(coleta_comum.SITE) / "esquemas"


def esquema(nome):
    return json.loads((ESQUEMAS / f"{nome}.schema.json").read_text(encoding="utf-8"))


class Feriados(unittest.TestCase):
    def test_pascoa(self):
        self.assertEqual(pascoa(2026), date(2026, 4, 5))
        self.assertEqual(pascoa(2027), date(2027, 3, 28))
        self.assertEqual(pascoa(2024), date(2024, 3, 31))

    def test_moveis_e_fixos(self):
        regras = [{"nome": "Corpus Christi", "pascoa": 60, "jurisdicao": "São Paulo/SP"}, {"nome": "Natal", "dia": "12-25", "jurisdicao": "nacional"}]
        self.assertEqual([f["data"] for f in feriados_do_ano(2026, regras)], ["2026-06-04", "2026-12-25"])

    def test_base_gerada_passa_no_esquema(self):
        d = gerar_feriados()
        self.assertEqual(validar(d, esquema("feriados")), [])
        datas = {f["data"] for f in d["feriados"]}
        self.assertIn("2026-04-03", datas)
        self.assertIn("2027-03-26", datas)
        self.assertLessEqual(d["validade"], "2027-12-31")


PAGINA = """
<a href="/anp/pt-br/x/resumo_semanal_lpc_2026-11-01_2026-11-07.xlsx">semana</a>
<a href="https://www.gov.br/anp/y/resumo_semanal_lpc_2026_11_08-2026_11_14.xlsx/@@download/file">semana</a>
<a href="/outro/revendas_lpc_2026-11-08_2026-11-14.xlsx">por posto</a>
"""
CAB = ("DATA INICIAL", "DATA FINAL", "ESTADO", "PRODUTO", "NÚMERO DE POSTOS PESQUISADOS", "UNIDADE DE MEDIDA", "PREÇO MÉDIO REVENDA")
NOMES_UF = ["ACRE", "ALAGOAS", "AMAPA", "AMAZONAS", "BAHIA", "CEARA", "DISTRITO FEDERAL", "ESPIRITO SANTO", "GOIAS", "MARANHAO",
            "MATO GROSSO", "MATO GROSSO DO SUL", "MINAS GERAIS", "PARA", "PARAIBA", "PARANA", "PERNAMBUCO", "PIAUI", "RIO DE JANEIRO",
            "RIO GRANDE DO NORTE", "RIO GRANDE DO SUL", "RONDONIA", "RORAIMA", "SANTA CATARINA", "SAO PAULO", "SERGIPE", "TOCANTINS"]


def planilha(preco_sp_gasolina=6.29):
    linhas = [("Levantamento de preços",), (), CAB]
    for uf in NOMES_UF:
        for prod, p in (("GASOLINA COMUM", 6.4), ("ETANOL HIDRATADO", 4.5), ("OLEO DIESEL S10", 6.1), ("GLP", 110.0)):
            if uf == "SAO PAULO" and prod == "GASOLINA COMUM":
                p = preco_sp_gasolina
            linhas.append(("08/11/2026", "14/11/2026", uf, prod, 100, "R$/l", f"{p:.2f}".replace(".", ",")))
    return linhas


class ANP(unittest.TestCase):
    def test_links_nos_dois_formatos_de_nome(self):
        links = achar_links(PAGINA, "https://www.gov.br/anp/pt-br/pagina")
        self.assertEqual(len(links), 2)
        self.assertEqual(links[0][1], date(2026, 11, 14))
        self.assertTrue(links[1][2].startswith("https://www.gov.br/anp/pt-br/x/"))

    def test_extrai_precos_por_uf(self):
        p = extrair_precos(planilha(), date(2026, 11, 8), date(2026, 11, 14), "u")
        self.assertEqual(len(p), 27 * 3)  # GLP é ignorado
        sp = next(x for x in p if x["uf"] == "SP" and x["combustivel"] == "Gasolina comum")
        self.assertAlmostEqual(sp["preco"], 6.29)
        self.assertEqual(sp["periodo_inicio"], "2026-11-08")
        base = coleta_comum.cabecalho("ANP", "2026-11-14", 10)
        base["precos"] = p
        self.assertEqual(validar(base, esquema("anp")), [])

    def test_layout_mudado_e_preco_absurdo_viram_anomalia(self):
        with self.assertRaises(Anomalia):
            extrair_precos([("A", "B", "C")] * 5, date(2026, 11, 8), date(2026, 11, 14), "u")
        with self.assertRaises(Anomalia):
            extrair_precos(planilha(preco_sp_gasolina=62.9), date(2026, 11, 8), date(2026, 11, 14), "u")

    def test_preco_medio_por_cidade(self):
        cab = ("CNPJ", "RAZÃO", "MUNICÍPIO", "ESTADO", "PRODUTO", "UNIDADE DE MEDIDA", "PREÇO DE REVENDA")
        linhas = [("Levantamento",), cab]
        for i in range(210):  # 210 cidades fictícias para passar do mínimo
            linhas.append((i, "Posto", f"CIDADE {i}", "SAO PAULO", "ETANOL", "R$/l", 4.0))
        linhas += [(1, "A", "CAMPINAS", "SAO PAULO", "ETANOL", "R$/l", 4.10), (2, "B", "Campinas", "SAO PAULO", "ETANOL", "R$/l", 4.20),
                   (3, "C", "CAMPINAS", "SAO PAULO", "GLP", "R$/13kg", 110), (4, "D", "CAMPINAS", "SAO PAULO", "ETANOL", "R$/l", 41.0)]
        r = {(p["chave"], p["combustivel"]): p for p in precos_por_municipio(linhas)}
        self.assertAlmostEqual(r[("CAMPINAS", "Etanol")]["preco"], 4.15)  # o preço absurdo (41) é descartado
        self.assertEqual(r[("CAMPINAS", "Etanol")]["postos"], 2)
        with self.assertRaises(Anomalia):
            precos_por_municipio(linhas[:20])

    def test_links_de_postos_e_nome_com_hifen(self):
        pagina = '<a href="/x/revendas_lpc_2026_11_08-2026_11_14.xlsx">p</a><a href="/x/resumo-semanal-lpc-2026-11-08-2026-11-14.xlsx">r</a>'
        self.assertEqual(len(achar_links(pagina, "https://www.gov.br/anp/")), 1)
        self.assertEqual(len(achar_links(pagina, "https://www.gov.br/anp/", PADRAO_POSTOS)), 1)

    def test_variacao_acima_do_limite(self):
        antes = [{"uf": "SP", "combustivel": "Etanol", "preco": 4.0}]
        conferir_variacao([{"uf": "SP", "combustivel": "Etanol", "preco": 4.5}], antes)
        with self.assertRaises(Anomalia):
            conferir_variacao([{"uf": "SP", "combustivel": "Etanol", "preco": 6.0}], antes)


CSV_ANTT = """concessionaria;praca;rodovia;uf;km_m;sentido;situacao;latitude;longitude
ECOVIA X;Praça Um;BR-116;SP;100,5;Crescente;Ativa;-23,40;-46,50
ECOVIA X;Praça Dois;116;SP;150;Decrescente;Desativada;-23,10;-46,20
ECOVIA X;Pórtico Free Flow;BR-101;RJ;10;Ambos;Ativa;-22,90;-43,20
"""


class Pedagios(unittest.TestCase):
    def test_ckan_escolhe_csv_mais_recente(self):
        r = {"result": {"resources": [{"format": "CSV", "url": "a.csv", "last_modified": "2026-01-01"},
                                      {"format": "PDF", "url": "d.pdf"},
                                      {"format": "csv", "url": "b.csv", "last_modified": "2026-03-30"}]}}
        self.assertEqual(url_do_csv(r), "b.csv")

    def test_csv_com_apelidos_e_situacao(self):
        linhas, mapa = ler_csv(CSV_ANTT)
        pontos = pontos_antt(linhas, mapa, "u")
        self.assertEqual(len(pontos), 2)  # desativada sai
        um = next(p for p in pontos if "um" in p["id"])
        self.assertEqual(um["rodovia"], "BR-116")
        self.assertEqual(um["coordenadas"], {"lat": -23.4, "lon": -46.5})
        # A ANTT diz "Crescente": cobra só nesse sentido. Sem graus, o app decide pela ordem das praças.
        self.assertEqual(um["sentido_texto"], "crescente")
        self.assertEqual(um["sentido"], "ambos")
        self.assertTrue(um["regras_acesso"])  # fica "possível" no app até a conferência do sentido
        self.assertEqual(next(p for p in pontos if "free" in p["id"])["tipo"], "free_flow")

    def test_colunas_faltando(self):
        with self.assertRaises(Anomalia):
            ler_csv("a;b\n1;2\n")

    def test_tarifa_curada_e_ponto_sem_tarifa(self):
        linhas, mapa = ler_csv(CSV_ANTT)
        antt = pontos_antt(linhas, mapa, "u")
        tid = antt[0]["id"]
        v = [{"inicio": "2026-01-01", "fim": None, "estado": "confirmada", "nivel_verificacao": "primaria", "categorias": {"automovel": 9.9}}]
        corpo = montar(antt, [], {tid: v})
        self.assertEqual(next(p for p in corpo["pontos"] if p["id"] == tid)["vigencias"], v)
        self.assertTrue(any(p["vigencias"] == [] for p in corpo["pontos"]))
        base = coleta_comum.cabecalho("x", None, 45)
        base.update(corpo, cobertura_completa=False)
        self.assertEqual(validar(base, esquema("pedagios")), [])

    def test_rodovia(self):
        self.assertEqual(rodovia_padrao("SP 160", "SP"), "SP-160")
        self.assertEqual(rodovia_padrao("116", "PR"), "BR-116")


def csv_semparar(n=120):
    cab = "id_praca,praca,rodovia,uf,municipio,km,sentidos_cobrados,concessao,url_tarifa_oficial,latitude,longitude,atualizado_em\n"
    linhas = [
        'S045,Piratininga,SP-160,SP,São Bernardo do Campo,32.381,sul,Ecovias dos Imigrantes,https://www.artesp.sp.gov.br/x,-23.820826,-46.582601,2026-11-09',
        'F001,Moreira César,BR-116,SP,Pindamonhangaba,87,ambos,RioSP,https://www.gov.br/antt/x,-22.93,-45.36,2026-11-09',
        'S042,Diadema (bloqueio),SP-160,SP,Diadema,15.9,sul,Ecovias,https://exemplo.com/x,-23.681683,-46.61108,2026-11-09',
    ]
    linhas += [f"X{i:03d},Praça {i},BR-101,SC,Cidade,{i},ambos,Conc,,-27.{i:03d}123,-48.{i:03d}456,2026-11-09" for i in range(n)]
    return cab + "\n".join(linhas) + "\n"


class SemParar(unittest.TestCase):
    def test_le_base_e_marca_pendencias(self):
        pontos = {p["id"]: p for p in pontos_semparar(csv_semparar(), "u")}
        pir = pontos["semparar-S045"]
        self.assertFalse(pir["coordenadas_verificadas"])
        self.assertIn("sentido sul", pir["regras_acesso"][0])
        self.assertEqual(pir["tolerancia_m"], 150)
        self.assertEqual(pir["url_tarifa_oficial"], "https://www.artesp.sp.gov.br/x")
        self.assertEqual(pontos["semparar-F001"]["tolerancia_m"], 1500)  # 2 casas decimais
        self.assertEqual(pontos["semparar-F001"]["regras_acesso"], [])
        bloq = pontos["semparar-S042"]
        self.assertTrue(any("bloqueio" in r for r in bloq["regras_acesso"]))
        self.assertIsNone(bloq["url_tarifa_oficial"])  # link fora de gov.br é descartado

    def test_base_pequena_ou_sem_colunas(self):
        with self.assertRaises(Anomalia):
            pontos_semparar(csv_semparar(n=10), "u")
        with self.assertRaises(Anomalia):
            pontos_semparar("a,b\n1,2\n", "u")

    def test_tolerancia(self):
        self.assertEqual(tolerancia_m(-23.820826, -46.582601), 150)
        self.assertEqual(tolerancia_m(-23.821, -46.583), 400)
        self.assertEqual(tolerancia_m(-22.93, -45.36), 1500)

    def test_antt_corrige_coordenadas_da_mesma_praca(self):
        sp = pontos_semparar(csv_semparar(), "u")
        antt = [{"id": "antt-x", "rodovia": "BR-116", "coordenadas": {"lat": -22.9351, "lon": -45.3612},
                 "fonte": {"origem": "ANTT"}}, {"id": "antt-y", "rodovia": "BR-381", "coordenadas": {"lat": -20.0, "lon": -44.0}, "fonte": {"origem": "ANTT"}}]
        juntos = {p["id"]: p for p in juntar_antt(sp, antt)}
        self.assertEqual(juntos["semparar-F001"]["coordenadas"], {"lat": -22.9351, "lon": -45.3612})
        self.assertEqual(juntos["semparar-F001"]["tolerancia_m"], 150)
        self.assertNotIn("antt-x", juntos)
        self.assertIn("antt-y", juntos)

    def test_antt_nao_duplica_praca(self):
        """Bug do robô em 24/11/2026: a mesma praça entrava duas vezes e o pedágio era somado em dobro."""
        sp = pontos_semparar(csv_semparar(), "u")
        f = lambda i, rod, lat, lon, sentido: {"id": i, "rodovia": rod, "sentido": "ambos", "sentido_texto": sentido, "nome": i,  # noqa: E731
                                              "coordenadas": {"lat": lat, "lon": lon}, "fonte": {"origem": "ANTT"}}
        antt = [
            f("antt-cres", "BR-116/SP", -22.9301, -45.3601, "crescente"),     # mesma praça do Sem Parar, rodovia escrita diferente
            f("antt-decr", "BR-116/SP", -22.9305, -45.3605, "decrescente"),   # mesma praça, outro sentido
            f("antt-n1", "BR-381", -20.0000, -44.0000, "crescente"),          # praça só da ANTT, um sentido
            f("antt-n2", "BR-381", -20.0003, -44.0002, "decrescente"),        # ... o outro sentido: fica (cobra só nele)
            f("antt-n3", "BR-381", -20.0004, -44.0001, "crescente"),          # linha repetida do mesmo sentido: sai
        ]
        juntos = {p["id"]: p for p in juntar_antt(sp, antt)}
        self.assertNotIn("antt-cres", juntos); self.assertNotIn("antt-decr", juntos)
        self.assertEqual(juntos["semparar-F001"]["coordenadas"], {"lat": -22.9301, "lon": -45.3601})
        self.assertIn("antt-n1", juntos); self.assertIn("antt-n2", juntos); self.assertNotIn("antt-n3", juntos)

    def test_antt_par_ambos_e_um_sentido_nao_cobra_em_dobro(self):
        """EPR Paraná: 'Rolândia' (crescente/decrescente) e 'Rolândia - Decrescente' no mesmo lugar."""
        f = lambda i, lat, sentido: {"id": i, "nome": i, "rodovia": "BR-369", "sentido": "ambos", "sentido_texto": sentido,  # noqa: E731
                                     "coordenadas": {"lat": lat, "lon": -51.4}, "fonte": {"origem": "ANTT"}, "regras_acesso": []}
        juntos = {p["id"]: p for p in juntar_antt([], [f("rol", -23.30, "ambos"), f("rol-decr", -23.303, "decrescente")])}
        self.assertEqual(juntos["rol"]["sentido_texto"], "crescente")
        self.assertEqual(juntos["rol-decr"]["sentido_texto"], "decrescente")

    def test_antt_sentido_e_nunca_conferida(self):
        from atualizar_pedagios import sentido_antt
        self.assertEqual(sentido_antt("Crescente"), "crescente")
        self.assertEqual(sentido_antt("decrescente"), "decrescente")
        self.assertEqual(sentido_antt("crescente/decrescente"), "ambos")
        self.assertEqual(sentido_antt(""), "ambos")
        linhas, mapa = ler_csv(CSV_ANTT)
        self.assertTrue(all(p["coordenadas_verificadas"] is False for p in pontos_antt(linhas, mapa, "u")))

    def test_manual_remove_e_substitui(self):
        sp = pontos_semparar(csv_semparar(), "u")
        corpo = montar(sp, [{"id": "semparar-S042", "remover": True}, {"id": "semparar-S045", "nome": "Piratininga (corrigido)"}], {})
        ids = {p["id"]: p for p in corpo["pontos"]}
        self.assertNotIn("semparar-S042", ids)
        self.assertEqual(ids["semparar-S045"]["nome"], "Piratininga (corrigido)")
        base = coleta_comum.cabecalho("x", None, 45)
        base.update(corpo, cobertura_completa=False)
        self.assertEqual(validar(base, esquema("pedagios")), [])


class Artesp(unittest.TestCase):
    TEXTO = ("01/07/2025\nLOTE - 1\nRodovia dos Bandeirantes SP-348 CAIEIRAS * 036+200 R$ 13,70 R$ 13,70\n"
             "Rodovia Dom Pedro I SP- 065 ATIBAIA 079+900  COBRANÇA BIDIRECIONAL TARIFA UNIDIRECIONAL R$ 10,60 R$ 10,60 R$ 5,30\n") * 40

    def test_le_tabela_e_liga_aos_pontos(self):
        data, pracas = __import__("atualizar_pedagios").ler_tabela_artesp(self.TEXTO)
        self.assertEqual(data, "2025-07-01")
        caieiras = next(p for p in pracas if p["nome"] == "CAIEIRAS")
        self.assertEqual((caieiras["rodovia"], caieiras["km"], caieiras["automovel"]), ("SP-348", 36.2, 13.7))
        atibaia = next(p for p in pracas if p["nome"] == "ATIBAIA")
        self.assertEqual((atibaia["rodovia"], atibaia["automovel"]), ("SP-065", 10.6))
        ap = __import__("atualizar_pedagios")
        pontos = [{"id": "s1", "rodovia": "SP-348", "km": 36.2}, {"id": "s2", "rodovia": "SP-065", "km": 79.9}, {"id": "s3", "rodovia": "SP-310", "km": 398.5}]
        t = ap.tarifas_artesp(pracas, data, pontos, "u")
        self.assertEqual(set(t), {"s1", "s2"})
        self.assertEqual(t["s1"][0]["revisar_desde"], "2026-07-01")
        self.assertEqual(t["s1"][0]["nivel_verificacao"], "primaria")

    def test_curadoria_mais_nova_tem_prioridade(self):
        ap = __import__("atualizar_pedagios")
        c = lambda inicio, valor: {"inicio": inicio, "estado": "confirmada", "categorias": {"automovel": valor}}  # noqa: E731
        cur = {"s1": [c("2026-07-01", 14.5)]}
        ofi = {"s1": [c("2025-07-01", 13.7)], "s2": [c("2025-07-01", 10.6)]}
        j = ap.juntar_tarifas(cur, ofi)
        self.assertEqual([v["categorias"]["automovel"] for v in j["s1"]], [14.5])
        self.assertEqual(j["s2"][0]["categorias"]["automovel"], 10.6)

    def test_cadeia_de_fontes(self):
        ap = __import__("atualizar_pedagios")
        c = lambda inicio, valor, **k: {"inicio": inicio, "estado": "confirmada", "categorias": {"automovel": valor}, **k}  # noqa: E731
        tarifas, alt = ap.escolher_tarifas([
            ("oficial", {"a": [c("2025-07-01", 13.7)], "b": [c("2026-07-01", 9.0)]}),
            ("pesquisa", {"a": [c("2026-07-01", 14.5)], "b": [c("2026-07-01", 9.5)]}),
            ("imprensa", {"c": [c("2026-06-04", 11.6)]}),
            ("curadoria", {"a": [c("2026-07-01", 14.5)], "c": [{"inicio": "2026-12-01", "estado": "prevista", "categorias": {"automovel": 5}}]}),
        ])
        self.assertEqual(tarifas["a"][0]["categorias"]["automovel"], 14.5)   # mais recente vence o oficial antigo
        self.assertEqual(tarifas["a"][0]["tipo_fonte"], "pesquisa")           # empate de data: pesquisa antes da curadoria
        self.assertEqual([o["valor"] for o in alt["a"]], [13.7])             # 14,5 repetido não vira alternativa
        self.assertEqual(tarifas["b"][0]["tipo_fonte"], "oficial")            # mesma data: oficial é a 1ª opção
        self.assertEqual(alt["b"][0]["valor"], 9.5)
        self.assertEqual([v["estado"] for v in tarifas["c"]], ["confirmada", "prevista"])  # prevista mantida à parte

    def test_escolhe_arquivo_atual_na_colecao(self):
        ap = __import__("atualizar_pedagios")
        lista = {"contents": [
            {"name": "2025.01.07_TARIFAS_encerradas.pdf", "updated": "2026-03-10", "self": "/a", "mediaType": {"mimeType": "application/pdf"}},
            {"name": "Tarifas Conessionarias - 2025_atualizacao.pdf", "updated": "2025-12-02", "self": "/b", "mediaType": {"mimeType": "application/pdf"}},
            {"name": "HISTÓRICO-DE-TARIFAS.pdf", "updated": "2025-10-01", "self": "/c", "mediaType": {"mimeType": "application/pdf"}}]}
        self.assertEqual(ap.url_tabela_artesp_dam(lista), "/b")


class PesquisaSobPedido(unittest.TestCase):
    def test_lista_sem_valor_e_valores_velhos(self):
        ap = __import__("atualizar_pedagios")
        pontos = [
            {"id": "a", "uf": "SP", "nome": "Agulha", "rodovia": "SP-310", "km": 346.4, "vigencias": []},
            {"id": "b", "uf": "SP", "nome": "Velha", "rodovia": "SP-330", "km": 10, "vigencias": [{"estado": "confirmada", "inicio": "2025-01-01"}]},
            {"id": "c", "uf": "SP", "nome": "Nova", "rodovia": "SP-348", "km": 36, "vigencias": [{"estado": "confirmada", "inicio": "2026-07-01"}]},
            {"id": "d", "uf": "SP", "nome": "Só prevista", "rodovia": "SP-160", "km": 32, "vigencias": [{"estado": "prevista", "inicio": "2026-12-01"}]},
        ]
        sem, velhas = ap.lista_para_pesquisa(pontos, "2026-11-23")
        self.assertEqual([s.split(" (")[0] for s in sem], ["SP Agulha", "SP Só prevista"])
        self.assertEqual(len(velhas), 1)
        self.assertIn("2025-01-01", velhas[0])


class OpenStreetMap(unittest.TestCase):
    """Praças e tarifas do país inteiro vindas do OpenStreetMap."""

    def F(self):
        return __import__("fonte_osm")

    def cabine(self, i, lat, lon, charge="7.10BRL/motorcar;3.55BRL/motorcycle", direcao=None, **extra):
        t = {"barrier": "toll_booth", "charge": charge, "operator": "Concessionária X", "check_date": "2026-07-10", "note": "Praça X", **extra}
        if direcao is not None:
            t["direction"] = str(direcao)
        return {"type": "node", "id": i, "lat": lat, "lon": lon, "tags": t, "timestamp": "2026-08-01T00:00:00Z"}

    def test_tarifa_de_carro(self):
        F = self.F()
        self.assertEqual(F.tarifa_carro("4.20BRL/motorcar;0.00BRL/motorcycle;4.20BRL/hgv/axle"), 4.2)
        self.assertIsNone(F.tarifa_carro("5.00BRL/hgv/axle"))
        self.assertIsNone(F.tarifa_carro(""))

    def test_rumo_e_o_oposto_da_direcao_da_cabine(self):
        # A cabine "olha" para o trânsito: direction=310 quer dizer carro indo para 130°.
        self.assertEqual(self.F().rumo({"direction": "310"}), 130)
        self.assertEqual(self.F().rumo({"direction": "N"}), 180)
        self.assertIsNone(self.F().rumo({}))

    def test_ref_da_rodovia(self):
        F = self.F()
        self.assertEqual(F.ref_rodovia("BR-40;MG-030"), "BR-040")
        self.assertEqual(F.ref_rodovia("RSC-287"), "RSC-287")
        self.assertIsNone(F.ref_rodovia("Rua A"))

    def test_cabines_dos_dois_lados_viram_uma_praca_ambos(self):
        F = self.F()
        dados = {"elements": [self.cabine(1, -10.0, -40.0, direcao=0), self.cabine(2, -10.0004, -40.0, direcao=180)]}
        g = F.agrupar(F.cabines(dados, {}))
        self.assertEqual(len(g), 1)
        self.assertEqual(g[0]["sentido"], "ambos")
        self.assertEqual(g[0]["valor"], 7.1)

    def test_cabines_de_um_lado_so_cobram_nesse_rumo(self):
        F = self.F()
        g = F.agrupar(F.cabines({"elements": [self.cabine(1, -10.0, -40.0, direcao=90), self.cabine(2, -10.0002, -40.0, direcao=80)]}, {}))
        self.assertEqual(len(g), 1)
        self.assertAlmostEqual(g[0]["sentido"], 265, delta=1)

    def test_taxa_de_turismo_e_estacionamento_ficam_fora(self):
        F = self.F()
        dados = {"elements": [self.cabine(1, -27.1, -48.5, operator="TPA Bombinhas"), self.cabine(2, -23.0, -46.0)]}
        vias = {2: {"rodovia": None, "estrada": False}}  # cabine 2 numa via de serviço
        self.assertEqual(F.cabines(dados, vias), [])

    def test_mesma_praca_da_base_so_empresta_a_tarifa(self):
        F = self.F()
        base = [{"id": "semparar-1", "coordenadas": {"lat": -10.0, "lon": -40.0}, "tolerancia_m": 150}]
        perto = F.agrupar(F.cabines({"elements": [self.cabine(1, -10.005, -40.0)]}, {}))  # ~550 m
        outro_lado = F.agrupar(F.cabines({"elements": [self.cabine(2, -10.018, -40.0, charge="9.00BRL/motorcar")]}, {}))  # ~2 km
        longe = F.agrupar(F.cabines({"elements": [self.cabine(3, -11.0, -41.0)]}, {}))
        novos, tarifas, _ = F.juntar(base, perto + outro_lado + longe, None, "2026-11-24")
        self.assertEqual(tarifas["semparar-1"][0]["categorias"]["automovel"], 7.1)
        self.assertEqual([n["id"] for n in novos], ["osm-n3"])  # o de 2 km não entra de novo (seria cobrança em dobro)
        self.assertEqual(tarifas["osm-n3"][0]["tipo_fonte"], "comunidade")
        self.assertEqual(tarifas["osm-n3"][0]["inicio"], "2026-07-10")

    def test_comunidade_nao_substitui_valor_recente_de_fonte_melhor(self):
        F = self.F()
        osm = {"a": [{"inicio": "2026-07-10"}], "b": [{"inicio": "2026-07-10"}]}
        oficial = {"a": [{"estado": "confirmada", "inicio": "2026-07-01"}], "b": [{"estado": "confirmada", "inicio": "2024-07-01"}]}
        self.assertEqual(list(F.filtrar_comunidade(osm, [oficial], "2026-11-24")), ["b"])

    def test_praca_da_base_no_lugar_errado_vai_para_a_cabine_do_mapa(self):
        """Limeira: a base punha a praça da Anhanguera (SP-330) colada à da Bandeirantes (SP-348)."""
        F = self.F()
        base = [{"id": "anh", "rodovia": "SP-330", "concessionaria": "AutoBAn", "tolerancia_m": 150, "coordenadas": {"lat": -22.555748, "lon": -47.460231}},
                {"id": "ban", "rodovia": "SP-348", "concessionaria": "AutoBAn", "tolerancia_m": 150, "coordenadas": {"lat": -22.555836, "lon": -47.460534}}]
        c1 = self.cabine(1, -22.555836, -47.460534, charge="9.70BRL/motorcar", operator="CCR AutoBAn")
        c2 = self.cabine(2, -22.50996, -47.397358, charge="9.70BRL/motorcar", operator="CCR AutoBAn")
        vias = {1: {"rodovia": "SP-348", "estrada": True}, 2: {"rodovia": "SP-330", "estrada": True}}
        novos, tarifas, coords = F.juntar(base, F.agrupar(F.cabines({"elements": [c1, c2]}, vias)), None, "2026-11-24")
        self.assertEqual(novos, [])  # nenhuma praça nova: as duas já existiam
        self.assertEqual(coords["anh"], {"lat": -22.50996, "lon": -47.397358})

    def test_cabine_repetida_no_mapa_fica_so_a_mais_nova(self):
        F = self.F()
        velha = self.cabine(1, -21.7, -48.2, charge="0.00BRL/motorcar", direcao=140, check_date="2025-09-19")
        nova = self.cabine(2, -21.70004, -48.2, charge="4.00BRL/motorcar", direcao=137, check_date="2026-08-13")
        g = F.agrupar(F.cabines({"elements": [velha, nova]}, {}))
        self.assertEqual([x["valor"] for x in g], [4.0])

    def test_cabines_auxiliares_iguais_contam_uma_vez(self):
        ap = __import__("atualizar_pedagios")
        vig = [{"inicio": "2026-03-06", "estado": "confirmada", "nivel_verificacao": "secundaria", "categorias": {"automovel": 12.8}}]
        p = lambda i, lat: {"id": i, "rodovia": "BR-369", "concessionaria": "EPR", "sentido": "ambos", "sentido_texto": "ambos",  # noqa: E731
                            "coordenadas": {"lat": lat, "lon": -49.98}}
        corpo = ap.montar([p("aux1", -23.1500), p("aux2", -23.1502)], [], {"aux1": vig, "aux2": vig})
        self.assertEqual([x["id"] for x in corpo["pontos"]], ["aux1"])

    def test_municipio_pela_malha(self):
        F = self.F()
        malha = {"features": [{"properties": {"codarea": "3550308"}, "geometry": {"type": "Polygon", "coordinates": [[[-47, -24], [-46, -24], [-46, -23], [-47, -23], [-47, -24]]]}}]}
        nomes = [{"id": 3550308, "nome": "São Paulo", "microrregiao": {"mesorregiao": {"UF": {"sigla": "SP"}}}}]
        m = F.Municipios(malha, nomes)
        self.assertEqual(m.onde(-23.5, -46.6), ("São Paulo", "SP"))
        self.assertEqual(m.onde(-10, -40), (None, None))


class Validacao(unittest.TestCase):
    """Dados externos não são garantidos: o robô filtra o que não faz sentido antes de publicar."""

    def vig(self, x, inicio="2026-07-01"):
        return [{"inicio": inicio, "estado": "confirmada", "nivel_verificacao": "secundaria", "categorias": {"automovel": x}}]

    def test_filtra_fora_da_faixa_futuro_e_fora_da_curva(self):
        ap = __import__("atualizar_pedagios")
        pontos = [{"id": i, "concessionaria": "EPR", "rodovia": "BR-1"} for i in "abcdef"]
        comunidade = {"a": self.vig(10), "b": self.vig(11), "c": self.vig(9.5), "d": self.vig(95),
                      "e": self.vig(150), "f": self.vig(10, "2027-06-01")}
        oficial = {"d": self.vig(96)}
        fontes, msgs = ap.filtrar_inconsistencias([("oficial", oficial), ("comunidade", comunidade)], pontos, "2026-11-24")
        com = dict(fontes)["comunidade"]
        self.assertEqual(com["a"], self.vig(10))
        self.assertEqual(com["d"], [])  # 95 é quase 10x a mediana: sai da comunidade
        self.assertEqual(com["e"], [])  # fora da faixa
        self.assertEqual(com["f"], [])  # começa no futuro distante
        self.assertEqual(dict(fontes)["oficial"]["d"], self.vig(96))  # oficial fica, com aviso
        self.assertTrue(any("Conferir" in m for m in msgs))

    def test_conflito_entre_fontes_recentes(self):
        ap = __import__("atualizar_pedagios")
        p = {"id": "x", "nome": "X", "rodovia": "BR-1", "vigencias": [{"estado": "confirmada", "inicio": "2026-07-01", "tipo_fonte": "comunidade", "categorias": {"automovel": 10}}],
             "alternativas": [{"valor": 14, "inicio": "2026-08-01", "fonte": "pesquisa enviada"}]}
        self.assertEqual(len(ap.conflitos_recentes([p], "2026-11-24")), 1)

    def test_fecha_aviso_resolvido_so_com_coleta_completa(self):
        av = __import__("abrir_avisos")
        abertas = [{"number": 3, "title": "Cobertura de tarifas abaixo de 80% na BR-116", "labels": [{"name": "dados"}]},
                   {"number": 9, "title": "Tabela da ARTESP ainda é de 01/07/2025", "labels": [{"name": "dados"}]},
                   {"number": 12, "title": "Outra coisa", "labels": [{"name": "bug"}]}]
        self.assertEqual([i["number"] for i in av.para_fechar(abertas, {"Tabela da ARTESP ainda é de 01/07/2025"})], [3])
        estado = {c: {"ultima_execucao": "2026-11-25T09:20:00Z"} for c in av.COLETORES}
        self.assertTrue(av.coleta_completa_hoje(estado, "2026-11-25"))
        estado["anp"]["ultima_execucao"] = "2026-11-24T09:20:00Z"
        self.assertFalse(av.coleta_completa_hoje(estado, "2026-11-25"))


class Rodizio(unittest.TestCase):
    def test_suspensoes(self):
        ok = suspensoes_validas([{"inicio": "2026-12-22", "fim": "2027-01-09", "fonte": "https://cet"}])
        self.assertEqual(len(ok), 1)
        with self.assertRaises(Anomalia):
            suspensoes_validas([{"inicio": "2026-12-22", "fim": "2026-12-01", "fonte": "https://cet"}])
        with self.assertRaises(Anomalia):
            suspensoes_validas([{"inicio": "2026-12-22", "fim": "2026-12-30"}])
        self.assertEqual(suspensoes_validas([{"inicio": "2025-01-01", "fim": "2025-01-02", "fonte": "https://x"}]), [])

    def test_periodo_sensivel(self):
        self.assertEqual(periodo_sensivel(date(2026, 12, 20), set()), "fim de ano")
        self.assertIn("véspera", periodo_sensivel(date(2027, 4, 19), {"2027-04-21"}))
        self.assertIsNone(periodo_sensivel(date(2027, 3, 10), set()))

    def test_regras_a_revisar(self):
        achados = regras_a_revisar({"a": {"revisar_ate": "2026-12-01"}, "b": [{"revisar_ate": "2026-01-01"}], "c": {"revisar_ate": "2028-01-01"}}, date(2026, 11, 23))
        self.assertEqual(len(achados), 2)
        self.assertTrue(any("VENCIDO" in a for a in achados))


class Gravacao(unittest.TestCase):
    def test_nao_grava_fora_do_esquema_nem_sem_mudanca(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(coleta_comum, "DADOS", Path(tmp)):
            with self.assertRaises(Anomalia):
                coleta_comum.gravar_base("anp.json", {"versao": "1"})
            self.assertFalse((Path(tmp) / "anp.json").exists())
            d = coleta_comum.cabecalho("ANP", None, 10)
            d["precos"] = []
            self.assertTrue(coleta_comum.gravar_base("anp.json", d))
            self.assertFalse(coleta_comum.gravar_base("anp.json", dict(d)))

    def test_falhas_seguidas_geram_aviso(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(coleta_comum, "ESTADO", Path(tmp) / "e.json"), \
                mock.patch.object(coleta_comum, "AVISOS", Path(tmp) / "a.md"):
            def falha():
                raise ConnectionError("fora do ar")
            coleta_comum.executar("x", falha)
            self.assertFalse((Path(tmp) / "a.md").exists())
            coleta_comum.executar("x", falha)
            self.assertIn("2 vezes seguidas", (Path(tmp) / "a.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
