# Tarifas de pedágio: pesquisa sob pedido

**Decisão (23/11/2026):** o robô não pesquisa tarifas na internet sozinho (isso exigiria uma API paga, contra a regra de custo zero). Ele lê só fontes fixas e **avisa** quando é preciso pesquisar.

## Fontes, em ordem (por praça)
Vale a tarifa confirmada **mais recente**; em empate de data, a ordem abaixo:

1. **Oficial, automática** — tabela "Valor Atual das Tarifas" da ARTESP (lida pela API de arquivos da ARTESP). Valor anterior ao último reajuste anual aparece como "pode ter reajuste".
2. **Pesquisa enviada** — `dados-curados/pesquisa-pedagios.json`, gerado por `scripts/importar_pesquisa_pedagios.py planilha.xlsx`.
3. **Notícia** — `dados-curados/tarifas-imprensa.json` (com o link de cada notícia).
4. **Base anterior** — `dados-curados/tarifas.json` (pacote v5).

Os demais valores aparecem no app como "outras estimativas". A correção feita pelo usuário no app vale acima de todas, só naquela viagem.

## Quando pesquisar
O robô abre o aviso **"Pedir pesquisa de tarifas — mês/ano"** com as praças sem valor e as com valor de mais de um ano.

## Como importar uma planilha
Formato: o mesmo da `Pedagios_Brasil_carros_e_motos` (aba "Pedágios" com UF, Praça, Rodovia, km, Tarifa automóvel, Tarifa moto, Vigente desde, Situação, Fonte, Página oficial).

```powershell
python scripts/importar_pesquisa_pedagios.py caminho\da\planilha.xlsx
python scripts/atualizar_pedagios.py
```

## Fontes verificadas que não servem para leitura automática (23/11/2026)
- Portal de dados abertos da ARTESP: o conjunto "Pedágio" só aponta para a página da tabela (já lida pela API de arquivos).
- Dados Abertos SP / DER: página com uma única praça sob jurisdição do DER (Itupeva, SP-324, R$ 8,40), com certificado de segurança incompleto no servidor.
- ANTT: só localização das praças (sem tarifa); o portal não respondeu nos testes.
- Calculadoras de terceiros (Pedagiômetro, ViaCusto e outras): sem fonte por praça e sem permissão de leitura automática; aparecem no app só como links para conferência.
