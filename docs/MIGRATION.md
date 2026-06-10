# Plano de Migracao

## Estado Atual

- `index.html` contem a estrutura da pagina e carrega `src/app/app.js` como modulo ESM (entry unico; o resto do grafo vem por `import`).
- `src/styles/` contem o CSS dividido por responsabilidade: `tokens.css`, `base.css`, `components.css`, `journey.css`, `match.css` e `dark-mode.css` (carregado por ultimo).
- `src/data/worldcup-data.js` publica `window.WC_DATA`.
- `src/engine/simulation.js` contem o motor de simulacao.
- `src/app/narrative.js` contem a narrativa derivada dos resultados.
- `src/state/simulation-profiles.js` contem perfis e parametros de simulacao.
- `src/state/simulation-store.js` contem estado salvo, cache e persistencia.
- `src/ui/` contem a experiencia visual separada por tela/responsabilidade.
- `src/app/app.js` contem orquestracao final, eventos globais e inicializacao.

## Fase 1: Organizacao Sem Build

Manter o app rodando pela raiz enquanto arquivos sao extraidos aos poucos.

Sugestoes:

- Criar modulos em `src/`.
- Copiar uma parte pequena do codigo para o modulo novo.
- Conectar pelo `src/app/app.js` quando necessario.
- Validar no navegador.
- So entao remover o trecho duplicado do arquivo antigo.

## Fase 2: ESM (concluida)

- Todos os modulos usam `import`/`export`; o `index.html` carrega so o entry `src/app/app.js` com `type="module"`.
- `window.WC_DATA`, `window.WC_CALENDAR` e `window.WC_LINEUPS` viraram exports (`WC_DATA`, `WC_CALENDAR`, `WC_LINEUPS`), com `TEAMS`/`GROUPS`/`ISO` exportados direto de `src/data/worldcup-data.js`.
- Estado mutavel compartilhado entre modulos usa setters (`setRandomSource`, `setJourneyLayoutIsMobile`) porque bindings importados sao somente-leitura.
- Atencao a ciclos de import: constantes de topo nao podem ler bindings de modulos em ciclo (TDZ) — ver `liveSubPosGroups()` em live-substitutions.
- O app agora exige servidor (`npm run dev`); abrir o `index.html` via file:// nao funciona com modulos.

## Fase 3: Build e Deploy

Depois que o app estiver em ESM:

- Usar `npm install`.
- Rodar `npm run dev`.
- Ajustar caminhos de assets.
- Rodar `npm run build`.
- Publicar `dist/` em Vercel, Netlify, Cloudflare Pages ou GitHub Pages.
