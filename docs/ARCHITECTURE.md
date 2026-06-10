# Arquitetura

O projeto roda em ES Modules: `index.html` carrega apenas `src/app/app.js` (`type="module"`) e o resto do grafo vem por `import`. Dev com `npm run dev` (Vite) e deploy com `npm run build`.

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
    dashboard.js
    tournament-sections.js
    bracket.js
    stats.js
    journey/        # experiencia guiada (telas, noticias, mobile, auto-advance)
    match/          # simulador ao vivo, escalacao, substituicoes, penaltis

  styles/
    tokens.css      # variaveis de design
    base.css        # pagina, tipografia, vidro, botoes
    components.css  # dashboard: tabs, nav, acordeao, chaveamento
    journey.css     # jornada guiada
    match.css       # partida: simulador, planejador, substituicoes, penaltis
    dark-mode.css   # overrides de tema escuro (carregado por ultimo)

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
5. Extrair persistencia em `localStorage`. (feito)
6. Separar renderizadores e eventos de UI. (feito)
7. Converter o carregamento para imports ESM. (feito)
8. Ligar Vite e gerar `dist/` para deploy. (feito — `npm run build`)
