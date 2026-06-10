
/* =================================================================
   CONSULTAS PURAS SOBRE PARTIDAS E CALENDÁRIO
   -----------------------------------------------------------------
   Funções sem DOM e sem estado: recebem o objeto de simulação (ou
   partidas) e devolvem dados derivados. Usadas pela jornada guiada,
   pelo dashboard e pelo simulador de partidas.
   ================================================================= */

/* ---- fases do mata-mata (ordem crescente) ---- */
const KO_ORDER = {
  "16-avos":1, "Fase de 32":1,
  "Oitavas de final":2, "Quartas de final":3,
  "Semifinal":4, "Disputa de 3º lugar":4, "Final":5,
};
const isGroupStage = match => (match.stage || "").includes("Grupo");

function getMatchWinnerTeam(match){
  if(!match) return null;
  if(match.winner?.team) return match.winner.team;
  if(match.ga > match.gb) return match.home;
  if(match.gb > match.ga) return match.away;
  return null;
}

// Todos os jogos de uma seleção, na ordem da campanha, anotados com
// journeyIndex / favoriteSide / resultado sob a ótica da favorita.
function getTeamMatches(sim, teamName){
  if(!sim || !teamName) return [];
  const groupMatches = sim.groups.flatMap(g => g.matches);
  const knockoutMatches = [
    ...sim.knockout.R32, ...sim.knockout.R16, ...sim.knockout.QF, ...sim.knockout.SF,
    sim.knockout.third, sim.knockout.final,
  ];
  return [...groupMatches, ...knockoutMatches]
    .filter(m => m.home === teamName || m.away === teamName)
    .map((m, i) => ({
      ...m,
      journeyIndex: i,
      favoriteSide: m.home === teamName ? "home" : "away",
      favoriteWon: getMatchWinnerTeam(m) === teamName,
      favoriteDrew: !getMatchWinnerTeam(m),
      opponent: m.home === teamName ? m.away : m.home,
    }));
}

function allTournamentMatches(sim){
  if(!sim) return [];
  return [
    ...sim.groups.flatMap(g => g.matches),
    ...sim.knockout.R32, ...sim.knockout.R16, ...sim.knockout.QF, ...sim.knockout.SF,
    sim.knockout.third, sim.knockout.final,
  ].filter(Boolean).slice().sort((a, b) => (a.matchNo || 999) - (b.matchNo || 999));
}

// Agrupa o torneio em dias de calendário ordenados (base da jornada).
function tournamentDays(sim){
  const byDate = new Map();
  allTournamentMatches(sim).forEach(match => {
    const key = match.dateISO || `match-${match.matchNo || 0}`;
    if(!byDate.has(key)){
      byDate.set(key, {dateISO:key, dateLabel:match.dateLabel || match.kickoff || "Data a definir", matches:[]});
    }
    byDate.get(key).matches.push(match);
  });
  return [...byDate.values()]
    .sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)))
    .map((day, i) => ({
      ...day,
      dayIndex: i,
      matches: day.matches.sort((a, b) => (a.matchNo || 999) - (b.matchNo || 999)),
    }));
}

// Maior fase do mata-mata já vivida pela favorita entre os jogos revelados.
function favoriteFrontierKO(matches, revealed){
  let frontier = 0;
  for(let i = 0; i < revealed && i < matches.length; i++){
    const m = matches[i];
    if(!isGroupStage(m)) frontier = Math.max(frontier, KO_ORDER[m.stage] || 0);
  }
  return frontier;
}

function matchFavoriteIndex(match, favoriteMatches){
  return favoriteMatches.findIndex(m => m.matchNo === match.matchNo);
}

// Jogos do calendário após o último jogo da favorita (modo espectador).
function observerMatchesAfterFavorite(sim, favoriteMatches){
  const last = favoriteMatches[favoriteMatches.length - 1];
  if(!last) return allTournamentMatches(sim);
  return allTournamentMatches(sim).filter(m => (m.matchNo || 0) > (last.matchNo || 0));
}

function groupRowForTeam(sim, team){
  return sim.groups.flatMap(g => g.table.map(r => ({...r, group:g.letter}))).find(r => r.team === team);
}

function favoriteGroup(sim, team){
  return sim.groups.find(g => g.teams.includes(team)) || null;
}

/* =================================================================
   RELÓGIO DA JORNADA (minutos de 0–1439 dentro de um dia)
   ================================================================= */
const JOURNEY_DAY_MINUTES = 1440;
const JOURNEY_MORNING_START = 300;   // 05:00 — início do período diurno
const JOURNEY_NIGHT_START = 1080;    // 18:00 — início do período noturno

// "16h" / "21h30" -> minuto do dia (default: meio-dia)
function parseMatchMinute(time){
  const text = String(time || "").trim().toLowerCase();
  const parsed = text.match(/(\d{1,2})h(?:(\d{2}))?/);
  if(!parsed) return 12 * 60;
  return Math.max(0, Math.min(JOURNEY_DAY_MINUTES - 1, (Number(parsed[1]) % 24) * 60 + Number(parsed[2] || 0)));
}

function formatJourneyMinute(minute){
  const m = Math.max(0, Math.min(JOURNEY_DAY_MINUTES - 1, minute | 0));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function daysBetweenISO(fromISO, toISO){
  if(!fromISO || !toISO) return null;
  const from = Date.parse(`${fromISO}T00:00:00`);
  const to = Date.parse(`${toISO}T00:00:00`);
  if(!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86400000));
}

function periodForMinute(minute){
  return minute >= JOURNEY_MORNING_START && minute < JOURNEY_NIGHT_START ? "day" : "night";
}
function dayPhaseForMinute(minute){
  return periodForMinute(minute) === "day" ? "morning" : "night";
}

// Minuto absoluto desde o dia 0 (compara momentos entre dias diferentes).
function absoluteJourneyMinute(dayIndex, minute){
  return Math.max(0, dayIndex | 0) * JOURNEY_DAY_MINUTES + Math.max(0, Math.min(JOURNEY_DAY_MINUTES - 1, minute | 0));
}

// Todos os jogos dos dias informados, ordenados pelo minuto absoluto.
function matchesWithAbsoluteMinutes(days){
  return (days || []).flatMap((day, dayIndex) => (day.matches || []).map(match => ({
    match,
    dayIndex,
    minute: parseMatchMinute(match.time),
    abs: absoluteJourneyMinute(dayIndex, parseMatchMinute(match.time)),
  }))).sort((a, b) => a.abs - b.abs || (a.match.matchNo || 999) - (b.match.matchNo || 999));
}

export { KO_ORDER, absoluteJourneyMinute, allTournamentMatches, dayPhaseForMinute, daysBetweenISO, favoriteFrontierKO, favoriteGroup, formatJourneyMinute, getMatchWinnerTeam, getTeamMatches, groupRowForTeam, isGroupStage, matchFavoriteIndex, matchesWithAbsoluteMinutes, observerMatchesAfterFavorite, parseMatchMinute, periodForMinute, tournamentDays };
