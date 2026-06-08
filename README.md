# 🏆 Simulador Copa do Mundo FIFA 2026

Reportagem interativa e **simulador jogo a jogo** da Copa do Mundo FIFA 2026 (EUA · México · Canadá).
Você escolhe uma seleção favorita e um estilo de simulação, vive a campanha **partida por partida, sem spoilers**, e só no final libera o **dashboard completo** com grupos, mata-mata, artilheiros, estatísticas e narrativa.

> ⚠️ **Projeto não-oficial e fictício.** Resultados, escalações e gols são projeções geradas por software. Onde a classificação/convocação ainda não eram oficiais, foram usadas projeções baseadas em ranking, eliminatórias, forma e elenco.

---

## ✨ Destaques

- **Jornada guiada sem spoilers** — a campanha da sua seleção é revelada um jogo de cada vez. Placar do próximo jogo fica oculto até você simular.
- **Simulador de partida animado** — relógio acelerado, barra de progresso, timeline de gols (autor, minuto, tipo) e resumo final.
- **Disputa de pênaltis estilo simulador** — cobrança a cobrança, mini-gol com 6 zonas, bolinhas verde/vermelha, cobrança decisiva e confete quando a favorita vence.
- **"Situação da Copa neste momento"** — após cada jogo, veja os **grupos parciais** e o **chaveamento até aquele ponto** (jogos futuros aparecem como *"A definir"*, sem estragar a surpresa).
- **Simulações salvas** — crie quantas quiser (seleção + estilo), troque entre elas, **exclua** ou gere uma **nova**. Tudo persistido no navegador.
- **Dashboard completo** como recompensa final: grupos A–L, todos os jogos, melhores terceiros, bracket responsivo, roteiro narrativo e estatísticas.
- **48 seleções** com elencos reais, **12 grupos**, melhores terceiros e proteção dos 4 primeiros do ranking FIFA no chaveamento.
- Visual **Apple-style**: glassmorphism, gradientes EUA/México/Canadá, **bandeiras reais** (flag-icons) e **ícones Lucide** (sem emojis).

---

## 🧰 Stack

- **HTML + CSS + JavaScript puro** (sem framework, sem build, sem backend).
- [Tailwind CSS](https://tailwindcss.com) (CDN) · [Lucide](https://lucide.dev) (ícones, CDN) · [flag-icons](https://github.com/lipis/flag-icons) (bandeiras, CDN).
- Persistência via `localStorage`. Simulações são **determinísticas** (PRNG mulberry32 + seed salvo).

---

## ▶️ Como rodar

Basta abrir o **`index.html`** no navegador (duplo-clique ou arrastar para a janela).

- Os arquivos precisam ficar **na mesma pasta**.
- É necessário **internet na primeira carga** (Tailwind, Lucide e flag-icons vêm de CDN).
- Não há etapa de build nem servidor. _(Opcional: para servir localmente, `npx serve .` ou abra via Live Server.)_

---

## 📁 Estrutura dos arquivos

| Arquivo | Função |
|---|---|
| **`index.html`** | Marcação da página, CDNs e `<link>`/`<script>` dos arquivos locais. |
| **`src/styles/styles.css`** | Todo o CSS customizado (glass, bracket, animações de partida e pênaltis, bandeiras). |
| **`src/data/worldcup-data.js`** | **Base de dados** — define `window.WC_DATA = { TEAMS, GROUPS, ISO, THIRD_PLACE_SLOT_ORDER, THIRD_PLACE_MAP }`. |
| **`src/data/venues.js`** | Sedes oficiais usadas para distribuir partidas. |
| **`src/engine/random.js`** | PRNG determinístico e utilidades de aleatoriedade. |
| **`src/engine/scoring.js`** | Tipos de gol e dados auxiliares de placar. |
| **`src/domain/bracket/top-seed-protection.js`** | Regras de proteção dos cabeças de chave no mata-mata. |
| **`src/engine/simulation.js`** | **Motor de simulação** (partidas, grupos, classificados, mata-mata, estatísticas e prêmios). |
| **`src/app/narrative.js`** | Texto narrativo gerado a partir dos resultados simulados. |
| **`src/state/simulation-profiles.js`** | Perfis Realística, Épica e Dramática, com seeds, caos e metadados. |
| **`src/state/simulation-store.js`** | Estado global da experiência, cache de simulações e persistência em `localStorage`. |
| **`src/ui/render-helpers.js`** | Helpers de DOM, bandeiras, ícones, badges e metadados visuais das seleções. |
| **`src/ui/guided-experience.js`** | Fluxo de escolha, jornada guiada, snapshots e progresso sem spoilers. |
| **`src/ui/dashboard.js`** | Abas, cards principais, visão geral e painel da seleção favorita. |
| **`src/ui/tournament-sections.js`** | Elencos, grupos, jogos, terceiros e proteção de ranking. |
| **`src/ui/bracket.js`** | Chaveamento, cards de mata-mata e modal de detalhes de partida. |
| **`src/ui/match-simulator.js`** | Simulador visual de partida, timeline, pênaltis e confete. |
| **`src/ui/stats.js`** | Narrativa renderizada, estatísticas, seleção ideal e destaques. |
| **`src/app/app.js`** | Orquestração final, filtros, navegação, scroll/reveal e inicialização. |
| **`src/legacy/prototype-legacy.js`** | Protótipo inicial — **não é carregado**, mantido apenas como referência histórica. |

Ordem de carga no `index.html`: dados → engine → narrativa → state → ui → `src/app/app.js`.

---

## 🧭 Fluxo da experiência

1. **Escolha da seleção** — grid com as 48 seleções (busca por nome/confederação/status).
2. **Escolha do estilo** — Realística, Épica ou Dramática.
3. **Jornada guiada (sem spoilers)** — simule um jogo por vez:
   - Cada jogo revelado mostra placar, gols e os botões **Grupos agora** / **Chaveamento agora** / **Rever jogo**.
   - O próximo jogo aparece só como prévia (confronto **sem placar**).
   - Em mata-mata, partidas decididas no tempo normal/prorrogação ou nos **pênaltis animados**.
4. **Fim da jornada** (eliminação ou título) → libera **"Ver Copa completa"**.
5. **Dashboard completo** — toda a Copa revelada: visão geral, grupos, jogos, terceiros, mata-mata, roteiro e estatísticas.

---

## 💾 Simulações salvas (criar / trocar / excluir)

- Cada simulação salva guarda `{ seleção, estilo, seed, progresso }` no `localStorage` e é **regenerada de forma determinística** pelo seed.
- **Criar nova:** botão "Nova simulação" (na jornada, no painel "Minhas simulações" e nas abas do dashboard).
- **Trocar:** clique na simulação desejada (painel lateral ou aba do dashboard).
- **Excluir:** ícone 🗑 na simulação.
- **Reiniciar progresso:** revive a campanha da simulação ativa do zero (sem apagá-la).

### Chaves de `localStorage`
| Chave | Conteúdo |
|---|---|
| `wc_simulations_v1` | Lista de simulações salvas (seleção, tipo, seed, progresso). |
| `wc_active_simulation_v1` | Id da simulação ativa. |

**Resetar tudo:** exclua as simulações pelo 🗑 ou limpe o `localStorage` do site (DevTools → Application → Local Storage).

---

## 🎛️ Onde ajustar

Pesos e perfis em **`src/state/simulation-profiles.js`**:

- **Pesos / estilo das simulações** → objeto `simulationProfiles` (`realistic`, `epic`, `dramatic`): `chaos`, `favoriteBias`, `upsetChance`, `drawChance`, `lateGoalChance`, `penaltyChance`, `extraTimeChance`, `starPlayerImpact`, etc.
- **Duração da partida animada** → função `simulateMatch`: `const totalMs = match.pens ? 28000 : match.aet ? 25000 : 20000;`
- **Duração dos pênaltis** → constantes `PK_PREP_MS`, `PK_SHOT_MS`, `PK_RESULT_MS` (para o ritmo 5s/5s do enunciado, use `PK_PREP_MS = 5000` e `PK_RESULT_MS = 5000`).

---

## 🔄 Atualizar os dados (após convocações/sorteio oficiais)

Edite apenas **`src/data/worldcup-data.js`**:

- **`TEAMS`** — por seleção: `ovr` (força), `conf` (confederação), `coach` (técnico) e `sq` (elenco) no formato `["Nome","POS",pesoDeGol,"tags"]`
  - `POS`: `GK` | `DF` | `MF` | `FW`
  - `tags`: `S` (craque) · `Y` (jovem) · `G` (goleiro)
- **`GROUPS`** — composição dos 12 grupos A–L.
- **`ISO`** — código de bandeira (flag-icons) de cada seleção.

O motor recalcula tudo automaticamente a partir dessa base.

---

## 🙌 Créditos

Projeto de portfólio · visual inspirado em dashboards esportivos premium.
Feito com Tailwind CSS, Lucide e flag-icons — sem backend, sem build step.
