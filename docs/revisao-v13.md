# Revisão da Especificação Técnica V13

Data: 23/11/2026. Revisão feita antes da implementação. Cada item diz o problema, o que foi decidido nesta primeira versão do código e o que ainda depende do mantenedor (registro na Seção 0 do documento completo).

## A. Contradições ou dependências circulares

| # | Seção | Problema | Decisão no código |
| :-: | :-- | :-- | :-- |
| A1 | 2 (Tela 1) | A tela 1 deve recusar volta antes da **chegada prevista** da ida, mas a chegada só existe depois da rota (tela 2) e das paradas (tela 3). | Tela 1 valida só "volta depois da partida da ida". A validação completa (volta ≥ chegada da ida, com paradas) é refeita na tela 6 e a cada recálculo, com erro que leva à tela 1. |
| A2 | 1.8 × 5.3 | A Seção 1.8 lista 5 situações (confirmado, estimado, manual, desatualizado, indisponível); pedágios usam outras 4 (confirmada, possível, desconhecida, manual). | A cobrança mantém as 4 situações próprias. O **valor** da cobrança usa as 5 da Seção 1.8 (ex.: tarifa `secundaria` = "estimado", Seção 11.4). |
| A3 | 11.3 × 14 | O app deve recusar base fora do esquema, mas `esquemas/` fica fora de `site/` e não é publicado. | Esquemas movidos para `site/esquemas/` (publicados). A automação lê da mesma pasta. |
| A4 | 3 × 10.1 | A Seção 3 exige `revisao_entrada`, mas a entidade `Viagem` não tem contador de revisão. | `Viagem.revisao` (inteiro) sobe a cada alteração; cada resultado guarda a revisão usada. |
| A6 | 13 | Cache com nome fixo (`app-v13.0.0`) impede atualizações: o navegador só reinstala o Service Worker quando `sw.js` muda. | O gerador do manifesto grava no `sw.js` um nome de cache com o hash dos arquivos do app (`app-v13.0.0-<hash>`). |
| A5 | 12.2 | CSP "restritiva" com cabeçalhos: o GitHub Pages não permite cabeçalhos próprios (`frame-ancestors`, `X-Content-Type-Options`). | CSP via `<meta>` (cobre script, estilo e conexões). `frame-ancestors` exige outra hospedagem — **pendência**. |

## B. Lacunas (informação que falta para implementar)

| # | Seção | Lacuna | Decisão provisória |
| :-: | :-- | :-- | :-- |
| B1 | 9.5 | Nenhum servidor de **imagens de mapa** foi escolhido. O servidor `tile.openstreetmap.org` tem política restritiva para apps. | O app mostra um **esboço do traçado** (SVG, sem mapa de fundo) com créditos. Mapa de fundo fica bloqueado até a escolha de um provedor autorizado. |
| B2 | 4.1 × 5.2 | "Automóvel com reboque" muda a categoria do pedágio (eixos), mas a tela 4 não pede eixos. | Campo "eixos do conjunto" aparece quando a categoria é com reboque. |
| B3 | 3 | Não há como obter o **fuso** de um lugar sem serviço extra. | Fuso pela UF (tabela IANA). Exceções conhecidas (oeste do AM e do PA, Fernando de Noronha) ficam como **pendência**. |
| B4 | 4.4 | "Última cidade antes do ponto de reserva" exige busca reversa. | Online: busca reversa no Photon do ponto exato. Offline: mostra km e coordenadas. |
| B5 | 4.3 | Não diz se o carro roda no destino entre a ida e a volta. | Tanque contínuo da ida para a volta, sem consumo no destino; premissa exibida. |
| B6 | 6.2.2 | "Sobre uma via do limite" exige dados de via que a rota não traz com segurança. | O teste usa o polígono (borda incluída). Como o polígono desta versão é aproximado (`nao_verificado`), o rodízio sai sempre como "Possível restrição — confirme na CET". |
| B7 | 7 | A faixa etária não define faixas. | Faixas: 0 a 14, 15, 16 ou 17, 18 ou mais. Com "15 anos", o app pede a data de nascimento (pode fazer 16 durante a viagem). |
| B8 | 2 | Termos de Uso e Aviso de Privacidade estão no documento jurídico, que não foi entregue. | Tela de aceite pronta, com texto provisório e versão `0.1-rascunho`. Substituir antes de publicar. |
| B9 | 11 | A tabela da Seção 11 trata pedágios e suspensões do rodízio como coletáveis, mas não há base aberta estruturada de **tarifas** (a ANTT publica só a localização das praças) nem de **suspensões** (Seção 11.5). O sentido da ANTT vem em texto, não em graus. | Coletores feitos: ANP e ANTT automáticos; tarifas e suspensões por curadoria em `dados-curados/`, com avisos automáticos. Praças da ANTT ficam "possível pedágio" até a conversão do sentido. |
| B10 | 11.6 | Uma variação grande e legítima de preço (ex.: imposto) seria bloqueada para sempre. | O mantenedor confere e roda o workflow com `aceitar_variacao = 1`. |

## C. Dados: nada inventado

| # | Base | Situação nesta entrega |
| :-: | :-- | :-- |
| C1 | `anp.json` | Sem preços. O app mostra "não disponível" e aceita preço manual. |
| C2 | `pedagios.json` | 320 pontos: 318 praças da base aberta do Sem Parar (CC BY 4.0, cópia de 09/11/2026 vinda do pacote v5) e 2 pórticos de free flow previstos (Seção 5.4). 213 com tarifa, todas `secundaria` (tabelas ANTT/ARTESP citadas no v5, não reconferidas). Nenhum ponto tem `coordenadas_verificadas: true`: todos geram só "possível pedágio". 26 praças têm coordenada com 2 casas decimais (≈1 km) e usam raio de busca maior (`tolerancia_m`). |
| C7 | `anp.json` do pacote v5 | **Não importado**: o arquivo não foi gerado pelo script (sem link da planilha no campo `fonte`) e a origem dos valores não pôde ser conferida. |
| C3 | `centro-expandido.geojson` | Polígono **aproximado**, `nao_verificado`. Substituir pelo GeoSampa. |
| C4 | `feriados.json` | Feriados nacionais de 2026 e 2027 e os de SP capital/estado (`secundaria`). |
| C5 | `regras.json` | Valores citados na especificação (rodízio, multas, free flow, limites FOSSGIS), todos `secundaria`. |
| C6 | `rodizio-suspensoes.json` | Vazio. |

## D. Pequenas correções de texto

* 4.3, item 4: o exemplo confere (42,5 × 10,8 = 459 km).
* 2.1: a ordem alfabética das caixas foi aplicada também a "Tipo de parada" (Parada rápida, Pernoite).
* 9.2: a política da FOSSGIS pede identificação do app; o navegador não permite mudar o `User-Agent`, então o app depende do `Referer`. Conferir com a FOSSGIS antes de publicar.
