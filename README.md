# World Cup Simulator

Simulador interativo da Copa do Mundo FIFA 2026, com jornada guiada, calendario real, simulacao partida a partida, noticias dinamicas, escalação manual e dashboard completo da competicao.

O projeto funciona como uma experiencia de "modo carreira" da selecao favorita: o usuario escolhe um time, acompanha os dias da Copa, monta escalações, joga ou assiste partidas, ve noticias do torneio e libera o panorama completo conforme a simulacao avanca.

> Projeto nao-oficial. Os dados, resultados, noticias e eventos sao simulados para fins de estudo, portfolio e entretenimento.

## Principais recursos

- Jornada guiada por selecao favorita, sem entregar todos os resultados de uma vez.
- Calendario da Copa aplicado dia a dia, com jogos por data, horario, local e fase.
- Ciclo visual de dia/noite baseado no horario da jornada.
- Avanco automatico do tempo ate jogos importantes, resultados do dia ou proxima partida da selecao do usuario.
- Simulador visual de partidas com placar, eventos, gols, tempo, prorrogacao e penaltis.
- Tela de penaltis com imagem de gol, marcadores de cobranca e resultado visual.
- Noticias dinamicas antes e depois dos jogos, com foco maior na selecao escolhida e tambem no restante do mundo.
- Noticias especiais de classificacao, eliminacao, semifinais, quartas, terceiro lugar e campeao.
- Dashboard completo com final em destaque, grupos, chaveamento, historico de jogos, estatisticas e campanha.
- Chaveamento da Copa em formato visual mais proximo de bracket esportivo.
- Protecao dos top seeds no mata-mata conforme regra de distribuicao por lados do chaveamento.
- Elencos, tecnicos, formações base e dados de selecoes em arquivos separados.
- Editor de escalação manual com campo visual, drag and drop, botao automatico opcional e penalidade por jogador improvisado fora da posicao.
- Substituicoes dinamicas seguindo regra de 5 trocas, com suporte preparado para prorrogacao e expansoes futuras.
- Simulacoes salvas em `localStorage`.
- Interface responsiva para desktop e mobile.

## Stack

- HTML
- CSS
- JavaScript puro
- Vite
- Tailwind CSS via CDN
- Lucide Icons via CDN
- flag-icons via CDN
- Persistencia local com `localStorage`

## Como rodar

Instale as dependencias:

```bash
npm install
```

Rode em modo desenvolvimento:

```bash
npm run dev
```

Gere build de producao:

```bash
npm run build
```

Visualize o build:

```bash
npm run preview
```

## Estrutura do projeto

```text
.
|-- index.html
|-- package.json
|-- public/
|   `-- assets/images/
|-- src/
|   |-- app/
|   |-- data/
|   |-- domain/
|   |-- engine/
|   |-- state/
|   |-- styles/
|   `-- ui/
`-- docs/
```

## Pastas principais

`src/data`
Base de dados do torneio: selecoes, grupos, calendario, sedes e informacoes auxiliares.

`src/engine`
Motor da simulacao: aleatoriedade deterministica, placares, criterios, escalações, substituicoes e simulacao da Copa.

`src/domain`
Regras de dominio mais isoladas, como protecao dos cabeças de chave no bracket.

`src/state`
Perfis de simulacao, estado global, saves e persistencia local.

`src/ui`
Componentes e telas da experiencia: jornada guiada, dashboard, bracket, simulador de partida, editor de escalação e estatisticas.

`src/styles`
CSS customizado do projeto.

`public/assets/images`
Imagens usadas na interface, como campo e gol dos penaltis.

`docs`
Documentacao tecnica e historico de organizacao do projeto.

## Fluxo da experiencia

1. O usuario escolhe uma selecao favorita.
2. Escolhe o perfil de simulacao.
3. A jornada inicia no calendario da Copa.
4. Em dias comuns, o usuario acompanha jogos do dia e noticias.
5. Em dia de jogo da sua selecao, o usuario pode montar a escalação e jogar a partida.
6. Depois da partida, o sistema mostra resultado, noticias, tabela/chaveamento e campanha.
7. Se a selecao for eliminada, os dias continuam passando ate campeao e terceiro lugar.
8. Ao fim da Copa, o dashboard completo fica disponivel.

## Escalacao e motor

O editor de escalação permite:

- começar com escalação vazia;
- preencher automaticamente apenas quando o usuario clicar no botao;
- arrastar jogadores para o campo;
- manter jogadores ao trocar formação;
- colocar jogadores fora da posicao natural;
- aplicar penalidade de desempenho quando um jogador esta improvisado;
- destacar visualmente jogadores improvisados em vermelho;
- usar cores diferentes por função: goleiro, defesa, meio-campo e ataque.

A escalação entra no motor como parte da tática da partida. Isso influencia o rating de ataque/defesa e tambem altera o seed da simulacao, entao mudanças taticas podem mudar o jogo.

## Dados e simulacao

O projeto usa dados locais para selecoes, elencos, grupos, calendario e sedes. A simulacao e deterministica a partir de seeds salvos, permitindo recriar resultados da mesma simulacao.

Os principais pontos que influenciam os resultados sao:

- força base das selecoes;
- perfil da simulacao;
- fase do torneio;
- mando/campo neutro e contexto;
- eventos gerados pelo motor;
- escalação, postura e improvisacoes;
- prorrogacao e penaltis quando necessario.

## Autores

- Macedo ([pmacedoo](https://github.com/pmacedoo))
- Matheus ([MenezesMatheus](https://github.com/MenezesMatheus))
- Victor ([VictorHGomes](https://github.com/VictorHGomes))

## Aviso

Este projeto nao tem relacao oficial com FIFA, Copa do Mundo, selecoes, confederacoes ou atletas. Ele e uma simulacao ficticia criada para aprendizado e demonstracao tecnica.
