<!-- © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro. -->
# Fontes de dados

Todas as fontes são gratuitas e sem chave. **Dados e valores de fontes externas não são garantidos pelo app**: o robô e o app conferem e filtram o que parece errado, e o resumo sempre manda conferir na fonte oficial.

Regra geral: quando uma fonte não responde ou não encontra o que foi pedido, o app (ou o robô) tenta a próxima da lista. Fontes com limite de uso ficam por último e só são consultadas quando as anteriores falham.

## Em uso

| Assunto | Ordem das fontes (1ª → reserva) | Onde | Limite / cuidado |
| :-- | :-- | :-- | :-- |
| Rota | OSRM (FOSSGIS) → Valhalla (FOSSGIS) → OSRM público (project-osrm.org) → rota salva → distância digitada | App, `servicos/roteador.js` | 1 consulta/s por serviço; o OSRM público tem limite de uso, por isso é o 3º |
| Autocompletar endereço | Photon (komoot) | App | Sem reserva automática: a política do Nominatim proíbe autocompletar |
| Botão "Buscar" endereço | Nominatim → Photon | App | Nominatim: 1 consulta/s, só com ação da pessoa |
| Cidade de um ponto (GPS, abastecimento) | Photon → Nominatim | App | Idem |
| Preço do combustível | ANP: média da cidade → média do estado → preço digitado | Robô (`atualizar_anp.py`) e app | Se a ANP falha, fica a última semana válida |
| Praças de pedágio | Sem Parar (CC BY 4.0) + ANTT + OpenStreetMap (ODbL) + `dados-curados/pedagios-manuais.json` | Robô (`atualizar_pedagios.py`, `fonte_osm.py`) | Overpass com até 3 tentativas; se falhar, ficam as praças já publicadas |
| Tarifa de pedágio | Oficial (ARTESP, `tarifas-oficiais.json`) → pesquisa enviada → notícia → base anterior → OpenStreetMap | Robô | Vale a mais recente; a do OpenStreetMap só entra sem valor oficial, de pesquisa ou de notícia com menos de 1 ano |
| Município e UF das praças novas | Malha do IBGE | Robô | Se falhar, usa a base anterior |
| Feriados | Regras em `dados-curados/feriados.json` | Robô | — |
| Rodízio de SP | `dados-curados/rodizio-suspensoes.json` (CET) | Robô | Curadoria manual |

## Planejadas para o Guia (em desenvolvimento)

| Guia | Fonte | Licença | Como usar quando o Guia ficar pronto |
| :-- | :-- | :-- | :-- |
| Hospedagem | Cadastur, Ministério do Turismo — [meios de hospedagem](https://dados.turismo.gov.br/dataset/meios-de-hospedagem/resource/fed6a353-bcb4-469a-a354-b246d0f52249) (arquivo do 4º trimestre de 2025) | ODbL | Selo "Cadastrado no Cadastur" (local regularizado). Arquivo trimestral: o robô baixa e publica um recorte por cidade |
| Hospedagem, Turismo e Compras | Overture Maps Places (mais de 64 milhões de lugares; nome, categoria, contatos, endereço, se está funcionando e nota de confiança) | CDLA-Permissive / ODbL, conforme o tema | Cada versão fica disponível por até 60 dias: o robô precisa rodar todo mês e gravar só o recorte do Brasil. Usar só lugares com nota de confiança alta e marcados como funcionando |
| Turismo | Wikipedia (busca por raio, 10 m a 10 km) → Wikidata (acima de 10 km) | CC BY-SA / CC0 | Consulta sob demanda, só quando a pessoa abrir o Guia; foto e descrição com o crédito do autor |

As três estão registradas em `scripts/config_coleta.json` (`fontes_planejadas`). Nenhuma é consultada ainda: os botões do Guia mostram "Recurso em desenvolvimento".

## Validação contra dados inconsistentes (robô)

Antes de publicar, `atualizar_pedagios.py` passa cada tarifa por `filtrar_inconsistencias`:

1. valor de carro fora de R$ 0 a R$ 100 → descartado;
2. vigência "confirmada" que começa mais de 60 dias no futuro → descartada;
3. valor 3 vezes maior ou menor que o das outras praças da mesma concessionária → aviso para conferir (há casos verdadeiros: serra da Imigrantes, pórticos de free flow fracionados, praças de bloqueio); só é descartado se passar de 5 vezes a mediana e vier da comunidade, da notícia ou da base anterior;
4. duas fontes recentes (menos de 1 ano) com diferença acima de 25% → mantém a escolhida e avisa;
5. praças duplicadas (mesmo lugar, mesmo sentido) → fica uma só.

O que for descartado ou suspeito vira um aviso único no GitHub ("Tarifas descartadas ou suspeitas"). Avisos que não aparecem mais na coleta do dia são fechados sozinhos.
