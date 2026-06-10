
/* =================================================================
   CENTRAL DA COPA — NOTÍCIAS DINÂMICAS DA JORNADA
   -----------------------------------------------------------------
   Gera as manchetes do dia a partir do contexto (pré-jogo, pós-jogo,
   dia sem jogo, modo espectador e Copa encerrada) e controla o
   carrossel com auto-rotação. O timer é limpo em renderGuided antes
   de cada re-render para nunca acumular intervals.
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
import { teamMeta } from "../../domain/teams/team-meta.js";
import { KO_ORDER, allTournamentMatches, getMatchWinnerTeam, isGroupStage, parseMatchMinute } from "../../domain/matches/match-queries.js";
import { partialStandings } from "../../domain/standings/partial-standings.js";
import { activeRecord } from "../../state/simulation-store.js";
import { $, flag, ic, matchScheduleLine, scoreLine } from "../render-helpers.js";
import { canRevealMatchTeams, getSpoilerSafeOpponent, hasWatchedMatch } from "./journey-context.js";

const JOURNEY_NEWS_ROTATION_MS = 6000;
let journeyNewsTimer = null;

function stopJourneyNewsCarousel(){
  if(journeyNewsTimer){
    clearInterval(journeyNewsTimer);
    journeyNewsTimer = null;
  }
}

/* ---------- helpers de conteúdo ---------- */
function newsPlayer(team, offset = 0){
  const players = teamMeta[team]?.keyPlayers || TEAMS[team]?.sq?.map(p => p[0]) || [];
  return players[offset % Math.max(players.length, 1)] || "o camisa 10";
}

function matchResultText(match){
  if(!match) return "sem resultado";
  return `${match.home} ${scoreLine(match)} ${match.away}`;
}

function groupRoundMatches(sim, round, excludeTeam = null){
  const r = Math.max(1, Math.min(round || 1, 3));
  return sim.groups.flatMap(g => g.matches.map(m => ({...m, group:g.letter})))
    .filter(m => (m.round || 0) === r && (!excludeTeam || (m.home !== excludeTeam && m.away !== excludeTeam)));
}

function pickMatch(matches, index = 0){
  return matches.length ? matches[index % matches.length] : null;
}

function matchHeadlinePlayer(match, fallbackTeam){
  const goal = match?.goals?.slice().sort((a, b) => b.minute - a.minute)[0];
  return goal?.player || newsPlayer(fallbackTeam || match?.home || match?.away, 0);
}

function matchResultMood(match){
  if(!match) return "jogo aberto";
  const total = (match.ga || 0) + (match.gb || 0);
  const diff = Math.abs((match.ga || 0) - (match.gb || 0));
  if(match.pens) return "drama nos pênaltis";
  if(match.aet) return "noite de prorrogação";
  if(diff >= 3) return "placar pesado";
  if(total >= 4) return "jogo aberto";
  if(total <= 1) return "partida travada";
  return "resultado controlado";
}

// Notícia de treino para dias sem jogo da favorita (varia com o dia).
function trainingNewsForOffDay(team, ctx){
  const dayIndex = ctx.calendarDayIndex || 0;
  const variants = [
    {
      tag:"TREINO FECHADO",
      title:`${flag(team)} ${team} faz atividade reservada em dia sem jogo`,
      text:`A comissão usa a pausa no calendário para ajustar bola parada, recuperação física e encaixes sem exposição pública.`,
      meta:`Técnico: ${TEAMS[team].coach}`,
    },
    {
      tag:"RECUPERAÇÃO",
      title:`${flag(team)} ${team} prioriza controle de carga antes da sequência`,
      text:`O dia livre de partida vira oportunidade para tratar desgaste, revisar vídeos e preparar alternativas para o próximo compromisso.`,
      meta:"Gestão de elenco",
    },
    {
      tag:"AJUSTE TÁTICO",
      title:`${flag(team)} ${TEAMS[team].coach} testa variações no treino`,
      text:`Sem bola rolando para a seleção hoje, a comissão trabalha movimentações curtas e cenários de pressão para a próxima rodada.`,
      meta:`Esquema-base ${TEAMS[team].shape}`,
    },
    {
      tag:"BASTIDOR",
      title:`${flag(team)} elenco de ${team} acompanha rodada do hotel`,
      text:`A delegação observa adversários possíveis e transforma o dia sem jogo em leitura de tabela, descanso e conversa interna.`,
      meta:"Dia de observação",
    },
  ];
  const item = variants[dayIndex % variants.length];
  return {type:"good", section:"Manhã · Treino", ...item};
}

/* ---------- geração das manchetes ---------- */
function journeyNewsItems(ctx){
  const {sim, team, revealed, finished, revealedMatches, nextMatch, partialGroup, allPartialGroups,
    currentRound, observerMode, nextWatchMatch, lastWatchMatch, watchIndex, favoriteMatchToday, dayMatches} = ctx;
  const last = revealedMatches[revealedMatches.length - 1];
  const row = partialGroup?.table.find(r => r.team === team);
  const groupRivals = (partialGroup?.table || []).filter(r => r.team !== team).slice(0, 3).map(r => r.team);
  const key = newsPlayer(team, 0);
  const secondKey = newsPlayer(team, 1);
  const lastScore = last ? `${last.home} ${scoreLine(last)} ${last.away}` : "";
  const won = last?.favoriteWon, lost = last && !last.favoriteWon && !last.favoriteDrew;
  const drew = last?.favoriteDrew;
  const revealedNos = new Set(revealedMatches.map(m => m.matchNo).filter(Boolean));
  const livedMatch = m => hasWatchedMatch(activeRecord(), m) || revealedNos.has(m.matchNo);
  const isPreFavoriteMatch = ctx.dayPhase === "morning" || ctx.canPlayFavoriteToday;
  const safeNext = nextMatch ? getSpoilerSafeOpponent(ctx, nextMatch) : null;
  const roundLabel = nextMatch
    ? (isGroupStage(nextMatch) ? `Rodada ${nextMatch.round || currentRound + 1} do grupo` : nextMatch.stage)
    : (last ? (isGroupStage(last) ? `Rodada ${last.round || currentRound} do grupo` : last.stage) : "Pré-jogo");
  const nextLine = nextMatch
    ? (safeNext?.canReveal ? `${nextMatch.home} x ${nextMatch.away}` : "Adversário a definir")
    : "Jornada em andamento";
  const newsRound = Math.max(1, Math.min(currentRound || nextMatch?.round || 1, 3));

  // seleções de outros grupos para as manchetes "do mundo"
  const globalGroups = (allPartialGroups?.length ? allPartialGroups : partialStandings(sim, newsRound))
    .filter(g => g.letter !== partialGroup?.letter);
  const groupLeaders = globalGroups.map(g => ({group:g, row:g.table[0]})).filter(x => x.row).slice(0, 4);
  const tightGroup = globalGroups
    .map(g => ({group:g, first:g.table[0], second:g.table[1]}))
    .filter(x => x.first && x.second)
    .sort((a, b) => (a.first.P - a.second.P) - (b.first.P - b.second.P))[0];
  const otherA = groupLeaders[0]?.row?.team || groupRivals[0] || team;
  const otherB = groupLeaders[1]?.row?.team || groupRivals[1] || team;
  const otherC = tightGroup?.second?.team || groupLeaders[2]?.row?.team || groupRivals[2] || team;
  const otherD = groupLeaders[3]?.row?.team || otherA;
  const pressureMeta = row ? `${row.pos}º no grupo · ${row.P} ponto(s)` : "Primeiro capítulo da campanha";

  const knockoutPool = allTournamentMatches(sim).filter(m => !isGroupStage(m));
  const recentKnockouts = knockoutPool.filter(m => (m.matchNo || 0) <= ((lastWatchMatch || last)?.matchNo || 0)).slice(-8);

  const championNews = () => [
    {type:"good", section:"Noite · Final", tag:"CAMPEÃO", title:`${flag(sim.champion)} ${sim.champion} conquista a Copa do Mundo`, text:`A final contra ${sim.runnerUp} fecha a simulação com festa, taça erguida e nome marcado na história do torneio.`, meta:`Final: ${sim.champion} x ${sim.runnerUp}`},
    {type:"good", section:"Noite · Final", tag:"HERÓI DA TAÇA", title:`${flag(sim.champion)} ${newsPlayer(sim.champion, 0)} vira símbolo do título`, text:`O jogador sai da Copa como rosto da campanha campeã e domina as manchetes do dia seguinte.`, meta:"Central da Copa"},
    {type:"bad", section:"Noite · Final", tag:"VICE DOLORIDO", title:`${flag(sim.runnerUp)} ${sim.runnerUp} fica a um jogo da glória`, text:`A derrota na decisão deixa frustração enorme, mas a campanha ainda será lembrada pela força até a final.`, meta:"Depois da decisão"},
    {type:"good", section:"Noite · 3º lugar", tag:"PÓDIO", title:`${flag(sim.thirdPlace)} ${sim.thirdPlace} fecha Copa no pódio`, text:`A vitória na disputa de terceiro lugar dá um último capítulo positivo para uma seleção que chegou longe.`, meta:`3º: ${sim.thirdPlace}`},
  ];
  if(finished && (sim.champion || sim.runnerUp)) return championNews();

  if(observerMode){
    const focus = nextWatchMatch || lastWatchMatch || recentKnockouts[recentKnockouts.length - 1];
    const stage = focus?.stage || "Copa";
    const alive = recentKnockouts.length
      ? [...new Set(recentKnockouts.map(m => getMatchWinnerTeam(m)).filter(Boolean))]
      : [focus?.home, focus?.away, otherA, otherB].filter(Boolean);
    const a = alive[0] || focus?.home || otherA;
    const b = alive[1] || focus?.away || otherB;
    const c = alive[2] || otherC;
    if(isPreFavoriteMatch){
      return [
        {type:"bad", section:`Manhã · ${stage}`, tag:"PÓS-ELIMINAÇÃO", title:`${flag(team)} comissão de ${TEAMS[team].coach} segue acompanhando a Copa`, text:`Sem jogar, a delegação observa os jogos restantes e tenta entender onde a campanha perdeu força.`, meta:"Primeira página após a queda"},
        {type:"good", section:`Manhã · ${stage}`, tag:"PREPARAÇÃO", title:focus ? `${flag(focus.home)} ${focus.home} e ${flag(focus.away)} ${focus.away} entram em dia decisivo` : `${flag(a)} ${a} mira próximo passo`, text:`A rodada agora coloca os sobreviventes sob pressão máxima, com treino curto e pouco espaço para erro.`, meta:focus ? `${focus.stage} · ${matchScheduleLine(focus)}` : "Calendário final"},
        {type:"good", section:`Manhã · ${stage}`, tag:"SEDE DE FINAL", title:`${flag(a)} ${newsPlayer(a, 0)} puxa clima de confiança`, text:`O vestiário tenta transformar favoritismo em controle emocional antes de mais um jogo pesado.`, meta:`Olho em ${a}`},
        {type:"bad", section:`Manhã · ${stage}`, tag:"RISCO", title:`${flag(b)} ${b} entra sob ameaça de desgaste`, text:`A sequência cobra preço físico, e a comissão avalia preservar intensidade sem desmontar a estrutura.`, meta:`${newsPlayer(b, 1)} monitorado`},
        {type:"good", section:`Manhã · ${stage}`, tag:"SONHO VIVO", title:`${flag(c)} ${c} começa a acreditar em campanha histórica`, text:`A seleção aparece entre os assuntos fortes do dia e tenta transformar momento em vaga na fase seguinte.`, meta:"Central da Copa"},
      ];
    }
    return [
      {type:"bad", section:`Noite · ${lastWatchMatch?.stage || stage}`, tag:"PÓS-ELIMINAÇÃO", title:`${flag(team)} bastidor ainda revisa a queda`, text:`A comissão acompanha os jogos restantes e compara escolhas, desgaste e resposta emocional com quem ainda está vivo.`, meta:"Sem jogo da sua seleção"},
      {type:"good", section:`Noite · ${lastWatchMatch?.stage || stage}`, tag:lastWatchMatch?.stage === "Semifinal" ? "FINALISTA" : lastWatchMatch?.stage === "Quartas de final" ? "SEMIFINALISTA" : "RESULTADO", title:lastWatchMatch ? `${flag(getMatchWinnerTeam(lastWatchMatch) || lastWatchMatch.home)} ${getMatchWinnerTeam(lastWatchMatch) || lastWatchMatch.home} avança em noite grande` : `${flag(a)} ${a} segue vivo`, text:lastWatchMatch ? `${matchResultText(lastWatchMatch)} muda o mapa da Copa e aproxima a competição da decisão.` : `A rodada movimenta o torneio e reduz ainda mais a lista de candidatos.`, meta:lastWatchMatch ? `${lastWatchMatch.stage} · ${matchResultMood(lastWatchMatch)}` : `${watchIndex} jogo(s) acompanhados`},
      {type:"good", section:"Noite · Mata-mata", tag:"PERSONAGEM", title:`${flag(a)} ${newsPlayer(a, 0)} ganha status de protagonista`, text:`A atuação recente coloca o jogador entre os nomes mais comentados da fase decisiva.`, meta:"Manchete da noite"},
      {type:"bad", section:"Noite · Mata-mata", tag:"ELIMINADO", title:lastWatchMatch ? `${flag(lastWatchMatch.home === getMatchWinnerTeam(lastWatchMatch) ? lastWatchMatch.away : lastWatchMatch.home)} queda pesa no vestiário` : `${flag(b)} ${b} sente pressão`, text:`A fase decisiva deixa pouco espaço para tropeço, e cada detalhe vira tema de cobrança pública.`, meta:"Pós-jogo geral"},
      {type:"good", section:"Noite · Central da Copa", tag:"CAMINHO DA TAÇA", title:`${flag(a)} ${a} aparece no radar da taça`, text:`As projeções internas da simulação começam a apontar quem tem elenco, momento e chave para chegar até a final.`, meta:"Projeção sem mostrar placar futuro"},
    ];
  }

  // dia sem jogo da favorita: manchetes giram em torno dos jogos do dia
  if(!favoriteMatchToday && dayMatches?.length){
    const baseDayPool = dayMatches
      .filter(m => m.home !== team && m.away !== team)
      .filter(m => canRevealMatchTeams(ctx, m));
    const dayPool = isPreFavoriteMatch
      ? baseDayPool.filter(m => !hasWatchedMatch(activeRecord(), m) && parseMatchMinute(m.time) >= ctx.journeyMinute)
      : baseDayPool.filter(m => hasWatchedMatch(activeRecord(), m));
    const fallbackPool = isPreFavoriteMatch ? (dayPool.length ? dayPool : baseDayPool) : dayPool;
    const dm1 = pickMatch(fallbackPool, 0), dm2 = pickMatch(fallbackPool, 1), dm3 = pickMatch(fallbackPool, 2), dm4 = pickMatch(fallbackPool, 3), dm5 = pickMatch(fallbackPool, 4);
    const training = trainingNewsForOffDay(team, ctx);
    if(isPreFavoriteMatch){
      return [
        training,
        {type:"good", section:"Manhã · Jogos do dia", tag:"AGENDA CHEIA", title:dm1 ? `${flag(dm1.home)} ${dm1.home} encara ${flag(dm1.away)} ${dm1.away}` : `${flag(otherA)} ${otherA} abre dia importante`, text:dm1 ? `A partida aparece como uma das vitrines do dia e pode mexer no humor da rodada.` : `A rodada começa com atenção dividida entre tabela, desgaste e favoritos.`, meta:dm1 ? matchScheduleLine(dm1) : "Calendário da Copa"},
        {type:"bad", section:"Manhã · Jogos do dia", tag:"PRESSÃO", title:dm2 ? `${flag(dm2.home)} ${dm2.home} entra sob cobrança antes da bola rolar` : `${flag(otherB)} ${otherB} joga com alerta ligado`, text:`A margem para erro diminui, e a comissão tenta blindar o elenco do barulho externo antes da partida.`, meta:dm2 ? matchScheduleLine(dm2) : "Pré-jogo"},
        {type:"good", section:"Manhã · Personagem", tag:"OLHO NO CRAQUE", title:dm3 ? `${flag(dm3.home)} ${newsPlayer(dm3.home, 0)} pode definir o ritmo` : `${flag(otherC)} ${newsPlayer(otherC, 0)} vira nome da rodada`, text:`O jogador chega cercado de expectativa e concentra parte das atenções antes dos jogos paralelos.`, meta:dm3 ? `${dm3.home} x ${dm3.away}` : "Central da Copa"},
        {type:"bad", section:"Manhã · Bastidor", tag:"RISCO DE ZEBRA", title:dm4 ? `${flag(dm4.away)} ${dm4.away} tenta frustrar favoritismo` : `${flag(otherD)} ${otherD} teme tropeço`, text:`O clima de favoritismo vira armadilha se a equipe não transformar controle em vantagem no placar.`, meta:dm4 ? matchScheduleLine(dm4) : "Rodada paralela"},
        {type:"good", section:"Manhã · Tabela", tag:"CONTA ABERTA", title:dm5 ? `${flag(dm5.home)} ${dm5.home} pode mudar a leitura do grupo` : `${flag(otherA)} ${otherA} mira salto na tabela`, text:`Os resultados do dia podem redesenhar liderança, saldo e pressão para a próxima data do calendário.`, meta:dm5 ? `M${dm5.matchNo || "?"}` : "Panorama"},
      ];
    }
    return [
      {...training, section:"Noite · Treino", tag:"TREINO E OBSERVAÇÃO"},
      {type:"good", section:"Noite · Resultado", tag:"DESTAQUE", title:dm1 ? `${flag(getMatchWinnerTeam(dm1) || dm1.home)} ${getMatchWinnerTeam(dm1) || dm1.home} domina manchetes` : `${flag(otherA)} ${otherA} fecha noite em alta`, text:dm1 ? `${matchResultText(dm1)} vira um dos resultados de referência do dia.` : `A noite termina com projeções mexendo no mapa da Copa.`, meta:dm1 ? matchResultMood(dm1) : "Pós-jogo"},
      {type:"bad", section:"Noite · Resultado", tag:"TROPEÇO", title:dm2 ? `${flag(dm2.home)} ${dm2.home} sai pressionado da rodada` : `${flag(otherB)} ${otherB} perde conforto`, text:dm2 ? `${matchResultText(dm2)} abre debate sobre postura, escolhas e capacidade de reação.` : `A combinação de resultados aumenta o peso do próximo jogo.`, meta:dm2 ? `M${dm2.matchNo || "?"}` : "Mesa redonda"},
      {type:"good", section:"Noite · Personagem", tag:"NOME DO DIA", title:dm3 ? `${flag(getMatchWinnerTeam(dm3) || dm3.home)} ${matchHeadlinePlayer(dm3, getMatchWinnerTeam(dm3) || dm3.home)} aparece nos holofotes` : `${flag(otherC)} ${newsPlayer(otherC, 0)} ganha destaque`, text:`A atuação entra na conversa da rodada e ajuda a explicar por que a tabela ficou mais apertada.`, meta:dm3 ? matchResultText(dm3) : "Central da Copa"},
      {type:"bad", section:"Noite · Tabela", tag:"ALERTA", title:dm4 ? `${flag(dm4.away)} ${dm4.away} deixa sinais de desgaste` : `${flag(otherD)} ${otherD} liga alerta`, text:`O calendário cobra intensidade, e a próxima manhã deve começar com ajustes físicos e táticos.`, meta:dm4 ? matchResultMood(dm4) : "Sequência pesada"},
      {type:"good", section:"Noite · Rodada", tag:"MAPA DA COPA", title:dm5 ? `${flag(getMatchWinnerTeam(dm5) || dm5.home)} ${getMatchWinnerTeam(dm5) || dm5.home} muda projeções` : `${flag(otherA)} ${otherA} ganha fôlego`, text:`Com a sua seleção sem jogo, o dia foi marcado por movimentos paralelos que importam para o caminho futuro.`, meta:dm5 ? matchResultText(dm5) : "Panorama do dia"},
    ];
  }

  // manhã de jogo da favorita: pré-jogo + rodada pelo mundo
  if(isPreFavoriteMatch){
    const prepMatch = nextMatch;
    const opponent = safeNext?.canReveal ? (prepMatch?.opponent || groupRivals[0] || otherA) : "adversário a definir";
    const homeAway = prepMatch?.home === team ? "como mandante da tabela" : "fora da ordem principal da tabela";
    const comfortable = row && row.pos <= 2 && row.P >= 4;
    const favoriteNews = [
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"PLANO DE JOGO", title:`${flag(team)} ${team} prepara pressão inicial${safeNext?.canReveal ? ` contra ${opponent}` : ""}`, text:safeNext?.canReveal ? `A comissão de ${TEAMS[team].coach} ensaia uma entrada forte para não deixar o jogo cair no ritmo do adversário.` : `A comissão trabalha cenários de jogo sem antecipar o chaveamento: o adversário só aparece quando a rodada definir o confronto.`, meta:nextLine},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"PROTAGONISTA", title:`${flag(team)} ${key} vira referência no vestiário`, text:`O camisa de maior peso técnico aparece como ponto de apoio para acelerar jogadas e quebrar linhas.`, meta:pressureMeta},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"AJUSTE FINO", title:`${flag(team)} ${secondKey} ganha liberdade no último treino`, text:`A preparação indica uma função mais solta para atacar o espaço entre meio-campo e defesa rival.`, meta:homeAway},
      {type:comfortable ? "good" : "bad", section:`Manhã · ${roundLabel}`, tag:comfortable ? "CONTROLE" : "PRESSÃO", title:comfortable ? `${flag(team)} ${team} tenta administrar vantagem no grupo` : `${flag(team)} ${team} joga com margem curta`, text:comfortable ? `A campanha permite um plano mais paciente, mas a comissão evita falar em classificação antecipada.` : `O ambiente é de atenção total: qualquer tropeço pode bagunçar a tabela da seleção.`, meta:pressureMeta},
    ];
    const worldNews = [
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"TERMÔMETRO", title:`${flag(otherA)} ${otherA} chega com bastidor positivo`, text:`Em outro grupo, a seleção aparece entre as mais confiantes do dia e tenta transformar favoritismo em placar.`, meta:groupLeaders[0] ? `Grupo ${groupLeaders[0].group.letter}` : "Central da Copa"},
      {type:"bad", section:`Manhã · Rodada ${newsRound}`, tag:"ALERTA MÉDICO", title:`${flag(otherB)} ${newsPlayer(otherB, 0)} vira preocupação antes da rodada`, text:`A escalação ainda não é tratada como problema fechado, mas a notícia muda o tom da preparação.`, meta:groupLeaders[1] ? `Grupo ${groupLeaders[1].group.letter}` : "Pré-jogo geral"},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"BRIGA ABERTA", title:`${flag(otherC)} ${otherC} mira topo em grupo apertado`, text:`A rodada pode redesenhar a liderança e transformar confronto paralelo em notícia central do dia.`, meta:tightGroup ? `${tightGroup.first.team} na cola` : "Rodada geral"},
      {type:"bad", section:`Manhã · Rodada ${newsRound}`, tag:"RISCO DE ZEBRA", title:`${flag(otherD)} ${otherD} entra sob aviso contra tropeço`, text:`A comissão evita clima de oba-oba e cobra concentração para não perder pontos em jogo teoricamente controlável.`, meta:`${newsPlayer(otherD, 1)} cobrado`},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"OLHO NO CRAQUE", title:`${flag(otherA)} ${newsPlayer(otherA, 0)} promete movimentar a rodada`, text:`O jogador chega cercado de expectativa e pode influenciar diretamente a tabela do grupo.`, meta:groupLeaders[0] ? `Líder do Grupo ${groupLeaders[0].group.letter}` : "Panorama"},
    ];
    return [...favoriteNews, ...worldNews];
  }

  // noite pós-jogo da favorita
  const playedRound = Math.max(1, Math.min(last?.round || currentRound || newsRound, 3));
  const roundMatches = allTournamentMatches(sim)
    .filter(m => isGroupStage(m))
    .filter(m => (m.round || 0) === playedRound)
    .filter(m => m.home !== team && m.away !== team)
    .filter(livedMatch);
  const gm1 = pickMatch(roundMatches, 0), gm2 = pickMatch(roundMatches, 1), gm3 = pickMatch(roundMatches, 2), gm4 = pickMatch(roundMatches, 3);
  const lastWinner = getMatchWinnerTeam(last);
  const decisiveTeam = lastWinner || team;
  const worldDecisiveTeam = decisiveTeam === team ? (last?.opponent || otherA) : decisiveTeam;
  const worldDecisivePlayer = matchHeadlinePlayer(last, worldDecisiveTeam);
  const resultMood = matchResultMood(last);
  const resultMeta = row ? `${row.pos}º no grupo · ${row.P} ponto(s), SG ${row.SG > 0 ? "+" : ""}${row.SG}` : (last ? matchResultText(last) : "Pós-jogo");
  const favoritePain = lost && row?.pos > 2;
  const groupEliminated = row?.status === "Eliminado";
  const knockoutEliminated = lost && last && !isGroupStage(last);
  const eliminated = groupEliminated || knockoutEliminated;
  const eliminationStageIdx = knockoutEliminated ? (KO_ORDER[last.stage] || 1) : 0;
  const earlyElimination = groupEliminated || eliminationStageIdx < 3;
  const eliminationTitle = earlyElimination
    ? `${flag(team)} ${team} cai cedo e torcida explode em cobrança`
    : `${flag(team)} ${team} se despede em noite triste`;
  const eliminationText = earlyElimination
    ? `${matchResultText(last)} confirma a eliminação e transforma o pós-jogo em crise: torcedores cobram explicações, escolhas de escalação e postura nos momentos decisivos.`
    : `${matchResultText(last)} encerra a caminhada. A queda dói, mas o tom é menos de revolta e mais de frustração por uma campanha que chegou perto de virar história.`;

  // manchetes extras por fase alcançada (quartas/semi/final)
  const phaseNews = [];
  if(last?.stage === "Quartas de final" && won){
    phaseNews.push({type:"good", section:"Noite · Quartas", tag:"SEMIFINALISTA", title:`${flag(team)} ${team} está entre os quatro melhores da Copa`, text:`A vaga na semifinal muda o patamar da campanha e coloca ${newsPlayer(team, 0)} no centro das manchetes.`, meta:matchResultText(last)});
  }
  if(last?.stage === "Semifinal"){
    phaseNews.push(won
      ? {type:"good", section:"Noite · Semifinal", tag:"FINALISTA", title:`${flag(team)} ${team} vai jogar a final da Copa`, text:`A classificação transforma a campanha em história nacional e deixa o vestiário a um jogo da taça.`, meta:matchResultText(last)}
      : {type:"bad", section:"Noite · Semifinal", tag:"QUASE", title:`${flag(team)} ${team} para na semifinal`, text:`A queda perto da decisão machuca, mas a campanha ainda coloca a seleção entre as grandes histórias do torneio.`, meta:matchResultText(last)});
  }
  if(last?.stage === "Final"){
    phaseNews.push(getMatchWinnerTeam(last) === team
      ? {type:"good", section:"Noite · Final", tag:"CAMPEÃO", title:`${flag(team)} ${team} é campeão do mundo`, text:`A final encerra a jornada com taça, festa e uma campanha que vira referência para a seleção.`, meta:matchResultText(last)}
      : {type:"bad", section:"Noite · Final", tag:"VICE", title:`${flag(team)} ${team} fica no quase`, text:`A derrota na decisão fecha a campanha com tristeza, mas também com a marca de ter chegado ao último jogo da Copa.`, meta:matchResultText(last)});
  }

  const favoriteNews = [
    ...phaseNews,
    {type:won ? "good" : "bad", section:`Noite · ${last?.stage || roundLabel}`, tag:eliminated ? "ELIMINAÇÃO" : "RESULTADO", title:eliminated ? eliminationTitle : won ? `${flag(team)} ${team} vence e muda o tom da campanha` : `${flag(team)} ${team} tropeça e liga alerta`, text:eliminated ? eliminationText : last ? `${matchResultText(last)} foi tratado internamente como ${resultMood}. A leitura agora passa pela tabela e pelo desgaste do elenco.` : "A rodada termina com clima de análise.", meta:eliminated ? (earlyElimination ? "Pressão máxima" : "Fim de campanha") : resultMeta},
    {type:lost ? "bad" : "good", section:`Noite · ${last?.stage || roundLabel}`, tag:"VESTIÁRIO", title:lost ? `${flag(team)} ${team}: vestiário cobra reação imediata` : drew ? `${flag(team)} ${team}: vestiário avalia empate` : `${flag(team)} ${team}: vestiário fala em passo importante`, text:lost ? `A comissão evita caça às bruxas, mas a conversa pós-jogo aponta ajustes urgentes para a próxima manhã.` : drew ? `O empate vira conversa de ajustes: a comissão cobra mais profundidade sem perder a organização defensiva.` : `A vitória não vira festa exagerada: o grupo fala em recuperar energia e manter concentração.`, meta:nextLine},
    {type:favoritePain ? "bad" : "good", section:`Noite · ${last?.stage || roundLabel}`, tag:favoritePain ? "SITUAÇÃO DELICADA" : "TABELA", title:favoritePain ? `${flag(team)} ${team} fica fora da zona desejada` : `${flag(team)} ${team} ainda controla parte do próprio caminho`, text:favoritePain ? `A pontuação coloca pressão real na sequência e torna os critérios de desempate assunto obrigatório.` : `A tabela não está resolvida, mas o cenário permite planejamento sem desespero.`, meta:resultMeta},
    {type:"bad", section:`Noite · ${last?.stage || roundLabel}`, tag:"ANÁLISE", title:`${flag(team)} ${newsPlayer(team, 1)} vira foco do debate tático`, text:`A atuação individual entra no centro da conversa porque mexeu com encaixes, pressão pós-perda e saída de bola.`, meta:last ? matchResultText(last) : "Mesa redonda"},
  ].slice(0, 4);

  const worldNews = [
    {type:"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"PERSONAGEM", title:`${flag(worldDecisiveTeam)} ${worldDecisivePlayer} ganha manchete da noite`, text:`O jogador sai do jogo como rosto mais citado da transmissão e vira tema da entrevista coletiva.`, meta:last ? matchResultText(last) : "Pós-jogo"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"TABELA DO DIA", title:`${flag(otherA)} ${otherA} fecha a noite em alta`, text:`A combinação de resultados melhora o ambiente e coloca a seleção entre os assuntos fortes da rodada.`, meta:groupLeaders[0] ? `Grupo ${groupLeaders[0].group.letter}` : "Tabela parcial"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"ZEBRA", title:gm1 ? `${flag(getMatchWinnerTeam(gm1) || gm1.home)} ${getMatchWinnerTeam(gm1) || gm1.home} bagunça projeções` : `${flag(otherB)} ${otherB} escapa de crise por pouco`, text:gm1 ? `${matchResultText(gm1)} entra no pacote de resultados que muda leitura de força da rodada.` : `A seleção deixa a noite sem tranquilidade total.`, meta:gm1 ? `Grupo ${gm1.group} · ${matchResultMood(gm1)}` : "Pós-jogo geral"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"NOME DA RODADA", title:`${flag(otherB)} ${matchHeadlinePlayer(gm2, otherB)} aparece nos holofotes`, text:`O nome ganha manchetes depois de influenciar uma rodada cheia de jogos paralelos importantes.`, meta:gm2 ? matchResultText(gm2) : "Rodada paralela"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"TROPEÇO", title:gm3 ? `${flag(gm3.home)} ${gm3.home} vê resultado virar problema` : `${flag(otherC)} ${otherC} perde margem`, text:gm3 ? `${matchResultText(gm3)} aumenta a pressão por resposta imediata e muda o peso da próxima partida.` : `A seleção entra na próxima manhã com menos conforto.`, meta:gm3 ? `Grupo ${gm3.group} · ${matchResultMood(gm3)}` : "Tabela"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"CLASSIFICAÇÃO", title:`${flag(otherC)} ${otherC} esquenta briga da chave`, text:`A noite termina com a seleção no centro dos cálculos, especialmente pelos critérios de saldo e gols marcados.`, meta:tightGroup ? `${tightGroup.first.team} e ${otherC}` : "Grupo aberto"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"CRISE", title:gm4 ? `${flag(gm4.away)} ${gm4.away} fecha o dia sob suspeita` : `${flag(otherD)} ${otherD} vira assunto negativo`, text:gm4 ? `${matchResultText(gm4)} deixa perguntas sobre postura, banco e capacidade de reação.` : `A seleção precisa responder rápido para não perder força.`, meta:gm4 ? `Grupo ${gm4.group}` : `${newsPlayer(otherD, 1)} cobrado`},
  ];
  return [...favoriteNews, ...worldNews];
}

/* ---------- renderização e carrossel ---------- */
function renderJourneyNews(ctx){
  const items = journeyNewsItems(ctx);
  return `<div class="journey-hero-card journey-news-card guided-card rounded-[2rem] p-4 guided-enter">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Notícias</div>
        <h2 class="font-display font-extrabold text-2xl">Central da Copa</h2>
      </div>
      ${ic('newspaper','w-6 h-6 text-usablue')}
    </div>
    <div class="journey-news-window mt-3" id="journeyNewsWindow">
      <div class="journey-news-stage" id="journeyNewsStage">
        ${items.map((n, i) => `<article class="journey-news-item ${n.type} ${i === 0 ? 'is-active' : ''}" data-news-index="${i}">
          <div class="journey-news-paperhead">
            <span>${n.section}</span>
            <span>Central da Copa</span>
          </div>
          <div class="journey-news-tag">${n.tag}</div>
          <h3>${n.title}</h3>
          <p>${n.text}</p>
          <div class="journey-news-meta">${n.meta}</div>
        </article>`).join("")}
      </div>
    </div>
    <div class="journey-news-progress mt-3" aria-hidden="true">
      <div id="journeyNewsProgress" class="journey-news-progress-fill"></div>
    </div>
    <div class="mt-3 flex items-center justify-between gap-3">
      <div class="flex gap-1.5" id="journeyNewsDots">
        ${items.map((_, i) => `<button type="button" class="journey-news-dot ${i === 0 ? 'is-active' : ''}" data-news-dot="${i}" aria-label="Notícia ${i + 1}"></button>`).join("")}
      </div>
      <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400"><span id="journeyNewsCount">1</span>/${items.length}</div>
    </div>
  </div>`;
}

// Auto-rotação com pausa no hover; o progresso acumula tempo decorrido
// para retomar de onde parou ao sair o mouse.
function wireJourneyNewsCarousel(){
  const cards = [...document.querySelectorAll(".journey-news-item")];
  if(!cards.length) return;
  const dots = [...document.querySelectorAll(".journey-news-dot")];
  const count = $("#journeyNewsCount");
  const windowEl = $("#journeyNewsWindow");
  const progress = $("#journeyNewsProgress");
  let active = 0;
  let elapsed = 0;
  let lastTick = Date.now();
  let paused = false;

  const paintProgress = () => {
    if(progress) progress.style.width = `${Math.min(100, (elapsed / JOURNEY_NEWS_ROTATION_MS) * 100)}%`;
  };
  const show = (i, resetProgress = true) => {
    active = (i + cards.length) % cards.length;
    cards.forEach((card, idx) => card.classList.toggle("is-active", idx === active));
    dots.forEach((dot, idx) => dot.classList.toggle("is-active", idx === active));
    if(count) count.textContent = String(active + 1);
    if(resetProgress){
      elapsed = 0;
      lastTick = Date.now();
      paintProgress();
    }
  };

  dots.forEach(dot => dot.onclick = () => show(Number(dot.dataset.newsDot)));
  if(windowEl){
    windowEl.addEventListener("mouseenter", () => { paused = true; windowEl.classList.add("is-paused"); });
    windowEl.addEventListener("mouseleave", () => { paused = false; lastTick = Date.now(); windowEl.classList.remove("is-paused"); });
  }
  paintProgress();
  journeyNewsTimer = setInterval(() => {
    const now = Date.now();
    if(!paused){
      elapsed += now - lastTick;
      if(elapsed >= JOURNEY_NEWS_ROTATION_MS) show(active + 1);
      else paintProgress();
    }
    lastTick = now;
  }, 80);
}

export { renderJourneyNews, stopJourneyNewsCarousel, wireJourneyNewsCarousel };
