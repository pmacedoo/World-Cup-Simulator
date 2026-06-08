# Plano de Migracao

## Estado Atual

- `index.html` contem a estrutura da pagina e carrega scripts globais.
- `src/styles/styles.css` contem todo o CSS customizado.
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

## Fase 2: ESM

Quando a maior parte do codigo estiver separada:

- Trocar scripts globais por `type="module"`.
- Usar `import` e `export`.
- Transformar `window.WC_DATA` em exports de `src/data`.

## Fase 3: Build e Deploy

Depois que o app estiver em ESM:

- Usar `npm install`.
- Rodar `npm run dev`.
- Ajustar caminhos de assets.
- Rodar `npm run build`.
- Publicar `dist/` em Vercel, Netlify, Cloudflare Pages ou GitHub Pages.
