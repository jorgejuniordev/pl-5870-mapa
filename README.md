# PL 5870/2026: mapa dos municípios

Mapa interativo que simula quais municípios brasileiros atenderiam aos critérios do
[PL 5870/2026](https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2654327)
(Kim Kataguiri, Missão-SP) para contratar shows com dinheiro público.

## Critérios (cumulativos)

| Critério | Exigência | Fonte |
| --- | --- | --- |
| Coleta de esgoto | ≥ 90% da população | IBGE, Censo 2022 (SIDRA 7555) |
| Água potável | ≥ 90% da população | IBGE, Censo 2022 (SIDRA 6894) |
| Atenção Primária à Saúde | ≥ 80% de cobertura potencial | Ministério da Saúde (relatorioaps) |
| Ideb anos iniciais, rede municipal | ≥ 7,0 | Inep, Ideb 2025 |
| População em favelas | < 5% | IBGE, Censo 2022 (SIDRA 9887 e 4709) |

Critérios que dependem da contratação (precatórios, orçamento, histórico do artista) não
entram no mapa. O PL ainda não está em vigor e não define qual edição de cada indicador
seria usada, então o resultado é uma simulação.

## Rodar localmente

```bash
npm install
npm run dev
```

## Atualizar os dados

```bash
npm run data
```

Baixa os indicadores das fontes oficiais e gera `public/data/indicadores.json` e
`public/data/municipios.geojson`.

## Autor

Feito por [Jorge Souza](https://www.linkedin.com/in/jorgejuniordeveloper/).
