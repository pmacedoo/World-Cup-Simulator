# Arquitetura

Este projeto ainda roda como site estatico pela raiz, usando `index.html` com arquivos locais em `src/`.

A estrutura abaixo prepara a migracao para um site profissional, com responsabilidades separadas e pronto para build/deploy com Vite.

## Estrutura Alvo

```text
public/
  assets/
    images/
    icons/
    flags/

src/
  app/
    bootstrap.js
    routes.js

  data/
    worldcup-data.js
    teams.js
    groups.js
    venues.js

  domain/
    bracket/
    matches/
    standings/
    teams/

  engine/
    random.js
    simulation.js
    penalties.js
    scoring.js

  state/
    storage.js
    simulation-store.js

  ui/
    render-helpers.js
    guided-experience.js
    dashboard.js
    tournament-sections.js
    bracket.js
    match-simulator.js
    stats.js

  styles/
    base.css
    components.css
    layout.css
    tokens.css

  utils/
    format.js
    guards.js
```

## Regras Para Refatorar

1. Primeiro mover codigo sem mudar comportamento.
2. Priorizar funcoes puras antes de UI.
3. Evitar misturar refatoracao com melhoria visual ou nova feature.
4. Manter nomes antigos temporariamente quando isso reduzir risco.
5. Testar no navegador depois de cada grupo pequeno de arquivos movidos.

## Ordem Recomendada

1. Extrair constantes e dados auxiliares.
2. Extrair `random`, `poisson`, `pick`, `clamp` e helpers puros.
3. Extrair motor de simulacao e regras de partida.
4. Extrair classificacao de grupos e mata-mata.
5. Extrair persistencia em `localStorage`.
6. Separar renderizadores e eventos de UI.
7. Converter o carregamento para imports ESM.
8. Ligar Vite e gerar `dist/` para deploy.
