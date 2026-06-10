# Regras de Design, UX e Responsividade

Este documento define as regras visuais e de experiencia que devem orientar qualquer alteracao futura no simulador. Ele e documentacao interna do projeto, nao conteudo de usuario final.

## Principios Gerais

- Preserve a proposta central: simulacao guiada da Copa antes do dashboard completo.
- Mobile deve parecer um app: telas curtas, navegacao clara, acoes acessiveis e conteudo progressivo.
- Desktop deve parecer um dashboard premium: mais informacao visivel, grids bem alinhados e leitura densa sem poluicao.
- Nenhuma tela deve exigir que o usuario adivinhe que ha conteudo fora da area visivel.
- Conteudo escondido por overflow precisa ter scrollbar visivel, fade, texto discreto ou outro indicador claro.
- Evite layouts que dependam de alturas implicitas quando ha listas, modais, tabelas ou bracket.
- Nunca revele dado futuro durante a jornada guiada.

## Mobile First

- Priorize uma estrutura de app com abas ou secoes segmentadas quando houver muitos dados.
- Evite paginas longas demais em uma unica coluna quando o conteudo puder ser dividido em abas.
- Use cards compactos, texto curto e controles sempre alcancaveis.
- Respeite `100dvh`, `env(safe-area-inset-bottom)` e padding inferior suficiente para bottom bars.
- Modais precisam caber na tela, rolar internamente e manter o ultimo item visivel.
- Tabelas e brackets em mobile devem usar scroll horizontal claro, com pista visual.
- Listas longas devem ter altura definida, scrollbar visivel e indicacao de continuidade.
- O ultimo item de qualquer lista nunca deve ficar atras de rodapes fixos, botoes ou safe areas.

## Desktop

- Use o espaco lateral com grids equilibrados, colunas consistentes e cards sem largura estreita demais.
- Evite areas vazias excessivas e alturas artificiais que criem buracos no dashboard.
- Cards repetidos devem ter raio contido e alinhamento previsivel.
- Tabelas devem permanecer legiveis; se estourarem, use scroll horizontal com indicador.
- O bracket completo deve ficar aberto e escaneavel, sem cards sobrepostos.
- A hierarquia deve ser clara: titulo, contexto curto, conteudo principal e acao.

## Scroll e Overflow

- Todo container com `overflow-y:auto` precisa comunicar rolagem quando houver conteudo oculto.
- Nao use `scrollbar-width:none` ou `::-webkit-scrollbar{display:none}` em listas importantes.
- Use scrollbar fina e estilizada em listas internas.
- Use fade inferior em containers rolaveis para sinalizar continuidade.
- Quando necessario, inclua texto discreto como "Role para ver mais" ou "Mais jogos abaixo".
- Containers rolaveis devem ter `max-height` ou `height` intencional e `padding-bottom` seguro.
- Areas com scroll horizontal devem ter scrollbar visivel e, em mobile, margem/padding para nao cortar bordas.
- Evite `overflow:hidden` em cards que contem conteudo dinamico, salvo quando outro filho interno rola corretamente.

## Jornada Guiada e Spoilers

- A jornada guiada so pode mostrar o que a selecao favorita ou o calendario ja viveu.
- Proximo adversario de mata-mata so aparece quando o confronto estiver revelado sem depender de resultados futuros.
- Se o dado ainda depender de jogos nao vividos, mostre "Adversario a definir" ou "Aguardando definicao do chaveamento".
- O bracket parcial da jornada deve ocultar resultados e confrontos futuros.
- Noticias, cards, resumos, scouting e botoes devem usar a mesma regra anti-spoiler.
- O dashboard completo so deve aparecer depois de confirmado/desbloqueado ao fim da experiencia.
- Nunca renderize campeao, vice, finalistas, tabela completa do mata-mata ou premios finais dentro da jornada antes da hora.

## Dashboard

- O dashboard e a tela final da experiencia e pode mostrar a Copa completa.
- Estruture secoes com espacamento consistente e sem sobreposicao.
- Cards devem alinhar altura naturalmente, sem esconder conteudo essencial.
- Listas e tabelas devem ter scroll claro quando necessario.
- No mobile, o dashboard deve empilhar secoes, manter filtros acessiveis e evitar overflow horizontal inesperado.
- No desktop, use grids amplos e deixe dados completos visiveis sem poluir a leitura.
- Modais abertos pelo dashboard devem respeitar viewport e rolar internamente.

## Bracket

- Cada fase precisa ficar visualmente clara.
- Cards de partidas devem ter largura e altura consistentes.
- No desktop, use colunas distribuidas com espacamento previsivel.
- No mobile, use scroll horizontal ou layout empilhado claro; nunca esprema o bracket ate quebrar.
- Conectores so devem existir se nao prejudicarem alinhamento; prefira simplificar a quebrar a leitura.
- O campeao deve ter destaque apenas no bracket completo do dashboard.
- Bracket parcial da jornada deve manter "A definir" para fases futuras e placares ocultos para jogos ainda nao vividos.

## Dia, Noite e Background

- A logica de intensidade da noite deve ser centralizada.
- Meia-noite deve retornar intensidade `1`; meio-dia deve retornar `0`.
- O background deve usar essa intensidade para transicao suave.
- O indicador visual de dia/noite deve usar a mesma intensidade, texto e icone coerentes.
- Evite CSS/JS antigo concorrendo com o ciclo atual.
- Transicoes nao devem piscar, saltar ou inverter estado visual.
- O indicador precisa ser legivel em mobile e desktop sem poluir o topo da jornada.

## Indicadores Visuais

- Estados interativos precisam ter foco, hover ou press feedback.
- Areas rolaveis precisam de pista de continuidade.
- Estados bloqueados ou futuros devem parecer claramente indisponiveis.
- Use icones para acoes familiares e texto curto para comandos importantes.
- Indicadores de progresso devem refletir estado real, nao apenas decoracao.

## Acessibilidade Minima

- Botoes icon-only precisam de `aria-label` e `title` quando fizer sentido.
- Modais precisam ter `role="dialog"` ou `role="alertdialog"` e fechamento previsivel por ESC.
- Contraste de texto deve permanecer legivel em modo claro, escuro, dia e noite.
- Areas clicaveis devem ter tamanho confortavel no mobile.
- Nao dependa apenas de cor para comunicar classificacao, bloqueio, vitoria ou derrota.
- Conteudos truncados devem preservar o significado principal.

## Consistencia Visual

- Reuse tokens, classes e componentes existentes antes de criar novos padroes.
- Mantenha paleta equilibrada entre azul, verde, vermelho, dourado e neutros.
- Evite paginas dominadas por um unico tom.
- Evite cards dentro de cards quando uma banda/separacao simples resolver.
- Nao adicione features novas durante polish; corrija o comportamento e a clareza do que ja existe.
- Antes de finalizar alteracoes visuais, teste mobile, desktop, dashboard, jornada, bracket, modais e reset de estado.
