"use strict";

function safeStorageGet(key){ try{return localStorage.getItem(key);}catch{return null;} }
function safeStorageSet(key,value){ try{localStorage.setItem(key,value);}catch{} }
function safeStorageRemove(key){ try{localStorage.removeItem(key);}catch{} }

/* =================================================================
   SIMULAÇÕES SALVAS PELO USUÁRIO
   -----------------------------------------------------------------
   Não há mais 3 simulações "padrão". O usuário cria simulações
   (seleção + tipo), cada uma é salva no localStorage e pode ser
   aberta, deletada ou usada para gerar uma nova. O objeto completo
   é regenerado de forma determinística a partir do seed salvo.
   ================================================================= */
const SIM_STORE_KEY  = "wc_simulations_v1";
const SIM_ACTIVE_KEY = "wc_active_simulation_v1";
const simCache = new Map();                       // id -> objeto de simulação completo

const state = { sims:[], meta:[], custom:null, active:0 };  // espelho usado pelo dashboard
const appState = {
  sims: [],            // registros: {id,favoriteTeam,type,seed,createdAt,revealed,finished,dashboardUnlocked}
  activeId: null,
  draftTeam: null,     // assistente de criação
  teamSearch: "",
  view: "picker-team", // picker-team | picker-type | journey | dashboard
  currentSimulatedMatch: null,
  matchTimer: null,
  penaltyTimers: [],
  matchAnimationStarted: false,
};
const uid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
function timeAgo(ts){
  const d=Math.max(0,Date.now()-ts), m=Math.floor(d/60000), h=Math.floor(m/60), dd=Math.floor(h/24);
  if(dd>0) return `há ${dd}d`; if(h>0) return `há ${h}h`; if(m>0) return `há ${m}min`; return "agora";
}
function persistSims(){
  safeStorageSet(SIM_STORE_KEY, JSON.stringify(appState.sims));
  safeStorageSet(SIM_ACTIVE_KEY, appState.activeId || "");
}
function loadSims(){
  let arr=[]; try{ arr=JSON.parse(safeStorageGet(SIM_STORE_KEY)||"[]"); }catch{ arr=[]; }
  appState.sims = (Array.isArray(arr)?arr:[])
    .filter(r=>r && TEAMS[r.favoriteTeam] && simulationProfiles[r.type])
    .map(r=>{
      const revealed=Math.max(0,r.revealed|0);
      const dayPhase = r.dayPhase==="night" || (!r.dayPhase && revealed>0) ? "night" : "morning";
      const tactics = (r.tactics && typeof r.tactics==="object") ? r.tactics : {};
      const watchIndex=Math.max(0,r.watchIndex|0);
      const calendarDayIndex=Math.max(0,r.calendarDayIndex|0);
      const journeyMinute=Number.isFinite(r.journeyMinute) ? Math.max(0, Math.min(1439, r.journeyMinute|0)) : 300;
      const watchedMatchNos=Array.isArray(r.watchedMatchNos) ? r.watchedMatchNos.map(Number).filter(Boolean) : [];
      return { id:r.id||uid(), favoriteTeam:r.favoriteTeam, type:r.type, seed:(r.seed>>>0)||1,
        createdAt:r.createdAt||Date.now(), revealed, tactics,
        watchIndex, calendarDayIndex, journeyMinute, watchedMatchNos, finished:!!r.finished, dashboardUnlocked:!!r.dashboardUnlocked, dayPhase };
    });
  const act=safeStorageGet(SIM_ACTIVE_KEY);
  appState.activeId = appState.sims.some(r=>r.id===act) ? act : (appState.sims[0]?.id || null);
}
function profileNameFor(record){ return `${record.favoriteTeam} · ${profileFor(record.type).label}`; }
function simObjFor(record){
  if(!record) return null;
  if(simCache.has(record.id)) return simCache.get(record.id);
  const p=profileFor(record.type);
  // MODO TÉCNICO: as táticas escolhidas pelo usuário (por jogo da favorita)
  // entram como simOptions. managerSeed = seed pedido (fixo) garante que os
  // jogos já jogados não mudem ao definir a tática de um jogo futuro.
  const simOptions={ favoriteTeam:record.favoriteTeam, tactics:record.tactics||{}, managerSeed:record.seed };
  const obj=tagSimulation(simulateWithRankingProtection(record.seed, p.chaos, profileNameFor(record), p.label, simOptions), record.type);
  obj.__recordId=record.id;
  simCache.set(record.id, obj);
  return obj;
}
function activeRecord(){ return appState.sims.find(r=>r.id===appState.activeId) || null; }
function currentSim(){ return simObjFor(activeRecord()); }
function createSimulation(team, type){
  const rec={ id:uid(), favoriteTeam:team, type, seed:((Date.now()^(Math.random()*1e9))>>>0)||1,
    createdAt:Date.now(), revealed:0, watchIndex:0, calendarDayIndex:0, journeyMinute:300, watchedMatchNos:[], tactics:{}, finished:false, dashboardUnlocked:false, dayPhase:"morning" };
  appState.sims.push(rec); appState.activeId=rec.id; persistSims();
  return rec;
}
// Define/atualiza a tática do jogo `journeyIndex` da favorita e invalida o cache
// da simulação para que o motor recompute com a nova escolha. Só permitido para
// um jogo ainda NÃO revelado (não reescreve o passado).
function setMatchTactic(record, journeyIndex, tactic){
  if(!record || journeyIndex<record.revealed) return;
  record.tactics = record.tactics || {};
  record.tactics[journeyIndex] = tactic;
  simCache.delete(record.id);
  persistSims();
}
function deleteSimulation(id){
  appState.sims = appState.sims.filter(r=>r.id!==id);
  simCache.delete(id);
  if(appState.activeId===id) appState.activeId = appState.sims[0]?.id || null;
  persistSims();
}
function setActiveSimulation(id){ appState.activeId=id; persistSims(); }
function markMatchRevealed(record, journeyIndex){
  if(!record) return;
  const sim=simObjFor(record);
  const total=getTeamMatches(sim, record.favoriteTeam).length;
  record.revealed = Math.min(total, Math.max(record.revealed, journeyIndex+1));
  if(record.revealed>=total){
    record.finished=false;
    record.watchIndex=record.watchIndex||0;
  }
  persistSims();
}
function syncDashboardState(){
  state.sims = appState.sims.map(simObjFor);
  state.meta = appState.sims.map(r=>{ const p=profileFor(r.type); return {sub:p.sub,color:p.color,type:r.type}; });
  state.active = Math.max(0, appState.sims.findIndex(r=>r.id===appState.activeId));
}
