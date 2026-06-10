
/* =================================================================
   SUBSTITUIÇÃO AO VIVO (durante a partida)
   -----------------------------------------------------------------
   Pausa a transmissão, deixa o usuário escolher sai/entra (clique ou
   drag and drop), grava as trocas no roteiro da tática (liveScript)
   e re-simula. Como o seed do jogo é estável por setup, os minutos já
   exibidos não mudam: a partida apenas RETOMA do minuto da troca.

   Regras FIFA aplicadas: limite total de trocas (5, ou 6 com
   prorrogação), até 3 trocas por parada e no máximo 3 paradas com
   bola rolando — o intervalo não conta como parada.
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
import { WC_LINEUPS } from "../../engine/lineups.js";
import { getTeamMatches } from "../../domain/matches/match-queries.js";
import { activeRecord, appState, currentSim, setMatchTactic } from "../../state/simulation-store.js";
import { $, UI, cx, getFavoriteTeam, ic, paintIcons, playerCard } from "../render-helpers.js";
import { FIELD_IMAGE_URL, POS_GROUPS } from "./lineup-editor.js";
import { simulateMatch } from "./match-simulator.js";
const LIVE_SUB_PER_WINDOW = 3;      // até 3 trocas na MESMA parada
const LIVE_SUB_INPLAY_WINDOWS = 3;  // máx. de paradas com bola rolando
// goleiros ficam fora do banco de trocas ao vivo (regra do app), então o
// carrossel pula a página "Goleiro" — no planejador pré-jogo ela existe.
// Função (e não const de topo): este módulo participa de um ciclo de
// imports com lineup-editor e POS_GROUPS ainda não existe na avaliação.
const liveSubPosGroups = () => POS_GROUPS.filter(g => g.pos !== "GK");

let liveSubDraft = null;            // [{out,in}] em edição na janela atual
let liveSubCtx = null;              // contexto da janela aberta
let liveSubCarouselIndex = 0;       // índice do carrossel de posições
let liveSubFieldSelection = null;   // jogador de campo selecionado p/ sair
let liveSubBenchSelection = null;   // reserva selecionado p/ entrar
let liveSubSuppressClickUntil = 0;  // evita clique fantasma pós-drag
let lastConfirmedSubs = null;       // [{out,in}] da última janela confirmada

// Consumido pela transmissão ao retomar, para exibir a confirmação.
function consumeLastConfirmedSubs(){
  const subs = lastConfirmedSubs;
  lastConfirmedSubs = null;
  return subs;
}

/* ---------- estado da janela ---------- */
// Quem está em campo no minuto dado, aplicando as trocas do roteiro.
function onFieldNamesAt(tactic, minute){
  const field = new Set(tactic.starters || []);
  (tactic.liveScript || []).filter(e => e.type === "sub" && e.out && e.in)
    .slice().sort((a, b) => (a.minute | 0) - (b.minute | 0))
    .forEach(sub => { if((sub.minute | 0) <= minute){ field.delete(sub.out); field.add(sub.in); } });
  return field;
}

// Janelas já usadas: o intervalo (min 45–46) não conta nas paradas.
function subWindowInfo(liveScript){
  const subs = (liveScript || []).filter(e => e.type === "sub");
  const isHalftime = m => (m | 0) >= 45 && (m | 0) <= 46;
  const inPlayMinutes = [...new Set(subs.map(s => s.minute | 0).filter(m => !isHalftime(m)))];
  return {
    total: subs.length,
    inPlayWindows: inPlayMinutes.length,
    inPlayMins: new Set(inPlayMinutes),
    halftimeUsed: subs.some(s => isHalftime(s.minute)),
  };
}

function clearLiveSubPicker(){
  const mount = $("#liveSubMount");
  if(mount) mount.innerHTML = "";
  appState.liveSubPaused = false;
  liveSubDraft = null;
  liveSubCtx = null;
  liveSubBenchSelection = null;
  liveSubCarouselIndex = 0;
  liveSubFieldSelection = null;
}

function openHalftimeBreak(){
  // Mostra popup de intervalo primeiro; o usuário decide se faz trocas
  const mount = $("#liveSubMount");
  if(!mount) return;
  appState.liveSubPaused = true;
  const item = appState.currentSimulatedMatch;
  if(!item) return;
  const {match} = item;
  // placar do INTERVALO: só os gols do 1º tempo (minuto <= 45), senão mostraria o placar final
  const firstHalf = (match.goals || []).filter(g => (g.minute | 0) <= 45);
  const homeGoals = firstHalf.filter(g => g.team === match.home).length;
  const awayGoals = firstHalf.filter(g => g.team === match.away).length;
  const scoreHalf = `${homeGoals} × ${awayGoals}`;
  // switch para aba "subs"
  item.matchTab = "subs";
  const shell = $("#matchScreenShell");
  if(shell) shell.dataset.matchTab = "subs";
  document.querySelectorAll("#matchSimulatorBox [data-match-tab]").forEach(btn => {
    const active = btn.dataset.matchTab === "subs";
    btn.classList.toggle("active", active);
    if(active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  mount.innerHTML = `
    <div class="guided-card rounded-3xl border-2 border-gold-400/50 halftime-modal">
      <div class="halftime-modal-body">
        <div class="halftime-modal-icon">${ic('coffee','w-8 h-8 text-gold-600')}</div>
        <div class="halftime-modal-title">Intervalo</div>
        <div class="halftime-modal-score">${scoreHalf}</div>
        <div class="halftime-modal-subtitle">1º tempo encerrado</div>
      </div>
      <div class="halftime-modal-actions">
        <button id="halftimeContinue" class="btn-premium text-white rounded-2xl px-5 py-3 font-extrabold flex-1">Continuar 2º tempo</button>
        <button id="halftimeMakeSubs" class="glass rounded-2xl px-5 py-3 font-extrabold text-usablue flex-1">Fazer alterações</button>
      </div>
    </div>`;
  paintIcons();
  $("#halftimeContinue").onclick = () => {
    clearLiveSubPicker();
    simulateMatch(match, 45);
  };
  $("#halftimeMakeSubs").onclick = () => {
    mount.innerHTML = "";
    appState.liveSubPaused = false;
    openLiveSubPicker("halftime");
  };
  mount.scrollIntoView({behavior:"smooth", block:"nearest"});
}

function openLiveSubPicker(mode){
  mode = mode === "halftime" ? "halftime" : "live";
  const item = appState.currentSimulatedMatch;
  if(!item || appState.liveSubPaused) return;
  if(mode === "live" && !appState.matchTimer) return;   // live só com a bola rolando
  const {match, journeyIndex} = item;
  const fav = getFavoriteTeam(), record = activeRecord();
  if(!record || journeyIndex !== record.revealed) return;
  if(match.home !== fav && match.away !== fav) return;
  if(mode === "live"){ clearInterval(appState.matchTimer); appState.matchTimer = null; }
  appState.liveSubPaused = true;
  if(item) item.matchTab = "subs";
  const shell = $("#matchScreenShell");
  if(shell) shell.dataset.matchTab = "subs";
  document.querySelectorAll("#matchSimulatorBox [data-match-tab]").forEach(btn => {
    const active = btn.dataset.matchTab === "subs";
    btn.classList.toggle("active", active);
    if(active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  const maxMinute = match.aet ? 120 : 90;
  const currentMinute = Math.max(1, Math.min(maxMinute - 1, item.minute || 1));
  const tactic = (record.tactics && record.tactics[journeyIndex]) || WC_LINEUPS.autoTactic(fav);
  const totalMax = match.aet ? 6 : 5;
  const info = subWindowInfo(tactic.liveScript);
  const squad = TEAMS[fav].sq;
  const posOf = name => squad.find(p => p[0] === name)?.[1];
  const rank = name => WC_LINEUPS.playerRank(fav, name);
  const subMinute = mode === "halftime" ? 46 : currentMinute;
  const baseField = onFieldNamesAt(tactic, mode === "halftime" ? 45 : currentMinute);
  const usedIn = new Set((tactic.liveScript || []).filter(e => e.type === "sub").map(e => e.in));
  const benchPool = squad.map(p => p[0])
    .filter(name => !baseField.has(name) && !usedIn.has(name) && posOf(name) !== "GK")
    .sort((a, b) => rank(b) - rank(a));
  const newInPlayWindow = mode === "live" && !info.inPlayMins.has(subMinute);
  const blockedReason = info.total >= totalMax ? "total"
    : (newInPlayWindow && info.inPlayWindows >= LIVE_SUB_INPLAY_WINDOWS) ? "window" : null;

  liveSubCtx = {mode, match, journeyIndex, fav, subMinute, resumeMinute:currentMinute, totalMax, info, baseField, benchPool, posOf, rank, blockedReason};
  liveSubDraft = [{out:"", in:""}];
  renderLiveSubPicker();
}

function liveSubMaxRows(){
  const {totalMax, info, benchPool} = liveSubCtx;
  return Math.max(1, Math.min(LIVE_SUB_PER_WINDOW, totalMax - info.total, benchPool.length));
}

// Registra uma troca (campo <- banco) no rascunho da janela atual.
function handleSubDrop(fieldPlayer, benchPlayer){
  if(!liveSubCtx || !liveSubDraft || !fieldPlayer || !benchPlayer) return;
  const {benchPool, posOf} = liveSubCtx;
  if(!benchPool.includes(benchPlayer)) return;
  if(posOf(fieldPlayer) === "GK") return;
  if(liveSubDraft.some(r => r.in === benchPlayer && r.out !== fieldPlayer)) return;   // reserva já usado em outra linha
  const existing = liveSubDraft.find(r => r.out === fieldPlayer);
  if(existing){ existing.in = benchPlayer; renderLiveSubPicker(); return; }
  const empty = liveSubDraft.find(r => !r.out && !r.in);
  if(empty){ empty.out = fieldPlayer; empty.in = benchPlayer; renderLiveSubPicker(); return; }
  if(liveSubDraft.length < liveSubMaxRows()){
    liveSubDraft.push({out:fieldPlayer, in:benchPlayer});
    renderLiveSubPicker();
  }
}

/* ---------- campo + carrossel ---------- */
// Nome em círculo: "L. Messi" quebrado em inicial + sobrenome.
function liveSubCircleName(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const sizeClass = s => s.length > 12 ? "tiny" : s.length > 9 ? "small" : "";
  if(parts.length <= 1) return `<span class="lineup-main ${sizeClass(name)}">${name || ""}</span>`;
  const first = `${parts[0][0]}.`;
  const surname = parts.slice(1).join(" ");
  return `<span class="lineup-initial">${first}</span><span class="lineup-surname ${sizeClass(surname)}">${surname}</span>`;
}

// Distribui os jogadores em campo nos slots da formação atual.
function liveSubFieldSlots(tactic, baseField, posOf){
  const formation = tactic.formation || "4-3-3";
  const nums = String(formation).match(/\d+/g)?.map(Number) || [4, 3, 3];
  const distY = count => ({1:[50],2:[35,65],3:[25,50,75],4:[18,39,61,82],5:[14,32,50,68,86]})[count] || [18,39,61,82];
  const lines = nums.length >= 4
    ? [{pos:"GK",x:11,count:1},{pos:"DF",x:29,count:nums[0]},{pos:"MF",x:43,count:nums[1]},{pos:"MF",x:57,count:nums[2]},{pos:"FW",x:71,count:nums[3]}]
    : [{pos:"GK",x:11,count:1},{pos:"DF",x:30,count:nums[0]||4},{pos:"MF",x:50,count:nums[1]||3},{pos:"FW",x:69,count:nums[2]||3}];
  const slots = lines.flatMap(line => distY(line.count).map(y => ({pos:line.pos, x:line.x, y, name:""})));

  // 1) posição salva na tática; 2) posição natural; 3) qualquer slot vago
  const savedPositions = tactic.positions || {};
  const placed = new Set();
  const fieldNames = [...baseField];
  fieldNames.forEach(name => {
    const saved = savedPositions[name];
    if(!saved) return;
    const slot = slots.find(s => !s.name && s.pos === (saved.pos || posOf(name)));
    if(slot){ slot.name = name; placed.add(name); }
  });
  fieldNames.forEach(name => {
    if(placed.has(name)) return;
    const slot = slots.find(s => !s.name && s.pos === posOf(name));
    if(slot){ slot.name = name; placed.add(name); }
  });
  fieldNames.forEach(name => {
    if(placed.has(name)) return;
    const slot = slots.find(s => !s.name);
    if(slot){ slot.name = name; placed.add(name); }
  });
  return {slots, formation};
}

function buildLiveSubField(){
  if(!liveSubCtx) return "";
  const {fav, journeyIndex, baseField, posOf:ctxPosOf} = liveSubCtx;
  const record = activeRecord();
  if(!record) return "";
  const tactic = (record.tactics && record.tactics[journeyIndex]) || WC_LINEUPS.autoTactic(fav);
  const squad = TEAMS[fav]?.sq;
  if(!squad) return "";
  const posOf = name => squad.find(p => p[0] === name)?.[1] || ctxPosOf(name) || "MF";
  const {slots, formation} = liveSubFieldSlots(tactic, baseField, posOf);

  const outSet = new Set((liveSubDraft || []).filter(r => r.out).map(r => r.out));
  const slotDivs = slots.filter(s => s.name).map(slot => {
    const isOut = outSet.has(slot.name);
    const isSelected = liveSubFieldSelection === slot.name;
    const canInteract = slot.pos !== "GK";
    const toneClass = isOut ? "sub-out-player" : isSelected ? "ls-field-sel-bubble" : "pos-tone-" + slot.pos.toLowerCase();
    const dataAttrs = canInteract ? `data-field-name="${slot.name}" data-field-pos="${slot.pos}"` : "";
    const cls = `lineup-drop-slot filled${canInteract ? " sub-drop-target" : ""}`;
    return `<div class="${cls}" ${dataAttrs} style="left:${slot.x}%;top:${slot.y}%;${canInteract ? "cursor:pointer" : ""}">
      <div class="lineup-field-player ${toneClass}">
        <span class="lineup-pos">${slot.pos}</span>
        <span class="lineup-name">${liveSubCircleName(slot.name)}</span>
      </div>
    </div>`;
  }).join("");

  return `<div class="lineup-field-wrap">
    <img class="lineup-field-img" src="${FIELD_IMAGE_URL}" alt="">
    <div class="lineup-field-overlay">${slotDivs}</div>
    <div class="ls-formation-badge">${formation}</div>
  </div>`;
}

function buildLiveSubCarousel(){
  if(!liveSubCtx) return "";
  const {fav, baseField, benchPool, posOf:ctxPosOf} = liveSubCtx;
  const squad = TEAMS[fav]?.sq || [];
  const posOf = name => squad.find(p => p[0] === name)?.[1] || ctxPosOf(name) || "MF";
  const inSet = new Set((liveSubDraft || []).filter(r => r.in).map(r => r.in));
  const outSet = new Set((liveSubDraft || []).filter(r => r.out).map(r => r.out));
  const groupIndex = Math.max(0, Math.min(liveSubCarouselIndex, liveSubPosGroups().length - 1));
  const group = liveSubPosGroups()[groupIndex];
  const groupPlayers = benchPool.filter(name => posOf(name) === group.pos);

  const cards = groupPlayers.map(name => {
    const isOnField = baseField.has(name);
    const isBench = benchPool.includes(name);
    const isOut = outSet.has(name);
    const isIn = inSet.has(name);
    const isFieldSel = liveSubFieldSelection === name;
    const isBenchSel = liveSubBenchSelection === name;
    const canInteract = !isOut && !isIn && (isBench || isOnField);
    let statusLabel, statusCls;
    if(isOut){ statusLabel = "Saindo"; statusCls = "ls-status-out"; }
    else if(isIn){ statusLabel = "Entrando"; statusCls = "ls-status-in"; }
    else if(isFieldSel){ statusLabel = "Selecionado · sai"; statusCls = "ls-status-sel"; }
    else if(isBenchSel){ statusLabel = "Selecionado · entra"; statusCls = "ls-status-sel"; }
    else if(isOnField){ statusLabel = "Titular"; statusCls = "ls-status-field"; }
    else if(isBench){ statusLabel = "Reserva"; statusCls = "ls-status-bench"; }
    else { statusLabel = "Fora"; statusCls = "ls-status-bench"; }
    let extraCls = "";
    if(isFieldSel || isBenchSel) extraCls = "ls-player-sel";
    else if(isOut || isIn) extraCls = "ls-player-used";
    else if(!canInteract) extraCls = "opacity-50 pointer-events-none";
    const icon = isOut ? ic('arrow-up-from-line','w-3 h-3 flex-none')
      : isIn ? ic('arrow-down-to-line','w-3 h-3 flex-none')
      : isFieldSel || isBenchSel ? ic('check','w-3 h-3 flex-none') : "";
    return `<button type="button" class="ls-card ${extraCls}" draggable="${isBench && !isIn && !isOut ? 'true' : 'false'}"
      data-ls-player="${name}" data-ls-field="${isOnField ? '1' : ''}" data-ls-bench="${isBench ? '1' : ''}">
      ${playerCard(name, { team: fav, size: "sm" })}
      <span class="ls-card-tag ${statusCls}">${icon}${statusLabel}</span>
    </button>`;
  }).join("");

  return `<div class="lineup-player-carousel">
    <div class="flex items-center justify-between gap-3 mb-3">
      <button class="pos-carousel-btn" data-ls-dir="-1" aria-label="Posição anterior">${ic('chevron-left','w-4 h-4')}</button>
      <div class="text-center min-w-0">
        <div class="${cx(UI.label10, "mb-0.5")}">Banco de reservas</div>
        <div class="font-display font-extrabold text-lg leading-tight">${group.label}</div>
      </div>
      <button class="pos-carousel-btn" data-ls-dir="1" aria-label="Próxima posição">${ic('chevron-right','w-4 h-4')}</button>
    </div>
    <div class="flex justify-center gap-1.5 mb-3">
      ${liveSubPosGroups().map((g, idx) => `<button class="pos-carousel-dot ${idx === groupIndex ? 'active' : ''}" data-ls-dot="${idx}" title="${g.label}" aria-label="${g.label}"></button>`).join("")}
    </div>
    <div class="lineup-scroll-shell">
      <div class="lineup-scroll-target ls-bench-grid">${cards || `<div class="text-sm text-slate-400 py-2 text-center font-semibold">Nenhum jogador</div>`}</div>
    </div>
  </div>`;
}

/* ---------- render da janela ---------- */
function renderLiveSubPicker(){
  if(!liveSubCtx) return;
  const mount = $("#liveSubMount");
  if(!mount) return;
  const {mode, subMinute, totalMax, info, blockedReason} = liveSubCtx;
  const isHalftime = mode === "halftime";
  const readyRows = liveSubDraft.filter(r => r.out && r.in);
  const counter = `${info.total}/${totalMax} trocas · ${info.inPlayWindows}/${LIVE_SUB_INPLAY_WINDOWS} paradas`;
  const hint = liveSubBenchSelection
    ? `${ic('arrow-down-to-line','w-3.5 h-3.5 text-usablue inline-block mr-1')}<b>${liveSubBenchSelection}</b> — agora clique em quem sai`
    : liveSubFieldSelection
    ? `${ic('arrow-up-from-line','w-3.5 h-3.5 text-amber-500 inline-block mr-1')}<b>${liveSubFieldSelection}</b> sai — clique em quem entra`
    : isHalftime
    ? "Selecione quem entra e quem sai no intervalo."
    : "Clique num reserva para selecionar quem entra, depois clique em quem sai.";

  const pendingHtml = readyRows.length ? `<div class="space-y-1.5 mt-3">
    ${readyRows.map((r, i) => `<div class="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-bold">
      <span class="flex-1 truncate text-slate-700">${r.out}</span>
      <span class="text-emerald-500 shrink-0">${ic('arrow-right','w-3.5 h-3.5')}</span>
      <span class="flex-1 truncate text-slate-700">${r.in}</span>
      <button class="ls-del-row w-5 h-5 grid place-items-center text-slate-400 hover:text-usared rounded-full shrink-0" data-ri="${i}" aria-label="Remover troca">${ic('x','w-3 h-3')}</button>
    </div>`).join("")}
  </div>` : "";

  let rightPanel;
  if(blockedReason){
    const msg = blockedReason === "total"
      ? "Você já usou todas as substituições."
      : "Você já usou as 3 paradas permitidas (fora o intervalo).";
    rightPanel = `<div class="p-4">
      <div class="text-sm font-semibold text-slate-500 mb-3">${msg}</div>
      <button id="liveSubGo" class="btn-premium text-white rounded-2xl px-5 py-2.5 font-bold w-full">${isHalftime ? 'Continuar 2º tempo' : 'Continuar jogo'}</button>
    </div>`;
  } else {
    rightPanel = `<div class="p-4 flex flex-col gap-3">
      ${buildLiveSubCarousel()}
      <div class="text-[11px] text-slate-400 font-semibold leading-snug px-1">${hint}</div>
      ${pendingHtml}
      <div class="flex gap-2 pt-1">
        <button id="liveSubCancel" class="${cx(UI.glassAction, "flex-none")}">${isHalftime ? 'Sem trocas' : 'Cancelar'}</button>
        <button id="liveSubConfirm" class="${cx("btn-premium text-white rounded-2xl px-5 py-2.5 font-extrabold flex-1", !(isHalftime || readyRows.length) && "opacity-40 pointer-events-none")}">${isHalftime ? 'Continuar 2º tempo' : readyRows.length > 1 ? 'Confirmar ' + readyRows.length + ' trocas' : 'Confirmar troca'}</button>
      </div>
    </div>`;
  }

  const {fav, journeyIndex} = liveSubCtx;
  const record = activeRecord();
  const tactic = record && record.tactics && record.tactics[journeyIndex]
    ? record.tactics[journeyIndex] : WC_LINEUPS.autoTactic(fav);
  const formations = WC_LINEUPS.FORMATIONS || [];
  const curFIdx = Math.max(0, formations.indexOf(tactic.formation || "4-3-3"));
  const formationBar = formations.length > 1 ? `
    <div class="ls-formation-selector mt-3">
      <div class="${cx(UI.label10, "text-center mb-1.5")}">Esquema</div>
      <div class="flex items-center gap-2 justify-center">
        <button class="pos-carousel-btn ls-form-dir" data-ls-form-dir="-1" aria-label="Esquema anterior">${ic('chevron-left','w-4 h-4')}</button>
        <span class="font-display font-extrabold text-xl min-w-[52px] text-center">${tactic.formation || "4-3-3"}</span>
        <button class="pos-carousel-btn ls-form-dir" data-ls-form-dir="1" aria-label="Próximo esquema">${ic('chevron-right','w-4 h-4')}</button>
      </div>
      <div class="flex justify-center gap-1 mt-1.5">
        ${formations.map((f, idx) => `<button class="pos-carousel-dot ${idx === curFIdx ? 'active' : ''}" data-ls-form-dot="${f}" title="${f}" aria-label="${f}"></button>`).join("")}
      </div>
    </div>` : "";

  mount.innerHTML = `
    <div class="guided-card rounded-3xl border-2 overflow-hidden ${isHalftime ? 'border-gold-400/50' : 'border-usablue/30'}">
      <div class="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
        <div class="font-display font-extrabold text-lg flex items-center gap-2 min-w-0">
          ${ic(isHalftime ? 'coffee' : 'repeat-2', (isHalftime ? 'w-5 h-5 text-gold-600' : 'w-5 h-5 text-usablue') + ' flex-none')}
          <span class="truncate">${isHalftime ? 'Intervalo · alterações' : 'Substituições — ' + subMinute + "'"}</span>
        </div>
        <div class="flex items-center gap-2 flex-none">
          <div class="text-[11px] font-extrabold rounded-full px-2 py-0.5 ${info.total >= totalMax ? 'text-usared bg-usared/10' : 'text-slate-500 bg-slate-100'}">${counter}</div>
          <button id="liveSubClose" class="w-8 h-8 grid place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-usared/10 hover:text-usared font-bold" title="${isHalftime ? 'Continuar sem trocas' : 'Cancelar e continuar o jogo'}" aria-label="${isHalftime ? 'Continuar sem trocas' : 'Cancelar e continuar o jogo'}">✕</button>
        </div>
      </div>
      <div class="ls-planner-layout">
        <div class="ls-field-col p-4">
          ${buildLiveSubField()}
          ${formationBar}
          <div class="ls-swap-hint mt-2 text-center text-[10px] font-semibold text-slate-400">Arraste um jogador do campo para trocar de posição</div>
        </div>
        <div class="ls-carousel-col">${rightPanel}</div>
      </div>
    </div>`;
  paintIcons();
  wireLiveSubPickerEvents();
  mount.scrollIntoView({behavior:"smooth", block:"nearest"});
}

function wireLiveSubPickerEvents(){
  if($("#liveSubClose")) $("#liveSubClose").onclick = cancelLiveSub;
  if($("#liveSubGo")) $("#liveSubGo").onclick = cancelLiveSub;
  if($("#liveSubCancel")) $("#liveSubCancel").onclick = cancelLiveSub;
  if($("#liveSubConfirm")) $("#liveSubConfirm").onclick = () => (liveSubDraft.some(r => r.out && r.in) ? confirmLiveSubs() : cancelLiveSub());
  document.querySelectorAll("#liveSubMount .ls-del-row").forEach(btn => {
    btn.onclick = () => {
      liveSubDraft.splice(Number(btn.dataset.ri), 1);
      if(!liveSubDraft.length) liveSubDraft.push({out:"", in:""});
      renderLiveSubPicker();
    };
  });
  document.querySelectorAll("#liveSubMount [data-ls-dir]").forEach(btn => {
    btn.onclick = () => {
      liveSubCarouselIndex = (liveSubPosGroups().length + liveSubCarouselIndex + Number(btn.dataset.lsDir)) % liveSubPosGroups().length;
      renderLiveSubPicker();
    };
  });
  document.querySelectorAll("#liveSubMount [data-ls-dot]").forEach(btn => {
    btn.onclick = () => { liveSubCarouselIndex = Number(btn.dataset.lsDot); renderLiveSubPicker(); };
  });
  // clique alternado: reserva seleciona quem entra, campo seleciona quem sai
  document.querySelectorAll("#liveSubMount [data-ls-player]").forEach(card => {
    card.onclick = () => {
      if(Date.now() < liveSubSuppressClickUntil) return;
      if(card.classList.contains("is-dragging")) return;
      const name = card.dataset.lsPlayer;
      const isBench = card.dataset.lsBench === "1";
      const isField = card.dataset.lsField === "1";
      if(isBench){
        if(liveSubFieldSelection){
          handleSubDrop(liveSubFieldSelection, name);
          liveSubFieldSelection = null;
          liveSubBenchSelection = null;
        } else {
          liveSubBenchSelection = (liveSubBenchSelection === name) ? null : name;
          renderLiveSubPicker();
        }
      } else if(isField){
        if(liveSubBenchSelection){
          handleSubDrop(name, liveSubBenchSelection);
          liveSubFieldSelection = null;
          liveSubBenchSelection = null;
        } else {
          liveSubFieldSelection = (liveSubFieldSelection === name) ? null : name;
          renderLiveSubPicker();
        }
      }
    };
  });
  document.querySelectorAll("#liveSubMount .sub-drop-target[data-field-name]").forEach(slot => {
    slot.onclick = () => {
      const fieldPlayer = slot.dataset.fieldName;
      if(liveSubBenchSelection){
        handleSubDrop(fieldPlayer, liveSubBenchSelection);
        liveSubFieldSelection = null;
        liveSubBenchSelection = null;
      } else {
        // se já há um jogador de campo selecionado, faz swap de posição
        if(liveSubFieldSelection && liveSubFieldSelection !== fieldPlayer){
          handleFieldPositionSwap(liveSubFieldSelection, fieldPlayer);
          liveSubFieldSelection = null;
        } else {
          liveSubFieldSelection = (liveSubFieldSelection === fieldPlayer) ? null : fieldPlayer;
          renderLiveSubPicker();
        }
      }
    };
  });
  // seletor de formação no sub picker
  document.querySelectorAll("#liveSubMount [data-ls-form-dir]").forEach(btn => {
    btn.onclick = () => {
      if(!liveSubCtx) return;
      const {fav, journeyIndex} = liveSubCtx;
      const record = activeRecord();
      if(!record) return;
      const cur = record.tactics?.[journeyIndex] || WC_LINEUPS.autoTactic(fav);
      const formations = WC_LINEUPS.FORMATIONS || [];
      const idx = formations.indexOf(cur.formation || "4-3-3");
      const next = (formations.length + (idx < 0 ? 0 : idx) + Number(btn.dataset.lsFormDir)) % formations.length;
      const newTactic = {...cur, starters:cur.starters.slice(), formation:formations[next]};
      setMatchTactic(record, journeyIndex, newTactic);
      renderLiveSubPicker();
    };
  });
  document.querySelectorAll("#liveSubMount [data-ls-form-dot]").forEach(btn => {
    btn.onclick = () => {
      if(!liveSubCtx) return;
      const {fav, journeyIndex} = liveSubCtx;
      const record = activeRecord();
      if(!record) return;
      const cur = record.tactics?.[journeyIndex] || WC_LINEUPS.autoTactic(fav);
      const newTactic = {...cur, starters:cur.starters.slice(), formation:btn.dataset.lsFormDot};
      setMatchTactic(record, journeyIndex, newTactic);
      renderLiveSubPicker();
    };
  });
  wireLiveSubDragAndDrop();
}

// Troca a posição de dois jogadores em campo (sem substituição)
function handleFieldPositionSwap(nameA, nameB){
  if(!liveSubCtx || !nameA || !nameB || nameA === nameB) return;
  const {fav, journeyIndex} = liveSubCtx;
  const record = activeRecord();
  if(!record) return;
  const tactic = record.tactics?.[journeyIndex] || WC_LINEUPS.autoTactic(fav);
  const positions = {...(tactic.positions || {})};
  const posA = positions[nameA] ? {...positions[nameA]} : null;
  const posB = positions[nameB] ? {...positions[nameB]} : null;
  if(posA) positions[nameB] = posA; else delete positions[nameB];
  if(posB) positions[nameA] = posB; else delete positions[nameA];
  const newTactic = {...tactic, positions};
  setMatchTactic(record, journeyIndex, newTactic);
  renderLiveSubPicker();
}

/* ---------- drag and drop (mouse + toque) ---------- */
function createLiveSubDragGhost(name){
  const pos = liveSubCtx?.posOf?.(name) || "MF";
  const ghost = document.createElement("div");
  ghost.className = "lineup-drag-ghost live-sub-drag-ghost";
  ghost.innerHTML = `<div class="lineup-field-player pos-tone-${pos.toLowerCase()}">
    <span class="lineup-pos">${pos}</span>
    <span class="lineup-name">${liveSubCircleName(name)}</span>
  </div>`;
  document.body.appendChild(ghost);
  return ghost;
}

function wireLiveSubDragAndDrop(){
  // drag de bolha em campo → outra bolha (troca de posição)
  document.querySelectorAll("#liveSubMount .sub-drop-target[data-field-name]").forEach(slot => {
    const name = slot.dataset.fieldName;
    let fieldPointerDrag = null;
    const bubble = slot.querySelector(".lineup-field-player");
    if(!bubble) return;
    bubble.setAttribute("draggable", "true");
    bubble.dataset.fieldDrag = name;
    bubble.ondragstart = e => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/field", name);
      slot.classList.add("is-field-dragging");
      const ghost = createLiveSubDragGhost(name);
      if(e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(ghost, 23, 23);
      setTimeout(() => ghost.remove(), 0);
    };
    bubble.ondragend = () => slot.classList.remove("is-field-dragging");
    // touch drag
    bubble.onpointerdown = e => {
      if(e.pointerType === "mouse") return;
      fieldPointerDrag = {name, moved:false, ghost:createLiveSubDragGhost(name)};
      bubble.setPointerCapture?.(e.pointerId);
      slot.classList.add("is-field-dragging");
      fieldPointerDrag.ghost.style.left = `${e.clientX - 23}px`;
      fieldPointerDrag.ghost.style.top = `${e.clientY - 23}px`;
    };
    bubble.onpointermove = e => {
      if(!fieldPointerDrag) return;
      fieldPointerDrag.moved = true;
      fieldPointerDrag.ghost.style.left = `${e.clientX - 23}px`;
      fieldPointerDrag.ghost.style.top = `${e.clientY - 23}px`;
    };
    bubble.onpointerup = e => {
      if(!fieldPointerDrag) return;
      const ghost = fieldPointerDrag.ghost;
      ghost.style.display = "none";
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".sub-drop-target[data-field-name]");
      ghost.remove();
      slot.classList.remove("is-field-dragging");
      bubble.releasePointerCapture?.(e.pointerId);
      const fromName = fieldPointerDrag.name;
      const moved = fieldPointerDrag.moved;
      fieldPointerDrag = null;
      if(moved) liveSubSuppressClickUntil = Date.now() + 350;
      if(target && target.dataset.fieldName !== fromName){
        handleFieldPositionSwap(fromName, target.dataset.fieldName);
        liveSubFieldSelection = null;
      }
    };
    bubble.onpointercancel = e => {
      if(fieldPointerDrag?.ghost) fieldPointerDrag.ghost.remove();
      fieldPointerDrag = null;
      slot.classList.remove("is-field-dragging");
    };
  });
  document.querySelectorAll("#liveSubMount [data-ls-bench='1'][draggable='true']").forEach(card => {
    let pointerDrag = null;
    card.ondragstart = e => {
      const name = card.dataset.lsPlayer;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", name);
      card.classList.add("is-dragging");
      const ghost = createLiveSubDragGhost(name);
      if(e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(ghost, 23, 23);
      setTimeout(() => ghost.remove(), 0);
    };
    card.ondragend = () => card.classList.remove("is-dragging");
    // toque: drag manual via pointer events (HTML5 DnD não cobre touch)
    card.onpointerdown = e => {
      if(e.pointerType === "mouse") return;
      const name = card.dataset.lsPlayer;
      pointerDrag = {name, moved:false, ghost:createLiveSubDragGhost(name)};
      card.setPointerCapture?.(e.pointerId);
      card.classList.add("is-dragging");
      pointerDrag.ghost.style.left = `${e.clientX - 23}px`;
      pointerDrag.ghost.style.top = `${e.clientY - 23}px`;
    };
    card.onpointermove = e => {
      if(!pointerDrag) return;
      pointerDrag.moved = true;
      pointerDrag.ghost.style.left = `${e.clientX - 23}px`;
      pointerDrag.ghost.style.top = `${e.clientY - 23}px`;
    };
    card.onpointerup = e => {
      if(!pointerDrag) return;
      const ghost = pointerDrag.ghost;
      ghost.style.display = "none";
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".sub-drop-target[data-field-name]");
      ghost.remove();
      card.classList.remove("is-dragging");
      card.releasePointerCapture?.(e.pointerId);
      const benchName = pointerDrag.name;
      const moved = pointerDrag.moved;
      pointerDrag = null;
      if(target || moved) liveSubSuppressClickUntil = Date.now() + 350;
      if(target){
        handleSubDrop(target.dataset.fieldName, benchName);
        liveSubFieldSelection = null;
        liveSubBenchSelection = null;
      }
    };
    card.onpointercancel = () => {
      if(pointerDrag?.ghost) pointerDrag.ghost.remove();
      pointerDrag = null;
      card.classList.remove("is-dragging");
    };
  });
  document.querySelectorAll("#liveSubMount .sub-drop-target[data-field-name]").forEach(slot => {
    slot.ondragover = e => { e.preventDefault(); slot.classList.add("drag-over"); };
    slot.ondragleave = () => slot.classList.remove("drag-over");
    slot.ondrop = e => {
      e.preventDefault();
      slot.classList.remove("drag-over");
      const fromField = e.dataTransfer.getData("text/field");
      const benchPlayer = e.dataTransfer.getData("text/plain");
      if(fromField && fromField !== slot.dataset.fieldName){
        handleFieldPositionSwap(fromField, slot.dataset.fieldName);
        liveSubFieldSelection = null;
      } else if(benchPlayer){
        handleSubDrop(slot.dataset.fieldName, benchPlayer);
        liveSubFieldSelection = null;
        liveSubBenchSelection = null;
      }
    };
  });
}

/* ---------- confirmar / cancelar ---------- */
function cancelLiveSub(){
  const item = appState.currentSimulatedMatch;
  const resume = liveSubCtx ? liveSubCtx.resumeMinute : (item?.minute || 0);
  clearLiveSubPicker();
  if(item) simulateMatch(item.match, Math.max(0, resume));   // retoma sem mudar nada
}

function confirmLiveSubs(){
  const item = appState.currentSimulatedMatch, record = activeRecord();
  if(!item || !record || !liveSubCtx) return;
  const {fav, journeyIndex, subMinute, resumeMinute} = liveSubCtx;
  // linhas completas e distintas (sem repetir quem sai ou quem entra)
  const seenOut = new Set(), seenIn = new Set(), picks = [];
  liveSubDraft.forEach(r => {
    if(r.out && r.in && r.out !== r.in && !seenOut.has(r.out) && !seenIn.has(r.in)){
      seenOut.add(r.out);
      seenIn.add(r.in);
      picks.push({minute:subMinute, type:"sub", out:r.out, in:r.in});
    }
  });
  if(!picks.length){ cancelLiveSub(); return; }
  const current = (record.tactics && record.tactics[journeyIndex]) || WC_LINEUPS.autoTactic(fav);
  const tactic = {...current, starters:current.starters.slice(), liveScript:[...(current.liveScript || []), ...picks]};
  setMatchTactic(record, journeyIndex, tactic);   // grava + invalida cache
  const fresh = getTeamMatches(currentSim(), fav)[journeyIndex];
  lastConfirmedSubs = picks.map(p => ({out:p.out, in:p.in}));
  clearLiveSubPicker();
  if(fresh){
    appState.currentSimulatedMatch = {match:fresh, journeyIndex, minute:resumeMinute, matchTab:"match"};
    const shell = $("#matchScreenShell");
    if(shell) shell.dataset.matchTab = "match";
    document.querySelectorAll("#matchSimulatorBox [data-match-tab]").forEach(btn => {
      const active = btn.dataset.matchTab === "match";
      btn.classList.toggle("active", active);
      if(active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    simulateMatch(fresh, Math.max(0, resumeMinute));
  }
}

export { cancelLiveSub, clearLiveSubPicker, consumeLastConfirmedSubs, openHalftimeBreak, openLiveSubPicker };
