
/* =================================================================
   CONTEXTO DA JORNADA GUIADA
   -----------------------------------------------------------------
   Constrói, a partir do registro persistido, tudo que a jornada
   precisa para renderizar um "momento" da Copa sem spoilers:
   dia atual do calendário, relógio, jogos do dia, próximo jogo da
   favorita, modo espectador e estado de conclusão.
   ================================================================= */

import { absoluteJourneyMinute, allTournamentMatches, dayPhaseForMinute, favoriteGroup, getTeamMatches, isGroupStage, matchFavoriteIndex, matchesWithAbsoluteMinutes, observerMatchesAfterFavorite, parseMatchMinute, periodForMinute, tournamentDays } from "../../domain/matches/match-queries.js";
import { partialStandings } from "../../domain/standings/partial-standings.js";
import { activeRecord, persistSims, simObjFor } from "../../state/simulation-store.js";

const KO_FEEDERS = {
  89:[74,77], 90:[73,75], 91:[76,78], 92:[79,80],
  93:[83,84], 94:[81,82], 95:[86,88], 96:[85,87],
  97:[89,90], 98:[93,94], 99:[91,92], 100:[95,96],
  101:[97,98], 102:[99,100],
  103:[101,102], 104:[101,102],
};

function hasWatchedMatch(record, match){
  return !!match?.matchNo && (record.watchedMatchNos || []).includes(match.matchNo);
}

// Marca um jogo do calendário como assistido e avança o relógio da
// jornada até o horário dele (nunca anda para trás).
function markCalendarMatchWatched(record, match){
  if(!record || !match?.matchNo) return;
  record.watchedMatchNos = [...new Set([...(record.watchedMatchNos || []), match.matchNo])];
  const matchMinute = parseMatchMinute(match.time);
  const days = tournamentDays(simObjFor(record));
  const found = matchesWithAbsoluteMinutes(days).find(x => x.match.matchNo === match.matchNo);
  const currentAbs = absoluteJourneyMinute(record.calendarDayIndex || 0, record.journeyMinute ?? 300);
  if(found && found.abs >= currentAbs){
    record.calendarDayIndex = found.dayIndex;
    record.journeyMinute = found.minute;
  } else {
    record.journeyMinute = Math.max(record.journeyMinute ?? 300, matchMinute);
  }
  record.dayPhase = dayPhaseForMinute(record.journeyMinute);
  persistSims();
}

// Marca como assistido SEM mexer no relógio (usado pelo avanço automático,
// que anima o relógio por conta própria).
function revealCalendarMatch(record, match){
  if(!record || !match?.matchNo) return;
  record.watchedMatchNos = [...new Set([...(record.watchedMatchNos || []), match.matchNo])];
}

// Próximo jogo da favorita ainda não assistido a partir do momento atual.
function nextFavoriteCalendarMatch(ctx){
  return matchesWithAbsoluteMinutes(ctx.days)
    .filter(x => x.match.home === ctx.team || x.match.away === ctx.team)
    .filter(x => !hasWatchedMatch(activeRecord(), x.match))
    .find(x => x.abs >= absoluteJourneyMinute(ctx.calendarDayIndex, ctx.journeyMinute)) || null;
}

function nightIntensityForMinute(minute){
  const m = ((minute % 1440) + 1440) % 1440;
  return (1 + Math.cos((m / 1440) * Math.PI * 2)) / 2;
}

function periodInfoForMinute(minute){
  const night = nightIntensityForMinute(minute);
  const m = ((minute % 1440) + 1440) % 1440;
  if(night >= .66) return {label:"Noite", tone:"night", icon:"moon", night};
  if(night <= .30) return {label:"Dia", tone:"day", icon:"sun", night};
  return {label:m < 720 ? "Amanhecer" : "Entardecer", tone:"transition", icon:m < 720 ? "sunrise" : "sunset", night};
}

// Variáveis CSS do ciclo dia/noite para um minuto do dia (céu da jornada).
function skyVarsForMinute(minute){
  const midnightOpacity = nightIntensityForMinute(minute);
  const dayStrength = 1 - midnightOpacity;
  return `--sky-day:${dayStrength.toFixed(3)};--sky-night:${midnightOpacity.toFixed(3)};--midnight-opacity:${midnightOpacity.toFixed(3)};`;
}

function visibleMatchNosFor(record, favoriteMatches = [], revealed = 0){
  const lived = new Set((record?.watchedMatchNos || []).filter(Boolean));
  favoriteMatches.slice(0, Math.max(0, revealed)).forEach(m => {
    if(m?.matchNo) lived.add(m.matchNo);
  });
  return lived;
}

function allGroupMatchesRevealed(sim, livedNos){
  return sim.groups
    .flatMap(g => g.matches)
    .every(m => !m.matchNo || livedNos.has(m.matchNo));
}

function canRevealMatchTeamsFor(sim, record, favoriteMatches, revealed, match){
  if(!match) return false;
  if(isGroupStage(match)) return true;
  const livedNos = visibleMatchNosFor(record, favoriteMatches, revealed);
  if(match.matchNo && livedNos.has(match.matchNo)) return true;
  const feeders = KO_FEEDERS[match.matchNo] || [];
  if(!feeders.length) return allGroupMatchesRevealed(sim, livedNos);
  return feeders.every(matchNo => livedNos.has(matchNo));
}

function canRevealOpponent(ctx, match = ctx?.nextMatch){
  if(!ctx || !match) return false;
  return canRevealMatchTeamsFor(ctx.sim, activeRecord(), ctx.matches, ctx.revealed, match);
}

function canRevealMatchTeams(ctx, match){
  if(!ctx || !match) return false;
  return canRevealMatchTeamsFor(ctx.sim, activeRecord(), ctx.matches, ctx.revealed, match);
}

function getSpoilerSafeOpponent(ctx, match = ctx?.nextMatch){
  if(!match) return {canReveal:false, opponent:null, label:"Adversário a definir", reason:"Sem próximo confronto pendente."};
  const opponent = match.home === ctx.team ? match.away : match.home;
  if(canRevealMatchTeams(ctx, match)){
    return {canReveal:true, opponent, label:opponent, reason:"Confronto definido no estado atual da jornada."};
  }
  return {
    canReveal:false,
    opponent:null,
    label:"Adversário a definir",
    reason:"Próximo confronto será revelado após os jogos necessários da rodada.",
  };
}

function getNextVisibleMatch(ctx){
  const next = nextFavoriteCalendarMatch(ctx);
  if(!next) return null;
  return {...next, canReveal:canRevealMatchTeams(ctx, next.match), opponent:getSpoilerSafeOpponent(ctx, next.match)};
}

function jumpToNextFavoriteMatch(record){
  if(!record) return false;
  const ctx = journeyVisibleContext(record);
  const target = nextFavoriteCalendarMatch(ctx);
  if(!target) return false;

  const fromAbs = absoluteJourneyMinute(ctx.calendarDayIndex, ctx.journeyMinute);
  const priorMatches = matchesWithAbsoluteMinutes(ctx.days)
    .filter(x => !hasWatchedMatch(record, x.match))
    .filter(x => x.abs >= fromAbs && x.abs < target.abs);

  priorMatches.forEach(x => revealCalendarMatch(record, x.match));

  const refreshedCtx = journeyVisibleContext(record);
  if(!canRevealMatchTeamsFor(refreshedCtx.sim, record, refreshedCtx.matches, refreshedCtx.revealed, target.match)){
    persistSims();
    return priorMatches.length > 0;
  }

  record.calendarDayIndex = target.dayIndex;
  record.journeyMinute = target.minute;
  record.dayPhase = dayPhaseForMinute(target.minute);
  persistSims();
  return true;
}

function getVisibleJourneyState(ctx){
  return {
    ...ctx,
    nextVisibleFavorite: getNextVisibleMatch(ctx),
    canRevealNextMatch: ctx?.nextMatch ? canRevealMatchTeams(ctx, ctx.nextMatch) : false,
  };
}

// Monta o snapshot completo do momento atual da jornada.
// Também SANEIA o registro (clamps de dia/minuto) antes de derivar.
function journeyVisibleContext(record){
  const sim = simObjFor(record), team = record.favoriteTeam;
  const matches = getTeamMatches(sim, team);
  const revealed = Math.min(record.revealed, matches.length);
  const days = tournamentDays(sim);

  const calendarDayIndex = Math.max(0, Math.min(record.calendarDayIndex || 0, Math.max(0, days.length - 1)));
  if(record.calendarDayIndex !== calendarDayIndex) record.calendarDayIndex = calendarDayIndex;
  const journeyMinute = Number.isFinite(record.journeyMinute)
    ? Math.max(0, Math.min(1439, record.journeyMinute | 0))
    : 300;
  if(record.journeyMinute !== journeyMinute) record.journeyMinute = journeyMinute;

  const period = periodForMinute(journeyMinute);
  const dayPhase = dayPhaseForMinute(journeyMinute);
  const currentDay = days[calendarDayIndex] || {dayIndex:0, dateLabel:"Calendário", matches:[]};
  const dayMatches = currentDay.matches || [];

  // jogo da favorita hoje: só pode ser jogado quando o relógio chega
  // no horário e ele é exatamente o próximo da campanha (revealed).
  const favoriteMatchToday = dayMatches.find(m => m.home === team || m.away === team) || null;
  const favoriteIndexToday = favoriteMatchToday ? matchFavoriteIndex(favoriteMatchToday, matches) : -1;
  const favoriteMatchDue = favoriteMatchToday && parseMatchMinute(favoriteMatchToday.time) <= journeyMinute;
  const candidateNextMatch = favoriteIndexToday >= 0 && favoriteIndexToday === revealed
    && favoriteMatchDue && !hasWatchedMatch(record, favoriteMatchToday)
    ? matches[revealed]
    : null;
  const canRevealCandidate = candidateNextMatch
    ? canRevealMatchTeamsFor(sim, record, matches, revealed, candidateNextMatch)
    : false;
  const canPlayFavoriteToday = !!candidateNextMatch && canRevealCandidate;

  const dayWatched = dayMatches.length > 0 && dayMatches.every(m => hasWatchedMatch(record, m));
  const watchedCalendarMatches = allTournamentMatches(sim).filter(m => hasWatchedMatch(record, m));
  const cupCalendarDone = allTournamentMatches(sim).every(m => hasWatchedMatch(record, m));

  // modo espectador: a favorita já terminou a campanha (sem ser campeã)
  // mas o calendário da Copa ainda tem jogos por assistir.
  const favoriteJourneyDone = revealed >= matches.length;
  const watchMatches = observerMatchesAfterFavorite(sim, matches);
  const watchedObserverCount = watchMatches.findIndex(m => !hasWatchedMatch(record, m));
  const derivedWatchIndex = watchedObserverCount < 0 ? watchMatches.length : watchedObserverCount;
  const watchIndex = Math.max(0, Math.min(Math.max(record.watchIndex || 0, derivedWatchIndex), watchMatches.length));
  if(record.watchIndex !== watchIndex) record.watchIndex = watchIndex;
  const observerMode = favoriteJourneyDone && sim.champion !== team && !cupCalendarDone;
  const finished = cupCalendarDone;

  const revealedMatches = matches.slice(0, revealed);
  const watchedMatches = observerMode
    ? watchMatches.slice(0, watchIndex)
    : watchedCalendarMatches.filter(m => m.home !== team && m.away !== team);
  const nextWatchMatch = observerMode && !finished ? watchMatches[watchIndex] : null;
  const lastWatchMatch = watchedMatches[watchedMatches.length - 1] || null;
  const nextMatch = observerMode || finished ? null : candidateNextMatch;

  // rodada de grupos "corrente" para tabelas parciais sem spoiler
  const groupMatches = matches.filter(isGroupStage);
  const groupRevealed = revealedMatches.filter(isGroupStage);
  // partida "vivida" = assistida no calendário ou revelada na campanha da
  // favorita (o OR cobre saves antigos sem watchedMatchNos preenchido)
  const revealedNos = new Set(revealedMatches.map(m => m.matchNo).filter(Boolean));
  const livedMatch = m => hasWatchedMatch(record, m) || revealedNos.has(m.matchNo);
  const livedGroupMatches = allTournamentMatches(sim).filter(m => isGroupStage(m) && livedMatch(m));
  const currentRound = livedGroupMatches.length
    ? Math.max(...livedGroupMatches.map(m => m.round || 0))
    : 0;

  const favGroup = favoriteGroup(sim, team);
  const allPartialGroups = partialStandings(sim, currentRound, livedMatch);
  const partialGroup = favGroup ? allPartialGroups.find(g => g.letter === favGroup.letter) : null;

  return {
    sim, team, matches, revealed, days, calendarDayIndex, journeyMinute, period,
    currentDay, dayMatches, favoriteMatchToday, favoriteIndexToday, favoriteMatchDue,
    canPlayFavoriteToday, dayWatched, favoriteJourneyDone, observerMode,
    watchMatches, watchIndex, watchedMatches, nextWatchMatch, lastWatchMatch,
    finished, dayPhase, revealedMatches, nextMatch, canRevealNextMatch:canRevealCandidate,
    groupMatches, groupRevealed,
    currentRound, favGroup, partialGroup, allPartialGroups,
  };
}

export { canRevealMatchTeams, canRevealOpponent, getNextVisibleMatch, getSpoilerSafeOpponent, getVisibleJourneyState, hasWatchedMatch, journeyVisibleContext, jumpToNextFavoriteMatch, markCalendarMatchWatched, nextFavoriteCalendarMatch, nightIntensityForMinute, periodInfoForMinute, revealCalendarMatch, skyVarsForMinute };
