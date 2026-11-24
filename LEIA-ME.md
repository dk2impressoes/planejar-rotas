# Planejar Rotas com Checklist — V13 (primeira implementação)

Site estático e PWA, sem etapa de compilação, que segue a *Especificação Técnica V13*. Grupo DK², 23/11/2026.

**Estado:** funcional para testes. **Não está pronto para publicação**: veja as pendências abaixo e em [docs/revisao-v13.md](docs/revisao-v13.md).

## Como rodar no computador

```powershell
powershell -ExecutionPolicy Bypass -File scripts\servidor.ps1
```

* App: http://localhost:8080/site/
* Testes de unidade: http://localhost:8080/testes/unidade/

Depois de editar qualquer arquivo em `site/`, gere o manifesto de novo (ele também muda o nome do cache em `sw.js`, o que faz o navegador instalar a nova versão):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gerar_manifesto.ps1
```

## O que já funciona

| Seção | Situação |
| :-- | :-- |
| 1–2 | Primeira abertura com aceite (caixa desmarcada, guarda versão e data), escolha online/offline, assistente de 6 telas com rascunho automático, validação por tela, "Editar" na revisão |
| 3 | UTC + fuso IANA, itinerário em cascata, pernoite com saída agendada, revisão de entrada em cada resultado, respostas atrasadas descartadas |
| 4 | Fórmulas 1–11, simulação do tanque, três números separados, reserva/inviável, flex, estimativa simplificada, sugestão geográfica de abastecimento |
| 5 | Candidatos por distância e ângulo, confirmação por via, passagens repetidas, vigência prevista × confirmada, "total confirmado conhecido", avisos de free flow vindos de `regras.json` |
| 6 | Rodízio por percurso e horário reais, margem, feriados, suspensões, "Possível restrição" sem dados confiáveis |
| 7 | Idade na data da viagem, faixas, autorização de menores, condutor, confirmação por pessoa |
| 8 | Preparação com inventário, conferência por SHA-256, autoteste sem rede, selo "Pronto" ou "Offline incompleto" |
| 9 | OSRM → Valhalla → rota salva → entrada manual; espera de 10 s, nova tentativa, disjuntor, 1 consulta/s; Photon com espera de 300 ms; Nominatim só no "Buscar" |
| 10–13 | IndexedDB, 3 cópias de segurança, migração, exportação/importação com SHA-256 e esquema, CSP, `textContent`, cache versionado |
| Do pacote v5 | Rotas alternativas (até 3, sem paradas no meio) com km, tempo e pedágios; sugestão de descanso a cada 2 h; orientação de cadeirinha pela idade na data da viagem; botões Google Maps e Waze (só coordenadas, com aviso); 318 praças do Sem Parar e 211 tarifas |

Testes: 75 testes de unidade (navegador) e 29 testes dos coletores em Python.

**Pedágios na prática:** como nenhuma fonte aberta confirma via, sentido e acesso, as praças aparecem como "possível pedágio", com valor e soma **à parte** do "total confirmado conhecido". Praças que cobram só no sentido oposto (pela ordem dos km ou pelo rumo do carro, nas praças norte/sul/leste/oeste) saem da soma. O valor de cada praça segue a cadeia de fontes oficial → pesquisa → notícia → base anterior (vale a mais recente); veja [docs/tarifas-pesquisa.md](docs/tarifas-pesquisa.md).

## Instaladores e publicação

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gerar_instaladores.ps1
```

Gera em `dist/`: `Instalar-PlanejarRotas.exe` (instalador único, compilado de `instalador-exe/Instalador.cs` com o `csc.exe` do Windows; registra em "Aplicativos instalados" só do usuário; teste com `/destino:<pasta> /semAtalhos /semAbrir /silencioso`), `PlanejarRotas-Windows.zip` (Instalar.cmd, servidor local na porta 47800, atalhos, atualização pelo `endereco_site`), `PlanejarRotas-Repositorio.zip` (projeto para o GitHub) e `Como-manter-online.pdf` (guia para leigos, feito de `docs/como-manter-online.html`).

## Atualização automática dos dados (Seção 11)

O workflow `atualizar-dados.yml` roda todo dia: coleta, valida, grava, gera o manifesto, publica e abre *issues* com rótulo `dados` para o mantenedor. Cada coletor, se falhar ou achar anomalia, **mantém a versão anterior**.

| Coletor | Fonte | Automático? | O que o mantenedor faz |
| :-- | :-- | :-- | :-- |
| `atualizar_feriados.py` | Regras em `dados-curados/feriados.json` (datas fixas + Páscoa calculada) | Sim | Incluir feriados de outras cidades, se necessário |
| `atualizar_anp.py` | Página "últimas semanas pesquisadas" da ANP → resumo semanal (estados) + planilha de postos (médias por cidade) | Sim | Ajustar `config_coleta.json` se a ANP mudar o nome do arquivo; aceitar variação grande já conferida (rodar o workflow com `aceitar_variacao = 1`) |
| `atualizar_pedagios.py` | Base aberta do Sem Parar (CC BY 4.0, base principal) + ANTT (coordenadas oficiais das federais) + `dados-curados/pedagios-manuais.json` + `dados-curados/tarifas.json` + tabela oficial da ARTESP (API de arquivos) + `pesquisa-pedagios.json` + `tarifas-imprensa.json` | Localização e tarifas de SP | **Pesquisa sob pedido** (sem API paga): o robô abre o aviso "Pedir pesquisa de tarifas" com as praças sem valor ou com valor de mais de um ano; importar a planilha com `importar_pesquisa_pedagios.py`. Nenhuma praça é "confirmada" até o mantenedor conferir coordenada, sentido e acessos |
| `verificar_rodizio.py` | `dados-curados/rodizio-suspensoes.json` | Não há base aberta | Incluir as suspensões anunciadas pela CET; recebe aviso nos períodos sensíveis, para regras perto de `revisar_ate` e para bases vencidas |

Testes dos coletores, sem rede: `python -m unittest discover -s testes/coletores -v` (exige `pip install -r scripts/requirements.txt`).

## Pendências antes de publicar

1. **Dados**: `centro-expandido.geojson` ainda é aproximado (falta coletor do GeoSampa); tarifas fora de SP e suspensões dependem de curadoria; ANP e ARTESP já foram coletadas das fontes reais (23/11/2026), mas a ANTT não respondeu daqui — rode o workflow manualmente uma vez e confira as *issues*.
2. **Texto jurídico**: Termos de Uso e Aviso de Privacidade são provisórios (`0.2-rascunho`).
3. **Licença do código** (`LICENCA.md`): escolha do Grupo DK².
4. **Mapa de fundo**: falta escolher um provedor autorizado (revisão B1).
5. **APK (TWA)**: exige domínio, `assetlinks.json` com a impressão digital real da chave e testes em aparelho.
6. **Elevar valores a `primaria`** com o texto oficial em `docs/evidencias/`.
