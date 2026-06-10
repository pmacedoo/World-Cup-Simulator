
/* =================================================================
   NARRATIVA DA COPA (texto gerado a partir dos resultados reais)
   -----------------------------------------------------------------
   Constrói os blocos do "roteiro" exibidos na seção final do
   dashboard: abertura, favoritos, zebra, heróis, decepção e final.
   ================================================================= */

import { TEAMS } from "../data/worldcup-data.js";
import { flag, scoreLine } from "../ui/render-helpers.js";
function narrativeFor(sim){
  const final = sim.knockout.final;
  const champ = sim.champion, vice = sim.runnerUp;
  const topScorer = sim.awards.topScorer;
  const upset = sim.highlights.biggestUpset;
  const cinderella = sim.highlights.cinderella;
  const disappointment = sim.highlights.disappointment;
  const bestPlayer = sim.awards.bestPlayer;
  const semis = sim.knockout.SF;

  const intro = `Sob o céu de três nações, a primeira Copa do Mundo com 48 seleções entregou exatamente o que prometia: caos controlado, gigantes sob pressão e uma final que ${flag(champ)} ${champ} venceu por ${scoreLine(final)} diante de ${flag(vice)} ${vice}. O torneio "${sim.name}" foi marcado pelo tom ${sim.tone.toLowerCase()} — e por histórias que só o futebol sabe escrever.`;

  const favoritos = `Os favoritos chegaram cercados de expectativa. ${flag(champ)} ${champ}, comandado por ${TEAMS[champ].coach}, soube dosar talento e equilíbrio: cresceu a cada rodada, encontrou o seu pico no momento certo e transformou o mata-mata em vitrine. Pelo outro lado da chave, ${flag(vice)} ${vice} provou ter elenco para o título, mas esbarrou na decisão.`;

  const surpresa = upset
    ? `A maior zebra veio em ${upset.m.stage.toLowerCase()}: ${flag(upset.m.winner.team)} ${upset.m.winner.team} eliminou ${flag(upset.m.loser.team)} ${upset.m.loser.team} por ${scoreLine(upset.m)}, derrubando uma seleção teoricamente superior e mudando o desenho do torneio.`
    : `Houve sustos, mas os favoritos administraram bem os perigos do mata-mata.`;

  const cinder = cinderella
    ? `Entre os médios, ${flag(cinderella)} ${cinderella} foi a sensação da Copa, furando o teto que a lógica lhe reservava e chegando bem mais longe do que o ranking previa.`
    : ``;

  const heroi = bestPlayer
    ? `O herói tático e emocional foi ${bestPlayer.player} (${flag(bestPlayer.team)} ${bestPlayer.team}), eleito melhor jogador após ${bestPlayer.goals} gol(is) e atuações decisivas nas fases finais.`
    : ``;
  const artilheiro = topScorer
    ? `A artilharia ficou com ${topScorer.player} (${flag(topScorer.team)} ${topScorer.team}), que balançou as redes ${topScorer.goals} vezes e carregou o ataque do seu país.`
    : ``;

  const decepcao = disappointment
    ? `Nem todos sorriram. ${flag(disappointment)} ${disappointment} foi a grande decepção: caiu antes do esperado e deixou o torneio devendo, em uma campanha que vai render debates em casa.`
    : ``;

  const semifinais = `O caminho até a decisão passou por duas semifinais intensas: ${flag(semis[0].winner.team)} ${semis[0].winner.team} superou ${flag(semis[0].loser.team)} ${semis[0].loser.team} (${scoreLine(semis[0])}), enquanto ${flag(semis[1].winner.team)} ${semis[1].winner.team} bateu ${flag(semis[1].loser.team)} ${semis[1].loser.team} (${scoreLine(semis[1])}).`;

  const decisao = `Na final, ${flag(champ)} ${champ} venceu porque uniu as duas coisas que definem campeões: um plano de jogo claro de ${TEAMS[champ].coach} e jogadores capazes de resolver no detalhe. ${champ} ergueu a taça e escreveu mais um capítulo na história das Copas.`;

  return {intro, favoritos, surpresa, cinder, heroi, artilheiro, decepcao, semis:semifinais, final:decisao};
}

export { narrativeFor };
