# Design Rules

Este projeto deve ser pensado como uma experiencia interativa de Copa, com cara de jogo esportivo moderno. A interface mobile e a referencia principal: no celular o fluxo precisa ser claro, compacto e navegavel sem esforço. No desktop, a mesma experiencia pode ganhar mais espaco, mas nao deve virar outro produto.

## Mobile First

Toda tela nova deve ser desenhada primeiro para mobile. Se funciona bem no celular, normalmente funciona melhor ainda no desktop. O contrario quase nunca e verdade.

O mobile deve seguir a direcao atual: uma experiencia tipo jogo/app, com abas no footer, icones claros e telas focadas. O usuario nao deve sentir que esta navegando um site longo; deve sentir que esta alternando areas de uma jornada esportiva:

- Jogo
- Noticias
- Tabela/Chave
- Jogos do dia
- Campanha

Cada aba deve ter uma funcao clara e previsivel.

## Sem Scroll Infinito

Todas as abas devem caber na tela do usuario sem necessidade de scroll principal.

Se o conteudo nao couber:

1. Transforme a area interna que cresce em uma lista scrollavel.
2. Se ainda ficar apertado, divida em duas telas/abas de forma organizada.
3. Nunca deixe um card pai crescer indefinidamente.

Exemplo correto: uma lista de eventos, saves, noticias ou jogos deve rolar dentro do seu proprio container, sem empurrar a tela inteira.

Quando uma area interna precisar rolar, a barra de scroll deve estar sempre visivel, clara e perfeitamente interagivel. Scroll escondido so vale para navegacao horizontal de telas/swipe, onde o proprio gesto e o footer deixam a posicao clara. Em listas verticais, historicos, jogadores, eventos e saves, o usuario precisa enxergar que existe mais conteudo e conseguir controlar pela barra.

## Interacao Antes do Problema

Toda funcionalidade interativa deve nascer pensando em:

- clique;
- toque;
- clicar e arrastar;
- arrastar e soltar no mobile;
- gestos naturais quando fizer sentido;
- pinça para zoom em telas densas como chaveamento, campo ou mapas visuais.

Nao espere o problema aparecer depois. Se uma tela tem elementos posicionaveis, comparaveis ou densos, ela ja deve ser planejada para gestos de mobile desde o inicio.

## Uma Experiencia, Dois Layouts

Mobile e desktop nao devem virar duas interfaces completamente diferentes.

A regra ideal:

- mesmos dados;
- mesmos paineis principais;
- mesmas acoes;
- layout diferente conforme o tamanho da tela.

No desktop, os mesmos paineis do mobile devem aparecer lado a lado quando houver espaco. Se nao couberem, eles viram um trilho horizontal com snap/rolagem, sem mudar a logica da tela.

No mobile, os mesmos paineis devem aparecer em abas no footer e tambem permitir deslizar lateralmente. O deslize deve travar automaticamente na tela selecionada, como um app moderno de consumo rapido. O footer funciona como atalho; o swipe funciona como navegacao natural.

Nao bloqueie zoom global do navegador como solucao de layout. A interface deve caber bem por desenho. Em telas densas, como chaveamento, campo e mapas visuais, pode existir zoom/pinca dentro do componente.

## Clareza De Jogo

A jornada guiada deve parecer um modo de Copa em um jogo:

- uma tela principal para o proximo passo;
- noticias como manchetes esportivas;
- tabela/chave como consulta rapida;
- campanha como historico;
- jogos do dia como calendario vivo;
- botoes objetivos e sem duplicacao.

Cada tela deve responder rapido: "o que posso fazer agora?" e "o que acabou de acontecer?".

## Regra De Ouro

Se uma tela fica confusa no mobile, ela ainda nao esta pronta.
