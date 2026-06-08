"use strict";

/* =================================================================
   GERAÇÃO DE NARRATIVA (texto a partir dos resultados reais)
   ================================================================= */
function fmt(team){ return `${flag(team)} ${team}`; }
function scoreLine(m){
  let s = `${m.ga}–${m.gb}`;
  if(m.pens) s += ` (pên. ${m.pens[0]}–${m.pens[1]})`;
  else if(m.aet) s += " (a.p.)";
  return s;
}
function narrativeFor(sim){
  const f = sim.knockout.final;
  const champ = sim.champion, vice = sim.runnerUp;
  const ts = sim.awards.topScorer;
  const up = sim.highlights.biggestUpset;
  const cind = sim.highlights.cinderella;
  const dis = sim.highlights.disappointment;
  const bp = sim.awards.bestPlayer;
  const sf = sim.knockout.SF;

  const intro = `Sob o céu de três nações, a primeira Copa do Mundo com 48 seleções entregou exatamente o que prometia: caos controlado, gigantes sob pressão e uma final que ${flag(champ)} ${champ} venceu por ${scoreLine(f)} diante de ${flag(vice)} ${vice}. O torneio "${sim.name}" foi marcado pelo tom ${sim.tone.toLowerCase()} — e por histórias que só o futebol sabe escrever.`;

  const favoritos = `Os favoritos chegaram cercados de expectativa. ${flag(champ)} ${champ}, comandado por ${TEAMS[champ].coach}, soube dosar talento e equilíbrio: cresceu a cada rodada, encontrou o seu pico no momento certo e transformou o mata-mata em vitrine. Pelo outro lado da chave, ${flag(vice)} ${vice} provou ter elenco para o título, mas esbarrou na decisão.`;

  const surpresa = up ? `A maior zebra veio em ${up.m.stage.toLowerCase()}: ${flag(up.m.winner.team)} ${up.m.winner.team} eliminou ${flag(up.m.loser.team)} ${up.m.loser.team} por ${scoreLine(up.m)}, derrubando uma seleção teoricamente superior e mudando o desenho do torneio.`
    : `Houve sustos, mas os favoritos administraram bem os perigos do mata-mata.`;

  const cinder = cind ? `Entre os médios, ${flag(cind)} ${cind} foi a sensação da Copa, furando o teto que a lógica lhe reservava e chegando bem mais longe do que o ranking previa.` : ``;

  const heroi = bp ? `O herói tático e emocional foi ${bp.player} (${flag(bp.team)} ${bp.team}), eleito melhor jogador após ${bp.goals} gol(is) e atuações decisivas nas fases finais.` : ``;
  const artilheiro = ts ? `A artilharia ficou com ${ts.player} (${flag(ts.team)} ${ts.team}), que balançou as redes ${ts.goals} vezes e carregou o ataque do seu país.` : ``;

  const decepcao = dis ? `Nem todos sorriram. ${flag(dis)} ${dis} foi a grande decepção: caiu antes do esperado e deixou o torneio devendo, em uma campanha que vai render debates em casa.` : ``;

  const semis = `O caminho até a decisão passou por duas semifinais intensas: ${flag(sf[0].winner.team)} ${sf[0].winner.team} superou ${flag(sf[0].loser.team)} ${sf[0].loser.team} (${scoreLine(sf[0])}), enquanto ${flag(sf[1].winner.team)} ${sf[1].winner.team} bateu ${flag(sf[1].loser.team)} ${sf[1].loser.team} (${scoreLine(sf[1])}).`;

  const final = `Na final, ${flag(champ)} ${champ} venceu porque uniu as duas coisas que definem campeões: um plano de jogo claro de ${TEAMS[champ].coach} e jogadores capazes de resolver no detalhe. ${champ} ergueu a taça e escreveu mais um capítulo na história das Copas.`;

  return { intro, favoritos, surpresa, cinder, heroi, artilheiro, decepcao, semis, final };
}


