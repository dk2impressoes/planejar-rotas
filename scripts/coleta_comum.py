# © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
"""Partes comuns dos coletores (Seção 11.1): download com novas tentativas, validação pelo esquema,
gravação só de arquivo válido, registro de falhas seguidas e avisos para o mantenedor.

Regras que valem para todos os coletores:
* nunca gravar arquivo vazio nem apagar a última base válida (Seção 11.2);
* qualquer anomalia mantém a versão anterior e gera um aviso (issue) — o usuário final não faz nada;
* registros técnicos nunca contêm coordenadas de usuários, placas ou nomes.
"""
from __future__ import annotations

import json
import os
import sys
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SITE = RAIZ / "site"
DADOS = SITE / "dados"
CURADOS = RAIZ / "dados-curados"
ESTADO = RAIZ / "dados-estado" / "coletas.json"
AVISOS = RAIZ / "dados-estado" / "avisos.md"
CONFIG = json.loads((Path(__file__).parent / "config_coleta.json").read_text(encoding="utf-8"))

sys.path.insert(0, str(Path(__file__).parent))
from validar_dados import validar  # noqa: E402  (mesmo subconjunto de JSON Schema do app)


class Anomalia(Exception):
    """Dado recebido, mas suspeito: não publicar, manter a versão anterior e avisar."""


def hoje() -> date:
    return date.fromisoformat(os.environ["DATA_HOJE"]) if os.environ.get("DATA_HOJE") else date.today()


def agora_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalizar(texto: str) -> str:
    """Maiúsculas, sem acentos e sem espaços repetidos: 'São Paulo ' -> 'SAO PAULO'."""
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(t.upper().split())


UF_POR_NOME = {normalizar(k): v for k, v in {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE",
    "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
    "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO",
}.items()}
UFS = set(UF_POR_NOME.values())


def uf_de(texto: str) -> str | None:
    t = normalizar(texto)
    if t in UFS:
        return t
    return UF_POR_NOME.get(t)


def baixar(url: str, cabecalhos: dict | None = None) -> bytes:
    """GET com espera máxima e novas tentativas com intervalo crescente."""
    ultimo = None
    for i in range(CONFIG["tentativas"]):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": CONFIG["agente"], **(cabecalhos or {})})
            with urllib.request.urlopen(req, timeout=CONFIG["espera_s"]) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - qualquer falha de rede conta como tentativa
            ultimo = e
            time.sleep(2 ** i * 5)
    raise ConnectionError(f"{url}: {ultimo}")


def ler_json(caminho: Path, padrao=None):
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else padrao


def gravar_base(nome_arquivo: str, dados: dict) -> bool:
    """Valida pelo esquema e grava de forma atômica. Devolve True se o conteúdo mudou."""
    esquema = json.loads((SITE / "esquemas" / f"{Path(nome_arquivo).stem}.schema.json").read_text(encoding="utf-8"))
    erros = validar(dados, esquema)
    if erros:
        raise Anomalia(f"{nome_arquivo} fora do esquema: {'; '.join(erros[:5])}")
    destino = DADOS / nome_arquivo
    anterior = ler_json(destino)
    if anterior is not None and _sem_carimbo(anterior) == _sem_carimbo(dados):
        # Nada mudou além da data: não gera nova versão do conjunto, a menos que a validade esteja para vencer.
        if str(anterior.get("validade", "")) > (hoje() + timedelta(days=2)).isoformat():
            return False
    texto = json.dumps(dados, ensure_ascii=False, indent=2) + "\n"
    if len(texto) < 50:
        raise Anomalia(f"{nome_arquivo}: conteúdo vazio")
    temporario = destino.with_suffix(destino.suffix + ".tmp")
    temporario.write_text(texto, encoding="utf-8")
    temporario.replace(destino)
    return True


def _sem_carimbo(d: dict) -> dict:
    return {k: v for k, v in d.items() if k not in ("atualizado_em", "versao", "validade")}


def cabecalho(fonte: str, referencia_em: str | None, validade_dias: int) -> dict:
    h = hoje()
    return {
        "versao": h.strftime("%Y.%m.%d"),
        "atualizado_em": h.isoformat(),
        "referencia_em": referencia_em,
        "fonte": fonte,
        "validade": (h + timedelta(days=validade_dias)).isoformat(),
    }


# ---------- Estado das coletas e avisos (Seção 11.6) ----------

def _estado() -> dict:
    return ler_json(ESTADO, {})


def _salvar_estado(e: dict) -> None:
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text(json.dumps(e, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def avisar(titulo: str, texto: str) -> None:
    """Acumula avisos em dados-estado/avisos.md; o workflow abre uma issue para cada título novo."""
    AVISOS.parent.mkdir(parents=True, exist_ok=True)
    with AVISOS.open("a", encoding="utf-8") as f:
        f.write(f"## {titulo}\n\n{texto}\n\n")
    print(f"⚠ {titulo}: {texto}")


def executar(nome: str, coletar) -> int:
    """Roda um coletor. Falha ou anomalia: mantém a base anterior, conta falhas seguidas e avisa."""
    e = _estado()
    reg = e.setdefault(nome, {"falhas_seguidas": 0})
    reg["ultima_execucao"] = agora_iso()
    limite = 2
    try:
        mudou = coletar()
        reg.update(falhas_seguidas=0, ultimo_sucesso=agora_iso(), ultimo_erro=None)
        print(f"✔ {nome}: {'atualizado' if mudou else 'sem mudanças'}")
        codigo = 0
    except Anomalia as x:
        reg["falhas_seguidas"] += 1
        reg["ultimo_erro"] = f"anomalia: {x}"
        avisar(f"Anomalia em {nome}", f"{x}\n\nA versão anterior foi mantida.")
        codigo = 0  # anomalia não derruba a automação: as outras bases seguem
    except Exception as x:  # noqa: BLE001
        reg["falhas_seguidas"] += 1
        reg["ultimo_erro"] = str(x)[:500]
        print(f"✖ {nome}: {x}")
        if reg["falhas_seguidas"] >= limite:
            avisar(f"Coleta de {nome} falhou {reg['falhas_seguidas']} vezes seguidas", f"Último erro: {str(x)[:500]}\n\nA versão anterior continua publicada.")
        codigo = 0
    _salvar_estado(e)
    return codigo
