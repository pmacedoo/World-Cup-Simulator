
/* =================================================================
   STORE DE SIMULAÇÕES + ESTADO GLOBAL DA APLICAÇÃO
   -----------------------------------------------------------------
   O usuário cria simulações (seleção favorita + tipo). Cada registro
   é persistido via camada de storage e o objeto completo do torneio
   é regenerado de forma determinística a partir do seed salvo —
   nunca é serializado.

   Registro persistido (appState.sims[i]):
     id, favoriteTeam, type, seed, createdAt,
     revealed            -> nº de jogos da favorita já revelados
     tactics             -> { journeyIndex: tática } escolhidas no modo técnico
     defaultTactic       -> última tática pré-jogo confirmada, usada como padrão
     watchIndex          -> progresso do modo espectador (pós-eliminação)
     calendarDayIndex    -> dia atual do calendário da jornada
     journeyMinute       -> minuto do relógio da jornada (0–1439)
     watchedMatchNos     -> jogos do calendário já assistidos
     finished, dashboardUnlocked, dayPhase ("morning"|"night")
   ================================================================= */

import { TEAMS } from "../data/worldcup-data.js";
import { simulateWithRankingProtection } from "../engine/simulation.js";
import { getTeamMatches } from "../domain/matches/match-queries.js";
import { STORAGE_KEYS, storageGet, storageGetJSON, storageSet, storageSetJSON } from "./storage.js";
import { profileFor, simulationProfiles, tagSimulation } from "./simulation-profiles.js";

// Cache id -> objeto de simulação completo (recriado sob demanda).
const simCache = new Map();

const appState = {
  sims: [],                    // registros persistidos (ver acima)
  activeId: null,              // id da simulação ativa
  draftTeam: null,             // seleção escolhida no assistente de criação
  teamSearch: "",              // filtro do seletor de seleções
  view: "picker-team",         // picker-team | picker-type | journey | dashboard
  mobileJourneyTab: "game",    // aba ativa da jornada no layout mobile
  darkMode: false,             // preferência de modo escuro (persistida)
  // -- partida em exibição no simulador --
  currentSimulatedMatch: null, // {match, journeyIndex, minute, finished}
  matchTimer: null,            // setInterval da transmissão acelerada
  penaltyTimers: [],           // timeouts da disputa de pênaltis
  liveSubPaused: false,        // painel de substituição ao vivo aberto
  // -- avanço automático do relógio da jornada --
  autoAdvancing: false,
  autoAdvanceTimer: null,
};

const createSimulationId = () =>
  "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function timeAgo(timestamp){
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  if(days > 0) return `há ${days}d`;
  if(hours > 0) return `há ${hours}h`;
  if(minutes > 0) return `há ${minutes}min`;
  return "agora";
}

/* ---------- persistência ---------- */
function persistSims(){
  storageSetJSON(STORAGE_KEYS.simulations, appState.sims);
  storageSet(STORAGE_KEYS.activeSimulation, appState.activeId || "");
}

// Carrega e SANEIA os registros salvos: descarta simulações de seleções
// ou perfis que não existem mais e normaliza campos numéricos/novos,
// mantendo compatibilidade com saves de versões anteriores.
function loadSims(){
  const raw = storageGetJSON(STORAGE_KEYS.simulations, []);
  appState.sims = (Array.isArray(raw) ? raw : [])
    .filter(record => record && TEAMS[record.favoriteTeam] && simulationProfiles[record.type])
    .map(normalizeSimulationRecord);
  const savedActiveId = storageGet(STORAGE_KEYS.activeSimulation);
  appState.activeId = appState.sims.some(r => r.id === savedActiveId)
    ? savedActiveId
    : (appState.sims[0]?.id || null);
}

function normalizeSimulationRecord(record){
  const revealed = Math.max(0, record.revealed | 0);
  return {
    id: record.id || createSimulationId(),
    favoriteTeam: record.favoriteTeam,
    type: record.type,
    seed: (record.seed >>> 0) || 1,
    createdAt: record.createdAt || Date.now(),
    revealed,
    tactics: (record.tactics && typeof record.tactics === "object") ? record.tactics : {},
    defaultTactic: cloneTactic(record.defaultTactic, false),
    watchIndex: Math.max(0, record.watchIndex | 0),
    calendarDayIndex: Math.max(0, record.calendarDayIndex | 0),
    journeyMinute: Number.isFinite(record.journeyMinute)
      ? Math.max(0, Math.min(1439, record.journeyMinute | 0))
      : 300,
    watchedMatchNos: Array.isArray(record.watchedMatchNos)
      ? record.watchedMatchNos.map(Number).filter(Boolean)
      : [],
    finished: !!record.finished,
    dashboardUnlocked: !!record.dashboardUnlocked,
    // saves antigos não tinham dayPhase: jornada já iniciada assume "night"
    dayPhase: record.dayPhase === "night" || (!record.dayPhase && revealed > 0) ? "night" : "morning",
  };
}

/* ---------- acesso à simulação ativa ---------- */
function profileNameFor(record){ return `${record.favoriteTeam} · ${profileFor(record.type).label}`; }

// Regenera (ou devolve do cache) o objeto completo do torneio de um registro.
// As táticas do modo técnico entram na simulação da campanha da favorita:
// XI/cobradores definem quem está em campo e os deltas mexem no xG.
function simObjFor(record){
  if(!record) return null;
  if(simCache.has(record.id)) return simCache.get(record.id);
  const profile = profileFor(record.type);
  const sim = tagSimulation(
    simulateWithRankingProtection(record.seed, profile.chaos, profileNameFor(record), profile.label, {
      favoriteTeam: record.favoriteTeam,
      tactics: record.tactics || {},
    }),
    record.type
  );
  sim.__recordId = record.id;
  simCache.set(record.id, sim);
  return sim;
}

function activeRecord(){ return appState.sims.find(r => r.id === appState.activeId) || null; }
function currentSim(){ return simObjFor(activeRecord()); }

/* ---------- mutações ---------- */
function createSimulation(favoriteTeam, type){
  const record = {
    id: createSimulationId(),
    favoriteTeam,
    type,
    seed: ((Date.now() ^ (Math.random() * 1e9)) >>> 0) || 1,
    createdAt: Date.now(),
    revealed: 0,
    tactics: {},
    defaultTactic: null,
    watchIndex: 0,
    calendarDayIndex: 0,
    journeyMinute: 300,
    watchedMatchNos: [],
    finished: false,
    dashboardUnlocked: false,
    dayPhase: "morning",
  };
  appState.sims.push(record);
  appState.activeId = record.id;
  persistSims();
  return record;
}

function deleteSimulation(id){
  appState.sims = appState.sims.filter(r => r.id !== id);
  simCache.delete(id);
  if(appState.activeId === id) appState.activeId = appState.sims[0]?.id || null;
  persistSims();
}

function setActiveSimulation(id){
  appState.activeId = id;
  persistSims();
}

function cloneTactic(tactic, keepLiveScript = true){
  if(!tactic || typeof tactic !== "object") return null;
  return {
    formation: tactic.formation || "4-3-3",
    starters: Array.isArray(tactic.starters) ? tactic.starters.slice(0, 11) : [],
    captain: tactic.captain || "",
    penaltyTaker: tactic.penaltyTaker || "",
    freeKickTaker: tactic.freeKickTaker || "",
    cornerTaker: tactic.cornerTaker || "",
    mentality: tactic.mentality || "balanced",
    positions: Object.fromEntries(Object.entries(tactic.positions || {}).map(([name, pos]) => [name, {...pos}])),
    liveScript: keepLiveScript && Array.isArray(tactic.liveScript)
      ? tactic.liveScript.map(ev => ({...ev}))
      : [],
  };
}

function setDefaultTactic(record, tactic){
  if(!record) return;
  record.defaultTactic = cloneTactic(tactic, false);
  persistSims();
}

// Define a tática do jogo `journeyIndex` da favorita e invalida o cache
// para que o torneio seja regenerado com ela. Só é permitido para um jogo
// ainda NÃO revelado (não reescreve o passado).
function setMatchTactic(record, journeyIndex, tactic){
  if(!record || journeyIndex < record.revealed) return;
  record.tactics = record.tactics || {};
  record.tactics[journeyIndex] = cloneTactic(tactic, true);
  simCache.delete(record.id);
  persistSims();
}

// Marca o jogo `journeyIndex` da favorita como revelado (idempotente:
// o progresso nunca anda para trás).
function markMatchRevealed(record, journeyIndex){
  if(!record) return;
  const sim = simObjFor(record);
  const total = getTeamMatches(sim, record.favoriteTeam).length;
  record.revealed = Math.min(total, Math.max(record.revealed, journeyIndex + 1));
  if(record.revealed >= total){
    record.finished = false;          // "finished" = calendário todo assistido, não só a campanha
    record.watchIndex = record.watchIndex || 0;
  }
  persistSims();
}

export { activeRecord, appState, createSimulation, currentSim, deleteSimulation, loadSims, markMatchRevealed, persistSims, setActiveSimulation, setDefaultTactic, setMatchTactic, simObjFor, timeAgo };
