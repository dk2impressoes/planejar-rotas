"""Gera site/dados/manifesto.json (Seção 11). Usado pela automação do GitHub Actions."""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SITE = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "site")
IGNORAR = {"dados/manifesto.json", "sw.js"}


def main() -> None:
    arquivos = []
    hash_dados = ""
    for p in sorted(SITE.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(SITE).as_posix()
        if rel in IGNORAR or rel.startswith(".well-known/"):
            continue
        dados = p.read_bytes()
        h = hashlib.sha256(dados).hexdigest()
        tipo = "dados" if rel.startswith(("dados/", "esquemas/")) else "app"
        item = {"caminho": rel, "tipo": tipo, "tamanho": len(dados), "sha256": h}
        if rel.startswith("dados/"):
            item["esquema"] = f"esquemas/{p.stem}.schema.json"
            hash_dados += h
        arquivos.append(item)
    agora = datetime.now(timezone.utc)
    conjunto = hashlib.sha256(hash_dados.encode()).hexdigest()[:12]
    hash_app = "".join(a["sha256"] for a in arquivos if a["tipo"] == "app")
    cache_app = "app-v13.0.0-" + hashlib.sha256(hash_app.encode()).hexdigest()[:12]
    sw = SITE / "sw.js"
    sw.write_text(re.sub(r"const CACHE = '[^']*';", f"const CACHE = '{cache_app}';", sw.read_text(encoding="utf-8")), encoding="utf-8")
    manifesto = {
        "versao_app": "13.0.0",
        "versao_conjunto": f"{agora:%Y.%m.%d}-{conjunto}",
        "cache_app": cache_app,
        "gerado_em": agora.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "arquivos": arquivos,
    }
    (SITE / "dados" / "manifesto.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Manifesto: {len(arquivos)} arquivos, conjunto {manifesto['versao_conjunto']}")


if __name__ == "__main__":
    main()
